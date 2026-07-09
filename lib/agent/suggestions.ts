// Guided-question suggestions (v3 §5).
//
// Two one-shot, low-effort claude-sonnet-5 calls that turn the Context Pack into
// clickable prompts: persona×data "starter questions" for a fresh conversation,
// and "follow-ups" after a run settles. Both fail SOFT to [] — suggestions are a
// nicety, never allowed to block conversation creation or a completed analysis.

import Anthropic from "@anthropic-ai/sdk";
import type { ContextPack, DatasetContext } from "@/lib/agent/context";
import type { Suggestion } from "@/lib/agent/events";

export type { Suggestion };

const MODEL_ANTHROPIC = "claude-sonnet-5";
const MODEL_OPENROUTER = "anthropic/claude-sonnet-5";

type Provider = "anthropic" | "openrouter";

/** Env-driven provider selection, mirroring the runner/scope-gate pattern. */
function chooseProvider(): { provider: Provider; apiKey: string } | null {
  const forced = process.env.AGENT_PROVIDER?.toLowerCase();
  const anthropic = process.env.ANTHROPIC_API_KEY;
  const openrouter = process.env.OPENROUTER_API_KEY;
  if (forced === "anthropic" && anthropic) return { provider: "anthropic", apiKey: anthropic };
  if (forced === "openrouter" && openrouter) return { provider: "openrouter", apiKey: openrouter };
  if (anthropic) return { provider: "anthropic", apiKey: anthropic };
  if (openrouter) return { provider: "openrouter", apiKey: openrouter };
  return null;
}

/** One low-effort model call returning raw text, or null on any error. */
async function callModel(prompt: string): Promise<string | null> {
  const chosen = chooseProvider();
  if (!chosen) return null;
  try {
    if (chosen.provider === "anthropic") {
      const client = new Anthropic({ apiKey: chosen.apiKey });
      const resp = await client.messages.create({
        model: MODEL_ANTHROPIC,
        max_tokens: 400,
        output_config: { effort: "low" },
        messages: [{ role: "user", content: prompt }],
      });
      return resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
    }
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${chosen.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL_OPENROUTER,
        messages: [{ role: "user", content: prompt }],
        reasoning: { effort: "low" },
        max_tokens: 400,
      }),
    });
    if (!resp.ok) return null;
    const j = await resp.json();
    return String(j?.choices?.[0]?.message?.content ?? "");
  } catch {
    return null;
  }
}

/**
 * Pull a JSON array of suggestions out of a model reply. Each element may be a
 * `{ label, question }` object (new shape) or a bare string (legacy / model
 * shortcut) — a string is treated as both the chip label and the full question.
 * Returns [] if none can be recovered.
 */
