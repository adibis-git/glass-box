// Insights aggregator for the /app home dashboard. Turns raw Message /
// Conversation / ReportSnapshot / Comparison rows into the "how the workspace
// turns data + docs into decisions" numbers the dashboard renders. Prisma only,
// no LLM calls. Reuses getOrgUsage for token/cost/by-day so metering never
// diverges from the Usage page.

import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { getOrgUsage, type OrgUsage } from "@/lib/usage";

export type InsightScope = "team" | "personal";

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

export interface TopConversation {
  id: string;
  title: string;
  updatedAt: Date;
  messageCount: number;
}

export interface TeamMemberActivity {
  userId: string;
  name: string;
  runs: number;
}

export interface OrgInsights {
  scope: InsightScope;
  questionsAsked: number;
  analysesRun: number;
  decisionReports: number;
  documentAnswers: number; // "clauses cited" — assistant answers over document sources
  versionsCompared: number;
  sharedReports: number;
  effortMix: EffortMix;
  intentMix: IntentMix;
  topConversations: TopConversation[];
  teamActivity: TeamMemberActivity[]; // populated only when scope = "team"
  usage: OrgUsage;
}

/**
 * Aggregate the reporting a user (or their team) should see on the /app home.
 *
 * scope "team"     → whole org (admins/owners): every conversation in the org.
 * scope "personal" → only conversations the viewer created (createdById = userId).
 *
 * Message has no direct userId, so per-user scoping goes through
 * Conversation.createdById. Comparisons have no user attribution (only
 * Source.orgId), so versionsCompared is always workspace-wide.
 */
export async function getOrgInsights(
  orgId: string,
  opts: { scope: InsightScope; userId?: string },
): Promise<OrgInsights> {
  const { scope } = opts;
  const scopeToUser = scope === "personal" && !!opts.userId;

  const convWhere: Prisma.ConversationWhereInput = scopeToUser
    ? { orgId, createdById: opts.userId }
    : { orgId };
  const msgWhere: Prisma.MessageWhereInput = { conversation: convWhere };
  const assistantWhere: Prisma.MessageWhereInput = { ...msgWhere, role: "ASSISTANT" };

  const reportShareWhere: Prisma.ReportSnapshotWhereInput = {
    orgId,
    shareToken: { not: null },
    ...(scopeToUser ? { conversation: { createdById: opts.userId } } : {}),
  };

  const [
    questionsAsked,
    analysesRun,
    decisionReports,
    documentAnswers,
    versionsCompared,
    sharedReports,
    effortGroups,
    intentGroups,
    topConvsRaw,
    usage,
  ] = await Promise.all([
    prisma.message.count({ where: { ...msgWhere, role: "USER" } }),
    prisma.message.count({ where: assistantWhere }),
    // A non-null `report` (SQL NULL when absent) means a verifier-checked
    // decision report was produced. Prisma 7: filter with { not: Prisma.DbNull }.
    prisma.message.count({ where: { ...assistantWhere, report: { not: Prisma.DbNull } } }),
    prisma.message.count({ where: { ...assistantWhere, modality: "document" } }),
    // Comparison has no orgId — join through Source.orgId. Workspace-wide.
    prisma.comparison.count({ where: { source: { orgId } } }),
    prisma.reportSnapshot.count({ where: reportShareWhere }),
    prisma.message.groupBy({
      by: ["effort"],
      where: assistantWhere,
      _count: { _all: true },
    }),
    prisma.message.groupBy({
      by: ["intent"],
      where: assistantWhere,
      _count: { _all: true },
    }),
    prisma.conversation.findMany({
      where: convWhere,
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    }),
    getOrgUsage(orgId),
  ]);

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
      // null (legacy rows) or any unrecognized intent
      intentMix.other += g._count._all;
    }
  }

  const topConversations: TopConversation[] = topConvsRaw.map((c) => ({
    id: c.id,
    title: c.title,
    updatedAt: c.updatedAt,
    messageCount: c._count.messages,
  }));

  let teamActivity: TeamMemberActivity[] = [];
  if (scope === "team") {
    const members = await prisma.membership.findMany({
      where: { orgId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    const runCounts = await Promise.all(
      members.map((m) =>
        prisma.message.count({
          where: { role: "ASSISTANT", conversation: { orgId, createdById: m.userId } },
        }),
      ),
    );
    teamActivity = members
      .map((m, i) => ({
        userId: m.userId,
        name: m.user.name?.trim() || m.user.email,
        runs: runCounts[i],
      }))
      .sort((a, b) => b.runs - a.runs);
  }

  return {
    scope,
    questionsAsked,
    analysesRun,
    decisionReports,
    documentAnswers,
    versionsCompared,
    sharedReports,
    effortMix,
    intentMix,
    topConversations,
    teamActivity,
    usage,
  };
}
