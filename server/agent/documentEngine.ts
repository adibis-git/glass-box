// Document engine (v3 §14) — the retrieve → reason → CITE loop for the Document
// pillar. Runs the SAME self-hosted Claude loop as the tabular runner (streamed
// via the shared providers), but with document tools instead of the Pyodide
// kernel: search_document retrieves passages, cite records verbatim evidence
// (the doc-mode "glass box"), extract compiles structured lists, and the run
// concludes with the shared final_report tool.
//
// Emits the SAME AgentEvent vocabulary the feed understands, plus the new `cite`
// event. Persona / domain / vertical (from the Context Pack) frame the run, and
// user-selectable effort scales reasoning — exactly like the tabular runner.
// All Claude calls are claude-sonnet-5. Provider selection mirrors scopeGate.ts.

import { runAnthropicTurn, generateAnthropicReport } from "@/lib/agent/providers/anthropic";
import { runOpenRouterTurn, generateOpenRouterReport } from "@/lib/agent/providers/openrouter";
import { classifyDocumentIntent } from "@/server/agent/scopeGate";
import { verifyReport } from "@/lib/agent/verifier";
import { reportToHistoryText } from "@/lib/agent/report";
import { buildDocumentSystemPrompt } from "@/lib/agent/systemPrompt";
import { DOCUMENT_TOOLS } from "@/lib/agent/documentTools";
import { retrievePassages, type RetrievableDoc } from "@/lib/agent/documentRetrieval";
import { generateDocumentFollowUps, type DocDescriptor } from "@/lib/agent/suggestions";
import { buildContextPack, effortLevel, type AnalysisMode, type DocProfile } from "@/lib/agent/context";
import type { AgentEvent, Suggestion } from "@/lib/agent/events";
import type { RunnerOutput } from "@/server/agent/runner";
import type { Persona, AnalysisEffort } from "@/lib/generated/prisma/client";
import type { ChatMessage, ContentBlock, FinalReport, ToolResultBlock, ToolUseBlock } from "@/lib/types";

const MAX_ITERATIONS = 14;
/** Combined extracted-text length under which we pass the whole document(s). */
const SHORT_DOC_CHARS = 12_000;
const TOP_K = 6;

export interface DocumentRef {
  versionId: string;
  sourceId: string;
  alias: string;
  name: string;
  text: string;
  profile?: DocProfile;
}

