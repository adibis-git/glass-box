import { prisma } from "@/lib/db";
import { authorize, authzErrorResponse } from "@/lib/authz";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

type Params = { params: Promise<{ oid: string; id: string }> };

/** Conversation detail: pinned sources + all messages (events for replay). */
export async function GET(_req: Request, { params }: Params) {
  const { oid, id } = await params;
  try {
    await authorize(oid, "VIEWER");
    const conversation = await prisma.conversation.findFirst({
      where: { id, orgId: oid },
      include: {
        sources: {
          include: {
            source: { select: { id: true, name: true } },
            version: { select: { id: true, version: true, sampled: true } },
          },
        },
        messages: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true, role: true, content: true, events: true, report: true,
            status: true, error: true, inputTokens: true, outputTokens: true, createdAt: true,
          },
        },
      },
    });
    if (!conversation) return Response.json({ error: "Not found." }, { status: 404 });
    return Response.json({ conversation });
  } catch (err) {
    return authzErrorResponse(err) ?? Response.json({ error: "Failed." }, { status: 500 });
  }
}

/**
 * Adopt a different version of an attached source into this conversation
 * (v3 §15.1) — updates the pinned ConversationSource.versionId. The next run
 * reloads the dataframe from the new version's storage.
 */
export async function PATCH(req: Request, { params }: Params) {
  const { oid, id } = await params;
  try {
    const ctx = await authorize(oid, "MEMBER");
    const body = (await req.json().catch(() => ({}))) as {
      sourceId?: string;
      version?: number;
      versionId?: string;
    };
    const sourceId = String(body.sourceId ?? "").trim();
    if (!sourceId) return Response.json({ error: "sourceId is required." }, { status: 400 });

    const link = await prisma.conversationSource.findUnique({
      where: { conversationId_sourceId: { conversationId: id, sourceId } },
      include: { conversation: { select: { orgId: true } } },
    });
    if (!link || link.conversation.orgId !== oid) {
      return Response.json({ error: "That source isn't attached to this conversation." }, { status: 404 });
    }

    // Resolve the target version by id or by version number.
    const target = await prisma.sourceVersion.findFirst({
      where: {
        sourceId,
        deletedAt: null,
        status: "READY",
        ...(body.versionId ? { id: body.versionId } : {}),
        ...(typeof body.version === "number" ? { version: body.version } : {}),
      },
      orderBy: { version: "desc" },
    });
    if (!target) return Response.json({ error: "Target version not found or not ready." }, { status: 404 });

    if (target.id !== link.versionId) {
      await prisma.conversationSource.update({
        where: { conversationId_sourceId: { conversationId: id, sourceId } },
        data: { versionId: target.id },
      });
      // Drop any warm kernel so the new version's dataframe reloads next run.
      const { getKernelRegistry } = await import("@/server/exec/registry");
      getKernelRegistry().releaseConversation(id);
      await audit({
        orgId: oid, actorId: ctx.userId, action: "conversation.adopt_version",
        targetType: "conversation", targetId: id,
        metadata: { sourceId, versionId: target.id, version: target.version }, req,
      });
    }

    return Response.json({ ok: true, versionId: target.id, version: target.version });
  } catch (err) {
    return authzErrorResponse(err) ?? Response.json({ error: "Failed." }, { status: 500 });
  }
}
