import Link from "next/link";
import type { Metadata } from "next";
import {
  Upload,
  ScanSearch,
  Route,
  TerminalSquare,
  FileText,
  ShieldCheck,
  BarChart3,
  MessagesSquare,
  Gauge,
  Columns3,
  EyeOff,
  ArrowRight,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  BrowserFrame,
  ReportPreview,
  CitationPreview,
} from "@/components/marketing/ProductPreview";

export const metadata: Metadata = {
  title: "How Glass Box works — a governed, evidence-backed AI analyst",
  description:
    "Upload a spreadsheet or a contract, ask in plain English, and a self-hosted coordinator routes the work: a Tabular Analyst runs real Python, a Document Researcher cites the exact clause, and a Verifier grounds every number before a decision report ships. Powered by claude-sonnet-5.",
};

const STEPS = [
  {
    icon: Upload,
    step: "01",
    title: "Upload & profile",
    body: "Drop in a CSV, Excel workbook, PDF, DOCX, or TXT. Glass Box profiles it on ingest — column types and a semantic read of tabular data, structure and sections for documents — so the analyst starts with context, not a blank file. Every source is versioned the moment it lands.",
  },
  {
    icon: MessagesSquare,
    step: "02",
    title: "Ask in plain English",
    body: "No SQL, no formulas, no prompt engineering. Ask the way you'd ask an analyst on your team: \"Where should we focus next quarter?\" or \"What are the mandatory requirements in this RFP?\" Quick questions get quick inline answers; decision questions escalate to a full report.",
  },
  {
    icon: Route,
    step: "03",
    title: "The Coordinator routes intent",
    body: "A Coordinator reads the question and decides what the work actually is — a fast lookup, a Python analysis, a document retrieval, or a multi-step decision report — then dispatches the right specialist. This is a self-hosted coordinator→workers loop on the Anthropic SDK, not a managed black box.",
  },
  {
    icon: TerminalSquare,
    step: "04",
    title: "Tabular Analyst runs Python",
    body: "For spreadsheets, the Tabular Analyst writes real pandas and runs it in a sandboxed Pyodide/WASM kernel — in your browser, never on a shared server. You see the exact Python and its output, so the analysis is reproducible, not asserted.",
  },
  {
    icon: FileText,
    step: "05",
    title: "Document Researcher cites clauses",
    body: "For PDFs and contracts, the Document Researcher retrieves the relevant passages and answers with the exact clause quoted and anchored — §3.2, §4.1 — so legal and procurement can trust the source. Upload v2 and it diffs the changes against v1.",
  },
  {
    icon: ShieldCheck,
    step: "06",
    title: "The Verifier grounds the numbers",
    body: "Before any report ships, a Verifier checks every reported figure against the evidence it came from — the Python output for data, the retrieved passage for documents. A number the analyst can't ground doesn't make it into the report.",
  },
  {
    icon: BarChart3,
    step: "07",
    title: "Decision report or quick answer",
    body: "The result renders as either a quick inline answer or a verifier-checked decision report: a headline, hero metrics, confidence-scored insights, and a recommendation your team can act on — and share via a revocable link.",
  },
];

const REACHES = [
  {
    icon: Columns3,
    title: "For spreadsheets",
    items: [
      "The column schema — names and inferred types",
      "A semantic profile of what each column means",
      "A 20-row sample, never the full dataset",
      "Up to 4,000 characters of output per analysis step",
    ],
  },
  {
    icon: FileText,
    title: "For documents",
    items: [
      "Only the passages retrieved for your question",
      "The exact clauses quoted back in the answer",
      "Section anchors so every claim is traceable",
      "Never the whole file dumped into the context",
    ],
  },
];

