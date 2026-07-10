import Link from "next/link";
import type { Metadata } from "next";
import {
  ScanSearch,
  Layers,
  MessagesSquare,
  GitCompareArrows,
  ShieldCheck,
  FileText,
  ArrowRight,
  Check,
  Server,
  Lock,
  ScrollText,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import {
  BrowserFrame,
  ReportPreview,
  CitationPreview,
  ComparePreview,
} from "@/components/marketing/ProductPreview";

export const metadata: Metadata = {
  title: "Glass Box — operationalize AI into decisions your team owns",
  description:
    "Every enterprise is buying AI. Few operationalize it. Glass Box turns your spreadsheets and documents into governed, evidence-backed decisions — self-hosted on your own infrastructure, powered by claude-sonnet-5.",
};

const OUTCOMES = [
  {
    icon: Layers,
    title: "Data and documents, one analyst",
    body: "Spreadsheets run as real Python in a sandboxed kernel; PDFs and contracts get retrieved and cited. One place for every source your team reasons over.",
  },
  {
    icon: MessagesSquare,
    title: "Conversational, with decision reports",
    body: "Quick questions get quick answers. Decision questions escalate to a verifier-checked report — headline, metrics, recommendation — teams can act on.",
  },
  {
    icon: GitCompareArrows,
    title: "Versioned sources you can compare",
    body: "Upload v2 of a spreadsheet or an RFP and see exactly what changed — a tightened SLA, a reworded clause — instead of re-reading the whole thing.",
  },
  {
    icon: ShieldCheck,
    title: "Governed and owned by your team",
    body: "Per-request RBAC, full audit trail, usage metering, revocable share links. Self-hosted by design — your data never leaves your infrastructure.",
  },
];

export default async function LandingPage() {
  const session = await auth();
  const signedIn = !!session?.user;
  const primaryHref = signedIn ? "/app" : "/demo";

  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 pt-20 pb-10 text-center">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-panel px-3 py-1 text-xs text-muted">
          <span className="text-accent">●</span> The governed AI analyst your team owns
        </div>
        <h1 className="text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
          Every enterprise is buying AI.
          <span className="text-accent"> Few operationalize it.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted">
          Glass Box turns your spreadsheets and documents into governed, evidence-backed
          decisions your teams actually own — self-hosted on your own infrastructure,
          powered by claude-sonnet-5. Not another chat window your data leaks into.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href={primaryHref}>
            <Button variant="primary">
              {signedIn ? "Open your workspace" : "Book a demo"} <ArrowRight size={16} />
            </Button>
          </Link>
          <Link href={signedIn ? "/app" : "/signup"}>
            <Button variant="secondary">Start a 10-day trial</Button>
          </Link>
        </div>
        <p className="mt-4 text-xs text-muted">
          Self-hosted · Powered by claude-sonnet-5 · Your data stays on your infrastructure
        </p>
      </section>

      {/* Hero product preview — the real decision report */}
      <section className="mx-auto max-w-4xl px-6 pb-16">
        <BrowserFrame url="app.glassbox.ai/app/conversations">
          <ReportPreview />
        </BrowserFrame>
        <p className="mt-3 text-center text-xs text-muted">
          A real decision report from Glass Box — every number verified against the
          underlying Python before it shipped.
        </p>
      </section>

      {/* The wedge — why not just buy the API */}
      <section className="border-y border-border bg-panel/40">
        <div className="mx-auto max-w-4xl px-6 py-14 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">
            Buying API access is not the same as operationalizing it
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-muted">
            A raw API key gives you a model. It doesn&apos;t give your finance lead a governed
            analyst that knows their role, profiles their data, cites the clause, checks its
            own math, keeps an audit trail, and runs where PHI can&apos;t leave the building.
            That last mile — the prompts, the sandbox, the agent loop, the RBAC, the
            self-hosting — is the product. Glass Box <em>is</em> that last mile, ready to
            deploy on your infrastructure and customize to your organization.
          </p>
          <div className="mt-8 flex justify-center">
            <Link href="/how-it-works">
              <Button variant="secondary">
                See how it works <ArrowRight size={16} />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Two more real previews — documents + versioning */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent">
            <FileText size={13} /> It reads your documents too
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">
            Ask an RFP a question. Get the clause back.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Procurement and legal upload the document, ask in plain English, and get an
            answer anchored to the exact wording — then diff v2 against v1 to see what
            changed. The audit wedge a chat upload can&apos;t touch.
          </p>
        </div>
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <BrowserFrame url="app.glassbox.ai/app/conversations">
            <CitationPreview />
          </BrowserFrame>
          <BrowserFrame url="app.glassbox.ai/app/datasets">
            <ComparePreview />
          </BrowserFrame>
        </div>
      </section>

      {/* Outcomes grid */}
      <section className="mx-auto max-w-6xl px-6 pb-16">
        <div className="grid gap-4 sm:grid-cols-2">
          {OUTCOMES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-panel p-6">
              <div className="mb-3 grid h-9 w-9 place-items-center rounded-lg border border-accent/40 bg-accent/15 text-accent">
                <f.icon size={18} />
              </div>
              <h3 className="text-sm font-semibold text-foreground">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Governance / self-hosted band */}
      <section className="border-y border-border bg-panel/40">
        <div className="mx-auto max-w-5xl px-6 py-14">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight">
              Your data never leaves your infrastructure
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted">
              Glass Box is self-hosted by design. There is no file to paste into a window you
              don&apos;t control — sources live in your workspace, access is enforced by role on
              every request, and every action is audited.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              { icon: Server, title: "Runs on your box", body: "Docker Compose or your VPC. Postgres + a single Node service. No data egress." },
              { icon: Lock, title: "Governed by role", body: "OWNER / ADMIN / MEMBER / VIEWER enforced in the database on every request." },
              { icon: ScrollText, title: "Fully audited", body: "Every upload, run, guardrail block, share, and deletion lands in the audit log." },
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
        </div>
      </section>

      {/* How you buy it */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight">How teams adopt Glass Box</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Try it in minutes; deploy it on your terms. The public app is a showcase — the
            real offering is a customized, self-hosted deployment tuned to your org.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { step: "1", title: "Start a 10-day trial", body: "Spin up a workspace, upload synthetic or real data, and see the analyst work end to end." },
            { step: "2", title: "Book a walkthrough", body: "We map your personas, domains, and the decisions your teams need to own." },
            { step: "3", title: "Deploy on your infra", body: "A customized Glass Box on your VPC — your roles, your sources, your retention, full ownership." },
          ].map((s) => (
            <div key={s.step} className="rounded-2xl border border-border bg-panel p-6">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-accent/15 text-sm font-bold text-accent">
                {s.step}
              </div>
              <h3 className="mt-3 text-sm font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-4xl px-6 pb-24">
        <div className="rounded-3xl border border-accent/30 bg-gradient-to-b from-accent/10 to-transparent p-10 text-center">
          <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-xl border border-accent/40 bg-accent/15 text-accent">
            <ScanSearch size={22} />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Operationalize AI into decisions your team owns
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted">
            See Glass Box on your own data, then deploy it on your own infrastructure.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link href="/demo">
              <Button variant="primary">Book a demo <ArrowRight size={16} /></Button>
            </Link>
            <Link href={signedIn ? "/app" : "/signup"}>
              <Button variant="secondary">Start a 10-day trial</Button>
            </Link>
          </div>
          <ul className="mx-auto mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-xs text-muted">
            {["10-day trial", "No card required", "Self-hosted deployment", "claude-sonnet-5"].map((t) => (
              <li key={t} className="inline-flex items-center gap-1.5">
                <Check size={13} className="text-green" /> {t}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
