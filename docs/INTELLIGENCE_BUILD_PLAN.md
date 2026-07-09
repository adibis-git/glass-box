# Glass Box — Intelligence, Documents & Versioning Build Plan (v3)

**Status:** proposed spec (not yet implemented)
**Supersedes:** v1 (persona/context). v2 (documents + versioning/diff). v3 folds
in the **agentic architecture** (coordinator + subagents on the self-hosted Claude
loop) and a **SaaS posture** (own-it-internally product, monetization sequenced
later). See §16 (agentic) and §17 (SaaS).

**One-line goal:** make Claude's answers materially smarter by feeding it *who is
asking (role × domain × vertical)*, *what the source is (tabular or document,
profiled)*, and *what changed across versions* — split conversational answers
from decision reports — **all Claude, end to end.**

---

## 0. The shape of v2 — two pillars, one metaphor

Glass Box becomes **two analysis engines under one product idea**:

| Pillar | Source kind | Engine | "Shows its work" = |
|---|---|---|---|
| **A. Tabular analytics** (today) | CSV / Excel | Pyodide kernel runs pandas | the Python + its output |
| **B. Document intelligence** (new) | PDF / DOCX / TXT | Claude reads text + cites | the exact clauses/passages cited |

Unified by three things every feature runs through:
1. **Versioned Sources** — one logical artifact, many versions (§2).
2. **The Context Pack** — role × domain × vertical + source profile (§1).
3. **The transparency metaphor** — the glass box shows *evidence*, whether that
   evidence is executed code or a cited paragraph.

**Principles**
- **One model, one effort — `claude-sonnet-5` at `effort: low`, everywhere.**
  Coordinator, workers, gates, verifier, domain read, suggestions, diff — all the
  same tier and effort. Cost-driven and deliberate: no Opus/Fable, no per-role
  tiering, no high/xhigh. The dial we *do* use is **context + prompting**, not
  effort (§16.4). Low effort is also a cost lever (fewer, consolidated tool calls;
  less preamble). Keep **adaptive thinking on** (omit `thinking` on Sonnet 5 → it
  runs adaptive) — effort and thinking are separate dials; low effort trims depth,
  adaptive still lets the model think per task.
- **Self-hosted agentic loop** — the coordinator + subagents run on the Anthropic
  TypeScript SDK (`@anthropic-ai/sdk`, already a dep) inside our Next.js Node
  runtime — **not** Managed Agents (§16.1). Keeps tool execution, the WASM
  sandbox, the AgentEvent transparency stream, and the data on *our* infra.
- **One context seam** — `buildContextPack()` feeds prompt, kickoff, gates, UI,
  and every subagent. Prompt-cache its stable prefix (§16.3).
- **Cache aggressively** — every added Claude call runs once and is cached.
- **Context guides, never fabricates** — role/domain/vertical change tone and
  priority; grounding ("only what the source shows / cites") stays absolute; a
  **verifier subagent** enforces it before any report ships (§16.2).
- **Design for SaaS, sequence monetization** — multi-tenant/RBAC/audit/metering
  built in from the start; org self-registration early; billing/payments
  *designed but gated* behind good feedback (§17).

**Non-goals (this phase):** live warehouse connectors; scheduled reports/alerts;
Slack surface; OCR of scanned/image PDFs (text-layer PDFs only — see §14 risks).

---

## 1. The Context Pack (`lib/agent/context.ts`)

Now spans both modalities and carries the full framing triple.

