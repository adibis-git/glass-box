// Insights aggregator for the /app home dashboard. Turns raw Message /
// Conversation / ReportSnapshot / Comparison rows into the "how the workspace
// turns data + docs into decisions" numbers the dashboard renders. Prisma only,
// no LLM calls. Reuses getOrgUsage for token/cost/by-day so metering never
// diverges from the Usage page.
//
// Scope follows the reporting structure (Membership.managerId):
//   "team"     → OWNER/ADMIN: every conversation in the org.
//   "reports"  → a manager: their own + all reports' conversations (subtree).
//   "personal" → an individual contributor: only their own conversations.

import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import type { Role } from "@/lib/generated/prisma/client";
import { getOrgUsage, type OrgUsage } from "@/lib/usage";

export type InsightScope = "team" | "reports" | "personal";

const PERIOD_DAYS = 30; // current window for trend deltas + the activity chart
const SPARK_DAYS = 14; // mini-sparkline window on the stat cards

export interface Trend {
  value: number; // all-time total
  currPeriod: number; // last PERIOD_DAYS
  prevPeriod: number; // the PERIOD_DAYS before that
  pct: number | null; // % change vs previous period; null when no prior baseline
  spark: number[]; // last SPARK_DAYS daily counts
}

export interface DayPoint {
  date: string; // YYYY-MM-DD (UTC)
  analyses: number;
  questions: number;
}

export interface EffortMix {
  LOW: number;
  MEDIUM: number;
  HIGH: number;
}

export interface IntentMix {
  quick_fact: number;
  analytical: number;
  decision: number;
  other: number;
}

export interface ModalityMix {
  data: number; // tabular (incl. legacy null modality)
  documents: number; // document answers
}

export interface TopConversation {
  id: string;
  title: string;
  updatedAt: Date;
  messageCount: number;
}

export interface MemberActivity {
  userId: string;
  name: string;
  email: string;
  isManager: boolean;
  analyses: number;
  decisionReports: number;
  lastActive: Date | null;
}

export interface OrgInsights {
  scope: InsightScope;
  questionsAsked: Trend;
  analysesRun: Trend;
  decisionReports: Trend;
  documentAnswers: Trend;
  versionsCompared: number;
  sharedReports: number;
  activeMembers: number;
  effortMix: EffortMix;
  intentMix: IntentMix;
  modalityMix: ModalityMix;
  activityByDay: DayPoint[]; // last PERIOD_DAYS
  topConversations: TopConversation[];
  memberActivity: MemberActivity[]; // team / reports scope only
  usage: OrgUsage;
}

export interface ViewerScope {
  scope: InsightScope;
  userId: string;
  /** For "reports": the viewer's membership + all descendants (userIds). */
  subtreeUserIds?: string[];
}

/**
 * Decide what a viewer should see based on their org role + reporting structure.
 * OWNER/ADMIN see the whole workspace; a member who manages others sees their
 * subtree; everyone else sees only their own work.
 */
export async function resolveViewerScope(
  orgId: string,
  userId: string,
  role: Role,
): Promise<ViewerScope> {
  if (role === "OWNER" || role === "ADMIN") return { scope: "team", userId };

  // Build the org's manager → reports tree once, then collect this member's subtree.
  const memberships = await prisma.membership.findMany({
    where: { orgId },
    select: { id: true, userId: true, managerId: true },
  });
  const mine = memberships.find((m) => m.userId === userId);
  if (!mine) return { scope: "personal", userId };

  const childrenByManager = new Map<string, typeof memberships>();
  for (const m of memberships) {
    if (!m.managerId) continue;
    const arr = childrenByManager.get(m.managerId) ?? [];
    arr.push(m);
    childrenByManager.set(m.managerId, arr);
  }

  const subtree = new Set<string>([mine.userId]);
  const queue = [mine.id];
  while (queue.length) {
    const id = queue.shift()!;
    for (const child of childrenByManager.get(id) ?? []) {
      if (!subtree.has(child.userId)) {
        subtree.add(child.userId);
        queue.push(child.id);
      }
    }
  }

  if (subtree.size <= 1) return { scope: "personal", userId };
  return { scope: "reports", userId, subtreeUserIds: [...subtree] };
}

function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Midnight UTC, `daysAgo` days before today (inclusive window start). */
function utcMidnightDaysAgo(daysAgo: number): Date {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d;
}

