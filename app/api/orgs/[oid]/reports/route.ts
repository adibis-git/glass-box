import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { authorize, authzErrorResponse } from "@/lib/authz";
import { audit } from "@/lib/audit";
import type { AgentEvent } from "@/lib/agent/events";
import type { Prisma } from "@/lib/generated/prisma/client";

export const runtime = "nodejs";

type Params = { params: Promise<{ oid: string }> };

/**
 * Snapshot a completed run's report (+ its charts) into a shareable object.
 * Body: { messageId, share?: boolean } → snapshot (+ shareToken when share).
 */
export async function POST(req: Request, { params }: Params) {
  const { oid } = await params;
  try {
    const ctx = await authorize(oid, "MEMBER");
    const body = (await req.json().catch(() => ({}))) as { messageId?: string; share?: boolean };
    if (!body.messageId) return Response.json({ error: "messageId is required." }, { status: 400 });

    const msg = await prisma.message.findFirst({
      where: { id: body.messageId, conversation: { orgId: oid } },
      include: { conversation: { select: { id: true, title: true } } },
    });
    if (!msg || msg.role !== "ASSISTANT" || !msg.report) {
      return Response.json({ error: "No report found on that message." }, { status: 404 });
    }

    const events = (msg.events as AgentEvent[] | null) ?? [];
    const charts = events.filter((e) => e.type === "chart").map((e) => e.spec);

    const snapshot = await prisma.reportSnapshot.create({
      data: {
        orgId: oid,
        conversationId: msg.conversation.id,
        messageId: msg.id,
        title: msg.conversation.title,
        report: msg.report as Prisma.InputJsonValue,
        charts: charts as unknown as Prisma.InputJsonValue,
        createdById: ctx.userId,
        shareToken: body.share ? randomBytes(24).toString("base64url") : null,
      },
    });

    await audit({
      orgId: oid, actorId: ctx.userId,
      action: body.share ? "report.share_create" : "report.snapshot",
      targetType: "report", targetId: snapshot.id,
      metadata: { conversationId: msg.conversation.id, shared: !!body.share }, req,
    });

    return Response.json(
      {
        snapshot: {
          id: snapshot.id,
          shareToken: snapshot.shareToken,
          sharePath: snapshot.shareToken ? `/share/${snapshot.shareToken}` : null,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return authzErrorResponse(err) ?? Response.json({ error: "Failed." }, { status: 500 });
  }
}
