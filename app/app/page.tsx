import Link from "next/link";
import { redirect } from "next/navigation";
import {
  MessagesSquare,
  BarChart3,
  FileCheck2,
  Quote,
  GitCompareArrows,
  Share2,
  Users,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { getActiveOrg } from "@/lib/activeOrg";
import { getOrgInsights, resolveViewerScope } from "@/lib/insights";
import { fmtInt, fmtDate, fmtDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/Button";
import { StatCard } from "@/components/app/dashboard/StatCard";
import { ActivityChart } from "@/components/app/dashboard/ActivityChart";
import { WorkDonut } from "@/components/app/dashboard/WorkDonut";
import { CategoryBars } from "@/components/app/dashboard/CategoryBars";
import { TeamWorkloadChart } from "@/components/app/dashboard/TeamWorkloadChart";
import { MostActiveTable } from "@/components/app/dashboard/MostActiveTable";
import type { DashboardMember } from "@/components/app/dashboard/types";

export const dynamic = "force-dynamic";

/** Compact relative-time on the server so a plain string crosses the boundary. */
function relativeTime(d: Date | null): string | null {
  if (!d) return null;
  const ms = Date.now() - d.getTime();
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(day / 365)}y ago`;
}

/** Small server-rendered tile (no sparkline) for the secondary metrics. */
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

export default async function AppHome() {
  const ctx = await getActiveOrg();
  if (!ctx?.active) redirect("/login");
  const org = ctx.active;

  const view = await resolveViewerScope(org.id, ctx.userId, org.role);
  const insights = await getOrgInsights(org.id, {
    scope: view.scope,
    userId: view.userId,
    subtreeUserIds: view.subtreeUserIds,
  });

  const {
    scope,
    questionsAsked,
    analysesRun,
    decisionReports,
    documentAnswers,
    versionsCompared,
    sharedReports,
    activeMembers,
    intentMix,
    effortMix,
    modalityMix,
    activityByDay,
    topConversations,
    memberActivity,
    usage,
  } = insights;

  const title =
    scope === "team"
      ? "Team intelligence"
      : scope === "reports"
        ? `${ctx.userName ?? "Your"} team`
        : "Your intelligence";
  const subtitle =
    "How this workspace turns its own data and documents into verifiable decisions — every run stays inside your infrastructure.";

  // Serialize member rows (Date → relative string) before the client boundary.
  const members: DashboardMember[] = memberActivity.map((m) => ({
    userId: m.userId,
    name: m.name,
    isManager: m.isManager,
    analyses: m.analyses,
    decisionReports: m.decisionReports,
    lastActive: relativeTime(m.lastActive),
  }));

  const showTeam = scope !== "personal" && memberActivity.length > 0;
  const activeMemberCount = memberActivity.filter((m) => m.analyses > 0).length;
  const maxDay = Math.max(1, ...usage.byDay.map((d) => d.tokens));
  const empty = analysesRun.value === 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <PageHeader title={title} subtitle={subtitle} />

      {empty ? (
        <div className="rounded-2xl border border-border bg-panel p-8 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Sparkles className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-base font-semibold text-foreground">
            Ask your first question
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">
            Upload a spreadsheet or a document, then ask a question in plain English. Glass Box
            runs the analysis, cites its sources, and drafts a decision report — all on your own
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
          {/* Primary metrics — trend + sparkline. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Questions asked"
              icon={<MessagesSquare className="h-4 w-4" />}
              trend={questionsAsked}
            />
            <StatCard
              label="Analyses run"
              icon={<BarChart3 className="h-4 w-4" />}
              trend={analysesRun}
            />
            <StatCard
              label="Decision reports"
              icon={<FileCheck2 className="h-4 w-4" />}
              trend={decisionReports}
            />
            <StatCard
              label="Document answers"
              icon={<Quote className="h-4 w-4" />}
              trend={documentAnswers}
            />
          </div>

          {/* Secondary metrics — simple tiles. */}
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatTile
              label="Versions compared"
              value={fmtInt(versionsCompared)}
              hint="what materially changed"
              icon={GitCompareArrows}
            />
            <StatTile
              label="Shared reports"
              value={fmtInt(sharedReports)}
              hint="published to stakeholders"
              icon={Share2}
            />
            <StatTile
              label="Active members"
              value={fmtInt(activeMembers)}
              hint={scope === "personal" ? "you" : "with activity"}
              icon={Users}
            />
          </div>

          {/* Honest impact line. */}
          <p className="mt-4 text-sm leading-relaxed text-muted">
            <span className="font-medium text-foreground">{fmtInt(decisionReports.value)}</span>{" "}
            verifier-checked decision report{decisionReports.value === 1 ? "" : "s"} and{" "}
            <span className="font-medium text-foreground">{fmtInt(documentAnswers.value)}</span>{" "}
            cited document answer{documentAnswers.value === 1 ? "" : "s"} from your own data —
            nothing left your infrastructure.
          </p>

          {/* Activity (wide) + Data/Documents donut. */}
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ActivityChart data={activityByDay} />
            </div>
            <WorkDonut data={modalityMix.data} documents={modalityMix.documents} />
          </div>

          {/* Intent + Effort mixes. */}
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <CategoryBars
              title="What was asked for"
              items={[
                { label: "Quick facts", value: intentMix.quick_fact, color: "var(--blue)" },
                { label: "Analytical", value: intentMix.analytical, color: "var(--accent)" },
                { label: "Decisions", value: intentMix.decision, color: "var(--green)" },
                { label: "Other", value: intentMix.other, color: "var(--muted)" },
              ]}
            />
            <CategoryBars
              title="Analysis depth"
              items={[
                { label: "Low", value: effortMix.LOW, color: "var(--blue)" },
                { label: "Medium", value: effortMix.MEDIUM, color: "var(--amber)" },
                { label: "High", value: effortMix.HIGH, color: "var(--accent)" },
              ]}
            />
          </div>

          {/* Team reporting (team / reports scope only). */}
          {showTeam && (
            <>
              <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <TeamWorkloadChart members={members} />
                <MostActiveTable members={members} />
              </div>
              {activeMemberCount <= 1 && (
                <p className="mt-3 text-xs text-muted">
                  Invite members and assign managers to see team reporting fill out.
                </p>
              )}
            </>
          )}

          {/* Recent conversations. */}
          <div className="mt-6 rounded-2xl border border-border bg-panel p-5">
            <div className="mb-4 flex items-baseline justify-between">
              <div className="text-sm font-semibold text-foreground">Recent conversations</div>
              <Link href="/app/conversations" className="text-xs text-accent hover:brightness-110">
                View all
              </Link>
            </div>
            {topConversations.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted">No conversations yet.</div>
            ) : (
              <ul className="divide-y divide-border">
                {topConversations.map((c) => (
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

          {/* Workspace usage — token consumption per day. */}
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
              <span className="font-mono text-foreground">${usage.costEstimateUsd.toFixed(2)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
