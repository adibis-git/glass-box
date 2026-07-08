// Server-side agent loop. Providers are called directly (no fetch hop), Python
// executes in the kernel registry (worker_threads pool), a scope gate refuses
// off-topic questions, and the caller receives everything needed to persist
// the run.
//
// Emits the SAME AgentEvent vocabulary the client feed reducer already
// understands — live SSE and DB replay share one rendering path.

import { runAnthropicTurn, generateAnthropicReport } from "@/lib/agent/providers/anthropic";
import { runOpenRouterTurn, generateOpenRouterReport } from "@/lib/agent/providers/openrouter";
import { getKernelRegistry, type DatasetRef } from "@/server/exec/registry";
import { classifyScope } from "@/server/agent/scopeGate";
import type { AgentEvent } from "@/lib/agent/events";
import type {
  ChartSpec,
  ChatMessage,
  ContentBlock,
  FinalReport,
  ToolResultBlock,
  ToolUseBlock,
} from "@/lib/types";

const MAX_ITERATIONS = 12;

export type { AgentEvent };

export interface RunnerDataset extends DatasetRef {
  name: string;
  rowCount: number | null;
  sampled: boolean;
  columnSchema: { name: string; dtype: string }[];
  sampleRows: Record<string, unknown>[];
}

export interface RunnerInput {
  conversationId: string;
  question: string;
  datasets: RunnerDataset[];
  /** Prior turns' apiMessages, already concatenated (follow-up context). */
  history: ChatMessage[];
  isFollowUp: boolean;
  emit: (e: AgentEvent) => void;
  signal: AbortSignal;
}

export interface RunnerOutput {
  events: AgentEvent[];
  /** The ChatMessages this run appended (assistant + tool_result turns). */
  apiMessages: ChatMessage[];
  report: FinalReport | null;
  inputTokens: number;
  outputTokens: number;
  status: "DONE" | "ERROR" | "CANCELLED";
  error?: string;
  /** True when the scope gate refused the question (audited as such). */
  refused?: boolean;
}

class AgentError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

interface FinalMessage {
  content: ContentBlock[];
  stop_reason: string | null;
  usage?: { input_tokens?: number; output_tokens?: number };
}

type Provider = "anthropic" | "openrouter";

function chooseProvider(): { provider: Provider; apiKey: string } {
  const forced = process.env.AGENT_PROVIDER?.toLowerCase();
  const anthropic = process.env.ANTHROPIC_API_KEY;
  const openrouter = process.env.OPENROUTER_API_KEY;
  if (forced === "anthropic" && anthropic) return { provider: "anthropic", apiKey: anthropic };
  if (forced === "openrouter" && openrouter) return { provider: "openrouter", apiKey: openrouter };
  if (anthropic) return { provider: "anthropic", apiKey: anthropic };
  if (openrouter) return { provider: "openrouter", apiKey: openrouter };
  throw new AgentError("No model provider configured (set ANTHROPIC_API_KEY or OPENROUTER_API_KEY).", 500);
}

function buildKickoff(datasets: RunnerDataset[], question: string, isFollowUp: boolean): string {
  if (isFollowUp) {
    return `Follow-up question from the user: ${question}\n\nAnswer from the loaded dataframes, reusing what you already established where possible. Conclude with final_report.`;
  }
  const sections = datasets.map((d) => {
    const cols = d.columnSchema.map((c) => `  - ${c.name}: ${c.dtype}`).join("\n");
    return [
      `### Dataframe \`${d.alias}\` — ${d.name}`,
      d.sampled
        ? `Rows: ${d.rowCount?.toLocaleString()} (REPRESENTATIVE SAMPLE of a larger file — rates/trends reliable, absolute totals are estimates)`
        : `Rows: ${d.rowCount?.toLocaleString()}`,
      `Columns:`,
      cols,
      `First ${Math.min(d.sampleRows.length, 20)} rows (JSON): ${JSON.stringify(d.sampleRows.slice(0, 20))}`,
    ].join("\n");
  });
  const q =
    question.trim() ||
    "Explore this data and surface the most interesting, decision-relevant insights.";
  return [
    `You have ${datasets.length} dataframe(s) loaded:`,
    "",
    sections.join("\n\n"),
    "",
    `User question: ${q}`,
    "",
    "Begin with a brief analysis plan, then take your first step.",
  ].join("\n");
}

