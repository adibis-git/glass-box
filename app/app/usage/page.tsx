import { redirect } from "next/navigation";
import { getActiveOrg } from "@/lib/activeOrg";
import { getOrgUsage } from "@/lib/usage";
import { fmtInt, fmtDate } from "@/lib/utils";
import { PageHeader } from "@/components/app/PageHeader";

export const dynamic = "force-dynamic";

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-panel p-5">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export default async function UsagePage() {
  const ctx = await getActiveOrg();
  if (!ctx?.active) redirect("/login");
  const org = ctx.active;

  const usage = await getOrgUsage(org.id, 14);
  const maxDay = Math.max(1, ...usage.byDay.map((d) => d.tokens));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Usage"
        subtitle="Analysis runs and token consumption across every conversation in this workspace."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Total runs" value={fmtInt(usage.totalRuns)} hint="analyses executed" />
        <StatTile label="Input tokens" value={fmtInt(usage.totalInputTokens)} />
        <StatTile label="Output tokens" value={fmtInt(usage.totalOutputTokens)} />
        <StatTile
          label="Est. cost"
          value={`$${usage.costEstimateUsd.toFixed(2)}`}
          hint="estimate"
        />
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-panel p-5">
        <div className="mb-4 flex items-baseline justify-between">
          <div className="text-sm font-semibold text-foreground">Last {usage.windowDays} days</div>
          <div className="text-xs text-muted">tokens per day (input + output)</div>
        </div>

        {usage.totalTokens === 0 ? (
          <div className="py-8 text-center text-sm text-muted">
            No usage yet. Start a conversation and ask a question to see metering here.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {usage.byDay.map((d) => {
              const pct = Math.round((d.tokens / maxDay) * 100);
              return (
                <li key={d.date} className="flex items-center gap-3 text-xs">
                  <span className="w-20 shrink-0 text-muted">{fmtDate(d.date)}</span>
                  <span className="relative h-5 flex-1 overflow-hidden rounded bg-panel-2">
                    <span
                      className="absolute inset-y-0 left-0 rounded bg-accent/30"
                      style={{ width: `${pct}%` }}
                      aria-hidden
                    />
                  </span>
                  <span className="w-24 shrink-0 text-right font-mono text-foreground/80">
                    {fmtInt(d.tokens)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        {usage.costNote} Cost is computed from {fmtInt(usage.totalInputTokens)} input and{" "}
        {fmtInt(usage.totalOutputTokens)} output tokens at ${usage.rates.inputPerMTok} / $
        {usage.rates.outputPerMTok} per 1M tokens. Billing is not enabled.
      </p>
    </div>
  );
}
