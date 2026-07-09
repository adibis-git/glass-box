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
import { classifyIntent } from "@/server/agent/scopeGate";
import { verifyReport } from "@/lib/agent/verifier";
import { buildSystemPrompt } from "@/lib/agent/systemPrompt";
import {
  buildContextPack,
  effortLevel,
  type AnalysisMode,
  type ColumnProfile,
  type DatasetContext,
  type DatasetDomain,
} from "@/lib/agent/context";
import { generateFollowUps } from "@/lib/agent/suggestions";
import type { AgentEvent } from "@/lib/agent/events";
import type { Persona, AnalysisEffort } from "@/lib/generated/prisma/client";
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
  /** Parsed Dataset.profile — richer than columnSchema when present (v3 §4). */
  profile?: { columns: ColumnProfile[]; domain?: DatasetDomain };
}

export interface RunnerInput {
  conversationId: string;
  question: string;
  datasets: RunnerDataset[];
  /** Prior turns' apiMessages, already concatenated (follow-up context). */
  history: ChatMessage[];
  isFollowUp: boolean;
  /** Who's asking — drives persona framing (v3 §3). */
  persona: Persona | null;
  /** Workspace framing (v3 §3). */
  org: { domain?: string | null; vertical?: string | null };
  /** User-selectable analysis depth; null → LOW (v3 §16.4). */
  effort: AnalysisEffort | null;
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
  /** Classified intent for this run (persisted to Message.intent). */
  intent?: AnalysisMode;
  /** Follow-up question chips (persisted to Message.suggestions). */
  suggestions?: string[];
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

/** Render one column from the rich profile (falls back to name:dtype). */
function renderColumn(c: ColumnProfile): string {
  const bits = [`${c.name}: ${c.semanticType} (${c.dtype})`];
  if (c.unit) bits.push(`unit=${c.unit}`);
  if (c.range) bits.push(`range ${c.range.min}–${c.range.max}`);
  if (c.cardinality != null) bits.push(`${c.cardinality} distinct`);
  if (c.nullRate > 0) bits.push(`${Math.round(c.nullRate * 100)}% missing`);
  if (c.topCategories?.length) {
    const top = c.topCategories
      .slice(0, 5)
      .map((t) => `${t.value} (${t.count})`)
      .join(", ");
    bits.push(`top: ${top}`);
  }
  return `  - ${bits.join("; ")}`;
}

function renderDataset(d: RunnerDataset): string {
  const lines = [`### Dataframe \`${d.alias}\` — ${d.name}`];
  lines.push(
    d.sampled
      ? `Rows: ${d.rowCount?.toLocaleString()} (REPRESENTATIVE SAMPLE of a larger file — rates/trends reliable, absolute totals are estimates)`
      : `Rows: ${d.rowCount?.toLocaleString()}`,
  );

  const domain = d.profile?.domain;
  if (domain) {
    if (domain.description) lines.push(`What it is: ${domain.description}`);
    if (domain.grain) lines.push(`Grain: ${domain.grain}`);
    if (domain.metrics?.length) lines.push(`Key metrics: ${domain.metrics.join(", ")}`);
    if (domain.entities?.length) lines.push(`Entities: ${domain.entities.join(", ")}`);
    if (domain.timeColumns?.length) lines.push(`Time columns: ${domain.timeColumns.join(", ")}`);
    if (domain.joinKeys?.length) lines.push(`Join keys: ${domain.joinKeys.join(", ")}`);
  }

  lines.push("Columns:");
  if (d.profile?.columns?.length) {
    lines.push(d.profile.columns.map(renderColumn).join("\n"));
  } else {
    lines.push(d.columnSchema.map((c) => `  - ${c.name}: ${c.dtype}`).join("\n"));
  }

  lines.push(
    `First ${Math.min(d.sampleRows.length, 20)} rows (JSON): ${JSON.stringify(d.sampleRows.slice(0, 20))}`,
  );
  return lines.join("\n");
}

/** Mode-specific closing instruction; quick_fact/analytical must NOT require final_report. */
function kickoffClosing(mode: AnalysisMode): string {
  if (mode === "quick_fact") {
    return "This is a quick lookup — answer directly in 1-3 sentences. Use at most one run_python if you truly need it, and do NOT call final_report.";
  }
  if (mode === "analytical") {
    return "Take a few focused steps, then give a concise, quantified answer. A single chart is optional; final_report is optional — only call it if a structured deliverable genuinely helps.";
  }
  return "Begin with a brief analysis plan, then take your first step. Conclude with final_report.";
}

function buildKickoff(
  datasets: RunnerDataset[],
  question: string,
  isFollowUp: boolean,
  mode: AnalysisMode,
): string {
  if (isFollowUp) {
    return `Follow-up question from the user: ${question}\n\nAnswer from the loaded dataframes, reusing what you already established where possible.\n\n${kickoffClosing(mode)}`;
  }
  const q =
    question.trim() ||
    "Explore this data and surface the most interesting, decision-relevant insights.";
  return [
    `You have ${datasets.length} dataframe(s) loaded:`,
    "",
    datasets.map(renderDataset).join("\n\n"),
    "",
    `User question: ${q}`,
    "",
    kickoffClosing(mode),
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
  system: string,
  effort: "low" | "medium" | "high",
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
    await runAnthropicTurn(write, { messages }, apiKey, system, effort);
  } else {
    await runOpenRouterTurn(write, { messages }, apiKey, system, effort);
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

function toDatasetContext(d: RunnerDataset): DatasetContext {
  return {
    alias: d.alias,
    name: d.name,
    rowCount: d.rowCount,
    sampled: d.sampled,
    columns: d.profile?.columns ?? [],
    domain: d.profile?.domain,
    sampleRows: d.sampleRows,
  };
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
    versionId: d.versionId,
    alias: d.alias,
    storageKey: d.storageKey,
  }));

