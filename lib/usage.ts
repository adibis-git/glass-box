// Usage metering (v3 §17 SaaS surface). Aggregates token/run usage from Message
// rows across an org's conversations. Shared by the GET usage API route and the
// Usage dashboard page so both report identical numbers. No LLM calls.

import { prisma } from "@/lib/db";

// Cost estimate uses Claude Sonnet 5 list rates. This is a ROUGH estimate — the
// actual model and provider (Anthropic vs OpenRouter, other tiers) can differ.
export const SONNET_INPUT_PER_MTOK = 3; // USD / 1M input tokens
export const SONNET_OUTPUT_PER_MTOK = 15; // USD / 1M output tokens

export interface UsageDay {
  date: string; // YYYY-MM-DD (UTC)
  inputTokens: number;
  outputTokens: number;
  tokens: number;
}

export interface OrgUsage {
  totalRuns: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  costEstimateUsd: number;
  rates: { inputPerMTok: number; outputPerMTok: number };
  costNote: string;
  windowDays: number;
  byDay: UsageDay[];
}

function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  const usd =
    (inputTokens / 1_000_000) * SONNET_INPUT_PER_MTOK +
    (outputTokens / 1_000_000) * SONNET_OUTPUT_PER_MTOK;
  return Math.round(usd * 100) / 100;
}

/** Compute usage for an org. `days` = size of the by-day window (default 14). */
export async function getOrgUsage(orgId: string, days = 14): Promise<OrgUsage> {
  const where = { conversation: { orgId } };

  // Window start = midnight UTC `days-1` days ago, so `days` buckets are inclusive.
  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  since.setUTCDate(since.getUTCDate() - (days - 1));

  const [agg, totalRuns, recent] = await Promise.all([
    prisma.message.aggregate({
      where,
      _sum: { inputTokens: true, outputTokens: true },
    }),
    // One assistant message == one agent run.
    prisma.message.count({ where: { ...where, role: "ASSISTANT" } }),
    prisma.message.findMany({
      where: { ...where, createdAt: { gte: since } },
      select: { createdAt: true, inputTokens: true, outputTokens: true },
    }),
  ]);

  const totalInputTokens = agg._sum.inputTokens ?? 0;
  const totalOutputTokens = agg._sum.outputTokens ?? 0;

  // Pre-seed every day in the window so the chart has no gaps.
  const buckets = new Map<string, { inputTokens: number; outputTokens: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setUTCDate(since.getUTCDate() + i);
    buckets.set(utcDayKey(d), { inputTokens: 0, outputTokens: 0 });
  }
  for (const m of recent) {
    const b = buckets.get(utcDayKey(m.createdAt));
    if (b) {
      b.inputTokens += m.inputTokens;
      b.outputTokens += m.outputTokens;
    }
  }

  const byDay: UsageDay[] = [...buckets.entries()].map(([date, v]) => ({
    date,
    inputTokens: v.inputTokens,
    outputTokens: v.outputTokens,
    tokens: v.inputTokens + v.outputTokens,
  }));

  return {
    totalRuns,
    totalInputTokens,
    totalOutputTokens,
    totalTokens: totalInputTokens + totalOutputTokens,
    costEstimateUsd: estimateCostUsd(totalInputTokens, totalOutputTokens),
    rates: { inputPerMTok: SONNET_INPUT_PER_MTOK, outputPerMTok: SONNET_OUTPUT_PER_MTOK },
    costNote:
      "Rough estimate at Claude Sonnet 5 list rates ($3 / $15 per 1M input / output tokens). Actual model and provider pricing may differ.",
    windowDays: days,
    byDay,
  };
}