export async function getOrgInsights(
  orgId: string,
  opts: { scope: InsightScope; userId?: string; subtreeUserIds?: string[] },
): Promise<OrgInsights> {
  const { scope } = opts;

  // Conversation filter that expresses the scope.
  let convWhere: Prisma.ConversationWhereInput;
  if (scope === "personal" && opts.userId) {
    convWhere = { orgId, createdById: opts.userId };
  } else if (scope === "reports" && opts.subtreeUserIds?.length) {
    convWhere = { orgId, createdById: { in: opts.subtreeUserIds } };
  } else {
    convWhere = { orgId };
  }
  const msgWhere: Prisma.MessageWhereInput = { conversation: convWhere };
  const assistantWhere: Prisma.MessageWhereInput = { ...msgWhere, role: "ASSISTANT" };
  const userWhere: Prisma.MessageWhereInput = { ...msgWhere, role: "USER" };

  const since30 = utcMidnightDaysAgo(PERIOD_DAYS - 1);
  const sincePrev = utcMidnightDaysAgo(PERIOD_DAYS * 2 - 1);
  const decisionReportWhere: Prisma.MessageWhereInput = {
    ...assistantWhere,
    report: { not: Prisma.DbNull },
  };
  const documentWhere: Prisma.MessageWhereInput = { ...assistantWhere, modality: "document" };

  const reportShareWhere: Prisma.ReportSnapshotWhereInput = {
    orgId,
    shareToken: { not: null },
    ...(scope === "personal" && opts.userId
      ? { conversation: { createdById: opts.userId } }
      : scope === "reports" && opts.subtreeUserIds?.length
        ? { conversation: { createdById: { in: opts.subtreeUserIds } } }
        : {}),
  };

  // Count helper for the current / previous trend windows.
  const between = (where: Prisma.MessageWhereInput, from: Date, to?: Date) =>
    prisma.message.count({ where: { ...where, createdAt: { gte: from, ...(to ? { lt: to } : {}) } } });

  const [
    qTotal, aTotal, dTotal, docTotal,
    qCurr, aCurr, dCurr, docCurr,
    qPrev, aPrev, dPrev, docPrev,
    versionsCompared, sharedReports,
    effortGroups, intentGroups,
    topConvsRaw, recent, usage,
  ] = await Promise.all([
    prisma.message.count({ where: userWhere }),
    prisma.message.count({ where: assistantWhere }),
    prisma.message.count({ where: decisionReportWhere }),
    prisma.message.count({ where: documentWhere }),
    between(userWhere, since30), between(assistantWhere, since30),
    between(decisionReportWhere, since30), between(documentWhere, since30),
    between(userWhere, sincePrev, since30), between(assistantWhere, sincePrev, since30),
    between(decisionReportWhere, sincePrev, since30), between(documentWhere, sincePrev, since30),
    prisma.comparison.count({ where: { source: { orgId } } }),
    prisma.reportSnapshot.count({ where: reportShareWhere }),
    prisma.message.groupBy({ by: ["effort"], where: assistantWhere, _count: { _all: true } }),
    prisma.message.groupBy({ by: ["intent"], where: assistantWhere, _count: { _all: true } }),
    prisma.conversation.findMany({
      where: convWhere,
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: { id: true, title: true, updatedAt: true, _count: { select: { messages: true } } },
    }),
    // One lightweight fetch (no report JSON) drives the 30-day activity chart
    // and the 14-day sparklines.
    prisma.message.findMany({
      where: { ...msgWhere, createdAt: { gte: since30 } },
      select: { createdAt: true, role: true, intent: true, modality: true },
    }),
    getOrgUsage(orgId),
  ]);

  // Seed 30 empty day buckets so the chart has no gaps.
  const days: string[] = [];
  const byDay = new Map<string, DayPoint>();
  for (let i = PERIOD_DAYS - 1; i >= 0; i--) {
    const key = utcDayKey(utcMidnightDaysAgo(i));
    days.push(key);
    byDay.set(key, { date: key, analyses: 0, questions: 0 });
  }
  const sparkMap = {
    questions: new Map<string, number>(),
    analyses: new Map<string, number>(),
    decision: new Map<string, number>(),
    document: new Map<string, number>(),
  };
  for (const m of recent) {
    const key = utcDayKey(m.createdAt);
    const bucket = byDay.get(key);
    const isAssistant = m.role === "ASSISTANT";
    if (bucket) {
      if (isAssistant) bucket.analyses += 1;
      else bucket.questions += 1;
    }
    if (isAssistant) {
      sparkMap.analyses.set(key, (sparkMap.analyses.get(key) ?? 0) + 1);
      if (m.intent === "decision") sparkMap.decision.set(key, (sparkMap.decision.get(key) ?? 0) + 1);
      if (m.modality === "document") sparkMap.document.set(key, (sparkMap.document.get(key) ?? 0) + 1);
    } else {
      sparkMap.questions.set(key, (sparkMap.questions.get(key) ?? 0) + 1);
    }
  }
  const sparkDays = days.slice(-SPARK_DAYS);
  const spark = (map: Map<string, number>) => sparkDays.map((k) => map.get(k) ?? 0);

  const pct = (curr: number, prev: number): number | null =>
    prev === 0 ? null : Math.round(((curr - prev) / prev) * 100);

  const mkTrend = (
    value: number, curr: number, prev: number, map: Map<string, number>,
  ): Trend => ({ value, currPeriod: curr, prevPeriod: prev, pct: pct(curr, prev), spark: spark(map) });

  const effortMix: EffortMix = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  for (const g of effortGroups) {
    if (g.effort === "LOW" || g.effort === "MEDIUM" || g.effort === "HIGH") {
      effortMix[g.effort] = g._count._all;
    }
  }

  const intentMix: IntentMix = { quick_fact: 0, analytical: 0, decision: 0, other: 0 };
  for (const g of intentGroups) {
    if (g.intent === "quick_fact" || g.intent === "analytical" || g.intent === "decision") {
      intentMix[g.intent] = g._count._all;
    } else {
      intentMix.other += g._count._all;
    }
  }

  const modalityMix: ModalityMix = { data: Math.max(0, aTotal - docTotal), documents: docTotal };

  const topConversations: TopConversation[] = topConvsRaw.map((c) => ({
    id: c.id,
    title: c.title,
    updatedAt: c.updatedAt,
    messageCount: c._count.messages,
  }));

  // Per-member activity for the manager / team views.
  let memberActivity: MemberActivity[] = [];
  if (scope === "team" || scope === "reports") {
    const memberWhere: Prisma.MembershipWhereInput =
      scope === "reports" && opts.subtreeUserIds?.length
        ? { orgId, userId: { in: opts.subtreeUserIds } }
        : { orgId };
    const members = await prisma.membership.findMany({
      where: memberWhere,
      select: {
        userId: true,
        user: { select: { name: true, email: true } },
        _count: { select: { reports: true } },
      },
    });
    memberActivity = await Promise.all(
      members.map(async (m) => {
        const base: Prisma.MessageWhereInput = {
          role: "ASSISTANT",
          conversation: { orgId, createdById: m.userId },
        };
        const [analyses, decisionReports, last] = await Promise.all([
          prisma.message.count({ where: base }),
          prisma.message.count({ where: { ...base, report: { not: Prisma.DbNull } } }),
          prisma.message.findFirst({
            where: { conversation: { orgId, createdById: m.userId } },
            orderBy: { createdAt: "desc" },
            select: { createdAt: true },
          }),
        ]);
        return {
          userId: m.userId,
          name: m.user.name?.trim() || m.user.email,
          email: m.user.email,
          isManager: m._count.reports > 0,
          analyses,
          decisionReports,
          lastActive: last?.createdAt ?? null,
        };
      }),
    );
    memberActivity.sort((a, b) => b.analyses - a.analyses);
  }

  const activeMembers =
    memberActivity.length > 0
      ? memberActivity.filter((m) => m.analyses > 0).length
      : aTotal > 0
        ? 1
        : 0;

  return {
    scope,
    questionsAsked: mkTrend(qTotal, qCurr, qPrev, sparkMap.questions),
    analysesRun: mkTrend(aTotal, aCurr, aPrev, sparkMap.analyses),
    decisionReports: mkTrend(dTotal, dCurr, dPrev, sparkMap.decision),
    documentAnswers: mkTrend(docTotal, docCurr, docPrev, sparkMap.document),
    versionsCompared,
    sharedReports,
    activeMembers,
    effortMix,
    intentMix,
    modalityMix,
    activityByDay: days.map((k) => byDay.get(k)!),
    topConversations,
    memberActivity,
    usage,
  };
}
