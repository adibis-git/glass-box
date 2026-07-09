import { prisma } from "@/lib/db";
import { authorize, authzErrorResponse } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { getStorage } from "@/server/storage";
import { ingestBuffer, IngestError, CSV_MAX } from "@/server/ingest";
import { computeColumnProfiles } from "@/server/ingest/profile";
import { describeDataset } from "@/lib/agent/datasetIntelligence";
import type { DatasetProfile } from "@/lib/agent/context";
import type { Prisma } from "@/lib/generated/prisma/client";

export const runtime = "nodejs";
export const maxDuration = 120;

type Params = { params: Promise<{ oid: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { oid } = await params;
  try {
    await authorize(oid, "VIEWER");
    const datasets = await prisma.dataset.findMany({
      where: { orgId: oid, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, name: true, originalFilename: true, sizeBytes: true, rowCount: true,
        status: true, sampled: true, sheetName: true, createdAt: true,
      },
    });
    return Response.json({
      datasets: datasets.map((d) => ({ ...d, sizeBytes: d.sizeBytes.toString() })),
    });
  } catch (err) {
    return authzErrorResponse(err) ?? Response.json({ error: "Failed." }, { status: 500 });
  }
}

/** Upload a CSV/Excel file (multipart form field "file"). */
export async function POST(req: Request, { params }: Params) {
  const { oid } = await params;
  try {
    const ctx = await authorize(oid, "MEMBER");

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "Attach a file in the 'file' field." }, { status: 400 });
    }
    if (file.size > CSV_MAX) {
      return Response.json({ error: `File too large (max ${CSV_MAX / 1048576} MB).` }, { status: 413 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const name = file.name.replace(/\.(csv|tsv|txt|xlsx|xls)$/i, "");

    let result;
    try {
      result = ingestBuffer(buf, file.name);
    } catch (e) {
      if (e instanceof IngestError) {
        return Response.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }

    const storage = getStorage();
    const id = crypto.randomUUID();
    const originalKey = `org/${oid}/datasets/${id}/original${file.name.slice(file.name.lastIndexOf("."))}`;
    await storage.put(originalKey, buf);

    if (result.needsSheetPick) {
      const dataset = await prisma.dataset.create({
        data: {
          orgId: oid,
          uploadedById: ctx.userId,
          name,
          originalFilename: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: BigInt(file.size),
          storageKey: "", // set after sheet pick
          originalStorageKey: originalKey,
          availableSheets: result.needsSheetPick,
          status: "NEEDS_SHEET_PICK",
        },
      });
      await audit({
        orgId: oid, actorId: ctx.userId, action: "dataset.upload",
        targetType: "dataset", targetId: dataset.id,
        metadata: { filename: file.name, sizeBytes: file.size, sheets: result.needsSheetPick }, req,
      });
      return Response.json(
        { dataset: { id: dataset.id, status: dataset.status, availableSheets: result.needsSheetPick } },
        { status: 201 },
      );
    }

    const normalizedKey = `org/${oid}/datasets/${id}/normalized.csv`;
    await storage.put(normalizedKey, result.normalizedCsv!);

    // Source intelligence (v3 §4): profile columns + a cached Claude domain read.
    // Fail-soft — a profiling error must never block the upload; profile is omitted.
    let profile: Prisma.InputJsonValue | undefined;
    try {
      const columns = computeColumnProfiles(
        result.sampleRows ?? [],
        result.columnSchema ?? [],
      );
      const domain = await describeDataset(name, columns, result.sampleRows ?? []);
      const built: DatasetProfile = { columns, ...(domain ? { domain } : {}) };
      profile = built as unknown as Prisma.InputJsonValue;
    } catch {
      profile = undefined;
    }

    const dataset = await prisma.dataset.create({
      data: {
        orgId: oid,
        uploadedById: ctx.userId,
        name,
        originalFilename: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: BigInt(file.size),
        storageKey: normalizedKey,
        originalStorageKey: originalKey,
        rowCount: result.rowCount,
        columnSchema: result.columnSchema as unknown as Prisma.InputJsonValue,
        sampleRows: result.sampleRows as unknown as Prisma.InputJsonValue,
        sampled: result.sampled ?? false,
        normalizations: result.normalizations as unknown as Prisma.InputJsonValue,
        ...(profile ? { profile } : {}),
        status: "READY",
        purgeAt: await purgeAtFor(oid),
      },
    });

    await audit({
      orgId: oid, actorId: ctx.userId, action: "dataset.upload",
      targetType: "dataset", targetId: dataset.id,
      metadata: {
        filename: file.name, sizeBytes: file.size, rows: result.rowCount,
        sampled: result.sampled, normalizations: result.normalizations?.length ?? 0,
      },
      req,
    });

    return Response.json(
      { dataset: { id: dataset.id, status: dataset.status, rowCount: dataset.rowCount } },
      { status: 201 },
    );
  } catch (err) {
    return authzErrorResponse(err) ?? Response.json({ error: "Upload failed." }, { status: 500 });
  }
}

async function purgeAtFor(orgId: string): Promise<Date | null> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { retentionDays: true },
  });
  if (!org?.retentionDays) return null;
  return new Date(Date.now() + org.retentionDays * 86_400_000);
}