```ts
export type Persona = "SALES" | "SUPPORT" | "FINANCE" | "OPERATIONS" | "CONSULTANT";
export type Vertical = string;   // "Healthcare" | "Fintech" | "SaaS" | "Manufacturing" | "Public" | …
export type SourceKind = "TABULAR" | "DOCUMENT";
export type AnalysisMode = "quick_fact" | "analytical" | "decision" | "document_review";

export interface OrgContext { domain?: string; vertical?: Vertical } // workspace framing

// ── Tabular (v1) ───────────────────────────────────────────────
export interface ColumnProfile { name; dtype; semanticType; cardinality; nullRate; range?; topCategories?; unit? }
export interface DatasetDomain { description; grain; metrics; entities; timeColumns; joinKeys }

// ── Document (new) ─────────────────────────────────────────────
export interface DocProfile {
  docType: "rfp" | "requirements" | "contract" | "policy" | "report" | "other";
  description: string;                 // Claude domain read
  sections: { heading: string; anchor: string }[]; // outline for citation
  keyEntities: string[];               // parties, dates, obligations, amounts
  pageCount: number; wordCount: number;
}

export interface SourceContext {
  sourceId: string; kind: SourceKind; alias: string; name: string;
  versionLabel: string;                // "v3"
  // tabular:
  rowCount?: number | null; sampled?: boolean;
  columns?: ColumnProfile[]; datasetDomain?: DatasetDomain; sampleRows?: Record<string, unknown>[];
  // document:
  doc?: DocProfile;
  // versioning:
  versionDiffSummary?: string;         // "vs v2: 3 requirements added, SLA tightened" (§15)
}

export interface ContextPack {
  persona: { key: Persona; label: string; framing: string } | null;
  org: OrgContext;                     // domain + vertical
  sources: SourceContext[];
  starterQuestions?: string[];
}
```

**Injection map**

| Consumer | Uses | How |
|---|---|---|
| System prompt | persona.framing, org.domain/vertical, mode | `buildSystemPrompt(pack, mode)` |
| Kickoff | sources[].columns/datasetDomain **or** doc profile | `buildKickoff(pack, question, mode)` |
| Gate | sources + kind | intent + scope classification (§6) |
| UI | starterQuestions, persona, domain/vertical, diff summaries | chips + context strip + "what changed" |

---

## 2. Data model — versioned Sources (the structural refactor)

The central change: **a one-off `Dataset` becomes a `SourceVersion` under a
logical `Source`.** This is what makes "upload v2/v3 into an open conversation"
and "compare versions" possible, for both tabular and document kinds.

```prisma
enum Persona     { SALES SUPPORT FINANCE OPERATIONS CONSULTANT }
enum SourceKind  { TABULAR DOCUMENT }

model Membership { /* …existing… */  persona Persona? }          // role (per user/org)

model Organization {
  /* …existing… */
  domain   String?   // "B2B SaaS sales", "IT procurement" — workspace framing
  vertical String?   // "Healthcare", "Fintech", …
}

// NEW — the logical artifact ("Q3 Vendor RFP", "sales_prospects")
model Source {
  id        String      @id @default(cuid())
  orgId     String
  kind      SourceKind
  name      String
  domain    String?     // optional per-source override of org domain/vertical
  vertical  String?
  createdAt DateTime    @default(now())
  org       Organization      @relation(fields: [orgId], references: [id], onDelete: Cascade)
  versions  SourceVersion[]
  links     ConversationSource[]
  @@index([orgId, kind])
}

// NEW — one uploaded revision. (Absorbs today's Dataset fields for TABULAR.)
model SourceVersion {
  id                 String   @id @default(cuid())
  sourceId           String
  version            Int      // 1..n, monotonic per source
  uploadedById       String?
  originalFilename   String
  mimeType           String
  sizeBytes          BigInt
  storageKey         String   // normalized artifact (CSV for tabular, text for doc)
  originalStorageKey String?
  status             VersionStatus @default(PROCESSING)
  // tabular:
  rowCount     Int?
  columnSchema Json?          // ColumnSchema[]
  sampleRows   Json?
  sampled      Boolean  @default(false)
  normalizations Json?
  // document:
  extractedTextKey String?    // storage key for extracted text/sections
  // shared enrichment (§4):
  profile      Json?          // ColumnProfile[]+DatasetDomain  OR  DocProfile
  createdAt    DateTime @default(now())
  source       Source   @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  @@unique([sourceId, version])
}

// Conversations attach a Source and PIN a version (defaults to latest).
model ConversationSource {
  conversationId String
  sourceId       String
  versionId      String   // the pinned SourceVersion
  alias          String   // python var (tabular) / doc handle
  // …relations…
  @@id([conversationId, sourceId])
}

model Conversation { /* …existing… */  starterQuestions Json? }
model Message      { /* …existing… */  suggestions Json? }

// NEW — cached diff between two versions (§15)
model Comparison {
  id         String   @id @default(cuid())
  sourceId   String
  fromVersion Int
  toVersion   Int
  summary    Json     // structured diff + Claude "what materially changed"
  createdAt  DateTime @default(now())
  @@unique([sourceId, fromVersion, toVersion])
}
```

