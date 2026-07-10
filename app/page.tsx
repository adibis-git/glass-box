import Link from "next/link";
import {
  ScanSearch,
  Layers,
  Sparkles,
  MessagesSquare,
  GitCompareArrows,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ThemeToggle";

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Layers,
    title: "Data and documents, one analyst",
    body: "Spreadsheets run as pandas in a sandboxed kernel — you see the Python and its output. PDFs, DOCX and text get retrieved and reasoned over, with the exact clauses cited. RFP and contract review is a first-class use case.",
  },
  {
    icon: ScanSearch,
    title: "Shows its evidence",
    body: "Never a black box. Every answer carries its proof — the Python for tabular questions, the quoted clause for document questions — so you can check the work before you act on it.",
  },
  {
    icon: Sparkles,
    title: "Role-aware and guided",
    body: "It knows your role — Sales, Support, Finance, Ops, Consultant — and your workspace's domain, profiles each source on upload, and suggests the questions that actually matter for the decision in front of you.",
  },
  {
    icon: MessagesSquare,
    title: "Conversational, with decision reports",
    body: "Quick questions get quick inline answers. Decision questions get a decision-grade report — headline, metrics, recommendation — and a verifier that checks every reported number against the underlying evidence.",
  },
  {
    icon: GitCompareArrows,
    title: "Versioned sources you can compare",
    body: "Upload v2 of a spreadsheet or an RFP and see exactly what changed — a dropped column, a tightened SLA, a reworded clause — instead of re-reading the whole thing from scratch.",
  },
  {
    icon: ShieldCheck,
    title: "Governed and owned by your team",
    body: "Per-request RBAC, a full audit trail, usage metering, and shareable, revocable report links. Self-hosted by design — your data never leaves your infrastructure.",
  },
];

export default async function LandingPage() {
  const session = await auth();
  const signedIn = !!session?.user;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-accent/40 bg-accent/15 text-accent">
            <ScanSearch size={18} />
          </span>
          <span className="text-lg font-semibold tracking-tight">Glass Box</span>
        </div>
        <nav className="flex items-center gap-2">
          <ThemeToggle />
          {signedIn ? (
            <Link href="/app">
              <Button variant="primary" size="sm">Open workspace →</Button>
            </Link>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" size="sm">Sign in</Button>
              </Link>
              <Link href="/signup">
                <Button variant="primary" size="sm">Get started free</Button>
              </Link>
            </>
          )}
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 pt-16 pb-12 text-center">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-panel px-3 py-1 text-xs text-muted">
          <span className="text-accent">●</span> The governed AI analyst your team owns
        </div>
        <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          Your data and documents,
          <span className="text-accent"> turned into governed decisions.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted">
          Glass Box is an AI analyst your team owns and self-hosts. Point it at a
          spreadsheet or an RFP, ask in plain English, and get an answer that shows its
          evidence — the Python for your data, the cited clauses for your documents —
          without your files ever leaving your infrastructure.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link href={signedIn ? "/app" : "/signup"}>
            <Button variant="primary">Start analyzing free</Button>
          </Link>
          <Link href="/login">
            <Button variant="secondary">Sign in</Button>
          </Link>
        </div>
        <p className="mt-4 text-xs text-muted">
          Self-hosted · Powered by claude-sonnet-5 · Your data stays on your infrastructure, governed by roles you control
        </p>
      </section>

      {/* Loop strip */}
      <section className="mx-auto max-w-5xl px-6 pb-16">
        <div className="rounded-2xl border border-border bg-panel p-5">
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2 font-mono text-sm text-muted">
              <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-foreground/60">Data</span>
              {["PLAN", "CODE", "EXECUTE", "OBSERVE", "SELF-CORRECT", "CHART", "REPORT"].map(
                (s, i, arr) => (
                  <span key={s} className="flex items-center gap-2">
                    <span className={i === 4 ? "font-semibold text-amber" : "text-foreground/85"}>
                      {s}
                    </span>
                    {i < arr.length - 1 && <span className="text-border">→</span>}
                  </span>
                ),
              )}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2 font-mono text-sm text-muted">
              <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-foreground/60">Docs</span>
              {["RETRIEVE", "REASON", "CITE"].map((s, i, arr) => (
                <span key={s} className="flex items-center gap-2">
                  <span className="text-foreground/85">{s}</span>
                  {i < arr.length - 1 && <span className="text-border">→</span>}
                </span>
              ))}
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-muted">
            Every step is visible — the Python the agent runs on your data, the clauses it
            quotes from your documents, and a verifier that checks each reported number.
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-panel p-5">
              <div className="mb-3 grid h-9 w-9 place-items-center rounded-lg border border-accent/40 bg-accent/15 text-accent">
                <f.icon size={18} />
              </div>
              <h3 className="text-sm font-semibold text-foreground">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Privacy band */}
      <section className="border-y border-border bg-panel/50">
        <div className="mx-auto max-w-4xl px-6 py-12 text-center">
          <h2 className="text-xl font-semibold">Your data never leaves your infrastructure</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            Glass Box is self-hosted, so there is no file to paste into a chat window you
            don't control. Sources live encrypted in your workspace, access is enforced by
            role on every request, usage is metered, every action lands in the audit log,
            and report links are shareable and revocable. <span className="text-foreground/90">The
            wedge over pasting a spreadsheet or contract into a public AI tool: you keep the data.</span>
          </p>
        </div>
      </section>

      {/* Pricing placeholder */}
      <section className="mx-auto max-w-4xl px-6 py-16 text-center">
        <h2 className="text-xl font-semibold">Simple pricing</h2>
        <div className="mx-auto mt-6 grid max-w-2xl gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-panel p-6 text-left">
            <div className="text-sm font-semibold">Self-hosted</div>
            <div className="mt-2 text-3xl font-bold">Free</div>
            <ul className="mt-4 space-y-1.5 text-sm text-muted">
              <li>· Run it on your own infrastructure</li>
              <li>· Spreadsheets and documents (CSV, Excel, PDF, DOCX)</li>
              <li>· Role-based access, audit trail, and shareable reports</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-accent/40 bg-panel p-6 text-left">
            <div className="text-sm font-semibold text-accent">Team · coming soon</div>
            <div className="mt-2 text-3xl font-bold">—</div>
            <ul className="mt-4 space-y-1.5 text-sm text-muted">
              <li>· Managed hosting and SSO</li>
              <li>· Data-source connectors</li>
              <li>· Retention policies and audit export</li>
            </ul>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 text-xs text-muted">
          <span>© {new Date().getFullYear()} Glass Box</span>
          <span>Built with Claude · India Builds with Claude</span>
        </div>
      </footer>
    </div>
  );
}
