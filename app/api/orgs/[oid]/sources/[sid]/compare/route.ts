// Compare two versions of a Source (v3 §15.2). Computes a structural tabular
// diff + a fail-soft Claude prose summary, and caches the result in Comparison
// (unique per source/from/to). Fail-soft: a missing model provider still yields
// the structured diff with an empty summary.

import { prisma } from "@/lib/db";
import { authorize, authzErrorResponse } from "@/lib/authz";
import { audit } from "@/lib/audit";
import {
  computeTabularDiff,
  summarizeTabularDiff,
  type TabularDiff,
} from "@/lib/agent/versionDiff";
import type { Prisma } from "@/lib/generated/prisma/client";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ oid: string; sid: string }> };

type Column = { name: string; dtype: string };

export async function GET(req: Request, { params }: Params) {
  const { oid, sid } = await params;
  try {
    await authorize(oid, "VIEWER");

    const url = new URL(req.url);
    const from = Number(url.searchParams.get("from"));
    const to = Number(url.searchParams.get("to"));
    if (!Number.isInteger(from) || !Number.isInteger(to) || from === to) {
      return Response.json(
        { error: "Provide distinct integer 'from' and 'to' version numbers." },
        { status: 400 },
      );
    }

    const source = await prisma.source.findFirst({ where: { id: sid, orgId: oid } });
    if (!source) return Response.json({ error: "Source not found." }, { status: 404 });

    // Serve a cached comparison if present.
    const cached = await prisma.comparison.findUnique({
      where: { sourceId_fromVersion_toVersion: { sourceId: sid, fromVersion: from, toVersion: to } },
    });
    if (cached) {
      return Response.json({ comparison: cached.summary, cached: true });
    }

    const [fromV, toV] = await Promise.all([
      prisma.sourceVersion.findFirst({ where: { sourceId: sid, version: from, deletedAt: null } }),
      prisma.sourceVersion.findFirst({ where: { sourceId: sid, version: to, deletedAt: null } }),
    ]);
    if (!fromV || !toV) {
      return Response.json({ error: "One or both versions were not found." }, { status: 404 });
    }

    const structural = computeTabularDiff(
      {
        version: fromV.version,
        rowCount: fromV.rowCount,
        columnSchema: (fromV.columnSchema as Column[] | null) ?? [],
      },
      {
        version: toV.version,
        rowCount: toV.rowCount,
        columnSchema: (toV.columnSchema as Column[] | null) ?? [],
      },
    );
    const summary = await summarizeTabularDiff(source.name, structural);
    const result: TabularDiff = { ...structural, summary };

    // Cache (best-effort; a race just re-serves the winner).
    await prisma.comparison
      .create({
        data: {
          sourceId: sid,
          fromVersion: from,
          toVersion: to,
          summary: result as unknown as Prisma.InputJsonValue,
        },
      })
      .catch(() => {});

    await audit({
      orgId: oid, actorId: null, action: "source.compare",
      targetType: "source", targetId: sid,
      metadata: { from, to },
    });

    return Response.json({ comparison: result, cached: false });
  } catch (err) {
    return authzErrorResponse(err) ?? Response.json({ error: "Compare failed." }, { status: 500 });
  }
}
