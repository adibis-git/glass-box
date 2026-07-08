import { prisma } from "@/lib/db";
import { requireSession, authzErrorResponse } from "@/lib/authz";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

type Params = { params: Promise<{ token: string }> };

export async function POST(req: Request, { params }: Params) {
  const { token } = await params;
  try {
    const { userId, email } = await requireSession();

    const invitation = await prisma.invitation.findUnique({ where: { token } });
    if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date()) {
      return Response.json({ error: "This invitation is invalid or has expired." }, { status: 404 });
    }
    if (invitation.email.toLowerCase() !== email.toLowerCase()) {
      return Response.json(
        { error: "This invitation was sent to a different email address." },
        { status: 403 },
      );
    }

    const existing = await prisma.membership.findUnique({
      where: { userId_orgId: { userId, orgId: invitation.orgId } },
    });
    if (existing) {
      return Response.json({ ok: true, orgId: invitation.orgId, alreadyMember: true });
    }

    await prisma.$transaction([
      prisma.membership.create({
        data: { userId, orgId: invitation.orgId, role: invitation.role },
      }),
      prisma.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      }),
    ]);

    await audit({
      orgId: invitation.orgId, actorId: userId, action: "member.invite_accept",
      targetType: "invitation", targetId: invitation.id,
      metadata: { role: invitation.role }, req,
    });

    return Response.json({ ok: true, orgId: invitation.orgId });
  } catch (err) {
    return authzErrorResponse(err) ?? Response.json({ error: "Failed." }, { status: 500 });
  }
}
