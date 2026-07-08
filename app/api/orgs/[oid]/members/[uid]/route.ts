import { prisma } from "@/lib/db";
import { authorize, authzErrorResponse } from "@/lib/authz";
import { audit } from "@/lib/audit";
import type { Role } from "@/lib/generated/prisma/enums";

export const runtime = "nodejs";

type Params = { params: Promise<{ oid: string; uid: string }> };

const VALID_ROLES: Role[] = ["OWNER", "ADMIN", "MEMBER", "VIEWER"];

/** Change a member's role. ADMIN can manage MEMBER/VIEWER; OWNER-level changes need OWNER. */
export async function PATCH(req: Request, { params }: Params) {
  const { oid, uid } = await params;
  try {
    const body = (await req.json().catch(() => ({}))) as { role?: Role };
    const newRole = body.role;
    if (!newRole || !VALID_ROLES.includes(newRole)) {
      return Response.json({ error: "Invalid role." }, { status: 400 });
    }

    const target = await prisma.membership.findUnique({
      where: { userId_orgId: { userId: uid, orgId: oid } },
    });
    if (!target) return Response.json({ error: "Member not found." }, { status: 404 });

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