  // Context Pack (persona × org × data profile) and the user's effort dial.
  const pack = buildContextPack({
    persona: input.persona,
    org: { domain: input.org.domain, vertical: input.org.vertical },
    datasets: datasets.map(toDatasetContext),
  });
  const effort = effortLevel(input.effort);

  const messages: ChatMessage[] = [...history];
  const appended: ChatMessage[] = [];

  let inputTokens = 0;
  let outputTokens = 0;
  let lastExecutionWasError = false;
  // Printed execution outputs the model saw — the evidence the grounding
  // verifier checks the final report against (decision runs only).
  const evidence: string[] = [];
  let runIntent: AnalysisMode = "analytical";
  let followUps: string[] = [];

  const push = (m: ChatMessage) => {
    messages.push(m);
    appended.push(m);
  };

  /** After a run settles, ask for next-step questions and emit them (fail-soft). */
  async function settleFollowUps(report: FinalReport | null, answerText: string): Promise<string[]> {
    const answer = report ? JSON.stringify(report) : answerText;
    if (!answer.trim()) return [];
    const fu = await generateFollowUps(question, answer, pack).catch(() => []);
    if (fu.length) emit({ type: "suggestions", id: uid("sugg"), questions: fu });
    return fu;
  }

  try {
    emit({ type: "status", status: "running" });

    // Scope + intent gate: refuse off-topic questions and route the rest to a
    // mode (quick_fact / analytical / decision) before any kernel or loop work.
    const verdict = await classifyIntent(
      question,
      datasets.map((d) => ({
        alias: d.alias,
        name: d.name,
        columns: d.columnSchema.map((c) => c.name),
      })),
      provider,
      apiKey,
    );
    runIntent = verdict.intent;
    const mode = verdict.intent;
    const system = buildSystemPrompt(pack, mode, effort);

    const kickoff: ChatMessage = {
      role: "user",
      content: buildKickoff(datasets, question, isFollowUp, mode),
    };
    push(kickoff);

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

      const final = await withRetry(
        () => callTurn(provider, apiKey, messages, emit, system, effort),
        signal,
      );
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

        // quick_fact / analytical don't require a final_report — a text answer
        // is the legitimate conclusion. Only force a report for decision mode,
        // when the model explicitly asked for one, or as a last-turn backstop.
        const requireReport = wantsReport || mode === "decision" || isLastTurn;

        if (!requireReport) {
          if (assistantText.trim()) push({ role: "assistant", content: assistantText });
          followUps = await settleFollowUps(null, assistantText);
          emit({ type: "status", status: "done" });
          return finish("DONE", null);
        }

        // Secondary net (decision mode only — the scope gate already ran, and
        // for quick_fact/analytical a short no-tool reply is handled above):
        // the model declined mid-loop with a short text-only reply → surface it
        // as a notice, don't fabricate a report.
        if (
          mode === "decision" &&
          toolUses.length === 0 &&
          turn === 0 &&
          assistantText.trim().length < 600
        ) {
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

        let report = await withRetry(
          () =>
            provider === "anthropic"
              ? generateAnthropicReport(reportHistory, apiKey, system, effort)
              : generateOpenRouterReport(reportHistory, apiKey, system, effort),
          signal,
        );
        if (signal.aborted) return finish("CANCELLED");

        // Cheap grounding pass (v3 §16.2): one extra LOW-effort call for decision
        // runs only, so an unsupported headline number can't ship. Fail-soft.
        if (mode === "decision") {
          const verdict = await verifyReport({
            report,
            evidence: evidence.join("\n\n---\n\n"),
            question,
            provider,
            apiKey,
          });
          if (!verdict.ok && verdict.corrected) report = verdict.corrected;
          emit({ type: "verification", id: uid("verify"), ok: verdict.ok, issues: verdict.issues });
        }

        if (assistantText.trim()) push({ role: "assistant", content: assistantText });
        emit({ type: "report", id: uid("report"), report });
        followUps = await settleFollowUps(report, assistantText);
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

          evidence.push(res.output);
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
    return {
      events,
      apiMessages: appended,
      report,
      inputTokens,
      outputTokens,
      status,
      error,
      intent: runIntent,
      suggestions: followUps.length ? followUps : undefined,
    };
  }
}
