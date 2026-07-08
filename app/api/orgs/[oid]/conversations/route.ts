import { prisma } from "@/lib/db";
import { authorize, authzErrorResponse } from "@/lib/authz";
import { audit } from "@/lib/audit";

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
        datasets: { include: { dataset: { select: { id: true, name: true } } } },
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

    const datasets = await prisma.dataset.findMany({
      where: { id: { in: links.map((l) => l.datasetId) }, orgId: oid, deletedAt: null, status: "READY" },
      select: { id: true, name: true },
    });
    if (datasets.length !== links.length) {
      return Response.json(
        { error: "One or more datasets were not found or are not ready." },
        { status: 400 },
      );
    }

    const title =
      String(body.title ?? "").trim() ||
      `Analysis of ${datasets.map((d) => d.name).join(" + ")}`.slice(0, 120);

    const conversation = await prisma.conversation.create({
      data: {
        orgId: oid,
        createdById: ctx.userId,
        title,
        datasets: { create: links.map((l) => ({ datasetId: l.datasetId, alias: l.alias })) },
      },
      include: { datasets: true },
    });

    await audit({
      orgId: oid, actorId: ctx.userId, action: "conversation.create",
      targetType: "conversation", targetId: conversation.id,
      metadata: { datasets: links }, req,
    });

    return Response.json({ conversation }, { status: 201 });
  } catch (err) {
    return authzErrorResponse(err) ?? Response.json({ error: "Failed." }, { status: 500 });
  }
}
