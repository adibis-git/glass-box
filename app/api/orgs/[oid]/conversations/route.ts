import { prisma } from "@/lib/db";
import { authorize, authzErrorResponse } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { generateStarterQuestions } from "@/lib/agent/suggestions";
import {
  buildContextPack,
  type ColumnProfile,
  type DatasetContext,
  type DatasetDomain,
} from "@/lib/agent/context";

export const runtime = "nodejs";

type Params = { params: Promise<{ oid: string }> };

const ALIAS_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESERVED = new Set(["pd", "np", "io", "print", "df_" /* prefix guard below */]);

export async function GET(_req: Request, { params }: Params) {
  const { oid } = await params;
  try {
    await authorize(oid, "VIEWER");
    const conversations = await prisma.conversation.findMany({
      where: { orgId: oid },
      orderBy: { updatedAt: "desc" },
      include: {
        sources: { include: { source: { select: { id: true, name: true } } } },
        _count: { select: { messages: true } },
      },
      take: 100,
    });
    return Response.json({ conversations });
  } catch (err) {
    return authzErrorResponse(err) ?? Response.json({ error: "Failed." }, { status: 500 });
  }
}

/** Create a conversation over 1..4 datasets (aliases become Python variables). */
export async function POST(req: Request, { params }: Params) {
  const { oid } = await params;
  try {
    const ctx = await authorize(oid, "MEMBER");
    const body = (await req.json().catch(() => ({}))) as {
      title?: string;
      datasets?: { datasetId: string; alias: string }[];
    };

    const links = body.datasets ?? [];
    if (links.length < 1 || links.length > 4) {
      return Response.json({ error: "Attach between 1 and 4 datasets." }, { status: 400 });
    }
    const aliases = new Set<string>();
    for (const l of links) {
      if (!ALIAS_RE.test(l.alias) || RESERVED.has(l.alias)) {
        return Response.json({ error: `Invalid alias "${l.alias}".` }, { status: 400 });
      }
      if (aliases.has(l.alias)) {
        return Response.json({ error: `Duplicate alias "${l.alias}".` }, { status: 400 });
      }
      aliases.add(l.alias);
    }

    // Each `datasetId` is a Source id; pin its latest live READY version (v3 §2).
    const sources = await prisma.source.findMany({
      where: { id: { in: links.map((l) => l.datasetId) }, orgId: oid },
      select: {
        id: true, name: true,
        versions: {
          where: { deletedAt: null, status: "READY" },
          orderBy: { version: "desc" },
          take: 1,
          select: { id: true, rowCount: true, sampled: true, sampleRows: true, profile: true },
        },
      },
    });
    const latestBySource = new Map(
      sources.filter((s) => s.versions.length > 0).map((s) => [s.id, { source: s, version: s.versions[0] }]),
    );
    if (latestBySource.size !== links.length) {
      return Response.json(
        { error: "One or more datasets were not found or are not ready." },
        { status: 400 },
      );
    }

    const title =
      String(body.title ?? "").trim() ||
      `Analysis of ${links.map((l) => latestBySource.get(l.datasetId)!.source.name).join(" + ")}`.slice(0, 120);

    const conversation = await prisma.conversation.create({
      data: {
        orgId: oid,
        createdById: ctx.userId,
        title,
        sources: {
          create: links.map((l) => ({
            sourceId: l.datasetId,
            versionId: latestBySource.get(l.datasetId)!.version.id,
            alias: l.alias,
          })),
        },
      },
      include: { sources: true },
    });

    await audit({
      orgId: oid, actorId: ctx.userId, action: "conversation.create",
      targetType: "conversation", targetId: conversation.id,
      metadata: { datasets: links }, req,
    });

    // Persona × data starter questions — best-effort, never blocks creation.
    try {
      const [membership, org] = await Promise.all([
        prisma.membership.findUnique({
          where: { userId_orgId: { userId: ctx.userId, orgId: oid } },
          select: { persona: true },
        }),
        prisma.organization.findUnique({
          where: { id: oid },
          select: { domain: true, vertical: true },
        }),
      ]);
      const dctx: DatasetContext[] = links.map((l) => {
        const { source: s, version: v } = latestBySource.get(l.datasetId)!;
        const raw = v.profile as { columns?: ColumnProfile[]; domain?: DatasetDomain } | null;
        return {
          alias: l.alias,
          name: s.name,
          rowCount: v.rowCount,
          sampled: v.sampled,
          columns: raw && Array.isArray(raw.columns) ? raw.columns : [],
          domain: raw?.domain,
          sampleRows: (v.sampleRows as Record<string, unknown>[]) ?? [],
        };
      });
      const pack = buildContextPack({
        persona: membership?.persona ?? null,
        org: { domain: org?.domain, vertical: org?.vertical },
        datasets: dctx,
      });
      const starterQuestions = await generateStarterQuestions(pack);
      if (starterQuestions.length) {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { starterQuestions },
        });
      }
    } catch (e) {
      console.error("[conversations] starter-question generation failed:", e);
    }

    return Response.json({ conversation }, { status: 201 });
  } catch (err) {
    return authzErrorResponse(err) ?? Response.json({ error: "Failed." }, { status: 500 });
  }
}
