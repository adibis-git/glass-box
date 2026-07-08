import Link from "next/link";
import { auth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";

const FEATURES = [
  {
    icon: "🧠",
    title: "Watch the agent think",
    body: "Every analysis runs in a transparent loop — the plan, the Python it writes, the output it reads, and how it corrects its own mistakes. Glass box, not black box.",
  },
  {
    icon: "📊",
    title: "Decision-grade reports",
    body: "Headline takeaway, hero metrics with trends, confidence-scored insights, and a concrete recommendation — not a wall of numbers.",
  },
  {
    icon: "💬",
    title: "Ask follow-up questions",
    body: "Drill into any finding conversationally. The agent keeps its working context and answers only from your data — nothing else.",
  },
  {
    icon: "🗂️",
    title: "Any CSV or Excel",
    body: "Messy headers, currency strings, merged cells, multiple sheets — the ingestion pipeline cleans it and shows you exactly what it changed.",
  },
  {
    icon: "🔐",
    title: "Role-based access control",
    body: "Owners, admins, members, and viewers. Every permission is enforced in the database on every request — and every action is audited.",
  },
  {
    icon: "🧾",
    title: "Compliance-ready tooling",
    body: "Full audit trail, hard deletion, retention policies, encryption at rest. Only the schema, a 20-row sample, and printed outputs ever reach the model — never your full file.",
  },
];

export default async function LandingPage() {
  const session = await auth();
  const signedIn = !!session?.user;

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-accent/40 bg-accent/15 text-base">
            🔎
          </span>
          <span className="text-lg font-semibold tracking-tight">Glass Box</span>
        </div>
        <nav className="flex items-center gap-2">
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
          <span className="text-accent">●</span> The data analysis companion for decision makers
        </div>
        <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          Upload a file. Watch it become
          <span className="text-accent"> a decision.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted">
          Glass Box is an AI data analyst that shows its work. Upload any CSV or Excel file,
          ask a question in plain English, and watch a transparent agent plan, write code,
          chart, self-correct, and deliver an executive report — then keep asking.
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
          No credit card required · Your data stays in your workspace, governed by roles you control
        </p>
      </section>

      {/* Loop strip */}
      <section className="mx-auto max-w-5xl px-6 pb-16">
        <div className="rounded-2xl border border-border bg-panel p-5">
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2 font-mono text-sm text-muted">
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
          <p className="mt-3 text-center text-xs text-muted">
            Every step is visible in the reasoning feed — including the moment the agent reads its
            own error and fixes it.
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-panel p-5">
              <div className="mb-2 text-2xl">{f.icon}</div>
              <h3 className="text-sm font-semibold text-foreground">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Privacy band */}
      <section className="border-y border-border bg-panel/50">
        <div className="mx-auto max-w-4xl px-6 py-12 text-center">
          <h2 className="text-xl font-semibold">What reaches the AI model — precisely</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            The column schema, a 20-row sample, up to 4,000 characters of printed output per
            analysis step, and chart data. <span className="text-foreground/90">Never your full
            file.</span> Your datasets live encrypted in your workspace, access is enforced by
            role on every request, every action lands in the audit log, and hard deletion removes
            data and stored files on demand.
          </p>
        </div>
      </section>

      {/* Pricing placeholder */}
      <section className="mx-auto max-w-4xl px-6 py-16 text-center">
        <h2 className="text-xl font-semibold">Simple pricing</h2>
        <div className="mx-auto mt-6 grid max-w-2xl gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-panel p-6 text-left">
            <div className="text-sm font-semibold">Starter</div>
            <div className="mt-2 text-3xl font-bold">Free</div>
            <ul className="mt-4 space-y-1.5 text-sm text-muted">
              <li>· 1 workspace, 3 members</li>
              <li>· CSV &amp; Excel uploads</li>
              <li>· Conversational analysis</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-accent/40 bg-panel p-6 text-left">
            <div className="text-sm font-semibold text-accent">Team · coming soon</div>
            <div className="mt-2 text-3xl font-bold">—</div>
            <ul className="mt-4 space-y-1.5 text-sm text-muted">
              <li>· Unlimited members &amp; roles</li>
              <li>· Data-source connectors</li>
              <li>· Retention policies &amp; audit export</li>
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
