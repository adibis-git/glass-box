import { prisma } from "@/lib/db";
import { authorize, authzErrorResponse } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { getStorage } from "@/server/storage";
import { ingestBuffer, IngestError } from "@/server/ingest";
import { computeColumnProfiles } from "@/server/ingest/profile";
import { describeDataset } from "@/lib/agent/datasetIntelligence";
import type { DatasetProfile } from "@/lib/agent/context";
import type { Prisma } from "@/lib/generated/prisma/client";

export const runtime = "nodejs";
export const maxDuration = 120;

type Params = { params: Promise<{ oid: string; id: string }> };

/** Finish ingestion of a multi-sheet Excel upload by choosing a sheet. */
export async function POST(req: Request, { params }: Params) {
  const { oid, id } = await params;
  try {
    const ctx = await authorize(oid, "MEMBER");
    const body = (await req.json().catch(() => ({}))) as { sheetName?: string };
    const sheetName = String(body.sheetName ?? "").trim();
    if (!sheetName) return Response.json({ error: "sheetName is required." }, { status: 400 });

    // `id` is the Source id; resolve its latest live version awaiting a sheet.
    const source = await prisma.source.findFirst({
      where: { id, orgId: oid },
      include: {
        versions: { where: { deletedAt: null }, orderBy: { version: "desc" }, take: 1 },
      },
    });
    const d = source?.versions[0];
    if (!source || !d) return Response.json({ error: "Dataset not found." }, { status: 404 });
    if (d.status !== "NEEDS_SHEET_PICK" || !d.originalStorageKey) {
      return Response.json({ error: "This dataset doesn't need a sheet pick." }, { status: 409 });
    }

    const storage = getStorage();
    const stream = await storage.getStream(d.originalStorageKey);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const buf = Buffer.concat(chunks);

    let result;
    try {
      result = ingestBuffer(buf, d.originalFilename, sheetName);
    } catch (e) {
      if (e instanceof IngestError) return Response.json({ error: e.message }, { status: e.status });
      throw e;
    }

    const normalizedKey = `org/${oid}/datasets/${d.id}/normalized.csv`;
    await storage.put(normalizedKey, result.normalizedCsv!);

    // Source intelligence (v3 §4) — profile the columns + cache a domain read.
    // Fail-soft: a profiling failure must never block the sheet-pick finalization.
    let profile: DatasetProfile | undefined;
    try {
      if (result.sampleRows && result.columnSchema) {
        const columns = computeColumnProfiles(result.sampleRows, result.columnSchema);
        const domain = await describeDataset(source.name, columns, result.sampleRows);
        profile = { columns, ...(domain ? { domain } : {}) };
      }
    } catch {
      profile = undefined;
    }

    const updated = await prisma.sourceVersion.update({
      where: { id: d.id },
      data: {
        storageKey: normalizedKey,
        sheetName,
        rowCount: result.rowCount,
        columnSchema: result.columnSchema as unknown as Prisma.InputJsonValue,
        sampleRows: result.sampleRows as unknown as Prisma.InputJsonValue,
        normalizations: result.normalizations as unknown as Prisma.InputJsonValue,
        ...(profile ? { profile: profile as unknown as Prisma.InputJsonValue } : {}),
        status: "READY",
        errorMessage: null,
      },
    });

    await audit({
      orgId: oid, actorId: ctx.userId, action: "dataset.sheet_pick",
      targetType: "source", targetId: source.id,
      metadata: { versionId: d.id, sheetName, rows: result.rowCount }, req,
    });

    return Response.json({ dataset: { id: source.id, status: updated.status, rowCount: updated.rowCount } });
  } catch (err) {
    return authzErrorResponse(err) ?? Response.json({ error: "Failed." }, { status: 500 });
  }
}
