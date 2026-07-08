import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { authorize, authzErrorResponse } from "@/lib/authz";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

type Params = { params: Promise<{ oid: string; rid: string }> };

/** Mint (or re-mint) a share token. */
export async function POST(req: Request, { params }: Params) {
  const { oid, rid } = await params;
  try {
    const ctx = await authorize(oid, "MEMBER");
    const snapshot = await prisma.reportSnapshot.findFirst({ where: { id: rid, orgId: oid } });
    if (!snapshot) return Response.json({ error: "Snapshot not found." }, { status: 404 });

    const shareToken = randomBytes(24).toString("base64url");
    await prisma.reportSnapshot.update({
      where: { id: rid },
      data: { shareToken, revokedAt: null },
    });
    await audit({
      orgId: oid, actorId: ctx.userId, action: "report.share_create",
      targetType: "report", targetId: rid, req,
    });
    return Response.json({ sharePath: `/share/${shareToken}` });
  } catch (err) {
    return authzErrorResponse(err) ?? Response.json({ error: "Failed." }, { status: 500 });
  }
}

/** Revoke a share link (ADMIN, or the member managing their own share). */
export async function DELETE(req: Request, { params }: Params) {
  const { oid, rid } = await params;
  try {
    const ctx = await authorize(oid, "ADMIN");
    await prisma.reportSnapshot.update({
      where: { id: rid },
      data: { revokedAt: new Date(), shareToken: null },
    });
    await audit({
      orgId: oid, actorId: ctx.userId, action: "report.share_revoke",
      targetType: "report", targetId: rid, req,
    });
    return Response.json({ ok: true });
  } catch (err) {
    return authzErrorResponse(err) ?? Response.json({ error: "Failed." }, { status: 500 });
  }
}
