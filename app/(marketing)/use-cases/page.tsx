import Link from "next/link";
import type { Metadata } from "next";
import {
  TrendingUp,
  Calculator,
  Workflow,
  Headphones,
  Scale,
  Briefcase,
  ArrowRight,
  ScanSearch,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  BrowserFrame,
  ReportPreview,
  ComparePreview,
} from "@/components/marketing/ProductPreview";

export const metadata: Metadata = {
  title: "Use cases — governed AI analysis for every role",
  description:
    "Sales, Finance, Operations, Support, Procurement/Legal, and Consultants each ask Glass Box the question that matters to them — and get an evidence-backed answer they can act on and own. Self-hosted, cited, and verifier-checked.",
};

const PERSONAS = [
  {
    icon: TrendingUp,
    role: "Sales",
    domain: "Pipeline & channel strategy",
    question: "Where should we focus next quarter?",
    outcome:
      "Glass Box runs the pipeline as real Python and returns a decision report: which channels fund open pipeline at what win rate, where deal size is being wasted on low-converting sources, and which reps are carrying at-risk pipeline — every number verified against the underlying analysis.",
    points: [
      "Win-rate and pipeline math you can defend in a QBR",
      "Confidence-scored insights, not vibes",
      "Share the report with leadership via a revocable link",
    ],
  },
  {
    icon: Calculator,
    role: "Finance",
    domain: "Variance & forecasting",
    question: "What's driving the variance this month?",
    outcome:
      "Upload the actuals and the budget and ask. The Tabular Analyst decomposes the variance line by line in pandas, surfaces the drivers with their contribution, and the Verifier checks each figure before the report ships — so the number in the deck matches the number in the data.",
    points: [
      "Line-level variance decomposition, reproducible",
      "See the exact Python behind every figure",
      "Grounded totals — no hand-keyed errors",
    ],
  },
  {
    icon: Workflow,
    role: "Operations",
    domain: "Throughput & bottlenecks",
    question: "Where are the bottlenecks in our process?",
    outcome:
      "Point Glass Box at your operational export and it profiles stage-by-stage throughput, flags where cycle time concentrates, and quantifies the cost of the slowest step — turning a spreadsheet you'd squint at into a ranked list of where to intervene.",
    points: [
      "Stage-level cycle-time and volume analysis",
      "Ranked bottlenecks with quantified impact",
      "Re-run against next month's export in seconds",
    ],
  },
  {
    icon: Headphones,
    role: "Support",
    domain: "Churn & ticket signal",
    question: "What are customers churning over?",
    outcome:
      "Feed in tickets or churn exports and ask. Glass Box clusters the reasons, sizes each theme by volume and revenue at risk, and tells you which issues actually correlate with cancellations — so the roadmap fights the churn that costs, not the loudest ticket.",
    points: [
      "Themes sized by volume and revenue at risk",
      "Correlation with churn, not just ticket counts",
      "Evidence you can hand to product",
    ],
  },
  {
    icon: Scale,
    role: "Procurement & Legal",
    domain: "RFP & contract review",
    question: "What are the mandatory requirements — and what changed in v2?",
    outcome:
      "Upload the RFP and Glass Box answers with the exact clause quoted and anchored — MUST vs. should, disqualifying conditions, compliance gates. Upload v2 and it diffs the changes against v1: the tightened SLA, the new data-residency clause, the reworded payment terms — so nobody re-reads 40 pages.",
    points: [
      "Every answer cites the exact clause and section",
      "Version-compare surfaces only what materially changed",
      "The audit wedge a chatbot upload can't touch",
    ],
  },
  {
    icon: Briefcase,
    role: "Consultant",
    domain: "Client-ready analysis",
    question: "Can I hand this to the client tomorrow?",
    outcome:
      "Consultants run the client's data and documents through one governed analyst and get output that's already client-ready: a decision report with cited sources and grounded numbers, produced on infrastructure the engagement controls — so the deliverable is defensible, not a screenshot from a public chat window.",
    points: [
      "Cited, grounded output you can put your name on",
      "Runs on infra the engagement owns — no data leakage",
      "Role-aware framing per client domain and vertical",
    ],
  },
];