function parseSuggestionArray(text: string | null, max: number): Suggestion[] {
  if (!text) return [];
  const first = text.indexOf("[");
  const last = text.lastIndexOf("]");
  if (first === -1 || last <= first) return [];
  try {
    const arr = JSON.parse(text.slice(first, last + 1));
    if (!Array.isArray(arr)) return [];
    const out: Suggestion[] = [];
    for (const item of arr) {
      if (typeof item === "string") {
        const q = item.trim();
        if (q) out.push({ label: q, question: q });
      } else if (item && typeof item === "object") {
        const question = String((item as { question?: unknown }).question ?? "").trim();
        const label = String((item as { label?: unknown }).label ?? "").trim() || question;
        if (question) out.push({ label, question });
      }
      if (out.length >= max) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** Compact, model-facing description of the loaded data + who's asking. */
function describePack(pack: ContextPack): string {
  const lines: string[] = [];
  if (pack.persona) lines.push(`Audience: ${pack.persona.label}. ${pack.persona.framing}`);
  if (pack.org.domain) lines.push(`Business context: ${pack.org.domain}.`);
  if (pack.org.vertical) lines.push(`Industry: ${pack.org.vertical}.`);
  lines.push("", "Loaded datasets:");
  for (const d of pack.datasets) lines.push(describeDataset(d));
  return lines.join("\n");
}

function describeDataset(d: DatasetContext): string {
  const cols = d.columns
    .slice(0, 40)
    .map((c) => `${c.name} (${c.semanticType})`)
    .join(", ");
  const parts = [
    `- ${d.alias} ("${d.name}")${d.rowCount != null ? `, ${d.rowCount.toLocaleString()} rows` : ""}`,
  ];
  if (d.domain?.description) parts.push(`  ${d.domain.description}`);
  if (cols) parts.push(`  columns: ${cols}`);
  return parts.join("\n");
}

/** 4-6 persona×data starter questions for a new conversation. Fails soft to []. */
export async function generateStarterQuestions(pack: ContextPack): Promise<Suggestion[]> {
  if (!pack.datasets.length) return [];
  const prompt = `You seed a data-analysis workspace with starter questions the user can click to begin.

${describePack(pack)}

Write 4-6 sharp, specific starter questions this audience would actually want answered from THIS data. Each must be answerable from the loaded columns and prefer decision-relevant angles (trends, segments, rates, risks, opportunities) over trivial lookups. Do not invent columns that aren't listed.

For each, return an object with:
- "label": a terse 3-6 word chip that scans at a glance (e.g. "Revenue by segment", "Top churn drivers")
- "question": the full, specific, naturally-phrased question that gets submitted (as the user would type it)

Respond with ONLY a JSON array of {"label","question"} objects, e.g. [{"label":"...","question":"..."}]. No other text.`;
  return parseSuggestionArray(await callModel(prompt), 6);
}

/** 3 next-step questions after a run. `answerOrReportJson` is the report JSON or answer text. */
export async function generateFollowUps(
  question: string,
  answerOrReportJson: string,
  pack: ContextPack,
): Promise<Suggestion[]> {
  if (!pack.datasets.length) return [];
  const prompt = `You suggest next-step questions in a data-analysis workspace.

${describePack(pack)}

The user just asked: "${question}"

The analysis produced:
${answerOrReportJson.slice(0, 3000)}

Write exactly 3 natural follow-up questions that dig deeper or open a useful adjacent angle, each answerable from the loaded data. Don't repeat the original question. Prefer decision-relevant directions.

For each, return an object with:
- "label": a terse 3-6 word chip that scans at a glance
- "question": the full, specific, naturally-phrased follow-up question that gets submitted

Respond with ONLY a JSON array of exactly 3 {"label","question"} objects. No other text.`;
  return parseSuggestionArray(await callModel(prompt), 3);
}

// ── Document pillar (v3 §5/§14) ───────────────────────────────────────────────

export interface DocDescriptor {
  name: string;
  docType?: string;
  description?: string;
  sections?: string[];
}

function describeDocs(pack: ContextPack, docs: DocDescriptor[]): string {
  const lines: string[] = [];
  if (pack.persona) lines.push(`Audience: ${pack.persona.label}. ${pack.persona.framing}`);
  if (pack.org.domain) lines.push(`Business context: ${pack.org.domain}.`);
  if (pack.org.vertical) lines.push(`Industry: ${pack.org.vertical}.`);
  lines.push("", "Loaded document(s):");
  for (const d of docs) {
    lines.push(`- "${d.name}"${d.docType ? ` (${d.docType})` : ""}`);
    if (d.description) lines.push(`  ${d.description}`);
    if (d.sections?.length) lines.push(`  sections: ${d.sections.slice(0, 20).join("; ")}`);
  }
  return lines.join("\n");
}

/** 4-6 persona×document starter questions for a new document conversation. */
export async function generateDocumentStarters(
  pack: ContextPack,
  docs: DocDescriptor[],
): Promise<Suggestion[]> {
  if (!docs.length) return [];
  const prompt = `You seed a document-analysis workspace with starter questions the user can click to begin.

${describeDocs(pack, docs)}

Write 4-6 sharp, specific starter questions this audience would actually want answered from THESE document(s). Favor high-value angles for the doc type — e.g. for an RFP/requirements doc: "Extract every mandatory requirement", "Where does this put risk on the vendor?"; for a contract/policy: key obligations, liabilities, unusual terms, deadlines. Each must be answerable from the document text.

For each, return an object with:
- "label": a terse 3-6 word chip that scans at a glance (e.g. "Mandatory requirements", "Vendor-side risk")
- "question": the full, specific question that gets submitted

Respond with ONLY a JSON array of {"label","question"} objects. No other text.`;
  return parseSuggestionArray(await callModel(prompt), 6);
}

/** 3 next-step questions after a document run. */
export async function generateDocumentFollowUps(
  question: string,
  answerOrReportJson: string,
  pack: ContextPack,
  docs: DocDescriptor[],
): Promise<Suggestion[]> {
  if (!docs.length) return [];
  const prompt = `You suggest next-step questions in a document-analysis workspace.

${describeDocs(pack, docs)}

The user just asked: "${question}"

The analysis produced:
${answerOrReportJson.slice(0, 3000)}

Write exactly 3 natural follow-up questions that dig deeper or open a useful adjacent angle, each answerable from the document(s). Don't repeat the original question.

For each, return an object with:
- "label": a terse 3-6 word chip that scans at a glance
- "question": the full, specific follow-up question that gets submitted

Respond with ONLY a JSON array of exactly 3 {"label","question"} objects. No other text.`;
  return parseSuggestionArray(await callModel(prompt), 3);
}
