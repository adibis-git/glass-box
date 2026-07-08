import { prisma } from "@/lib/db";
import { authorize, authzErrorResponse } from "@/lib/authz";

export const runtime = "nodejs";

type Params = { params: Promise<{ oid: string; id: string }> };

/** Conversation detail: datasets + all messages (events for replay). */
export async function GET(_req: Request, { params }: Params) {
  const { oid, id } = await params;
  try {
    await authorize(oid, "VIEWER");
    const conversation = await prisma.conversation.findFirst({
      where: { id, orgId: oid },
      include: {
        datasets: { include: { dataset: { select: { id: true, name: true, sampled: true } } } },
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
