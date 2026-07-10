import Link from "next/link";
import type { Metadata } from "next";
import {
  Compass,
  ShieldCheck,
  Server,
  Sparkles,
  ArrowRight,
  ScanEye,
  KeyRound,
  ScrollText,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "About Glass Box — why we built the governed AI analyst",
  description:
    "Generic AI chat is ungoverned and leaks data. We built Glass Box so enterprises can operationalize AI into evidence-backed decisions their teams own — self-hosted on their own infrastructure, powered by claude-sonnet-5.",
};

const PRINCIPLES = [
  {
    icon: ScanEye,
    title: "Evidence over vibes",
    body: "Every number is verified against the Python that produced it; every claim about a document is anchored to the exact clause. If Glass Box can't show its work, it doesn't ship the answer.",
  },
  {
    icon: KeyRound,
    title: "Ownership over rental",
    body: "You shouldn't rent your analyst from a window you don't control. Glass Box deploys on your infrastructure so the workspace, the data, and the decisions belong to your team.",
  },
  {
    icon: ShieldCheck,
    title: "Governance is not optional",
    body: "Role, audit, metering, and revocable access are enforced on every request — not bolted on later. For finance, legal, and health data, that's the difference between a demo and production.",
  },
  {
    icon: Server,
    title: "The last mile is the product",
    body: "A raw API key gives you a model. The persona-aware prompts, the sandboxed kernel, the agent loop, the RBAC, and the self-hosting are the hard part — and that's exactly what Glass Box is.",
  },
];

export default async function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 pt-20 pb-10 text-center">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-panel px-3 py-1 text-xs text-muted">
          <span className="text-accent">●</span> Our mission
        </div>
        <h1 className="text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
          Why we built <span className="text-accent">Glass Box</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted">
          Every enterprise is buying AI. Few operationalize it. We built Glass Box to close
          that gap — turning spreadsheets and documents into governed, evidence-backed
          decisions your team owns, running on your own infrastructure.
        </p>
      </section>

      {/* The thesis */}
      <section className="border-y border-border bg-panel/40">
        <div className="mx-auto max-w-4xl px-6 py-14">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-xl border border-accent/40 bg-accent/15 text-accent">
              <Compass size={22} />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">
              Generic AI chat is ungoverned — and it leaks
            </h2>
          </div>
          <div className="mx-auto mt-6 max-w-2xl space-y-4 text-sm leading-relaxed text-muted">
            <p>
              Pasting a spreadsheet or a contract into a public chatbot feels like progress.
              It isn&apos;t. That file now lives somewhere you don&apos;t control, the answer
              can&apos;t show its work, no one checked its math, and there&apos;s no record of
              who asked what. For a marketing brainstorm, fine. For a pricing decision, an RFP
              review, or anything touching regulated data, it&apos;s a liability.
            </p>
            <p>
              The gap isn&apos;t model quality — the models are good. The gap is the last mile:
              knowing the analyst&apos;s role, profiling the data, citing the clause, checking
              its own arithmetic, keeping an audit trail, and running where the data can&apos;t
              leave the building. Enterprises don&apos;t need another chat window. They need to{" "}
              <span className="text-foreground">operationalize</span> AI into decisions their
              teams own — on infrastructure they control.
            </p>
            <p>
              So that&apos;s what we built. Glass Box <em>is</em> that last mile: a governed,
              self-hosted analyst that reasons over your data and documents, shows every step,
              and answers to your roles and your audit log.
            </p>
          </div>
        </div>
      </section>

      {/* What we believe */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight">What we believe</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Four principles decide what goes into the product — and what stays out.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {PRINCIPLES.map((p) => (
            <div key={p.title} className="rounded-2xl border border-border bg-panel p-6">
              <div className="mb-3 grid h-9 w-9 place-items-center rounded-lg border border-accent/40 bg-accent/15 text-accent">
                <p.icon size={18} />
              </div>
              <h3 className="text-sm font-semibold text-foreground">{p.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Built with Claude */}
      <section className="border-y border-border bg-panel/40">
        <div className="mx-auto max-w-4xl px-6 py-14">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-xl border border-accent/40 bg-accent/15 text-accent">
              <Sparkles size={22} />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">Built with Claude</h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted">
              Glass Box was built for the India Builds with Claude event, run by Anthropic and
              Razorpay. It&apos;s powered end to end by claude-sonnet-5 — a single model with a
              user-selectable effort dial (Low, Medium, High), so teams trade speed for depth
              when a decision warrants it. One model, self-hosted, reasoning over your data
              inside your own infrastructure.
            </p>
          </div>
        </div>
      </section>

      {/* Governance note strip */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: Server,
              title: "Runs on your box",
              body: "Docker Compose or your VPC. Postgres + a single Node service. No data egress.",
            },
            {
              icon: ShieldCheck,
              title: "Governed by role",
              body: "OWNER / ADMIN / MEMBER / VIEWER enforced in the database on every request.",
            },
            {
              icon: ScrollText,
              title: "Fully audited",
              body: "Every upload, run, guardrail block, share, and deletion lands in the audit log.",
            },
          ].map((b) => (
            <div key={b.title} className="rounded-2xl border border-border bg-panel p-5">
              <div className="mb-3 grid h-9 w-9 place-items-center rounded-lg border border-accent/40 bg-accent/15 text-accent">
                <b.icon size={18} />
              </div>
              <h3 className="text-sm font-semibold">{b.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{b.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Closing CTA */}
      <section className="mx-auto max-w-4xl px-6 pb-24">
        <div className="rounded-3xl border border-accent/30 bg-gradient-to-b from-accent/10 to-transparent p-10 text-center">
          <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-xl border border-accent/40 bg-accent/15 text-accent">
            <Compass size={22} />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">
            See it on your own data
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted">
            We&apos;ll map your personas, analyze your data and contracts live, and scope a
            deployment for your infrastructure.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link href="/demo">
              <Button variant="primary">
                Book a demo <ArrowRight size={16} />
              </Button>
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
