import Link from "next/link";
import type { Metadata } from "next";
import { HelpCircle, Plus, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "FAQ — Glass Box, the self-hosted governed AI analyst",
  description:
    "Answers on how Glass Box works, why self-hosting matters, what it costs, how version-compare and the effort dial work, how the verifier grounds numbers, roles and audit trails, and how to deploy on your own infrastructure. Powered by claude-sonnet-5.",
};

const FAQS: { q: string; a: string }[] = [
  {
    q: "What is Glass Box?",
    a: "Glass Box is a self-hosted, governed AI analyst. It turns your spreadsheets and documents into evidence-backed decisions your team owns — running real Python over tabular data and citing the exact clause in documents, all on your own infrastructure. Every enterprise is buying AI; Glass Box is how you operationalize it into decisions you can defend.",
  },
  {
    q: "How is this different from pasting a file into ChatGPT?",
    a: "Three ways. First, your data never leaves your infrastructure — there's no file to paste into a window you don't control. Second, Glass Box shows its work: for spreadsheets you see the actual Python and its output; for documents you get the exact quoted clause. Third, it's governed — role-based access, a full audit trail, usage metering, and revocable share links. A public chatbot gives you an answer; Glass Box gives you a decision you can trace and stand behind.",
  },
  {
    q: "Is my data sent anywhere?",
    a: "No. Glass Box is self-hosted by design — it runs on your VPC or via Docker on your own box (Postgres plus a single Node service). Spreadsheet analysis executes locally in a sandboxed Pyodide/WASM kernel in the browser. Only a tight, purposeful slice ever reaches the model: for tabular data, the column schema, a semantic profile, a 20-row sample, and up to 4,000 characters of output per step — never the whole file. For documents, only the retrieved passages relevant to your question.",
  },
  {
    q: "What models does it use?",
    a: "Glass Box is powered end to end by claude-sonnet-5 — a single model across the whole pipeline. There's no model-picker to manage. Instead you get an effort dial that trades speed for depth on the same model, so you control cost and thoroughness per request.",
  },
  {
    q: "Can it read PDFs, contracts, and RFPs?",
    a: "Yes — documents are a first-class modality. Upload a PDF, DOCX, or TXT and a Document Researcher retrieves the relevant passages, reasons over them, and answers with the exact clause quoted and anchored to its section. RFP and contract review is a core use case: ask for every mandatory requirement and get each one cited back to the source.",
  },
  {
    q: "How does version-compare work?",
    a: "Sources are versioned. Upload v2 of a contract or RFP and Glass Box runs a structural and semantic diff against v1, surfacing only what materially changed — a tightened SLA, a reworded payment term, a brand-new data-residency clause — so procurement and legal don't re-read 40 pages to find the three lines that moved.",
  },
  {
    q: "What is the effort dial?",
    a: "It's a user-selectable control — Low, Medium, or High — that trades speed for depth on claude-sonnet-5. Low is the default: fast and economical for everyday questions. Medium adds reasoning for multi-part analysis. High is for the highest-stakes decisions where you want maximum depth and verification. You spend compute where the decision warrants it, and nowhere else.",
  },
  {
    q: "How does it show its work — can I trust the numbers?",
    a: "Every reported number is grounded before it ships. For tabular analysis you see the exact Python that produced each figure; for documents you see the exact passage a claim came from. On top of that, a Verifier checks every reported number against its evidence before a decision report is delivered — a figure the analyst can't ground doesn't make it into the report. Insights carry confidence scores so you know how much weight to put on each one.",
  },
  {
    q: "What roles and permissions exist?",
    a: "Access is enforced per request in the database across four roles: OWNER, ADMIN, MEMBER, and VIEWER. Glass Box is also role-aware in a second sense — it frames analysis for Sales, Support, Finance, Operations, or Consultant users, organized by workspace domain and vertical, so the output speaks to how each team actually works.",
  },
  {
    q: "Is there an audit trail?",
    a: "Yes. Every upload, analysis run, guardrail block, share, and deletion lands in a full audit log. Combined with per-org rate limiting, usage metering, and revocable share links, you get the governance an enterprise needs to put an AI analyst in front of real data.",
  },
  {
    q: "What's the architecture under the hood?",
    a: "A self-hosted coordinator→workers agentic loop built on the Anthropic SDK — not managed agents. A Coordinator routes intent, a Tabular Analyst runs Python in the sandboxed kernel, a Document Researcher retrieves and cites passages, and a Verifier grounds the numbers. You run and own the whole loop.",
  },
  {
    q: "How do I deploy it?",
    a: "Glass Box ships as Docker Compose — Postgres plus a single Node service — so it runs inside your VPC or on your own box with no data egress. The public site is a showcase and a place to start a trial; the real offering is a customized deployment tuned to your organization's roles, sources, and retention.",
  },
  {
    q: "What does it cost?",
    a: "Start with a 10-day trial — no card required — and see the analyst work end to end on your own data. For a self-hosted, customized enterprise deployment, contact us and we'll scope it to your organization.",
  },
  {
    q: "Do you offer a self-hosted enterprise deployment?",
    a: "Yes — that's the core offering. We map your personas, domains, and the decisions your teams need to own, then deploy a customized Glass Box on your infrastructure: your roles, your sources, your retention policy, full ownership. Book a demo to start the conversation.",
  },
  {
    q: "Is there SSO and are there connectors?",
    a: "SSO and source connectors are on the roadmap. Today, sources are uploaded into your workspace and governed by role, with everything running on your own infrastructure. If a specific integration is a requirement for your deployment, raise it in a demo and we'll factor it into scoping.",
  },
];

export default function FaqPage() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 pt-20 pb-10 text-center">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-panel px-3 py-1 text-xs text-muted">
          <span className="text-accent">●</span> Frequently asked
        </div>
        <h1 className="text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
          Questions, answered
          <span className="text-accent"> plainly</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted">
          What Glass Box is, why self-hosting is the point, how it shows its work, and
          how you deploy it. If your question isn&apos;t here, book a demo and ask us
          directly.
        </p>
      </section>

      {/* Accordion */}
      <section className="mx-auto max-w-3xl px-6 pb-16">
        <div className="space-y-3">
          {FAQS.map((f) => (
            <details
              key={f.q}
              className="group rounded-xl border border-border bg-panel"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-semibold text-foreground [&::-webkit-details-marker]:hidden">
                {f.q}
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-border bg-panel-2 text-muted transition-transform group-open:rotate-45">
                  <Plus size={14} />
                </span>
              </summary>
              <div className="border-t border-border px-5 py-4 text-sm leading-relaxed text-muted">
                {f.a}
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* Closing CTA */}
      <section className="mx-auto max-w-4xl px-6 pb-24">
        <div className="rounded-3xl border border-accent/30 bg-gradient-to-b from-accent/10 to-transparent p-10 text-center">
          <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-xl border border-accent/40 bg-accent/15 text-accent">
            <HelpCircle size={22} />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Still have questions?
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted">
            Book a demo and see Glass Box on your own data — or start a 10-day trial and
            try it yourself.
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
