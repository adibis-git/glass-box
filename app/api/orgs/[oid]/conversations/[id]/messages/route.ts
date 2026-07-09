// POST a question → run the whole agent loop server-side, streaming AgentEvents
// as SSE. Persists a USER message + an ASSISTANT message (events, apiMessages,
// report, usage) when the run settles.

import { prisma } from "@/lib/db";
import { authorize, authzErrorResponse } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { runAgentTurn, type RunnerDataset } from "@/server/agent/runner";
import type { ChatMessage, ContentBlock } from "@/lib/types";
import type { ColumnProfile, DatasetDomain } from "@/lib/agent/context";
import type { Prisma, AnalysisEffort } from "@/lib/generated/prisma/client";

const EFFORTS = new Set<AnalysisEffort>(["LOW", "MEDIUM", "HIGH"]);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Params = { params: Promise<{ oid: string; id: string }> };

const HEARTBEAT_MS = 15_000;
/** Keep tool_results from the most recent N assistant runs verbatim; truncate older ones. */
const FULL_DETAIL_RUNS = 2;
const OLD_TOOL_RESULT_CHARS = 300;

function compactHistory(runs: ChatMessage[][]): ChatMessage[] {
  const out: ChatMessage[] = [];
  runs.forEach((run, idx) => {
    const isRecent = idx >= runs.length - FULL_DETAIL_RUNS;
    for (const m of run) {
      if (isRecent || typeof m.content === "string") {
        out.push(m);
        continue;
      }
      const content = (m.content as ContentBlock[]).map((b) => {
        if (b.type === "tool_result" && typeof b.content === "string" && b.content.length > OLD_TOOL_RESULT_CHARS) {
          return { ...b, content: b.content.slice(0, OLD_TOOL_RESULT_CHARS) + "\n...[older output truncated]" };
        }
        return b;
      });
      out.push({ ...m, content });
    }
  });
  return out;
}

export async function POST(req: Request, { params }: Params) {
  const { oid, id } = await params;
  let ctx;
  try {
    ctx = await authorize(oid, "MEMBER");
  } catch (err) {
    return authzErrorResponse(err) ?? Response.json({ error: "Failed." }, { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as { question?: string; effort?: string };
  const question = String(body.question ?? "").trim();
  if (!question) return Response.json({ error: "Ask a question." }, { status: 400 });

  const conversation = await prisma.conversation.findFirst({
    where: { id, orgId: oid },
    include: {
      org: { select: { domain: true, vertical: true } },
      datasets: { include: { dataset: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!conversation) return Response.json({ error: "Conversation not found." }, { status: 404 });

  // Who's asking (persona) + effort dial. Persona is fetched directly rather
  // than relying on the authz Ctx; effort comes from the request, else the
  // conversation's saved default.
  const membership = await prisma.membership.findUnique({
    where: { userId_orgId: { userId: ctx.userId, orgId: oid } },
    select: { persona: true },
  });
  const bodyEffort = typeof body.effort === "string" ? body.effort.toUpperCase() : "";
  const effort: AnalysisEffort = EFFORTS.has(bodyEffort as AnalysisEffort)
    ? (bodyEffort as AnalysisEffort)
    : conversation.defaultEffort;

  const running = conversation.messages.some((m) => m.status === "RUNNING");
  if (running) {
    return Response.json({ error: "A run is already in progress for this conversation." }, { status: 409 });
  }

  const datasets: RunnerDataset[] = conversation.datasets.map((l) => {
    const raw = l.dataset.profile as { columns?: ColumnProfile[]; domain?: DatasetDomain } | null;
    const profile =
      raw && Array.isArray(raw.columns)
        ? { columns: raw.columns, domain: raw.domain }
        : undefined;
    return {
      datasetId: l.dataset.id,
      alias: l.alias,
      storageKey: l.dataset.storageKey,
      name: l.dataset.name,
      rowCount: l.dataset.rowCount,
      sampled: l.dataset.sampled,
      columnSchema: (l.dataset.columnSchema as { name: string; dtype: string }[]) ?? [],
      sampleRows: (l.dataset.sampleRows as Record<string, unknown>[]) ?? [],
      profile,
    };
  });
  if (datasets.some((d) => !d.storageKey)) {
    return Response.json({ error: "A dataset in this conversation isn't ready." }, { status: 409 });
  }

  const priorRuns = conversation.messages
    .filter((m) => m.role === "ASSISTANT" && Array.isArray(m.apiMessages))
    .map((m) => m.apiMessages as unknown as ChatMessage[]);
  const history = compactHistory(priorRuns);
  const isFollowUp = priorRuns.length > 0;

  // Persist the user message + a RUNNING assistant shell up front, so a dropped
  // client can still see "run in progress" and recover on reload.
  const [, assistantMsg] = await prisma.$transaction([
    prisma.message.create({
      data: { conversationId: id, role: "USER", content: question },
    }),
    prisma.message.create({
      data: { conversationId: id, role: "ASSISTANT", status: "RUNNING" },
    }),
    prisma.conversation.update({ where: { id }, data: { updatedAt: new Date() } }),
  ]);

  await audit({
    orgId: oid, actorId: ctx.userId, action: "agent.run_start",
    targetType: "conversation", targetId: id,
    metadata: { messageId: assistantMsg.id, question: question.slice(0, 200), datasets: datasets.map((d) => d.alias) },
    req,
  });

  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort());

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`: hb\n\n`));
        } catch {
          closed = true;
        }
      }, HEARTBEAT_MS);

      send("meta", { messageId: assistantMsg.id });

      const result = await runAgentTurn({
        conversationId: id,
        question,
        datasets,
        history,
        isFollowUp,
        persona: membership?.persona ?? null,
        org: { domain: conversation.org.domain, vertical: conversation.org.vertical },
        effort,
        emit: (e) => send(e.type, e),
        // The run continues even if the client disconnects; it settles and
        // persists so the user can reload. Only explicit cancel aborts.
        signal: abort.signal,
      });

      await prisma.message.update({
        where: { id: assistantMsg.id },
        data: {
          events: result.events as unknown as Prisma.InputJsonValue,
          apiMessages: result.apiMessages as unknown as Prisma.InputJsonValue,
          report: (result.report ?? undefined) as unknown as Prisma.InputJsonValue,
          suggestions: (result.suggestions ?? undefined) as unknown as Prisma.InputJsonValue,
          intent: result.intent,
          effort,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          status: result.status,
          error: result.error,
        },
      }).catch((e) => console.error("[messages] persist failed:", e));

      await audit({
        orgId: oid, actorId: ctx.userId, action: "agent.run_end",
        targetType: "conversation", targetId: id,
        metadata: {
          messageId: assistantMsg.id, status: result.status,
          inputTokens: result.inputTokens, outputTokens: result.outputTokens,
          blockedSteps: result.events.filter((e) => e.type === "execution" && e.blocked).length,
        },
      });
      if (result.refused) {
        await audit({
          orgId: oid, actorId: ctx.userId, action: "agent.scope_refusal",
          targetType: "conversation", targetId: id,
          metadata: { messageId: assistantMsg.id, question: question.slice(0, 200) },
        });
      }

      clearInterval(heartbeat);
      if (!closed) {
        send("persisted", { messageId: assistantMsg.id, status: result.status });
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
