// Explicit coordinator (Claude Architect coordinator→workers pattern). This is a
// THIN, named orchestration entry the messages route calls instead of dispatching
// the tabular vs document worker inline. It:
//   1. inspects the conversation's loaded source modalities (tabular / document),
//   2. selects the worker(s) — the per-worker scope/intent gate + verifier still
//      run INSIDE each worker exactly as before,
//   3. for MIXED conversations, routes the turn to the modality the question is
//      about (a light, deterministic kind hint — see chooseModality).
//
// It is NOT a rewrite of the workers. The AgentEvent stream, persistence shape,
// and RunnerOutput are all preserved: pure-modality conversations delegate
// straight through with zero behavior change, and the only coordinator-authored
// event is an optional info `notice` on ambiguous mixed routing (merged into the
// returned RunnerOutput.events so it replays from the DB too).

import { runAgentTurn, type RunnerDataset, type RunnerInput, type RunnerOutput } from "@/server/agent/runner";
import { runDocumentTurn, type DocumentRef, type DocumentRunnerInput } from "@/server/agent/documentEngine";
import type { AgentEvent } from "@/lib/agent/events";
import type { Persona, AnalysisEffort } from "@/lib/generated/prisma/client";
import type { ChatMessage } from "@/lib/types";

export interface CoordinatorInput {
  conversationId: string;
  question: string;
  /** Tabular sources loaded for this conversation (may be empty). */
  datasets: RunnerDataset[];
  /** Document sources loaded for this conversation (may be empty). */
  documents: DocumentRef[];
  history: ChatMessage[];
  isFollowUp: boolean;
  persona: Persona | null;
  org: { domain?: string | null; vertical?: string | null };
  effort: AnalysisEffort | null;
  /** Pre-decided modality (the route decides it up front so it can also filter
   *  the conversation history to the SAME modality — avoids cross-modality
   *  context pollution in mixed conversations). When omitted the coordinator
   *  decides itself. */
  modality?: "tabular" | "document";
  emit: (e: AgentEvent) => void;
  signal: AbortSignal;
}

/**
 * Which worker a turn routes to, given the loaded sources + question. Exported so
 * the messages route can decide up front and scope history to the same modality.
 */
export function decideModality(
  question: string,
  datasets: RunnerDataset[],
  documents: DocumentRef[],
): "tabular" | "document" {
  const hasTabular = datasets.length > 0;
  const hasDocument = documents.length > 0;
  if (hasDocument && !hasTabular) return "document";
  if (!hasDocument) return "tabular";
  return chooseModality(question, datasets, documents).modality;
}

let seq = 0;
const uid = (p: string) => `${p}-${++seq}-${Date.now()}`;

// Light, deterministic lexical hints. These do NOT need to be exhaustive — they
// only break the tie for a MIXED conversation (both tabular AND document sources
// loaded). A clear miss simply falls back to the ambiguous → tabular branch,
// which never crashes and tells the user which sources it used.
const DOC_HINTS = [
  "document", "doc", "rfp", "contract", "agreement", "clause", "clauses",
  "section", "sections", "page", "pages", "pdf", "policy", "terms",
  "requirement", "requirements", "obligation", "obligations", "sla",
  "proposal", "paragraph", "appendix", "exhibit", "provision", "provisions",
  "deadline", "signatory", "signature", "wording", "compliant", "compliance",
];
const DATA_HINTS = [
  "data", "dataset", "metric", "metrics", "row", "rows", "column", "columns",
  "average", "mean", "median", "sum", "total", "count", "trend", "rate",
  "ratio", "percentage", "chart", "graph", "plot", "revenue", "sales",
  "distribution", "correlation", "segment", "cohort", "aggregate", "rank",
  "ranking", "outlier", "outliers", "forecast",
];

interface ModalityPick {
  modality: "tabular" | "document";
  /** True when the hint was a tie (or empty) — we defaulted to tabular. */
  ambiguous: boolean;
}

/**
 * Decide which modality a question in a MIXED conversation is about, using only
 * cheap lexical hints plus the loaded source names/aliases — no extra LLM call,
 * so this stays bounded and cannot fail. The chosen worker then runs its OWN
 * scope/intent gate. When the signal is a genuine tie (or absent) we prefer the
 * tabular worker (the historical fall-through) and flag it as ambiguous so the
 * caller can note which sources were actually used. A full cross-modal JOIN in a
 * single report is intentionally out of scope — we route cleanly to one worker.
 */
