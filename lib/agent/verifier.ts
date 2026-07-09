// Grounding verifier (v3 §16.2) — a cheap evaluator-optimizer pass that runs
// AFTER a report is composed but BEFORE it is emitted/persisted, so a low-effort
// Sonnet 5 answer can't ship a headline number or claim the evidence doesn't
// support. One claude-sonnet-5 LOW-effort call checks every headline number,
// metric, and key claim against the run's EVIDENCE (the printed tool/exec
// outputs the tabular model saw, or the verbatim quotes the document model
// cited) and, when it can, returns a lightly `corrected` report that prunes or
// softens whatever isn't supported — never inventing new data.
//
// Only wired for decision / document_review runs (cost). Fails SOFT: any error,
// unparseable verdict, or missing evidence returns {ok:true, issues:[]} so the
// verifier can never block a report. Provider/env selection mirrors scopeGate.ts.

import Anthropic from "@anthropic-ai/sdk";
import { normalizeReport } from "@/lib/agent/report";
import type { FinalReport } from "@/lib/types";

const MODEL_ANTHROPIC = "claude-sonnet-5";
const MODEL_OPENROUTER = "anthropic/claude-sonnet-5";

export interface VerifyInput {
  /** The report just composed by the run, about to be emitted. */
  report: FinalReport;
  /**
   * The evidence the model actually saw:
   *  - tabular: concatenated printed run_python / execution outputs
   *  - document: the verbatim quotes the model cited
   */
  evidence: string;
  /** The user's question (frames what "key claim" means). */
  question: string;
  provider: "anthropic" | "openrouter";
  apiKey: string;
}

export interface VerifyResult {
  ok: boolean;
  issues: string[];
  /** A lightly-pruned report when the model could repair unsupported claims. */
  corrected?: FinalReport;
}

const OK: VerifyResult = { ok: true, issues: [] };

/** Cap the evidence we send so verification stays a cheap single call. */
const MAX_EVIDENCE_CHARS = 24_000;

function buildPrompt(report: FinalReport, evidence: string, question: string): string {
  const clipped =
    evidence.length > MAX_EVIDENCE_CHARS
      ? evidence.slice(0, MAX_EVIDENCE_CHARS) + "\n…[evidence truncated]…"
      : evidence;
  return `You are a strict grounding checker for a data/document analysis tool. A report was drafted to answer a user's question. Your ONLY job is to confirm that every headline number, hero metric, and key factual claim in the report is DIRECTLY SUPPORTED by the EVIDENCE below — the actual computed outputs (or cited passages) the analyst saw. Flag anything fabricated, guessed, mis-stated, or not derivable from the evidence.

USER QUESTION: "${question}"

EVIDENCE (the only ground truth — printed computation outputs and/or verbatim cited quotes):
"""
${clipped}
"""

REPORT (JSON) under review:
"""
${JSON.stringify(report, null, 2)}
"""

Check the headline, summary, every metric value, and every insight finding/evidence line. A claim is SUPPORTED only if the number or fact appears in, or is a straightforward calculation from, the EVIDENCE. Qualitative framing and recommendations are fine as long as they don't assert unsupported numbers or facts.

If EVERYTHING is supported, respond with ONLY:
{"ok": true}

If one or more claims are unsupported, respond with ONLY:
{"ok": false, "issues": ["short description of each unsupported/fabricated claim"], "corrected": { ...the SAME report with unsupported specifics removed or softened... }}

Rules for "corrected":
- Return the FULL report object (headline, summary, metrics, insights, and recommendation if present) in the exact same shape.
- ONLY prune or soften what is unsupported: drop a fabricated metric, remove an unsupported number, or reword a claim to what the evidence actually shows.
- NEVER invent new numbers, metrics, or findings, and never add data not present in the evidence.
- If you cannot produce a safe corrected version, omit the "corrected" field and just list the issues.

Respond with ONLY the JSON object, no other text.`;
}

/** One cheap LOW-effort call. Returns raw text, or null on any error. */
async function runVerifier(
  prompt: string,
  provider: "anthropic" | "openrouter",
  apiKey: string,
): Promise<string | null> {
  try {
    if (provider === "anthropic") {
      const client = new Anthropic({ apiKey });
      const resp = await client.messages.create({
        model: MODEL_ANTHROPIC,
        max_tokens: 1500,
        output_config: { effort: "low" }, // cheapest useful reasoning
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
        reasoning: { effort: "low" },
        max_tokens: 1500,
      }),
    });
    if (!resp.ok) return null;
    const j = await resp.json();
    return String(j?.choices?.[0]?.message?.content ?? "");
  } catch {
    return null;
  }
}

function parseVerdict(text: string): VerifyResult {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last <= first) return OK;
  let j: {
    ok?: boolean;
    issues?: unknown;
    corrected?: unknown;
  };
  try {
    j = JSON.parse(text.slice(first, last + 1));
  } catch {
    return OK; // fail soft — never block on a malformed verdict
  }
  if (j.ok !== false) return OK; // ok:true or missing → passed

  const issues = Array.isArray(j.issues)
    ? j.issues.map((s) => String(s)).filter((s) => s.trim())
    : [];

  let corrected: FinalReport | undefined;
  if (j.corrected && typeof j.corrected === "object") {
    const c = normalizeReport(j.corrected as Record<string, unknown>);
    // Only accept a correction that is still a usable report.
    if (c.summary.trim() || c.headline.trim() || c.insights.length) corrected = c;
  }

  return {
    ok: false,
    issues: issues.length ? issues : ["One or more claims could not be verified against the evidence."],
    corrected,
  };
}

/**
 * Verify a composed report against the run's evidence. One LOW-effort Sonnet 5
 * call. Fails SOFT to {ok:true, issues:[]} on any error, empty evidence, or an
 * unparseable verdict — it can prune an unsupported claim but never blocks a run.
 */
export async function verifyReport(input: VerifyInput): Promise<VerifyResult> {
  const { report, evidence, question, provider, apiKey } = input;
  // No evidence to check against, or an empty report → nothing to verify.
  if (!evidence.trim()) return OK;
  if (!report.headline.trim() && !report.summary.trim() && !report.insights.length) return OK;

  const text = await runVerifier(buildPrompt(report, evidence, question), provider, apiKey);
  if (text === null) return OK; // fail soft
  return parseVerdict(text);
}
