import { prisma } from "@/lib/db";
import { authorize, authzErrorResponse } from "@/lib/authz";
import { audit } from "@/lib/audit";
import type { Role } from "@/lib/generated/prisma/enums";

export const runtime = "nodejs";

type Params = { params: Promise<{ oid: string; uid: string }> };

const VALID_ROLES: Role[] = ["OWNER", "ADMIN", "MEMBER", "VIEWER"];

/**
 * Change a member's role and/or manager (reporting structure).
 * Body may contain `role`, `managerId` (string | null), or both — each is handled
 * independently. Role changes: ADMIN manages MEMBER/VIEWER, OWNER-level needs OWNER.
 * Manager changes: ADMIN, with same-org / self / cycle guards.
 */
export async function PATCH(req: Request, { params }: Params) {
  const { oid, uid } = await params;
  try {
    const body = (await req.json().catch(() => ({}))) as {
      role?: Role;
      managerId?: string | null;
    };
    const hasRole = body.role !== undefined;
    const hasManager = "managerId" in body;
    if (!hasRole && !hasManager) {
      return Response.json({ error: "Nothing to update." }, { status: 400 });
    }

    const target = await prisma.membership.findUnique({
      where: { userId_orgId: { userId: uid, orgId: oid } },
    });
    if (!target) return Response.json({ error: "Member not found." }, { status: 404 });

    // --- Role change (unchanged behavior) ---
    if (hasRole) {
      const newRole = body.role!;
      if (!VALID_ROLES.includes(newRole)) {
        return Response.json({ error: "Invalid role." }, { status: 400 });
      }

      // Touching OWNER/ADMIN (either direction) requires OWNER; else ADMIN suffices.
      const touchesElevated =
        newRole === "OWNER" || newRole === "ADMIN" || target.role === "OWNER" || target.role === "ADMIN";
      const ctx = await authorize(oid, touchesElevated ? "OWNER" : "ADMIN");

      // An OWNER cannot demote themselves if they're the last owner.
      if (target.role === "OWNER" && newRole !== "OWNER") {
        const owners = await prisma.membership.count({ where: { orgId: oid, role: "OWNER" } });
        if (owners <= 1) {
          return Response.json(
            { error: "Cannot demote the last owner. Transfer ownership first." },
            { status: 400 },
          );
        }
      }

      await prisma.membership.update({
        where: { userId_orgId: { userId: uid, orgId: oid } },
        data: { role: newRole },
      });
      await audit({
        orgId: oid, actorId: ctx.userId, action: "member.role_change",
        targetType: "user", targetId: uid,
        metadata: { from: target.role, to: newRole }, req,
      });
    }

    // --- Manager (reporting structure) change ---
    if (hasManager) {
      const managerId = body.managerId ?? null;
      const ctx = await authorize(oid, "ADMIN");

      if (managerId !== null) {
        // Cannot manage yourself.
        if (managerId === target.id) {
          return Response.json(
            { error: "A member cannot be their own manager." },
            { status: 400 },
          );
        }

        // Manager must be a membership in the same org.
        const manager = await prisma.membership.findUnique({
          where: { id: managerId },
          select: { id: true, orgId: true },
        });
        if (!manager || manager.orgId !== oid) {
          return Response.json(
            { error: "Manager must be a member of this organization." },
            { status: 400 },
          );
        }

        // No cycles: the chosen manager must not be the target or any of its
        // descendants. Walk up from the manager; if we reach the target, the
        // target is an ancestor of the manager → assigning it would form a loop.
        const all = await prisma.membership.findMany({
          where: { orgId: oid },
          select: { id: true, managerId: true },
        });
        const parentOf = new Map(all.map((m) => [m.id, m.managerId]));
        let cursor: string | null = managerId;
        const seen = new Set<string>();
        while (cursor) {
          if (cursor === target.id) {
            return Response.json(
              { error: "That assignment would create a reporting cycle." },
              { status: 400 },
            );
          }
          if (seen.has(cursor)) break; // guard against pre-existing loops
          seen.add(cursor);
          cursor = parentOf.get(cursor) ?? null;
        }
      }

      await prisma.membership.update({
        where: { userId_orgId: { userId: uid, orgId: oid } },
        data: { managerId },
      });
      await audit({
        orgId: oid, actorId: ctx.userId, action: "member.manager_change",
        targetType: "user", targetId: uid,
        metadata: { targetUserId: uid, managerId }, req,
      });
    }

    return Response.json({ ok: true });
  } catch (err) {
    return authzErrorResponse(err) ?? Response.json({ error: "Failed." }, { status: 500 });
  }
}

/** Remove a member (or leave, if removing yourself). */
export async function DELETE(req: Request, { params }: Params) {
  const { oid, uid } = await params;
  try {
    const target = await prisma.membership.findUnique({
      where: { userId_orgId: { userId: uid, orgId: oid } },
    });
    if (!target) return Response.json({ error: "Member not found." }, { status: 404 });

    // Self-removal (leave) needs only membership; removing others needs ADMIN
    // (OWNER if the target is elevated).
    const { userId } = await authorize(
      oid,
      "VIEWER", // establishes identity + membership
    );
    const removingSelf = userId === uid;
    if (!removingSelf) {
      const touchesElevated = target.role === "OWNER" || target.role === "ADMIN";
      await authorize(oid, touchesElevated ? "OWNER" : "ADMIN");
    }

    if (target.role === "OWNER") {
      const owners = await prisma.membership.count({ where: { orgId: oid, role: "OWNER" } });
      if (owners <= 1) {
        return Response.json(
          { error: "The last owner cannot leave. Transfer ownership or delete the organization." },
          { status: 400 },
        );
      }
    }

    await prisma.membership.delete({
      where: { userId_orgId: { userId: uid, orgId: oid } },
    });
    await audit({
      orgId: oid, actorId: userId,
      action: removingSelf ? "member.leave" : "member.remove",
      targetType: "user", targetId: uid, req,
    });
    return Response.json({ ok: true });
  } catch (err) {
    return authzErrorResponse(err) ?? Response.json({ error: "Failed." }, { status: 500 });
  }
}