function normalizeChart(input: Record<string, unknown>): ChartSpec {
  return {
    chart_type: (input.chart_type as ChartSpec["chart_type"]) ?? "bar",
    title: String(input.title ?? "Chart"),
    data: Array.isArray(input.data) ? (input.data as Record<string, unknown>[]) : [],
    x_key: String(input.x_key ?? ""),
    y_keys: Array.isArray(input.y_keys) ? (input.y_keys as string[]) : [],
  };
}

const TRANSIENT = (status?: number) => status === 429 || status === 529;

let seq = 0;
const uid = (p: string) => `${p}-${++seq}-${Date.now()}`;

/** One streamed provider turn: text deltas → plan events; resolves final message. */
async function callTurn(
  provider: Provider,
  apiKey: string,
  messages: ChatMessage[],
  emit: (e: AgentEvent) => void,
): Promise<FinalMessage> {
  let planId: string | null = null;
  let final: FinalMessage | null = null;
  let error: { message: string; status?: number } | null = null;

  const write = (event: string, data: unknown) => {
    if (event === "text") {
      const delta = (data as { delta?: string }).delta ?? "";
      if (!delta) return;
      if (!planId) {
        planId = uid("plan");
        emit({ type: "plan_start", id: planId });
      }
      emit({ type: "plan_delta", id: planId, delta });
    } else if (event === "done") {
      final = data as FinalMessage;
    } else if (event === "error") {
      error = data as { message: string; status?: number };
    }
  };

  if (provider === "anthropic") {
    await runAnthropicTurn(write, { messages }, apiKey);
  } else {
    await runOpenRouterTurn(write, { messages }, apiKey);
  }

  if (planId) emit({ type: "plan_end", id: planId });
  if (error) {
    const e = error as { message: string; status?: number };
    throw new AgentError(e.message, e.status);
  }
  if (!final) throw new AgentError("The model returned an empty response.");
  return final;
}

async function withRetry<T>(fn: () => Promise<T>, signal: AbortSignal): Promise<T> {
  const delays = [1_000, 2_000, 4_000, 8_000];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      return await fn();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      lastErr = err;
      const status = err instanceof AgentError ? err.status : undefined;
      if (!TRANSIENT(status) || attempt === delays.length) throw err;
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
  throw lastErr;
}

