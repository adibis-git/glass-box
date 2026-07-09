// The Context Pack (v3 §1) — the single seam that carries who-is-asking
// (persona × domain × vertical) and what-the-data-is (profile + domain read)
// into the system prompt, kickoff, gates, and UI. All roles/subagents consume it.
//
// SHARED CONTRACT: the source-intelligence layer WRITES `Dataset.profile` in the
// { columns: ColumnProfile[]; domain?: DatasetDomain } shape below; the agent
// core READS it here. Keep these types the single source of truth.

import type { Persona, AnalysisEffort } from "@/lib/generated/prisma/client";
import { PERSONA_FRAMING } from "@/lib/agent/personas";

export type AnalysisMode = "quick_fact" | "analytical" | "decision" | "document_review";

/** Per-column semantic profile computed at ingest (server/ingest/profile.ts). */
export interface ColumnProfile {
  name: string;
  dtype: string; // pandas dtype (existing columnSchema)
  semanticType: "id" | "category" | "metric" | "currency" | "date" | "boolean" | "text";
  cardinality: number;
  nullRate: number; // 0..1
  range?: { min: string; max: string }; // numeric / date
  topCategories?: { value: string; count: number }[]; // low-cardinality only
  unit?: string; // e.g. "USD" inferred from *_usd
}

/** One-time Claude "domain read", cached on Dataset.profile.domain. */
export interface DatasetDomain {
  description: string; // "B2B sales pipeline; one row per prospect…"
  grain: string; // "one row = one prospect"
  metrics: string[];
  entities: string[];
  timeColumns: string[];
  joinKeys: string[];
}

/** Shape persisted at Dataset.profile. */
export interface DatasetProfile {
  columns: ColumnProfile[];
  domain?: DatasetDomain;
}

// ── Document intelligence (v3 §14) ────────────────────────────────────────────

/** One heading in a document's outline, with a stable char-offset anchor. */
export interface DocSection {
  heading: string;
  /** Opaque anchor token the citation tools echo back, e.g. "c1234". */
  anchor: string;
}

/**
 * Document "domain read" (v3 §14.4), persisted at SourceVersion.profile for
 * DOCUMENT sources. The `kind: "document"` discriminator distinguishes it from
 * the tabular DatasetProfile (which carries `columns`) when read back.
 */
export interface DocProfile {
  kind: "document";
  docType: "rfp" | "requirements" | "contract" | "policy" | "report" | "other";
  description: string; // Claude domain read
  sections: DocSection[]; // outline for citation (deterministic anchors)
  keyEntities: string[]; // parties, dates, obligations, amounts
  pageCount: number;
  wordCount: number;
}

/** Narrow a persisted `profile` Json to a DocProfile (vs. a tabular profile). */
export function isDocProfile(profile: unknown): profile is DocProfile {
  return (
    !!profile &&
    typeof profile === "object" &&
    (profile as { kind?: unknown }).kind === "document"
  );
}

export interface DatasetContext {
  alias: string;
  name: string;
  rowCount: number | null;
  sampled: boolean;
  columns: ColumnProfile[];
  domain?: DatasetDomain;
  sampleRows: Record<string, unknown>[];
}

export interface OrgContext {
  domain?: string | null;
  vertical?: string | null;
}

export interface ContextPack {
  persona: { key: Persona; label: string; framing: string } | null;
  org: OrgContext;
  datasets: DatasetContext[];
  starterQuestions?: string[];
}

export function buildContextPack(input: {
  persona: Persona | null;
  org: OrgContext;
  datasets: DatasetContext[];
  starterQuestions?: string[];
}): ContextPack {
  const p = input.persona;
  return {
    persona: p ? { key: p, label: PERSONA_FRAMING[p].label, framing: PERSONA_FRAMING[p].framing } : null,
    org: input.org,
    datasets: input.datasets,
    starterQuestions: input.starterQuestions,
  };
}

/** Map the user-facing effort dial to Claude's effort levels (all Sonnet 5). */
export function effortLevel(e: AnalysisEffort | null | undefined): "low" | "medium" | "high" {
  return e === "HIGH" ? "high" : e === "MEDIUM" ? "medium" : "low";
}