**Migration path:** the existing `Dataset` table maps to `Source(kind=TABULAR)` +
`SourceVersion(version=1)`. Provide a one-time backfill in the `migrate` step, or
(simpler for the demo timeline) start fresh — the deployed DB currently holds
only demo data. All new fields nullable → safe.

---

## 3. Layer 1 — Role × domain × vertical ("who is asking")

Unchanged from v1 for **persona** (Sales/Support/Finance/Operations/Consultant),
plus two additions:

- **Persona** on `Membership` — captured at signup, editable in Settings.
- **Domain + vertical** on `Organization` — set at workspace creation / Settings
  ("What does this workspace do?" + "Which industry?"). Optional per-`Source`
  override for mixed workspaces (an agency auditing clients across verticals).

`lib/agent/personas.ts` holds the curated framing map (full text below), and the
system prompt now weaves domain/vertical into it.

```ts
export const PERSONA_FRAMING: Record<Persona, { label: string; framing: string }> = {
  SALES:      { label: "Sales leader",              framing: "…pipeline, win rates, quota, velocity, rep performance; lead with revenue impact + one action this week…" },
  SUPPORT:    { label: "Support leader",            framing: "…ticket volume/backlog, resolution & response time, SLA breaches, CSAT, reopen/deflection, agent load…" },
  FINANCE:    { label: "Finance / Business leader", framing: "…revenue, margin, cost drivers, growth, unit economics, concentration/risk; quantify in money and %…" },
  OPERATIONS: { label: "Operations leader",         framing: "…throughput, cycle time, bottlenecks, utilization, defect rates, SLA/on-time; lead with the bottleneck + fix…" },
  CONSULTANT: { label: "Consultant / Analyst",      framing: "…rigorous, hypothesis-driven; question→evidence→confidence; executive summary; caveats + data-quality limits…" },
};
```

System-prompt block: `## Who you're helping — a <persona.label> in <vertical>,
working on <domain>. <framing> …grounding rules unchanged.`

---

## 4. Layer 2 — Source intelligence ("what the source is")

Two kinds, one `profile` field on `SourceVersion`.

**Tabular** (v1): deterministic `computeColumnProfiles()` at upload
(`server/ingest/profile.ts`) → semantic types, cardinality, null rate, ranges,
top categories, units; plus a cached Claude **domain read** (`describeDataset`)
→ description/grain/metrics/entities/time/join-keys. Injected into the kickoff.

**Document** (new): see §14.

---

## 5. Layer 3 — Guided questions ("what should I ask")

`lib/agent/suggestions.ts` — starter chips (cached on `Conversation`) and
per-answer follow-up chips (on `Message.suggestions`). Now **kind- and
version-aware**: a document source suggests *"Extract every mandatory
requirement"*, *"What changed since v2?"*, *"Where does this RFP put risk on the
vendor?"*; a tabular source suggests analytics as in v1. Persona × domain ×
vertical shape all of them.

---

## 6. Conversation vs report split + document mode (all Claude)

Extend the scope gate → `classifyIntent()` returning
`{ inScope, intent, refusal? }` where `intent ∈ {quick_fact, analytical,
decision, document_review}`. The runner routes on `intent` **and** source kind:

