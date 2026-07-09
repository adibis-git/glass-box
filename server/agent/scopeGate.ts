// Scope gate — a cheap, deterministic classifier that runs BEFORE the agent
// loop. Decides whether a question can plausibly be answered from the loaded
// datasets; out-of-scope questions are refused without spending a kernel or a
// full agent run. Fails OPEN (in-scope) on classifier errors so legitimate
// analysis is never blocked by gate flakiness.

import Anthropic from "@anthropic-ai/sdk";
import type { AnalysisMode } from "@/lib/agent/context";

const MODEL_ANTHROPIC = "claude-sonnet-5";
const MODEL_OPENROUTER = "anthropic/claude-sonnet-5";

export interface ScopeVerdict {
  inScope: boolean;
  /** User-facing refusal message when out of scope. */
  refusal?: string;
}

export interface IntentVerdict extends ScopeVerdict {
  /** Splits how much machinery the question deserves (v3 §6). */
  intent: AnalysisMode;
}

function buildPrompt(
  question: string,
  datasets: { alias: string; name: string; columns: string[] }[],
): string {
  const desc = datasets
    .map((d) => `- ${d.alias} ("${d.name}"): columns [${d.columns.join(", ")}]`)
    .join("\n");
  return `You are a scope classifier for a data-analysis companion used by business decision makers. The tool analyzes the following loaded datasets with pandas and turns them into insights and data-grounded recommendations:

${desc}

Question: "${question}"

Decide whether this question can be MEANINGFULLY INFORMED by analyzing these datasets.

IN scope (answer {"in_scope": true}):
- Direct analytical questions: metrics, trends, comparisons, rates, rankings, outliers, data quality.
- Follow-ups referring to earlier analysis of this data ("what about by region?", "which one first?").
- DECISION-SUPPORT questions about the business/domain this data describes — "what should I do / decide / prioritize / fix / focus on / improve?", "where are we losing money?", "what would you recommend as a manager?". These are the tool's core purpose: the agent answers them with recommendations grounded strictly in what the data shows. Lean in-scope whenever the data could inform the decision, even partially.

OUT of scope (answer {"in_scope": false}):
- Questions requiring knowledge the data cannot provide AT ALL: world events, sports outcomes, celebrity/politics, market predictions, general coding help, other companies' private data, math homework, or anything with no connection to this business's data.

Respond with ONLY a JSON object, no other text:
{"in_scope": true}
or
{"in_scope": false, "refusal": "one or two friendly sentences declining and steering back to what you CAN analyze in this data"}`;
}

function parseVerdict(text: string): ScopeVerdict | null {
  try {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first === -1 || last <= first) return null;
    const j = JSON.parse(text.slice(first, last + 1)) as {
      in_scope?: boolean;
      refusal?: string;
    };
    if (typeof j.in_scope !== "boolean") return null;
    return {
      inScope: j.in_scope,
      refusal:
        typeof j.refusal === "string" && j.refusal.trim()
          ? j.refusal.trim()
          : "I can only analyze the data loaded in this conversation — ask me anything about those datasets instead.",
    };
  } catch {
    return null;
  }
}

/** One cheap, no-reasoning classifier call. Returns the raw text, or null on error. */
async function runClassifier(
  prompt: string,
  provider: "anthropic" | "openrouter",
  apiKey: string,
): Promise<string | null> {
  try {
    if (provider === "anthropic") {
      const client = new Anthropic({ apiKey });
      const resp = await client.messages.create({
        model: MODEL_ANTHROPIC,
        max_tokens: 200,
        thinking: { type: "disabled" }, // effort none — cheapest, deterministic
        messages: [{ role: "user", content: prompt }],
      });
      return resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
    }
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL_OPENROUTER,
        messages: [{ role: "user", content: prompt }],
        reasoning: { effort: "none" },
        max_tokens: 200,
      }),
    });
    if (!resp.ok) return null;
    const j = await resp.json();
    return String(j?.choices?.[0]?.message?.content ?? "");
  } catch {
    return null;
  }
}

export async function classifyScope(
  question: string,
  datasets: { alias: string; name: string; columns: string[] }[],
  provider: "anthropic" | "openrouter",
  apiKey: string,
): Promise<ScopeVerdict> {
  const text = await runClassifier(buildPrompt(question, datasets), provider, apiKey);
  if (text === null) return { inScope: true }; // fail open
  return parseVerdict(text) ?? { inScope: true };
}