function chooseModality(
  question: string,
  datasets: RunnerDataset[],
  documents: DocumentRef[],
): ModalityPick {
  const q = question.toLowerCase();
  const words = new Set(q.split(/[^a-z0-9]+/).filter(Boolean));
  const hits = (list: string[]) => list.reduce((n, w) => n + (words.has(w) ? 1 : 0), 0);

  // A reference to a specific source (by alias or a distinctive name token, or a
  // document's docType) boosts that modality.
  const nameHit = (names: (string | undefined)[]) =>
    names.reduce((n, name) => {
      if (!name) return n;
      const tokens = name.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
      return n + (tokens.some((t) => words.has(t)) ? 1 : 0);
    }, 0);

  let docScore = hits(DOC_HINTS);
  let dataScore = hits(DATA_HINTS);
  docScore += nameHit(documents.flatMap((d) => [d.alias, d.name, d.profile?.docType]));
  dataScore += nameHit(datasets.flatMap((d) => [d.alias, d.name]));

  if (docScore > dataScore) return { modality: "document", ambiguous: false };
  if (dataScore > docScore) return { modality: "tabular", ambiguous: false };
  return { modality: "tabular", ambiguous: true };
}

function toTabularInput(input: CoordinatorInput): RunnerInput {
  return {
    conversationId: input.conversationId,
    question: input.question,
    datasets: input.datasets,
    history: input.history,
    isFollowUp: input.isFollowUp,
    persona: input.persona,
    org: input.org,
    effort: input.effort,
    emit: input.emit,
    signal: input.signal,
  };
}

function toDocumentInput(input: CoordinatorInput): DocumentRunnerInput {
  return {
    conversationId: input.conversationId,
    question: input.question,
    documents: input.documents,
    history: input.history,
    isFollowUp: input.isFollowUp,
    persona: input.persona,
    org: input.org,
    effort: input.effort,
    emit: input.emit,
    signal: input.signal,
  };
}

/**
 * The single named orchestration entry the messages route calls. Builds nothing
 * itself — the route hands it the already-loaded datasets + documents — and
 * returns the worker's RunnerOutput unchanged (persona/effort/intent/suggestions/
 * verification all produced inside the worker).
 */
export async function runCoordinatedTurn(input: CoordinatorInput): Promise<RunnerOutput> {
  const hasTabular = input.datasets.length > 0;
  const hasDocument = input.documents.length > 0;

  // Pure modalities — unchanged behavior. The worker runs its own scope/intent
  // gate + (for decision/document_review) the grounding verifier. Nothing to
  // orchestrate, so delegate straight through. An empty conversation (neither
  // modality) also falls to the tabular worker, its historical default.
  if (hasDocument && !hasTabular) return runDocumentTurn(toDocumentInput(input));
  if (!hasDocument) return runAgentTurn(toTabularInput(input));

  // MIXED (both tabular AND document sources): route the turn to the single
  // modality the question is about. The route usually pre-decides (input.modality)
  // so it can scope history to the same modality; fall back to deciding here.
  const pick = input.modality
    ? { modality: input.modality, ambiguous: false }
    : chooseModality(input.question, input.datasets, input.documents);

  if (pick.modality === "document") {
    return runDocumentTurn(toDocumentInput(input));
  }

  if (!pick.ambiguous) {
    return runAgentTurn(toTabularInput(input));
  }

  // Genuinely ambiguous → prefer tabular, and note which sources were used so the
  // user knows the document(s) were not consulted this turn (and how to ask about
  // them). This notice is authored by the coordinator, so we thread it into the
  // worker's returned events too — otherwise it would stream live but vanish on
  // DB replay.
  const noticeText =
    `This conversation has both data and document sources. I read your question as a data question, ` +
    `so I analyzed the tabular source(s): ${input.datasets.map((d) => d.alias).join(", ")}. ` +
    `To review the document(s) instead — ${input.documents.map((d) => d.name).join(", ")} — ask specifically about their contents.`;
  const notice: AgentEvent = { type: "notice", id: uid("route"), tone: "info", text: noticeText };
  input.emit(notice);

  const out = await runAgentTurn(toTabularInput(input));
  return { ...out, events: [notice, ...out.events] };
}