- **quick_fact** → 1–3 sentence answer, ≤1 `run_python`, no report.
- **analytical** → few steps, concise answer, optional single chart.
- **decision** → today's full tabular report (plan→code→charts→final_report).
- **document_review** → the document engine (§14): retrieve → reason → cite →
  optional structured report (requirement matrix, gap list, redline summary).

Provider change (unchanged from v1): `run*Turn` / `generate*Report` accept a
built `system` string; the runner composes it from the Context Pack + mode.

---

## 14. Document intelligence pillar (Pillar B)

### 14.1 Ingestion
`server/ingest/document.ts` — extract text from **text-layer PDF / DOCX / TXT**
(server-side lib, e.g. `pdf-parse`/`pdfjs` for PDF, `mammoth` for DOCX). Produce:
normalized text + a section outline (headings/anchors) + page map. Store text as
the version's `storageKey`; keep the raw upload as `originalStorageKey`.
**Scoped out this phase:** OCR of scanned/image PDFs, complex table-in-PDF
extraction (flag to the user; offer "convert to CSV" for tabular PDFs).

### 14.2 Representation to Claude
No kernel. For short docs, pass the full text. For long docs, **chunk + retrieve**
the passages relevant to the question (embed sections once, cached on the
version; retrieve top-k per turn). The agent reasons over retrieved passages.

### 14.3 Tools (the document engine's "glass box")
- `search_document(query)` → returns ranked passages **with section anchors**.
- `cite(anchor, quote)` → records the evidence; the UI renders citations inline
  and lets the user jump to the source passage. **Citations are the transparency
  trace** — the doc-mode equivalent of showing executed Python.
- `extract(schema)` → pull a structured list (e.g., every requirement, every
  obligation, every dated deadline) into a table the user can export.

### 14.4 Document domain read (cached)
`describeDocument()` (Claude, once per version) → `DocProfile`: docType
(rfp/requirements/contract/policy/…), description, section outline, key entities
(parties, dates, amounts, obligations). Drives suggestions + framing.

### 14.5 RFP / requirements use cases (the wedge)
Powered by role × domain × vertical + the tools above:
- **Extract & classify requirements** (mandatory vs optional vs informational).
- **RFP ↔ response check** (two sources in one conversation): does the proposal
  satisfy each RFP requirement? → gap matrix with citations on both sides.
- **Compliance / risk scan**: flag obligations, liabilities, SLAs, unusual terms
  — framed by vertical (a healthcare RFP is judged against different concerns
  than a SaaS one).
- **Version diff** (§15): "what did the client change between RFP v1 and v2?"

---

## 15. Versioning & version diff (cross-cutting, both pillars)

### 15.1 Upload a new version into an open conversation
`POST /api/orgs/[oid]/sources/[sid]/versions` adds `SourceVersion(version=n+1)`.
In a conversation attached to that source, the user can **adopt** the new version
(updates `ConversationSource.versionId`). The runner is told, in the kickoff:
*"The <alias> source was updated to v3 (previously v2). Key changes: <diff
summary>."* — so answers reflect the new reality and can reference the change.

### 15.2 Compare any two versions
`GET /api/orgs/[oid]/sources/[sid]/compare?from=1&to=3` → cached `Comparison`:
- **Tabular diff:** schema delta (added/removed/renamed columns, dtype changes),
  row-count delta, distribution shifts on key metrics, and — when a stable key
  exists — added/removed/changed rows. Computed in the kernel; summarized by Claude.
- **Document diff:** section-level text diff (added/removed/modified) **plus a
  Claude semantic diff**: "3 requirements added, payment terms Net-30→Net-45, SLA
  tightened 99.5%→99.9%, indemnity clause new." Structured + prose, with citations.

### 15.3 UI
A **"Versions" panel** per source (v1…vn, uploader, date) and a **"Compare"**
view (pick two → rendered diff). Diff summaries also surface as context chips and
as a starter question ("Summarize what changed in v3").

