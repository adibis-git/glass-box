// Source-intelligence layer (v3 §4) — the one-time Claude "domain read".
//
// A single claude-sonnet-5 low-effort call that turns a dataset's columns +
// sample into a DatasetDomain (what the data IS: grain, metrics, entities,
// time/join keys). Cached on Dataset.profile.domain by the datasets POST route.
// Fail-soft: returns null on any error so upload is never blocked.
//
// Provider selection + env handling mirror server/agent/scopeGate.ts.

import Anthropic from "@anthropic-ai/sdk";
import type { ColumnProfile, DatasetDomain } from "@/lib/agent/context";

const MODEL_ANTHROPIC = "claude-sonnet-5";
const MODEL_OPENROUTER = "anthropic/claude-sonnet-5";

type Provider = "anthropic" | "openrouter";

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

function buildPrompt(
  name: string,
  columns: ColumnProfile[],
  sampleRows: Record<string, unknown>[],
): string {
  const cols = columns
    .map((c) => {
      const bits = [c.semanticType, c.dtype];
      if (c.unit) bits.push(c.unit);
      return `- ${c.name} (${bits.join(", ")})`;
    })
    .join("\n");
  const sample = JSON.stringify(sampleRows.slice(0, 10));
  return `You are profiling a tabular dataset for a data-analysis companion. Read the columns and a few sample rows, then describe what this data IS.

Dataset name: "${name}"

Columns:
${cols}

Sample rows (JSON): ${sample}

Respond with ONLY a JSON object, no other text:
{
  "description": "1-2 sentences: what this dataset is and what each row represents",
  "grain": "one row = one <entity> (the unit of analysis)",
  "metrics": ["column names that are measures worth aggregating"],
  "entities": ["business entities/dimensions this data is about"],
  "timeColumns": ["column names that carry dates/times"],
  "joinKeys": ["column names usable as keys to join to other data"]
}
Use exact column names from the list. Use [] for any list you cannot fill.`;
}

function parseDomain(text: string): DatasetDomain | null {
  try {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first === -1 || last <= first) return null;
    const j = JSON.parse(text.slice(first, last + 1)) as Record<string, unknown>;
    const strArr = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    const description = typeof j.description === "string" ? j.description.trim() : "";
    const grain = typeof j.grain === "string" ? j.grain.trim() : "";
    if (!description && !grain) return null;
    return {
      description,
      grain,
      metrics: strArr(j.metrics),
      entities: strArr(j.entities),
      timeColumns: strArr(j.timeColumns),
      joinKeys: strArr(j.joinKeys),
    };
  } catch {
    return null;
  }
}

/**
 * One cheap Claude call that returns the dataset's domain read, or null on any
 * error (missing key, network, bad JSON) — callers must treat null as "skip".
 */
export async function describeDataset(
  name: string,
  columns: ColumnProfile[],
  sampleRows: Record<string, unknown>[],
): Promise<DatasetDomain | null> {
  const sel = chooseProvider();
  if (!sel) return null;
  const { provider, apiKey } = sel;
  const prompt = buildPrompt(name, columns, sampleRows);
  try {
    let text = "";
    if (provider === "anthropic") {
      const client = new Anthropic({ apiKey });
      const resp = await client.messages.create({
        model: MODEL_ANTHROPIC,
        max_tokens: 600,
        thinking: { type: "disabled" },
        messages: [{ role: "user", content: prompt }],
      });
      text = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
    } else {
      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL_OPENROUTER,
          messages: [{ role: "user", content: prompt }],
          reasoning: { effort: "none" },
          max_tokens: 600,
        }),
      });
      if (!resp.ok) return null;
      const j = await resp.json();
      text = String(j?.choices?.[0]?.message?.content ?? "");
    }
    return parseDomain(text);
  } catch {
    return null;
  }
}
