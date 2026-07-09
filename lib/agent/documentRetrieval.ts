// Document retrieval (v3 §14.2) — deterministic keyword/overlap ranking over
// chunked text. No embeddings dependency: short docs pass whole (the caller
// includes full text in the kickoff), long docs are chunked here and the top
// passages are surfaced per `search_document` call, each carrying the section
// anchor the model cites.

import type { DocSection } from "@/lib/agent/context";
import { sectionForOffset } from "@/server/ingest/document";

export interface DocChunk {
  docAlias: string;
  anchor: string; // "c<startOffset>"
  start: number;
  section?: string;
  text: string;
}

export interface Passage extends DocChunk {
  score: number;
}

export interface RetrievableDoc {
  alias: string;
  text: string;
  sections: DocSection[];
}

const CHUNK_CHARS = 1200;
const OVERLAP = 200;

const STOPWORDS = new Set([
  "the", "and", "for", "are", "with", "that", "this", "from", "have", "has", "will",
  "shall", "any", "all", "not", "our", "your", "their", "its", "was", "were", "been",
  "what", "which", "who", "how", "does", "did", "can", "could", "would", "should",
  "about", "into", "than", "then", "there", "these", "those", "such", "each", "per",
]);

/** Fixed-window chunks (with overlap), anchored by char offset. */
export function chunkDocument(doc: RetrievableDoc): DocChunk[] {
  const chunks: DocChunk[] = [];
  const step = Math.max(1, CHUNK_CHARS - OVERLAP);
  for (let start = 0; start < doc.text.length; start += step) {
    const text = doc.text.slice(start, start + CHUNK_CHARS).trim();
    if (!text) continue;
    chunks.push({
      docAlias: doc.alias,
      anchor: `c${start}`,
      start,
      section: sectionForOffset(doc.sections, start),
      text,
    });
    if (start + CHUNK_CHARS >= doc.text.length) break;
  }
  return chunks;
}

function tokenize(s: string): string[] {
  return [...new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w)),
  )];
}

/** Score a chunk by query-term frequency + a whole-phrase bonus. */
function scoreChunk(chunkText: string, queryTokens: string[], phrase: string): number {
  const lower = chunkText.toLowerCase();
  let score = 0;
  for (const t of queryTokens) {
    let idx = lower.indexOf(t);
    while (idx !== -1) {
      score += 1;
      idx = lower.indexOf(t, idx + t.length);
    }
  }
  if (phrase.length >= 4 && lower.includes(phrase)) score += 5;
  return score;
}

/**
 * Rank passages across all docs for a query. `docAlias` filter narrows to one
 * document. Returns up to `k` passages, best first; falls back to the head of
 * the doc(s) when nothing matches so the model always gets grounding.
 */
export function retrievePassages(
  docs: RetrievableDoc[],
  query: string,
  k = 6,
  docAlias?: string,
): Passage[] {
  const pool = docAlias ? docs.filter((d) => d.alias === docAlias) : docs;
  const tokens = tokenize(query);
  const phrase = query.trim().toLowerCase();

  const scored: Passage[] = [];
  for (const doc of pool) {
    for (const c of chunkDocument(doc)) {
      scored.push({ ...c, score: scoreChunk(c.text, tokens, phrase) });
    }
  }

  const hits = scored.filter((p) => p.score > 0).sort((a, b) => b.score - a.score);
  if (hits.length) return hits.slice(0, k);
  // No keyword hits → return the opening passages as a weak fallback.
  return scored.sort((a, b) => a.start - b.start).slice(0, k);
}

/** Format retrieved passages for a `search_document` tool result. */
export function formatPassages(passages: Passage[]): string {
  if (!passages.length) return "No passages found.";
  return passages
    .map((p) => {
      const loc = [`anchor: ${p.anchor}`, p.docAlias, p.section ? `§ ${p.section}` : null]
        .filter(Boolean)
        .join(" · ");
      return `[${loc}]\n${p.text}`;
    })
    .join("\n\n---\n\n");
}