function buildIntentPrompt(
  question: string,
  datasets: { alias: string; name: string; columns: string[] }[],
): string {
  const desc = datasets
    .map((d) => `- ${d.alias} ("${d.name}"): columns [${d.columns.join(", ")}]`)
    .join("\n");
  return `You are a router for a data-analysis companion used by business decision makers. It analyzes the following loaded datasets with pandas:

${desc}

Question: "${question}"

Decide TWO things.

1. SCOPE — can this question be MEANINGFULLY INFORMED by analyzing these datasets?
   IN scope: analytical questions (metrics, trends, comparisons, rates, rankings, outliers, data quality), follow-ups referring to earlier analysis of this data, and DECISION-SUPPORT questions about the business/domain this data describes ("what should I do / prioritize / fix?", "where are we losing money?"). Lean in-scope whenever the data could inform the question, even partially.
   OUT of scope: questions requiring knowledge the data cannot provide at all (world events, sports, celebrity/politics, market predictions, general coding help, other companies' private data, math homework).

2. INTENT — how much analytical machinery does the question deserve?
   - "quick_fact": a lookup, a count, or a single number ("how many rows?", "what's the max order value?", "which region has the most customers?").
   - "analytical": needs real computation but not a full deliverable ("what's the return rate by category?", "how did sales trend over the year?").
   - "decision": asks what to do / prioritize / where the risk or opportunity is ("what should I focus on?", "where are we losing money?", "what would you recommend?").

Respond with ONLY a JSON object, no other text:
{"in_scope": true, "intent": "quick_fact" | "analytical" | "decision"}
or, if out of scope:
{"in_scope": false, "intent": "analytical", "refusal": "one or two friendly sentences declining and steering back to what you CAN analyze in this data"}`;
}

function parseIntent(text: string): IntentVerdict | null {
  try {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first === -1 || last <= first) return null;
    const j = JSON.parse(text.slice(first, last + 1)) as {
      in_scope?: boolean;
      intent?: string;
      refusal?: string;
    };
    if (typeof j.in_scope !== "boolean") return null;
    const intent: AnalysisMode =
      j.intent === "quick_fact" || j.intent === "decision" ? j.intent : "analytical";
    return {
      inScope: j.in_scope,
      intent,
      refusal:
        typeof j.refusal === "string" && j.refusal.trim()
          ? j.refusal.trim()
          : "I can only analyze the data loaded in this conversation — ask me anything about those datasets instead.",
    };
  } catch {
    return null;
  }
}

/**
 * Scope + intent in one cheap, no-reasoning call. Fails OPEN to an in-scope,
 * analytical verdict so a flaky classifier never blocks legitimate analysis.
 */
export async function classifyIntent(
  question: string,
  datasets: { alias: string; name: string; columns: string[] }[],
  provider: "anthropic" | "openrouter",
  apiKey: string,
): Promise<IntentVerdict> {
  const text = await runClassifier(buildIntentPrompt(question, datasets), provider, apiKey);
  if (text === null) return { inScope: true, intent: "analytical" }; // fail open
  return parseIntent(text) ?? { inScope: true, intent: "analytical" };
}

// ── Document intent (v3 §6/§14) ───────────────────────────────────────────────

function buildDocumentIntentPrompt(
  question: string,
  documents: { alias: string; name: string; docType?: string }[],
): string {
  const desc = documents
    .map((d) => `- ${d.alias} ("${d.name}"${d.docType ? `, a ${d.docType}` : ""})`)
    .join("\n");
  return `You are a router for a document-analysis companion. It reads the following loaded document(s) and answers questions by retrieving and citing passages:

${desc}

Question: "${question}"

Decide TWO things.

1. SCOPE — can this be answered from the loaded document(s)? IN scope: anything about their content — summaries, requirements, obligations, terms, risks, compliance ("does X satisfy the RFP?"), extraction, comparisons. OUT of scope: questions with no connection to these documents (world events, general knowledge, other files). Lean in-scope whenever the documents could inform the question.

2. INTENT:
   - "quick_fact": a trivial lookup answerable in a sentence ("what's the submission deadline?", "who is the issuing party?", "what's the contract value?").
   - "document_review": anything substantive — summarize, extract every requirement/obligation, assess compliance or risk, "does our proposal satisfy the RFP?", "what changed?". Default to this when unsure.

Respond with ONLY a JSON object, no other text:
{"in_scope": true, "intent": "quick_fact" | "document_review"}
or, if out of scope:
{"in_scope": false, "intent": "document_review", "refusal": "one or two friendly sentences declining and steering back to the loaded document(s)"}`;
}

function parseDocumentIntent(text: string): IntentVerdict | null {
  try {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first === -1 || last <= first) return null;
    const j = JSON.parse(text.slice(first, last + 1)) as {
      in_scope?: boolean;
      intent?: string;
      refusal?: string;
    };
    if (typeof j.in_scope !== "boolean") return null;
    const intent: AnalysisMode = j.intent === "quick_fact" ? "quick_fact" : "document_review";
    return {
      inScope: j.in_scope,
      intent,
      refusal:
        typeof j.refusal === "string" && j.refusal.trim()
          ? j.refusal.trim()
          : "I can only answer from the document(s) loaded in this conversation — ask me about those instead.",
    };
  } catch {
    return null;
  }
}

/**
 * Scope + intent for a DOCUMENT conversation. Fails OPEN to an in-scope,
 * document_review verdict so a flaky classifier never blocks legitimate review.
 */
export async function classifyDocumentIntent(
  question: string,
  documents: { alias: string; name: string; docType?: string }[],
  provider: "anthropic" | "openrouter",
  apiKey: string,
): Promise<IntentVerdict> {
  const text = await runClassifier(buildDocumentIntentPrompt(question, documents), provider, apiKey);
  if (text === null) return { inScope: true, intent: "document_review" }; // fail open
  return parseDocumentIntent(text) ?? { inScope: true, intent: "document_review" };
}
