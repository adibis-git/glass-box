// Version-diff (v3 §15.2) — tabular schema/row diff plus a fail-soft Claude
// "what materially changed" prose summary. Provider selection mirrors
// server/agent/scopeGate.ts. All model calls are claude-sonnet-5 at low effort.

import Anthropic from "@anthropic-ai/sdk";
import type { DocSection } from "@/lib/agent/context";

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

// ── Document diff (v3 §15.2) ──────────────────────────────────────────────────

export interface DocSnapshot {
  version: number;
  text: string;
  sections: DocSection[];
}

export interface DocumentDiff {
  kind: "document";
  from: { version: number; sectionCount: number; wordCount: number };
  to: { version: number; sectionCount: number; wordCount: number };
  sections: { added: string[]; removed: string[]; modified: string[] };
  /** Prose "what materially changed" (empty when the model call is unavailable). */
  summary: string;
}

const anchorOffset = (anchor: string): number => Number(anchor.replace(/^c/, "")) || 0;
const normHeading = (h: string): string => h.toLowerCase().replace(/\s+/g, " ").trim();
const normBody = (s: string): string => s.replace(/\s+/g, " ").trim();
const wordCount = (s: string): number => (s.match(/\S+/g) ?? []).length;

/** Map each section heading to its body text (slice between consecutive anchors). */
function sectionBodies(snap: DocSnapshot): Map<string, { heading: string; body: string }> {
  const out = new Map<string, { heading: string; body: string }>();
  const secs = [...snap.sections].sort((a, b) => anchorOffset(a.anchor) - anchorOffset(b.anchor));
  for (let i = 0; i < secs.length; i++) {
    const start = anchorOffset(secs[i].anchor);
    const end = i + 1 < secs.length ? anchorOffset(secs[i + 1].anchor) : snap.text.length;
    out.set(normHeading(secs[i].heading), {
      heading: secs[i].heading,
      body: normBody(snap.text.slice(start, end)),
    });
  }
  return out;
}

/** Section-level text diff: headings added/removed and bodies modified. */
export function computeDocumentDiff(
  from: DocSnapshot,
  to: DocSnapshot,
): Omit<DocumentDiff, "summary"> {
  const fromMap = sectionBodies(from);
  const toMap = sectionBodies(to);

  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];

  for (const [key, v] of toMap) {
    if (!fromMap.has(key)) added.push(v.heading);
    else if (fromMap.get(key)!.body !== v.body) modified.push(v.heading);
  }
  for (const [key, v] of fromMap) {
    if (!toMap.has(key)) removed.push(v.heading);
  }

  return {
    kind: "document",
    from: { version: from.version, sectionCount: from.sections.length, wordCount: wordCount(from.text) },
    to: { version: to.version, sectionCount: to.sections.length, wordCount: wordCount(to.text) },
    sections: { added, removed, modified },
  };
}

function buildDocDiffPrompt(
  sourceName: string,
  diff: Omit<DocumentDiff, "summary">,
  from: DocSnapshot,
  to: DocSnapshot,
): string {
  const fromMap = sectionBodies(from);
  const toMap = sectionBodies(to);
  const excerpt = (s: string) => (s.length > 500 ? s.slice(0, 500) + "…" : s);

  const changes: string[] = [];
  for (const h of diff.sections.modified.slice(0, 12)) {
    const key = normHeading(h);
    changes.push(
      `## MODIFIED — ${h}\nBefore: ${excerpt(fromMap.get(key)?.body ?? "")}\nAfter: ${excerpt(toMap.get(key)?.body ?? "")}`,
    );
  }
  for (const h of diff.sections.added.slice(0, 12)) {
    changes.push(`## ADDED — ${h}\n${excerpt(toMap.get(normHeading(h))?.body ?? "")}`);
  }
  for (const h of diff.sections.removed.slice(0, 12)) {
    changes.push(`## REMOVED — ${h}\n${excerpt(fromMap.get(normHeading(h))?.body ?? "")}`);
  }

  return `You are summarizing what MATERIALLY changed between two versions of a business document for a decision-maker.

Document: "${sourceName}"
Comparing v${diff.from.version} → v${diff.to.version}.
Sections: ${diff.from.sectionCount} → ${diff.to.sectionCount}. Words: ${diff.from.wordCount} → ${diff.to.wordCount}.
Added sections: ${diff.sections.added.join(", ") || "none"}
Removed sections: ${diff.sections.removed.join(", ") || "none"}
Modified sections: ${diff.sections.modified.join(", ") || "none"}

Section changes (with excerpts):
${changes.join("\n\n") || "(no section-level text changes detected)"}

Write 2-4 plain sentences capturing what substantively changed and why it matters — be concrete (e.g. "payment terms Net-30 → Net-45", "SLA tightened 99.5% → 99.9%", "new indemnity clause", "3 requirements added"). Quote specific numbers/terms from the excerpts. If nothing material changed, say so. Respond with prose only — no JSON, no preamble.`;
}

/** Fail-soft Claude prose summary of a document diff. Returns "" on any error. */
export async function summarizeDocumentDiff(
  sourceName: string,
  diff: Omit<DocumentDiff, "summary">,
  from: DocSnapshot,
  to: DocSnapshot,
): Promise<string> {
  const sel = chooseProvider();
  if (!sel) return "";
  const prompt = buildDocDiffPrompt(sourceName, diff, from, to);
  try {
    if (sel.provider === "anthropic") {
      const client = new Anthropic({ apiKey: sel.apiKey });
      const resp = await client.messages.create({
        model: MODEL_ANTHROPIC,
        max_tokens: 500,
        output_config: { effort: "low" },
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
        reasoning: { effort: "low" },
        max_tokens: 500,
      }),
    });
    if (!resp.ok) return "";
    const j = await resp.json();
    return String(j?.choices?.[0]?.message?.content ?? "").trim();
  } catch {
    return "";
  }
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
