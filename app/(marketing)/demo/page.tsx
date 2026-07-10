import type { Metadata } from "next";
import {
  Users,
  Database,
  Server,
  ShieldCheck,
  Lock,
} from "lucide-react";
import { LeadForm } from "@/components/marketing/LeadForm";

export const metadata: Metadata = {
  title: "Book a demo — Glass Box, the governed AI analyst you own",
  description:
    "See Glass Box on your own data: your personas mapped, your spreadsheets and contracts analyzed live, and a self-hosted deployment scoped to your infrastructure. Your data never leaves your environment.",
};

const REASONS = [
  {
    icon: Users,
    title: "Your personas, mapped",
    body: "We start from the decisions your finance, sales, and procurement teams actually own, and show how a role-aware analyst serves each one.",
  },
  {
    icon: Database,
    title: "Your data, analyzed live",
    body: "Bring a spreadsheet and a contract. Watch Glass Box run real Python in a sandboxed kernel, cite the exact clause, and check its own math.",
  },
  {
    icon: Server,
    title: "A deployment scoped to your infra",
    body: "We map a self-hosted rollout on your VPC or Docker — your roles, retention, and connectors — so you leave with a concrete path, not a pitch.",
  },
  {
    icon: ShieldCheck,
    title: "Governance you can audit",
    body: "Per-request RBAC, a full audit trail, usage metering, and revocable share links — the controls that separate a demo from production.",
  },
];

export default async function DemoPage() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 pt-20 pb-10 text-center">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-panel px-3 py-1 text-xs text-muted">
          <span className="text-accent">●</span> See it on your own data
        </div>
        <h1 className="text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
          Book a <span className="text-accent">walkthrough</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted">
          A working session, not a slide deck. We&apos;ll map your personas, analyze your data
          and contracts live, and scope a self-hosted deployment on your own infrastructure.
        </p>
      </section>

      {/* Two-column: pitch + form */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Left — the pitch */}
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              What you&apos;ll see in the walkthrough
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Every walkthrough is run on data that stays yours — self-hosted by design, so
              nothing you bring ever leaves your environment.
            </p>
            <div className="mt-6 space-y-4">
              {REASONS.map((r) => (
                <div key={r.title} className="flex gap-3.5">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-accent/40 bg-accent/15 text-accent">
                    <r.icon size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{r.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted">{r.body}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex items-start gap-2.5 rounded-2xl border border-border bg-panel p-4">
              <Lock size={16} className="mt-0.5 shrink-0 text-green" />
              <p className="text-xs leading-relaxed text-muted">
                Self-hosted by design. Glass Box runs on your infrastructure — Postgres and a
                single Node service — so your data never leaves the building and every action
                lands in your own audit log.
              </p>
            </div>
          </div>

          {/* Right — the form */}
          <div className="rounded-2xl border border-border bg-panel p-6">
            <h2 className="text-xl font-semibold tracking-tight">Book your walkthrough</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Tell us a little about your team and what you want to operationalize. We&apos;ll
              reach out to schedule a session and scope a deployment.
            </p>
            <div className="mt-5">
              <LeadForm source="demo" />
            </div>
            <p className="mt-4 flex items-center gap-1.5 text-[11px] text-muted">
              <ShieldCheck size={12} className="text-green" />
              Stored in our own self-hosted lead inbox. No third-party sharing.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
