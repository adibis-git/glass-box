// Framed, theme-aware "product previews" for the marketing site. These render the
// ACTUAL synthetic-data output produced by the running product (a real decision
// report, real RFP citations, a real version diff) as crisp, responsive UI inside
// a browser-chrome frame — sharper and theme-correct in both light and dark, and
// not dependent on a raster screenshot. The numbers/clauses are the genuine output
// from the demo workspace (sales_prospects v2 + Acme Health Systems vendor RFP).

import {
  BarChart3,
  FileText,
  GitCompareArrows,
  Quote,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";
import type { ReactNode } from "react";

/** A faux browser window that frames a live-looking product screenshot. */
export function BrowserFrame({
  url = "app.glassbox.ai",
  children,
  className = "",
}: {
  url?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-xl border border-border bg-panel shadow-2xl shadow-black/20 ${className}`}
    >
      <div className="flex items-center gap-2 border-b border-border bg-panel-2 px-3 py-2.5">
        <div className="flex gap-1.5">
          <span className="h-3 w-3 rounded-full bg-red/70" />
          <span className="h-3 w-3 rounded-full bg-amber/70" />
          <span className="h-3 w-3 rounded-full bg-green/70" />
        </div>
        <div className="mx-auto flex items-center gap-1.5 rounded-md border border-border bg-panel px-3 py-1 text-[11px] text-muted">
          <ShieldCheck size={11} className="text-green" />
          {url}
        </div>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

function ConfidenceBadge({ level }: { level: "HIGH" | "MEDIUM" | "LOW" }) {
  const tone =
    level === "HIGH"
      ? "border-green/40 bg-green/15 text-green"
      : level === "MEDIUM"
        ? "border-amber/40 bg-amber/15 text-amber"
        : "border-border bg-panel-2 text-muted";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold tracking-wide ${tone}`}>
      {level}
    </span>
  );
}

/**
 * The decision report — real output for "Where should sales focus next quarter?"
 * on the synthetic sales_prospects dataset. Headline + hero metrics + confidence-
 * scored insights, exactly as the verifier-checked report renders in-app.
 */
