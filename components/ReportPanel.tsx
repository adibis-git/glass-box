"use client";

import type { FinalReport, ReportMetric } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/Markdown";
import { ChartColumn, Lightbulb, Loader2 } from "lucide-react";

const trendMeta: Record<NonNullable<ReportMetric["trend"]>, { arrow: string; cls: string }> = {
  up: { arrow: "↑", cls: "text-green" },
  down: { arrow: "↓", cls: "text-red" },
  flat: { arrow: "→", cls: "text-muted" },
};

function MetricCard({ metric }: { metric: ReportMetric }) {
  const t = metric.trend ? trendMeta[metric.trend] : null;
  return (
    <div className="rounded-xl border border-border bg-panel/70 p-3.5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
        {metric.label}
      </div>
      <div className={cn("mt-1 flex items-baseline gap-1.5 text-2xl font-bold tracking-tight", t?.cls ?? "text-foreground")}>
        {t && <span className="text-lg">{t.arrow}</span>}
        <span>{metric.value}</span>
      </div>
    </div>
  );
}

const confidenceStyle = {
  high: "bg-green/15 text-green border-green/30",
  medium: "bg-amber/15 text-amber border-amber/30",
  low: "bg-muted/15 text-muted border-muted/30",
} as const;

export function ReportPanel({ report }: { report: FinalReport }) {
  return (
    <div className="gb-in overflow-hidden rounded-2xl border border-green/30 bg-gradient-to-b from-green/10 via-panel to-panel">
      <div className="p-5">
        <div className="mb-2 flex items-center gap-2">
          <ChartColumn size={16} className="text-green" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-green">
            Final Report
          </span>
        </div>

        {report.headline && (
          <h2 className="text-lg font-semibold leading-snug tracking-tight text-foreground">
            {report.headline}
          </h2>
        )}

        {report.metrics.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {report.metrics.map((m, i) => (
              <MetricCard key={i} metric={m} />
            ))}
          </div>
        )}

        {report.summary && (
          <Markdown text={report.summary} className="mt-4 text-foreground/85" />
        )}
      </div>

      {report.insights.length > 0 && (
        <div className="border-t border-border/70 bg-panel/40 p-5">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
            Key insights
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {report.insights.map((ins, i) => (
              <div key={i} className="rounded-xl border border-border bg-panel p-3.5">
                <div className="mb-1.5 flex items-start justify-between gap-3">
                  <span className="text-sm font-medium leading-snug text-foreground">
                    {ins.finding}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                      confidenceStyle[ins.confidence],
                    )}
                  >
                    {ins.confidence}
                  </span>
                </div>
                <div className="text-xs leading-relaxed text-muted">{ins.evidence}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {report.recommendation && (
        <div className="flex items-start gap-2.5 border-t border-border/70 bg-accent/5 p-5">
          <Lightbulb size={16} className="mt-0.5 shrink-0 text-accent" />
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-accent">
              Recommendation
            </div>
            <p className="mt-1 text-sm leading-relaxed text-foreground/85">
              {report.recommendation}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export function ReportComposing() {
  return (
    <div className="gb-in rounded-2xl border border-green/30 bg-gradient-to-b from-green/10 to-panel p-5">
      <div className="mb-3 flex items-center gap-2">
        <Loader2 size={16} className="animate-spin text-green" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-green">
          Composing final report…
        </span>
      </div>
      <div className="space-y-2.5">
        <div className="h-5 w-3/4 animate-pulse rounded bg-border" />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-border/60" />
          ))}
        </div>
        <div className="h-4 w-full animate-pulse rounded bg-border/60" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-border/60" />
      </div>
    </div>
  );
}