---

## 7. File-by-file (delta from v1)

**New:** `lib/agent/context.ts`, `personas.ts`, `datasetIntelligence.ts`,
`documentIntelligence.ts`, `suggestions.ts`, `versionDiff.ts`;
`server/ingest/profile.ts`, `server/ingest/document.ts`;
`server/agent/documentEngine.ts` (retrieve→reason→cite loop);
API: `sources/[sid]/versions`, `sources/[sid]/compare`, `orgs/[oid]/me` (persona),
org domain/vertical settings.
**Changed:** `prisma/schema.prisma` (§2), `systemPrompt.ts`→`buildSystemPrompt`,
both providers (`system` param), `scopeGate.ts`→`classifyIntent`, `runner.ts`
(kind + mode + version aware), `lib/authz.ts` (Ctx gains persona),
`app/api/auth/signup`, datasets/conversations/messages routes → sources model,
UI (persona/domain/vertical capture, versions panel, compare view, chips).

---

## 8. Phasing (v3) — spine first, then the two feature tracks

**P0 — Agentic spine (foundational refactor, no user-visible change).**
Split `runner.ts` into **coordinator + Tabular Analyst worker + Verifier + Report
Composer** on `@anthropic-ai/sdk` (§16); prompt-cache the Context Pack prefix;
add per-run `task_budget` + per-org token metering (§17). Ship behind the existing
AgentEvent stream and verify output parity, then everything below plugs in.