export default function UseCasesPage() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 pt-20 pb-10 text-center">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-panel px-3 py-1 text-xs text-muted">
          <span className="text-accent">●</span> Use cases
        </div>
        <h1 className="text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
          One analyst,
          <span className="text-accent"> every team's hardest question</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted">
          Glass Box is role-aware. Sales, Finance, Operations, Support, Procurement, and
          consultants each ask the question that matters to them — in plain English — and
          get an evidence-backed answer they can act on and own. Same governed analyst,
          same audit trail, tuned to each team's domain.
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

      {/* Sales — with ReportPreview */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid items-center gap-8 lg:grid-cols-2">
          <div>
            <div className="mb-3 grid h-9 w-9 place-items-center rounded-lg border border-accent/40 bg-accent/15 text-accent">
              <TrendingUp size={18} />
            </div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">
              Sales · Pipeline &amp; channel strategy
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              &ldquo;Where should we focus next quarter?&rdquo;
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              {PERSONAS[0].outcome}
            </p>
            <ul className="mt-5 space-y-2">
              {PERSONAS[0].points.map((p) => (
                <li
                  key={p}
                  className="flex items-start gap-2 text-sm leading-relaxed text-foreground"
                >
                  <Check size={14} className="mt-0.5 shrink-0 text-green" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <BrowserFrame url="app.glassbox.ai/app/conversations">
            <ReportPreview />
          </BrowserFrame>
        </div>
      </section>

      {/* Middle personas grid — Finance, Operations, Support */}
      <section className="border-y border-border bg-panel/40">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight">
              The question changes. The rigor doesn&apos;t.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Every team gets the same treatment: real Python, grounded numbers, a
              report they can share.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {PERSONAS.slice(1, 4).map((p) => (
              <div
                key={p.role}
                className="flex flex-col rounded-2xl border border-border bg-panel p-6"
              >
                <div className="mb-3 grid h-9 w-9 place-items-center rounded-lg border border-accent/40 bg-accent/15 text-accent">
                  <p.icon size={18} />
                </div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {p.role} · {p.domain}
                </div>
                <h3 className="mt-2 text-base font-semibold leading-snug text-foreground">
                  &ldquo;{p.question}&rdquo;
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted">{p.outcome}</p>
                <ul className="mt-4 space-y-2">
                  {p.points.map((pt) => (
                    <li
                      key={pt}
                      className="flex items-start gap-2 text-xs leading-relaxed text-foreground"
                    >
                      <Check size={13} className="mt-0.5 shrink-0 text-green" />
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Procurement & Legal — with ComparePreview */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid items-center gap-8 lg:grid-cols-2">
          <BrowserFrame url="app.glassbox.ai/app/datasets">
            <ComparePreview />
          </BrowserFrame>
          <div className="lg:order-first">
            <div className="mb-3 grid h-9 w-9 place-items-center rounded-lg border border-accent/40 bg-accent/15 text-accent">
              <Scale size={18} />
            </div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">
              Procurement &amp; Legal · RFP &amp; contract review
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              &ldquo;Every mandatory requirement — and what changed in v2?&rdquo;
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              {PERSONAS[4].outcome}
            </p>
            <ul className="mt-5 space-y-2">
              {PERSONAS[4].points.map((p) => (
                <li
                  key={p}
                  className="flex items-start gap-2 text-sm leading-relaxed text-foreground"
                >
                  <Check size={14} className="mt-0.5 shrink-0 text-green" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Consultant — full-width band */}
      <section className="border-y border-border bg-panel/40">
        <div className="mx-auto max-w-4xl px-6 py-16">
          <div className="rounded-2xl border border-border bg-panel p-8">
            <div className="mb-3 grid h-9 w-9 place-items-center rounded-lg border border-accent/40 bg-accent/15 text-accent">
              <Briefcase size={18} />
            </div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">
              Consultant · Client-ready analysis
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              &ldquo;Can I hand this to the client tomorrow?&rdquo;
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">
              {PERSONAS[5].outcome}
            </p>
            <ul className="mt-5 grid gap-2 sm:grid-cols-3">
              {PERSONAS[5].points.map((p) => (
                <li
                  key={p}
                  className="flex items-start gap-2 text-xs leading-relaxed text-foreground"
                >
                  <Check size={13} className="mt-0.5 shrink-0 text-green" />
                  {p}
                </li>
              ))}
            </ul>
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
            Bring your team&apos;s hardest question
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted">
            See Glass Box answer it on your own data and documents — then deploy it on
            your own infrastructure.
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
