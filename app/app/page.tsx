import Link from "next/link";
import { redirect } from "next/navigation";
import {
  MessagesSquare,
  BarChart3,
  FileCheck2,
  Quote,
  GitCompareArrows,
  Share2,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { getActiveOrg } from "@/lib/activeOrg";
import { getOrgInsights, type InsightScope } from "@/lib/insights";
import { fmtInt, fmtDate, fmtDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/Button";

export const dynamic = "force-dynamic";

function StatTile({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-2xl border border-border bg-panel p-5">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</div>
        <Icon className="h-4 w-4 text-muted" />
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

function Breakdown({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: number }[];
}) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <div className="rounded-2xl border border-border bg-panel p-5">
      <div className="mb-4 text-sm font-semibold text-foreground">{title}</div>
      {total === 0 ? (
        <div className="py-4 text-center text-xs text-muted">No analyses yet.</div>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => {
            const pct = total === 0 ? 0 : Math.round((r.value / total) * 100);
            return (
              <li key={r.label} className="flex items-center gap-3 text-xs">
                <span className="w-20 shrink-0 text-muted">{r.label}</span>
                <span className="relative h-4 flex-1 overflow-hidden rounded bg-panel-2">
                  <span
                    className="absolute inset-y-0 left-0 rounded bg-accent/30"
                    style={{ width: `${pct}%` }}
                    aria-hidden
                  />
                </span>
                <span className="w-16 shrink-0 text-right font-mono text-foreground/80">
                  {fmtInt(r.value)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default async function AppHome() {
  const ctx = await getActiveOrg();
  if (!ctx?.active) redirect("/login");
  const org = ctx.active;

  const isManager = org.role === "OWNER" || org.role === "ADMIN";
  const scope: InsightScope = isManager ? "team" : "personal";

  const insights = await getOrgInsights(org.id, { scope, userId: ctx.userId });
  const { usage } = insights;
  const maxDay = Math.max(1, ...usage.byDay.map((d) => d.tokens));
  const maxRuns = Math.max(1, ...insights.teamActivity.map((m) => m.runs));

  const empty = insights.questionsAsked === 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <PageHeader
        title={isManager ? "Team intelligence" : "Your intelligence"}
        subtitle={
          isManager
            ? `How ${org.name} turns its own data and documents into verifiable decisions — every run stays inside your infrastructure.`
            : "How your questions become verifier-checked answers and decision reports — from your own data, without a file leaving your infrastructure."
        }
      />

      {empty ? (
        <div className="rounded-2xl border border-border bg-panel p-8 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Sparkles className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-base font-semibold text-foreground">
            Your first analysis starts here
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">
            Upload a spreadsheet or a document, then ask a question in plain English. Glass Box runs
            the analysis, cites its sources, and drafts a decision report — all on your own
            infrastructure.
          </p>
          <div className="mt-5 flex items-center justify-center gap-3">
            <Link href="/app/datasets">
              <Button variant="primary">
                Upload a dataset
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/app/conversations">
              <Button variant="secondary">Ask a question</Button>
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <StatTile
              label="Questions asked"
              value={fmtInt(insights.questionsAsked)}
              hint={isManager ? "across the team" : "by you"}
              icon={MessagesSquare}
            />
            <StatTile
              label="Analyses run"
              value={fmtInt(insights.analysesRun)}
              hint="verifier-checked"
              icon={BarChart3}
            />
            <StatTile
              label="Decision reports"
              value={fmtInt(insights.decisionReports)}
              hint="structured recommendations"
              icon={FileCheck2}
            />
            <StatTile
              label="Clauses cited"
              value={fmtInt(insights.documentAnswers)}
              hint="grounded in documents"
              icon={Quote}
            />
            <StatTile
              label="Versions compared"
              value={fmtInt(insights.versionsCompared)}
              hint="what materially changed"
              icon={GitCompareArrows}
            />
            <StatTile
              label="Shared reports"
              value={fmtInt(insights.sharedReports)}
              hint="published to stakeholders"
              icon={Share2}
            />
          </div>

          <p className="mt-4 text-sm leading-relaxed text-muted">
            <span className="font-medium text-foreground">
              {fmtInt(insights.decisionReports)}
            </span>{" "}
            verifier-checked decision report{insights.decisionReports === 1 ? "" : "s"} and{" "}
            <span className="font-medium text-foreground">{fmtInt(insights.documentAnswers)}</span>{" "}
            cited document answer{insights.documentAnswers === 1 ? "" : "s"} produced from{" "}
            {isManager ? "your team's" : "your"} own data — without a file leaving your
            infrastructure.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Breakdown
              title="Analysis depth"
              rows={[
                { label: "Quick", value: insights.effortMix.LOW },
                { label: "Standard", value: insights.effortMix.MEDIUM },
                { label: "Deep", value: insights.effortMix.HIGH },
              ]}
            />
            <Breakdown
              title="What you asked for"
              rows={[
                { label: "Quick facts", value: insights.intentMix.quick_fact },
                { label: "Analysis", value: insights.intentMix.analytical },
                { label: "Decisions", value: insights.intentMix.decision },
                ...(insights.intentMix.other > 0
                  ? [{ label: "Other", value: insights.intentMix.other }]
                  : []),
              ]}
            />
          </div>

          <div className="mt-6 rounded-2xl border border-border bg-panel p-5">
            <div className="mb-4 flex items-baseline justify-between">
              <div className="text-sm font-semibold text-foreground">Workspace usage</div>
              <div className="text-xs text-muted">
                tokens per day (input + output), last {usage.windowDays} days
              </div>
            </div>
            {usage.totalTokens === 0 ? (
              <div className="py-8 text-center text-sm text-muted">
                No metered usage yet. Run an analysis to see consumption here.
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
            <div className="mt-4 flex items-center justify-between border-t border-border pt-4 text-xs">
              <span className="text-muted">Estimated cost (workspace-wide)</span>
              <span className="font-mono text-foreground">
                ${usage.costEstimateUsd.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-border bg-panel p-5">
            <div className="mb-4 flex items-baseline justify-between">
              <div className="text-sm font-semibold text-foreground">Recent conversations</div>
              <Link
                href="/app/conversations"
                className="text-xs text-accent hover:brightness-110"
              >
                View all
              </Link>
            </div>
            {insights.topConversations.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted">No conversations yet.</div>
            ) : (
              <ul className="divide-y divide-border">
                {insights.topConversations.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/app/conversations/${c.id}`}
                      className="group flex items-center justify-between gap-4 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm text-foreground group-hover:text-accent">
                          {c.title}
                        </div>
                        <div className="mt-0.5 text-xs text-muted">
                          {fmtInt(c.messageCount)} message{c.messageCount === 1 ? "" : "s"} ·{" "}
                          {fmtDateTime(c.updatedAt)}
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted group-hover:text-accent" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {isManager && insights.teamActivity.length > 0 && (
            <div className="mt-6 rounded-2xl border border-border bg-panel p-5">
              <div className="mb-4 flex items-baseline justify-between">
                <div className="text-sm font-semibold text-foreground">Team activity</div>
                <Link href="/app/members" className="text-xs text-accent hover:brightness-110">
                  Manage members
                </Link>
              </div>
              <ul className="space-y-2.5">
                {insights.teamActivity.map((m) => {
                  const pct = Math.round((m.runs / maxRuns) * 100);
                  return (
                    <li key={m.userId} className="flex items-center gap-3 text-xs">
                      <span className="w-40 shrink-0 truncate text-foreground">{m.name}</span>
                      <span className="relative h-4 flex-1 overflow-hidden rounded bg-panel-2">
                        <span
                          className="absolute inset-y-0 left-0 rounded bg-accent/30"
                          style={{ width: `${pct}%` }}
                          aria-hidden
                        />
                      </span>
                      <span className="w-24 shrink-0 text-right text-muted">
                        {fmtInt(m.runs)} run{m.runs === 1 ? "" : "s"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