**Track A — Context intelligence (near-term demo; delegated via the coordinator)**
P1 Persona awareness · P2 Tabular source intelligence · P3 Guided questions ·
P4 Intent-gated conversation/report split (now the coordinator's router).

**Track B — Documents & versioning (the second pillar)**
P5 **Versioned Source model** (schema refactor; prerequisite for both) ·
P6 **Document Researcher subagent** (PDF/DOCX/TXT → search/cite/extract;
RFP/requirements) · P7 **Version-Diff subagent** (tabular + document "what changed").

**P8 — SaaS surface:** org self-registration, rate limiting, eval harness, usage
dashboards. Billing/entitlements **designed, gated** (§17).

**Recommended sequencing:** P0 first (unlocks clean delegation, caching, budgets)
→ P1–P2 (fast, visible, on existing data) → **P5 versioned Sources** (foundational)
→ then pick the demo's headline: "audit/procurement/RFP review" → P6 next;
"talk to your data" → finish P3–P4 first. P7 (diff) lands last as the flourish.

**Honest scope note:** this is now three bodies of work — the agentic spine, and
each pillar. All achievable, but **don't plan to demo all of it polished at once.**
Build the spine (P0), stand up both pillars minimally, and deepen the one the
pitch leads with. The coordinator/subagent/verifier structure is itself a
demo-worthy story at an Anthropic event.

---

## 9. Migration & deployment
Schema change → `docker compose run --rm migrate` → `docker compose up -d --build
app`. New fields nullable; `Dataset`→`Source/Version` backfill (or fresh start,
since prod holds only demo data).

## 10. Cost / latency / caching
Cost-first, given the single-model / low-effort choice (§16.4):
- **One model → one uniform prompt cache.** The Context Pack prefix
  (persona/domain/vertical + source profile) is cached and never model-switched,
  so it isn't re-billed every turn (§16.3).
- **Low effort trims tokens** — fewer, consolidated tool calls and less preamble
  per run.
- **Per-run `task_budget`** (beta `task-budgets-2026-03-13`) caps the agentic loop
  so no single run can run away; per-org monthly budgets on top (§17).
- Domain read (per version), doc domain read (per version), embeddings for long
  docs (per version), starters (per conversation), version diff (per pair) —
  **all cached**. Intent gate replaces the scope-gate call (no net-new).
- Sonnet 5 intro pricing ($2/$10 per MTok through 2026-08-31) makes end-to-end
  cheap; re-baseline `max_tokens` headroom for its tokenizer, and stream any run
  with large `max_tokens`.

---

## 16. Agentic architecture — coordinator + subagents (Claude, self-hosted)

v1/v2 assume **one** Claude loop per turn (today's `runner.ts`). v3 restructures
that into a **coordinator + specialized worker subagents** — the orchestrator-worker
pattern from the Claude Architect / "Building Effective Agents" playbook — kept
**self-hosted on `@anthropic-ai/sdk` inside our Next.js Node runtime.**

### 16.1 Decision: self-hosted Claude API loop, NOT Managed Agents
Anthropic offers two ways to build coordinator+subagents:
- **Managed Agents (CMA)** — Anthropic runs the loop *and hosts a per-session
  container where tools execute*, with a first-class `multiagent:{type:"coordinator",
  agents:[…]}` roster, per-subagent threads, memory stores, and rubric-graded
  Outcomes. Powerful, but it **takes over tool execution and the event stream.**
- **Claude API + tool use, self-hosted** — we run the loop, host compute, own the
  tools and the stream. Maximum flexibility.

**Choose self-hosted.** CMA would move Python execution into Anthropic's container
and replace our AgentEvent feed — breaking (a) the **WASM Pyodide sandbox + the
"glass box" transparency UI** that is the product, and (b) the **SaaS moat**
("your data never leaves your infra; you own this"). We build CMA's *patterns* on
the SDK we already depend on. Revisit CMA only if we ever want Anthropic-hosted
compute for a hosted tier.

### 16.2 The roles (each a focused Claude loop — own context window + scoped tools)
- **Coordinator / router** — runs the intent gate (`quick_fact | analytical |
  decision | document_review`) + source kind, then decomposes and delegates.
  (Anthropic patterns: *routing* + *orchestrator-workers*.)
- **Tabular Analyst** — pandas in the Pyodide kernel (today's runner logic).
  Tools: `run_python`, `render_chart`.
- **Document Researcher** — retrieve → reason → cite (§14). Tools:
  `search_document`, `cite`, `extract`.
- **Version-Diff Analyst** — computes/summarizes a `Comparison` (§15).
- **Verifier / Critic** — *evaluator-optimizer*, and the **safety net that makes
  low effort acceptable** (§16.4). On `decision` / `document_review` runs only
  (skip quick facts), a **cheap, tight checklist pass** — same Sonnet 5 @ low —
  that checks every number against a printed tool output and every claim against
  its citation and returns findings for **one** revision. Not a re-analysis;
  a grounded correctness gate. Formalizes today's "reports can never be empty".
- **Report Composer** — the non-streaming decision artifact (today's
  `generate*Report`).

All emit the **same AgentEvent vocabulary**, so the glass-box feed renders
coordinator + subagent activity in one timeline (this is CMA's "session threads"
idea, done in our stream).

### 16.3 Context engineering (the real lever, per the Architect curriculum)
- **Prompt-cache the Context Pack prefix** — stable persona/domain/vertical +
  source profile first, volatile question last (render order tools→system→messages).
  Across a multi-tenant SaaS this is the biggest cost/latency win.
- **Compaction / context-editing** for long conversations — upgrade today's
  `compactHistory` to server-side compaction (beta `compact-2026-01-12`) or
  tool-result clearing (`clear_tool_uses_20250919`).
- **Memory** — a per-org semantic layer (learned metric definitions, prior-analysis
  notes) persisted across sessions; the coordinator consults it before delegating.

### 16.4 One model, user-selectable effort (default `low`) — `claude-sonnet-5`
No model tiering — one tier, Sonnet 5, everywhere (uniform prompt cache, no
model-switch invalidation, predictable spend; intro pricing $2/$10 per MTok through
2026-08-31). **Effort is exposed to the user as a control, the way Claude does** —
an "analysis depth" dial (low / medium / high) that **defaults to `low`** for cost.
Low is the floor for every automatic/background call (gates, suggestions, domain
reads — those stay `low` regardless of the dial). The user opts into more depth
per run when a question is worth it — which doubles as a **pricing lever**: deeper
effort → higher plan tier or metered usage (§17). Cheap-by-default *and* a paid
path to depth, without ever leaving Sonnet 5.

**But be honest about what low effort costs, and compensate for it.** Anthropic's
guidance: Sonnet 5 *respects effort strictly* — at `low` it "scopes work to what
was asked rather than going above and beyond," with "some risk of under-thinking
on moderately complex tasks," and (with thinking lean) it reaches for tools less
eagerly. Left unaddressed, that dulls exactly the thing that impressed us: the
deep, multi-step, self-correcting **decision** run. Four compensations, all
prompt/architecture-side (no effort increase):

1. **Prescriptive prompts are load-bearing now.** The existing system prompt
   ("work in SMALL steps", "go beyond the obvious — segment, trend, rate", "2–4
   charts") is exactly the scaffolding that buys back depth at low effort — keep
   and strengthen it; do **not** dial it back. Add the guidance Anthropic
   recommends for pinned-low workloads: *"This involves multi-step reasoning —
   inspect the data first, work step by step, don't shortcut to an answer."*
2. **Explicit tool-use triggers.** At low effort Sonnet 5 under-reaches for tools;
   make every tool's *when-to-call* explicit in its description and the prompt
   (run_python for each analysis step; search_document before answering doc
   questions).
3. **Context isolation via subagents *helps* low effort.** A focused worker with
   only its relevant slice of the Context Pack does better at low effort than one
   big loop juggling everything — so the coordinator/worker split is a low-effort
   *enabler*, not just organization. Keep windows tight; prompt-cache the shared
   prefix.
4. **The Verifier is the net** (§16.2) — a cheap low-effort checklist pass catches
   the shallow-analysis misses that low effort risks.

**The `decision` run is where depth matters most — and now the user controls it.**
Default `low`, but the analysis-depth dial lets the user (or their plan tier) raise
a specific decision to `medium`/`high` when it's worth the spend. Compensations 1–4
keep the low-effort default respectable; the eval harness in P0 calibrates that
default. Background/automatic calls stay pinned `low` regardless of the dial.

---

## 17. SaaS productization & sequencing

Multi-tenancy, RBAC, and the audit trail already exist. To be a real SaaS a team
owns internally (your pitch), design now / build in the phase noted:

- **Org self-registration & onboarding** — signup → org → invite, capturing
  persona/domain/vertical (§3). *[P8, but the spine lands in P1.]*
- **Usage metering & cost control** — per-org/run token accounting (the runner
  already tracks input/output tokens) + per-run **`task_budget`** (Claude's
  self-moderating token ceiling, beta `task-budgets-2026-03-13`) + per-org monthly
  budgets + graceful degradation at cap. *[P0/P8.]*
- **Rate limiting** per org/plan. *[P8.]*
- **Observability & evals** — the AgentEvent trace is already the audit spine; add
  a scripted **eval harness** (same approach as our live-tunnel verification) to
  score agent quality per release — the Architect curriculum's "measure it"
  discipline. *[alongside the Verifier, P0+.]*
- **Plan tiers + billing (Stripe) + entitlements** — **designed now, GATED behind
  good feedback. Do NOT build yet**, per your call. When it's time: entitlement
  checks in `authz`, metered usage → invoices, a hosted tier could then adopt CMA
  (§16.1) for Anthropic-run compute.

**Monetization stays sequenced:** prove intelligence + document/versioning value
→ good feedback → *then* org billing/payments. The architecture above doesn't
block on any of it — it just leaves the seams (metering, entitlements, budgets)
in the right places.

### 17.1 Why buy this vs. rent the API / Claude Enterprise (the moat)
The engineering — on-point prompts, prompt caching, the coordinator/verifier
orchestration, effort tuning — is the **head start and the demo wow**, but it is
*replicable*, so it is not the whole moat. It's what lets us charge *now*; three
things keep us from being disintermediated *later*:

1. **A maintained vertical product, not a horizontal assistant.** Claude Enterprise
   is a great *generalist* (chat + Claude Code + admin controls) — it is **not** a
   governed analytics/RFP product with your data model, RBAC *on your datasets*,
   shareable decision reports, version-diff, and persona/domain/vertical framing.
   The raw API is just the model — you'd have to build everything Glass Box is.
   "You could build it yourself" is true of every SaaS on every cloud and rarely
   stops anyone buying: faster, maintained, someone-else's-problem.
2. **Ownership + data residency + governance on THEIR infra** — the sharpest wedge
   vs Claude Enterprise, which by definition sends data to Anthropic's product.
   The self-hosted stack (Docker + tunnel) runs on the customer's own
   infrastructure: their data never leaves, their RBAC, their audit, their
   retention. For procurement / compliance / regulated verticals — exactly the
   RFP/audit use case — "an AI analyst that never ships our documents to a third
   party and is fully auditable on our own servers" is something Claude Enterprise
   *structurally cannot* offer.
3. **A per-tenant flywheel** — the semantic layer (company metric definitions),
   memory (learned analyses), version history, and domain-tuned prompts accumulate
   *inside the customer's tenant* and compound with use. That's switching cost the
   API/Enterprise don't build for this use case.

**How the engineering becomes revenue:** we don't charge *for* the prompts — we
charge for the **outcome** (a governed, role-aware, auditable decision / a checked
RFP). Our prompt/caching/effort work **lowers the inference cost floor**, so the
spread between value-based price (per seat / per workspace / per engagement) and
actual per-task cost is the margin. Low-effort-by-default + one-model caching is
what makes that spread healthy.

**Two revenue shapes — pick per customer:**
- **SaaS** (multi-tenant, we host, or they self-host a licensed build): per-seat /
  per-workspace / metered-by-effort. Wins on time-to-value + maintenance + the
  governance a DIY build usually gets wrong.
- **Build-&-own / template + services** (fits the "companies build this internally
  with Claude" thesis): sell the reference implementation + deployment on their
  infra + ongoing tuning/managed-service retainer. This is the consultancy-that-
  ships-an-owned-product model — the honest resolution of "will consultancies die":
  the ones who help you *own* it win.

The effort dial (§16.4) is the same idea at the feature level: cheap by default,
pay for depth.

## 11. Risks & mitigations
- **Scanned/image PDFs** → out of scope this phase; detect no text layer and tell
  the user (offer OCR later).
- **Long documents** → retrieval keeps context bounded; cite anchors so claims
  are checkable.
- **Diff on schemaless docs** → lead with the Claude semantic diff; show raw
  text diff as backup evidence.
- **Model over-narrowing by persona/vertical** → framing guides priority, not
  scope; grounding + citations stay mandatory.
- **Data model refactor risk** → additive/nullable; backfill or fresh-start.

## 12. Testing
Unit: `computeColumnProfiles`, document section extraction, tabular schema-diff,
`buildSystemPrompt` snapshots per persona×vertical×mode. Integration (scripted vs
the live tunnel): persona A≠B emphasis; quick_fact → no report; upload v2 → agent
references the change; `compare?from&to` returns a non-empty structured diff; RFP
requirement extraction produces a cited list.

## 13. Why this wins "why not ChatGPT?"
A generic upload knows nothing about *who* you are, treats every file as raw
text/dtypes, keeps no history, and can't tell you what changed when the vendor
sends RFP v2. Glass Box — built and owned in-house — knows the user is a
**procurement lead in healthcare**, knows the source is an **RFP it profiled and
outlined**, **guides** them to the requirements and risks that matter, **cites
every clause**, **tracks every version**, and **audits every step**. Role-,
data-, and version-aware evidence is the product — and it's exactly what a team
can only get from a tool built around their own people, data, and documents.
```
