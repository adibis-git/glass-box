// Guided-question suggestions (v3 §5).
//
// Two one-shot, low-effort claude-sonnet-5 calls that turn the Context Pack into
// clickable prompts: persona×data "starter questions" for a fresh conversation,
// and "follow-ups" after a run settles. Both fail SOFT to [] — suggestions are a
// nicety, never allowed to block conversation creation or a completed analysis.

import Anthropic from "@anthropic-ai/sdk";
import type { ContextPack, DatasetContext } from "@/lib/agent/context";

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

/** Pull a JSON string[] out of a model reply. Returns [] if none can be recovered. */
function parseQuestionArray(text: string | null, max: number): string[] {
  if (!text) return [];
  const first = text.indexOf("[");
  const last = text.lastIndexOf("]");
  if (first === -1 || last <= first) return [];
  try {
    const arr = JSON.parse(text.slice(first, last + 1));
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((q): q is string => typeof q === "string")
      .map((q) => q.trim())
      .filter(Boolean)
      .slice(0, max);
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
export async function generateStarterQuestions(pack: ContextPack): Promise<string[]> {
  if (!pack.datasets.length) return [];
  const prompt = `You seed a data-analysis workspace with starter questions the user can click to begin.

${describePack(pack)}

Write 4-6 sharp, specific starter questions this audience would actually want answered from THIS data. Each must be answerable from the loaded columns, be phrased naturally (as the user would type it), and prefer decision-relevant angles (trends, segments, rates, risks, opportunities) over trivial lookups. Do not invent columns that aren't listed.

Respond with ONLY a JSON array of strings, e.g. ["...", "...", "..."]. No other text.`;
  return parseQuestionArray(await callModel(prompt), 6);
}

/** 3 next-step questions after a run. `answerOrReportJson` is the report JSON or answer text. */
export async function generateFollowUps(
  question: string,
  answerOrReportJson: string,
  pack: ContextPack,
): Promise<string[]> {
  if (!pack.datasets.length) return [];
  const prompt = `You suggest next-step questions in a data-analysis workspace.

${describePack(pack)}

The user just asked: "${question}"

The analysis produced:
${answerOrReportJson.slice(0, 3000)}

Write exactly 3 natural follow-up questions that dig deeper or open a useful adjacent angle, each answerable from the loaded data. Don't repeat the original question. Prefer decision-relevant directions.

Respond with ONLY a JSON array of exactly 3 strings. No other text.`;
  return parseQuestionArray(await callModel(prompt), 3);
}
