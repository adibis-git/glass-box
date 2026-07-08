import { prisma } from "@/lib/db";
import { authorize, authzErrorResponse } from "@/lib/authz";
import { audit } from "@/lib/audit";
import type { Role } from "@/lib/generated/prisma/enums";

export const runtime = "nodejs";

type Params = { params: Promise<{ oid: string }> };

const INVITABLE_ROLES: Role[] = ["ADMIN", "MEMBER", "VIEWER"]; // OWNER via transfer only

export async function GET(_req: Request, { params }: Params) {
  const { oid } = await params;
  try {
    await authorize(oid, "ADMIN");
    const invitations = await prisma.invitation.findMany({
      where: { orgId: oid, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    return Response.json({ invitations });
  } catch (err) {
    return authzErrorResponse(err) ?? Response.json({ error: "Failed." }, { status: 500 });
  }
}

/** Invite by email. Returns the accept link (email delivery is post-v1). */
export async function POST(req: Request, { params }: Params) {
  const { oid } = await params;
  try {
    const ctx = await authorize(oid, "ADMIN");
    const body = (await req.json().catch(() => ({}))) as { email?: string; role?: Role };
    const email = String(body.email ?? "").trim().toLowerCase();
    const role = body.role ?? "MEMBER";

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (!INVITABLE_ROLES.includes(role)) {
      return Response.json({ error: "Role must be ADMIN, MEMBER, or VIEWER." }, { status: 400 });
    }

    // Already a member?
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      const m = await prisma.membership.findUnique({
        where: { userId_orgId: { userId: existingUser.id, orgId: oid } },
      });
      if (m) return Response.json({ error: "Already a member of this organization." }, { status: 409 });
    }

    const invitation = await prisma.invitation.upsert({
      where: { orgId_email: { orgId: oid, email } },
      create: {
        orgId: oid, email, role, invitedById: ctx.userId,
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
      },
      update: {
        role, invitedById: ctx.userId, acceptedAt: null,
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
      },
    });

    await audit({
      orgId: oid, actorId: ctx.userId, action: "member.invite",
      targetType: "invitation", targetId: invitation.id,
      metadata: { email, role }, req,
    });

    return Response.json(
      { invitation, acceptPath: `/invite/${invitation.token}` },
      { status: 201 },
    );
  } catch (err) {
    return authzErrorResponse(err) ?? Response.json({ error: "Failed." }, { status: 500 });
  }
}