export default function HowItWorksPage() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 pt-20 pb-10 text-center">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-panel px-3 py-1 text-xs text-muted">
          <span className="text-accent">●</span> How it works
        </div>
        <h1 className="text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
          From a raw file to a decision
          <span className="text-accent"> you can defend</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted">
          Glass Box is a self-hosted agentic analyst: a Coordinator routes your question,
          specialists run the Python or cite the clause, and a Verifier grounds every
          number before it reaches you. All of it on your own infrastructure, powered
          end to end by claude-sonnet-5.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/demo">
            <Button variant="primary">
              Book a demo <ArrowRight size={16} />
            </Button>
          </Link>
          <Link href="/signup">
            <Button variant="secondary">Start a 10-day trial</Button>
          </Link>
        </div>
      </section>

      {/* Pipeline steps */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent">
            <Route size={13} /> The pipeline
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">
            Seven steps, all of them inspectable
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Nothing happens in a black box. Each stage shows its work — the Python, the
            clause, the grounding check — so the output is evidence, not a guess.
          </p>
        </div>
        <div className="space-y-4">
          {STEPS.map((s) => (
            <div
              key={s.step}
              className="flex gap-4 rounded-2xl border border-border bg-panel p-6 sm:gap-5"
            >
              <div className="flex shrink-0 flex-col items-center gap-2">
                <div className="grid h-9 w-9 place-items-center rounded-lg border border-accent/40 bg-accent/15 text-accent">
                  <s.icon size={18} />
                </div>
                <span className="font-mono text-[10px] font-semibold text-muted">
                  {s.step}
                </span>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Real previews — data path + document path */}
      <section className="border-y border-border bg-panel/40">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent">
              <ScanSearch size={13} /> Two paths, one analyst
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              What the two paths actually produce
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              The data path ends in a verifier-checked decision report. The document
              path ends in an answer anchored to the exact clause. Both are real output
              from the demo workspace.
            </p>
          </div>
          <div className="grid items-start gap-5 lg:grid-cols-2">
            <div>
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-foreground">
                <BarChart3 size={14} className="text-green" /> Data path — the decision report
              </div>
              <BrowserFrame url="app.glassbox.ai/app/conversations">
                <ReportPreview />
              </BrowserFrame>
            </div>
            <div>
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-foreground">
                <FileText size={14} className="text-blue" /> Document path — the cited answer
              </div>
              <BrowserFrame url="app.glassbox.ai/app/conversations">
                <CitationPreview />
              </BrowserFrame>
            </div>
          </div>
        </div>
      </section>

      {/* What reaches the model — trust section */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent">
            <EyeOff size={13} /> What reaches the model
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">
            The model sees enough to reason — never your whole file
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Glass Box is deliberate about what leaves your workspace and enters the
            context window. The analysis runs against your full data locally; only a
            tight, purposeful slice is ever sent to the model.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {REACHES.map((r) => (
            <div key={r.title} className="rounded-2xl border border-border bg-panel p-6">
              <div className="mb-3 grid h-9 w-9 place-items-center rounded-lg border border-accent/40 bg-accent/15 text-accent">
                <r.icon size={18} />
              </div>
              <h3 className="text-sm font-semibold text-foreground">{r.title}</h3>
              <ul className="mt-3 space-y-2">
                {r.items.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2 text-sm leading-relaxed text-muted"
                  >
                    <Check size={14} className="mt-0.5 shrink-0 text-green" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Effort dial */}
      <section className="border-y border-border bg-panel/40">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent">
              <Gauge size={13} /> The effort dial
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              One model, a dial for how hard it thinks
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Every request runs on claude-sonnet-5. A user-selectable effort dial trades
              speed for depth — so you spend the compute where the decision warrants it,
              and nowhere else. Low is the default to keep everyday questions fast and
              inexpensive.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                level: "Low",
                tag: "Default",
                body: "Fast, economical answers for everyday questions and quick lookups. The right setting for most of what your team asks in a day.",
                tone: "border-green/40 bg-green/15 text-green",
              },
              {
                level: "Medium",
                tag: "Balanced",
                body: "More reasoning steps for multi-part questions and reports that need to weigh several factors before landing a recommendation.",
                tone: "border-amber/40 bg-amber/15 text-amber",
              },
              {
                level: "High",
                tag: "Deepest",
                body: "Maximum depth for the highest-stakes decisions — thorough exploration, more thorough verification, the analysis you'd staff a person on.",
                tone: "border-accent/40 bg-accent/15 text-accent",
              },
            ].map((d) => (
              <div key={d.level} className="rounded-2xl border border-border bg-panel p-6">
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{d.level}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${d.tone}`}
                  >
                    {d.tag}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-muted">{d.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="mx-auto max-w-4xl px-6 py-24">
        <div className="rounded-3xl border border-accent/30 bg-gradient-to-b from-accent/10 to-transparent p-10 text-center">
          <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-xl border border-accent/40 bg-accent/15 text-accent">
            <ScanSearch size={22} />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">
            See the whole pipeline on your own data
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted">
            Watch a question travel from upload to a grounded decision report — then
            deploy Glass Box on your own infrastructure.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link href="/demo">
              <Button variant="primary">Book a demo <ArrowRight size={16} /></Button>
            </Link>
            <Link href="/signup">
              <Button variant="secondary">Start a 10-day trial</Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