export async function runAgentTurn(input: RunnerInput): Promise<RunnerOutput> {
  const { conversationId, question, datasets, history, isFollowUp, signal } = input;

  const events: AgentEvent[] = [];
  const emit = (e: AgentEvent) => {
    events.push(e);
    input.emit(e);
  };

  const { provider, apiKey } = chooseProvider();
  const registry = getKernelRegistry();
  const refs: DatasetRef[] = datasets.map((d) => ({
    datasetId: d.datasetId,
    alias: d.alias,
    storageKey: d.storageKey,
  }));

  const kickoff: ChatMessage = { role: "user", content: buildKickoff(datasets, question, isFollowUp) };
  const messages: ChatMessage[] = [...history, kickoff];
  const appended: ChatMessage[] = [kickoff];

  let inputTokens = 0;
  let outputTokens = 0;
  let lastExecutionWasError = false;

  const push = (m: ChatMessage) => {
    messages.push(m);
    appended.push(m);
  };

  try {
    emit({ type: "status", status: "running" });

    // Scope gate: refuse out-of-scope questions before any kernel or loop work.
    const verdict = await classifyScope(
      question,
      datasets.map((d) => ({
        alias: d.alias,
        name: d.name,
        columns: d.columnSchema.map((c) => c.name),
      })),
      provider,
      apiKey,
    );
    if (!verdict.inScope) {
      const refusal =
        verdict.refusal ??
        "I can only analyze the data loaded in this conversation — ask me anything about those datasets instead.";
      emit({ type: "notice", id: uid("scope"), tone: "warning", text: refusal });
      push({ role: "assistant", content: refusal });
      emit({ type: "status", status: "done" });
      const out = finish("DONE", null);
      out.refused = true;
      return out;
    }

    for (let turn = 0; turn < MAX_ITERATIONS; turn++) {
      if (signal.aborted) return finish("CANCELLED");
      emit({ type: "step", current: turn + 1, max: MAX_ITERATIONS });
      if (lastExecutionWasError) emit({ type: "correction", id: uid("fix") });

      const final = await withRetry(() => callTurn(provider, apiKey, messages, emit), signal);
      if (signal.aborted) return finish("CANCELLED");

      inputTokens += final.usage?.input_tokens ?? 0;
      outputTokens += final.usage?.output_tokens ?? 0;
      emit({
        type: "usage",
        inputTokens: final.usage?.input_tokens ?? 0,
        outputTokens: final.usage?.output_tokens ?? 0,
      });

      const toolUses = final.content.filter((b): b is ToolUseBlock => b.type === "tool_use");
      const wantsReport = toolUses.some((t) => t.name === "final_report");
      const isLastTurn = turn === MAX_ITERATIONS - 1;

      if (wantsReport || toolUses.length === 0 || isLastTurn) {
        const assistantText = final.content
          .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
          .map((b) => b.text)
          .join("");

        // Secondary net: the model itself declined mid-loop with a short
        // text-only reply → surface it as a notice, don't fabricate a report.
        if (toolUses.length === 0 && turn === 0 && assistantText.trim().length < 600) {
          emit({ type: "notice", id: uid("scope"), tone: "warning", text: assistantText.trim() });
          push({ role: "assistant", content: assistantText });
          emit({ type: "status", status: "done" });
          const out = finish("DONE", null);
          out.refused = true;
          return out;
        }

        emit({ type: "report_pending" });
        const reportHistory = [...messages];
        if (assistantText.trim()) reportHistory.push({ role: "assistant", content: assistantText });

        const report = await withRetry(
          () =>
            provider === "anthropic"
              ? generateAnthropicReport(reportHistory, apiKey)
              : generateOpenRouterReport(reportHistory, apiKey),
          signal,
        );
        if (signal.aborted) return finish("CANCELLED");

        if (assistantText.trim()) push({ role: "assistant", content: assistantText });
        emit({ type: "report", id: uid("report"), report });
        emit({ type: "status", status: "done" });
        return finish("DONE", report);
      }

      push({ role: "assistant", content: final.content });
      const toolResults: ToolResultBlock[] = [];

      for (const tu of toolUses) {
        if (signal.aborted) return finish("CANCELLED");

        if (tu.name === "run_python") {
          const code = String(tu.input.code ?? "");
          const desc = String(tu.input.step_description ?? "Analysis step");
          emit({ type: "code", id: uid("code"), stepDescription: desc, code });

          const res = await registry.run(conversationId, refs, code);
          emit({
            type: "execution",
            id: uid("exec"),
            output: res.output,
            isError: res.isError,
            blocked: res.blocked,
            timedOut: res.timedOut,
          });

          let content = res.output;
          if (res.kernelRebuilt && (isFollowUp || turn > 0)) {
            content = `[runtime note: the Python runtime was restarted — earlier in-memory variables are gone; base dataframes are reloaded]\n${content}`;
          }
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content,
            is_error: res.isError,
          });
          lastExecutionWasError = res.isError;
        } else if (tu.name === "render_chart") {
          const spec = normalizeChart(tu.input);
          emit({ type: "chart", id: uid("chart"), spec });
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: `Chart "${spec.title}" rendered in the results canvas.`,
          });
          lastExecutionWasError = false;
        } else {
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: `Unknown tool: ${tu.name}`,
            is_error: true,
          });
        }
      }

      push({ role: "user", content: toolResults });
    }

    emit({ type: "status", status: "done" });
    return finish("DONE");
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return finish("CANCELLED");
    const message = err instanceof Error ? err.message : "The analysis failed unexpectedly.";
    emit({ type: "status", status: "error", message, canRetry: true });
    return finish("ERROR", null, message);
  }

  function finish(
    status: RunnerOutput["status"],
    report: FinalReport | null = null,
    error?: string,
  ): RunnerOutput {
    return { events, apiMessages: appended, report, inputTokens, outputTokens, status, error };
  }
}