export function ReportPreview() {
  const metrics = [
    { label: "Overall win rate", value: "13.0%", trend: "→" },
    { label: "Paid marketing win rate", value: "5.8%", trend: "↓", bad: true },
    { label: "Cold outreach pipeline", value: "$7.7M", trend: "→" },
    { label: "At-risk rep pipeline", value: "$4.5M", trend: "↓", bad: true },
  ];
  const insights: { text: string; sub: string; level: "HIGH" | "MEDIUM" }[] = [
    {
      text: "Paid Marketing drives the largest lead volume (1,635 deals, avg $46.0K) but only a 5.8% win rate — the lowest of all 7 sources — with $11.2M sitting in open pipeline.",
      sub: "1,635 deals · avg $46,023 · win rate 5.8% · open pipeline $11.23M",
      level: "HIGH",
    },
    {
      text: "Referral and Conference leads convert 3–5× better despite similar deal values, so the problem is channel quality, not deal size.",
      sub: "Referral: avg $49,232, win 29.3% · Conference: avg $46,566, win 25.1%",
      level: "HIGH",
    },
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-green">
        <BarChart3 size={13} /> Final report
      </div>
      <h3 className="text-base font-bold leading-snug text-foreground sm:text-lg">
        Paid Marketing and Cold Outreach are funding{" "}
        <span className="text-accent">$18.9M of open pipeline at a sub-9% win rate</span> —
        nearly triple the average deal size wasted on the weakest-converting channels.
      </h3>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-lg border border-border bg-panel-2 p-3">
            <div className="text-[9px] font-semibold uppercase leading-tight tracking-wide text-muted">
              {m.label}
            </div>
            <div
              className={`mt-1.5 flex items-baseline gap-1 text-xl font-bold ${
                m.bad ? "text-red" : "text-foreground"
              }`}
            >
              <span className="text-sm font-normal text-muted">{m.trend}</span>
              {m.value}
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">
          Key insights
        </div>
        {insights.map((ins) => (
          <div key={ins.sub} className="rounded-lg border border-border bg-panel-2 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs leading-relaxed text-foreground">{ins.text}</p>
              <ConfidenceBadge level={ins.level} />
            </div>
            <p className="mt-1.5 font-mono text-[10px] text-muted">{ins.sub}</p>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 text-[10px] text-muted">
        <TerminalSquare size={12} className="text-accent" />
        Every number verified against the Python output before this report shipped ·{" "}
        <span className="underline decoration-dotted">Show the work</span>
      </div>
    </div>
  );
}

/**
 * Document intelligence — real cited answer for "What are the mandatory
 * requirements?" against the Acme Health Systems vendor RFP. Each claim carries
 * the exact quoted clause it came from.
 */
export function CitationPreview() {
  const cites = [
    {
      claim: "SOC 2 Type II and HIPAA compliance are mandatory, not preferred.",
      clause:
        "“The vendor MUST hold a current SOC 2 Type II attestation and be able to execute a HIPAA Business Associate Agreement prior to contract award.”",
      anchor: "§3.2 · Security & Compliance",
    },
    {
      claim: "The platform must support self-hosted deployment inside Acme's VPC.",
      clause:
        "“Solutions requiring PHI to transit third-party multi-tenant infrastructure will be disqualified.”",
      anchor: "§4.1 · Deployment",
    },
  ];
  return (
    <div className="space-y-3.5">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-blue">
        <FileText size={13} /> Cited answer · vendor_rfp_v1
      </div>
      <p className="text-sm font-medium text-foreground">
        “What are the mandatory requirements a vendor must meet?”
      </p>
      <div className="space-y-2.5">
        {cites.map((c) => (
          <div key={c.anchor} className="rounded-lg border border-border bg-panel-2 p-3">
            <p className="text-xs font-medium text-foreground">{c.claim}</p>
            <div className="mt-2 flex gap-2 rounded-md border-l-2 border-accent/60 bg-panel px-2.5 py-2">
              <Quote size={12} className="mt-0.5 shrink-0 text-accent" />
              <p className="text-[11px] italic leading-relaxed text-muted">{c.clause}</p>
            </div>
            <div className="mt-1.5 text-[10px] font-semibold text-blue">{c.anchor}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Versioned sources — real diff between vendor_rfp_v1 and v2, the procurement
 * wedge: see exactly what changed instead of re-reading the whole document.
 */
export function ComparePreview() {
  const diffs = [
    {
      field: "Payment terms",
      before: "Net-30 from invoice",
      after: "Net-45 from invoice",
      tone: "changed",
    },
    {
      field: "Uptime SLA",
      before: "99.5% monthly",
      after: "99.9% monthly",
      tone: "changed",
    },
    {
      field: "Data residency",
      before: "—",
      after: "New clause: PHI must remain in-region (us-east)",
      tone: "added",
    },
  ];
  return (
    <div className="space-y-3.5">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-accent">
        <GitCompareArrows size={13} /> What changed · v1 → v2
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="grid grid-cols-[1fr_1fr_1fr] gap-px bg-border text-[10px] font-semibold uppercase tracking-wide text-muted">
          <div className="bg-panel-2 px-3 py-2">Field</div>
          <div className="bg-panel-2 px-3 py-2">v1</div>
          <div className="bg-panel-2 px-3 py-2">v2</div>
        </div>
        {diffs.map((d) => (
          <div
            key={d.field}
            className="grid grid-cols-[1fr_1fr_1fr] gap-px border-t border-border bg-border text-[11px]"
          >
            <div className="bg-panel px-3 py-2.5 font-medium text-foreground">{d.field}</div>
            <div className="bg-panel px-3 py-2.5 text-muted line-through decoration-red/50">
              {d.before}
            </div>
            <div
              className={`bg-panel px-3 py-2.5 font-medium ${
                d.tone === "added" ? "text-green" : "text-accent"
              }`}
            >
              {d.after}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted">
        Structural + semantic diff — Glass Box flags the terms that materially changed so
        procurement doesn&apos;t re-read 40 pages.
      </p>
    </div>
  );
}