export interface DocumentRunnerInput {
  conversationId: string;
  question: string;
  documents: DocumentRef[];
  history: ChatMessage[];
  isFollowUp: boolean;
  persona: Persona | null;
  org: { domain?: string | null; vertical?: string | null };
  effort: AnalysisEffort | null;
  emit: (e: AgentEvent) => void;
  signal: AbortSignal;
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

let seq = 0;
const uid = (p: string) => `${p}-${++seq}-${Date.now()}`;

/** Coerce an extract cell to a display string (for the extract event / CSV). */
function stringifyCell(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

const TRANSIENT = (status?: number) => status === 429 || status === 529;

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

/** One streamed provider turn with the document tools; text deltas → plan events. */
async function callDocTurn(
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
    await runAnthropicTurn(write, { messages }, apiKey, system, effort, DOCUMENT_TOOLS);
  } else {
    await runOpenRouterTurn(write, { messages }, apiKey, system, effort, DOCUMENT_TOOLS);
  }

  if (planId) emit({ type: "plan_end", id: planId });
  if (error) {
    const e = error as { message: string; status?: number };
    throw new AgentError(e.message, e.status);
  }
  if (!final) throw new AgentError("The model returned an empty response.");
  return final;
}

function toRetrievable(docs: DocumentRef[]): RetrievableDoc[] {
  return docs.map((d) => ({ alias: d.alias, text: d.text, sections: d.profile?.sections ?? [] }));
}

function toDescriptors(docs: DocumentRef[]): DocDescriptor[] {
  return docs.map((d) => ({
    name: d.name,
    docType: d.profile?.docType,
    description: d.profile?.description,
    sections: d.profile?.sections?.map((s) => s.heading),
  }));
}

function describeDocForKickoff(d: DocumentRef, includeFullText: boolean): string {
  const p = d.profile;
  const lines = [`### Document \`${d.alias}\` — ${d.name}`];
  if (p) {
    if (p.docType) lines.push(`Type: ${p.docType}`);
    if (p.description) lines.push(`What it is: ${p.description}`);
    lines.push(`Length: ~${p.wordCount.toLocaleString()} words, ${p.pageCount} page(s)`);
    if (p.keyEntities.length) lines.push(`Key entities: ${p.keyEntities.join(", ")}`);
    if (p.sections.length) {
      lines.push(`Outline: ${p.sections.slice(0, 30).map((s) => s.heading).join(" · ")}`);
    }
  }
  if (includeFullText) {
    lines.push("", "Full text (cite anchors are char offsets; still call search_document to get anchors):", d.text);
  }
  return lines.join("\n");
}

function kickoffClosing(mode: AnalysisMode): string {
  if (mode === "quick_fact") {
    return "This is a quick lookup — run one search_document, then answer directly in 1-3 grounded sentences with a citation. Do NOT call final_report.";
  }
  return "Begin with a brief plan, then search the document(s). Cite every material point, and conclude with final_report.";
}

function buildKickoff(
  docs: DocumentRef[],
  question: string,
  isFollowUp: boolean,
  mode: AnalysisMode,
  includeFullText: boolean,
): string {
  if (isFollowUp) {
    return `Follow-up question from the user: ${question}\n\nAnswer from the loaded document(s), reusing evidence you already cited where possible. Search again for anything new.\n\n${kickoffClosing(mode)}`;
  }
  const q = question.trim() || "Summarize this document and surface the most decision-relevant points.";
  return [
    `You have ${docs.length} document(s) loaded:`,
    "",
    docs.map((d) => describeDocForKickoff(d, includeFullText)).join("\n\n"),
    "",
    `User question: ${q}`,
    "",
    kickoffClosing(mode),
  ].join("\n");
}

export async function runDocumentTurn(input: DocumentRunnerInput): Promise<RunnerOutput> {
  const { question, documents, history, isFollowUp, signal } = input;

  const events: AgentEvent[] = [];
  const emit = (e: AgentEvent) => {
    events.push(e);
    input.emit(e);
  };

  const { provider, apiKey } = chooseProvider();

  // Context Pack carries persona + org framing (no tabular datasets here).
  const pack = buildContextPack({
    persona: input.persona,
    org: { domain: input.org.domain, vertical: input.org.vertical },
    datasets: [],
  });
  const effort = effortLevel(input.effort);
  const retrievable = toRetrievable(documents);
  const descriptors = toDescriptors(documents);
  const totalChars = documents.reduce((n, d) => n + d.text.length, 0);
  const includeFullText = totalChars <= SHORT_DOC_CHARS;

  // Anchor → nearest-section map, populated as we surface passages, so a cite
  // can be labelled with its section heading in the feed.
  const anchorSection = new Map<string, string | undefined>();

  const messages: ChatMessage[] = [...history];
  const appended: ChatMessage[] = [];
  const push = (m: ChatMessage) => {
    messages.push(m);
    appended.push(m);
  };

  let inputTokens = 0;
  let outputTokens = 0;
  // Verbatim quotes the model cited — the evidence the grounding verifier checks
  // the final report against (document_review runs only).
  const citedQuotes: string[] = [];
  let runIntent: AnalysisMode = "document_review";
  let followUps: Suggestion[] = [];

  async function settleFollowUps(report: FinalReport | null, answerText: string): Promise<Suggestion[]> {
    const answer = report ? JSON.stringify(report) : answerText;
    if (!answer.trim()) return [];
    const fu = await generateDocumentFollowUps(question, answer, pack, descriptors).catch(() => []);
    if (fu.length) emit({ type: "suggestions", id: uid("sugg"), items: fu });
    return fu;
  }

  /** Retrieve, record anchor→section, and format passages for a tool result. */
  function runSearch(query: string, docAlias?: string): string {
    const passages = retrievePassages(retrievable, query, TOP_K, docAlias);
    if (!passages.length) return "No matching passages found. Try different search terms.";
    return passages
      .map((p) => {
        const anchor = documents.length > 1 ? `${p.docAlias}:${p.anchor}` : p.anchor;
        anchorSection.set(anchor, p.section);
        const loc = [
          `anchor: ${anchor}`,
          documents.length > 1 ? p.docAlias : null,
          p.section ? `§ ${p.section}` : null,
        ]
          .filter(Boolean)
          .join(" · ");
        return `[${loc}]\n${p.text}`;
      })
      .join("\n\n---\n\n");
  }

  try {
    emit({ type: "status", status: "running" });

    const verdict = await classifyDocumentIntent(
      question,
      documents.map((d) => ({ alias: d.alias, name: d.name, docType: d.profile?.docType })),
      provider,
      apiKey,
    );
    runIntent = verdict.intent;
    const mode = verdict.intent;
    const system = buildDocumentSystemPrompt(pack, mode, effort);

    push({ role: "user", content: buildKickoff(documents, question, isFollowUp, mode, includeFullText) });

    if (!verdict.inScope) {
      const refusal =
        verdict.refusal ??
        "I can only answer from the document(s) loaded in this conversation — ask me about those instead.";
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

      const final = await withRetry(
        () => callDocTurn(provider, apiKey, messages, emit, system, effort),
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

        const requireReport = wantsReport || mode === "document_review" || isLastTurn;

        if (!requireReport) {
          if (assistantText.trim()) push({ role: "assistant", content: assistantText });
          followUps = await settleFollowUps(null, assistantText);
          emit({ type: "status", status: "done" });
          return finish("DONE", null);
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

        // Cheap grounding pass (v3 §16.2): one extra LOW-effort call for
        // document_review runs only, checked against the cited quotes. Fail-soft.
        if (mode === "document_review") {
          const verdict = await verifyReport({
            report,
            evidence: citedQuotes.join("\n\n---\n\n"),
            question,
            provider,
            apiKey,
          });
          if (!verdict.ok && verdict.corrected) report = verdict.corrected;
          emit({ type: "verification", id: uid("verify"), ok: verdict.ok, issues: verdict.issues });
        }

        // Fold the report into history so a follow-up turn remembers what was
        // concluded (findings, cited figures) instead of denying its own report.
        const historyText = [assistantText.trim(), reportToHistoryText(report)]
          .filter(Boolean)
          .join("\n\n");
        push({ role: "assistant", content: historyText });
        emit({ type: "report", id: uid("report"), report });
        followUps = await settleFollowUps(report, assistantText);
        emit({ type: "status", status: "done" });
        return finish("DONE", report);
      }

      push({ role: "assistant", content: final.content });
      const toolResults: ToolResultBlock[] = [];

      for (const tu of toolUses) {
        if (signal.aborted) return finish("CANCELLED");

        if (tu.name === "search_document") {
          const query = String(tu.input.query ?? "");
          const docAlias = tu.input.doc ? String(tu.input.doc) : undefined;
          const result = runSearch(query, docAlias);
          toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: result });
        } else if (tu.name === "cite") {
          const anchor = String(tu.input.anchor ?? "");
          const quote = String(tu.input.quote ?? "");
          if (anchor && quote) {
            citedQuotes.push(quote);
            emit({
              type: "cite",
              id: uid("cite"),
              anchor,
              quote,
              section: anchorSection.get(anchor),
            });
            toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: "Citation recorded." });
          } else {
            toolResults.push({
              type: "tool_result",
              tool_use_id: tu.id,
              content: "cite needs both an anchor (from a search result) and a verbatim quote.",
              is_error: true,
            });
          }
        } else if (tu.name === "extract") {
          const title = String(tu.input.title ?? "Extracted list");
          const rawRows = Array.isArray(tu.input.rows)
            ? (tu.input.rows as unknown[])
            : [];
          // Columns come from the tool input; fall back to the union of row keys.
          let columns = Array.isArray(tu.input.columns)
            ? (tu.input.columns as unknown[]).map((c) => String(c))
            : [];
          if (!columns.length) {
            const keys = new Set<string>();
            for (const r of rawRows) {
              if (r && typeof r === "object") for (const k of Object.keys(r)) keys.add(k);
            }
            columns = [...keys];
          }
          // Stringify + column-align each row so the UI can render a table / CSV.
          const rows: string[][] = rawRows.map((r) => {
            const obj = r && typeof r === "object" ? (r as Record<string, unknown>) : {};
            const cells = columns.length ? columns.map((c) => obj[c]) : Object.values(obj);
            return cells.map(stringifyCell);
          });
          // Emit the structured list for the feed (render + CSV download) AND keep
          // feeding the compiled result back to the model as before.
          emit({ type: "extract", id: uid("extract"), title, columns, rows });
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: `Compiled "${title}" with ${rows.length} row(s). Use these in your final report, and cite the key ones.`,
          });
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
    const message = err instanceof Error ? err.message : "The document review failed unexpectedly.";
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
