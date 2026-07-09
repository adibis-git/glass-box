// Version-diff (v3 §15.2) — tabular schema/row diff plus a fail-soft Claude
// "what materially changed" prose summary. Provider selection mirrors
// server/agent/scopeGate.ts. All model calls are claude-sonnet-5 at low effort.

import Anthropic from "@anthropic-ai/sdk";

const MODEL_ANTHROPIC = "claude-sonnet-5";
const MODEL_OPENROUTER = "anthropic/claude-sonnet-5";

type Column = { name: string; dtype: string };

export interface ColumnDelta {
  added: string[];
  removed: string[];
  renamed: { from: string; to: string }[];
  typeChanged: { name: string; from: string; to: string }[];
}

export interface TabularDiff {
  from: { version: number; rowCount: number | null; columnCount: number };
  to: { version: number; rowCount: number | null; columnCount: number };
  rowCountDelta: number | null;
  columns: ColumnDelta;
  /** Prose "what materially changed" (empty when the model call is unavailable). */
  summary: string;
}

/** Pure structural diff of two versions' column schemas + row counts. */
export function computeTabularDiff(
  from: { version: number; rowCount: number | null; columnSchema: Column[] },
  to: { version: number; rowCount: number | null; columnSchema: Column[] },
): Omit<TabularDiff, "summary"> {
  const fromMap = new Map(from.columnSchema.map((c) => [c.name, c.dtype]));
  const toMap = new Map(to.columnSchema.map((c) => [c.name, c.dtype]));

  const removed: string[] = [];
  const typeChanged: { name: string; from: string; to: string }[] = [];
  for (const [name, dtype] of fromMap) {
    if (!toMap.has(name)) removed.push(name);
    else if (toMap.get(name) !== dtype) typeChanged.push({ name, from: dtype, to: toMap.get(name)! });
  }
  const added: string[] = [];
  for (const name of toMap.keys()) if (!fromMap.has(name)) added.push(name);

  // Light rename heuristic: pair a removed and an added column that share a
  // dtype (greedy) — reported as a rename instead of a remove+add.
  const renamed: { from: string; to: string }[] = [];
  const availableAdded = [...added];
  for (const r of [...removed]) {
    const rType = fromMap.get(r);
    const match = availableAdded.find((a) => toMap.get(a) === rType);
    if (match) {
      renamed.push({ from: r, to: match });
      removed.splice(removed.indexOf(r), 1);
      added.splice(added.indexOf(match), 1);
      availableAdded.splice(availableAdded.indexOf(match), 1);
    }
  }

  return {
    from: { version: from.version, rowCount: from.rowCount, columnCount: from.columnSchema.length },
    to: { version: to.version, rowCount: to.rowCount, columnCount: to.columnSchema.length },
    rowCountDelta:
      from.rowCount != null && to.rowCount != null ? to.rowCount - from.rowCount : null,
    columns: { added, removed, renamed, typeChanged },
  };
}

function chooseProvider(): { provider: "anthropic" | "openrouter"; apiKey: string } | null {
  const forced = process.env.AGENT_PROVIDER?.toLowerCase();
  const anthropic = process.env.ANTHROPIC_API_KEY;
  const openrouter = process.env.OPENROUTER_API_KEY;
  if (forced === "anthropic" && anthropic) return { provider: "anthropic", apiKey: anthropic };
  if (forced === "openrouter" && openrouter) return { provider: "openrouter", apiKey: openrouter };
  if (anthropic) return { provider: "anthropic", apiKey: anthropic };
  if (openrouter) return { provider: "openrouter", apiKey: openrouter };
  return null;
}

function buildPrompt(sourceName: string, diff: Omit<TabularDiff, "summary">): string {
  return `You are summarizing what changed between two versions of a tabular dataset for a business decision-maker.

Dataset: "${sourceName}"
Comparing v${diff.from.version} → v${diff.to.version}.

Structured diff (JSON):
${JSON.stringify(diff, null, 2)}

Write 1-3 plain sentences describing what MATERIALLY changed and why it might matter (e.g. new columns unlock new analysis, dropped columns break prior analysis, row-count swings, dtype changes hinting at data-quality shifts). Be concrete and use the actual column names. If nothing meaningful changed, say so briefly. Respond with prose only — no JSON, no preamble.`;
}

/** Fail-soft Claude prose summary of a structural diff. Returns "" on any error. */
export async function summarizeTabularDiff(
  sourceName: string,
  diff: Omit<TabularDiff, "summary">,
): Promise<string> {
  const sel = chooseProvider();
  if (!sel) return "";
  const prompt = buildPrompt(sourceName, diff);
  try {
    if (sel.provider === "anthropic") {
      const client = new Anthropic({ apiKey: sel.apiKey });
      const resp = await client.messages.create({
        model: MODEL_ANTHROPIC,
        max_tokens: 400,
        thinking: { type: "disabled" },
        messages: [{ role: "user", content: prompt }],
      });
      return resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
    }
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${sel.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL_OPENROUTER,
        messages: [{ role: "user", content: prompt }],
        reasoning: { effort: "none" },
        max_tokens: 400,
      }),
    });
    if (!resp.ok) return "";
    const j = await resp.json();
    return String(j?.choices?.[0]?.message?.content ?? "").trim();
  } catch {
    return "";
  }
}
