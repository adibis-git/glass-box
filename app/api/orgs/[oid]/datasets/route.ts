// Datasets API — external path kept for frontend churn reasons, but each
// "dataset" is now a Source (kind=TABULAR) with a latest SourceVersion (v3 §2).
// The `id` in these responses is the Source id; conversations pin its versions.

import { prisma } from "@/lib/db";
import { authorize, authzErrorResponse } from "@/lib/authz";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";
import { IngestError, CSV_MAX } from "@/server/ingest";
import { buildVersionData, purgeAtFor } from "@/server/ingest/version";

export const runtime = "nodejs";
export const maxDuration = 120;

type Params = { params: Promise<{ oid: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { oid } = await params;
  try {
    await authorize(oid, "VIEWER");
    // A "dataset" row = a Source with at least one live version; show the latest.
    const sources = await prisma.source.findMany({
      where: { orgId: oid, versions: { some: { deletedAt: null } } },
      orderBy: { createdAt: "desc" },
      include: {
        versions: {
          where: { deletedAt: null },
          orderBy: { version: "desc" },
          select: {
            id: true, version: true, originalFilename: true, sizeBytes: true,
            rowCount: true, status: true, sampled: true, sheetName: true, createdAt: true,
          },
        },
      },
    });
    return Response.json({
      datasets: sources.map((s) => {
        const v = s.versions[0];
        return {
          id: s.id,
          name: s.name,
          version: v.version,
          versionCount: s.versions.length,
          originalFilename: v.originalFilename,
          sizeBytes: v.sizeBytes.toString(),
          rowCount: v.rowCount,
          status: v.status,
          sampled: v.sampled,
          sheetName: v.sheetName,
          createdAt: s.createdAt,
        };
      }),
    });
  } catch (err) {
    return authzErrorResponse(err) ?? Response.json({ error: "Failed." }, { status: 500 });
  }
}

/** Upload a CSV/Excel file (multipart form field "file") → Source + version 1. */
export async function POST(req: Request, { params }: Params) {
  const { oid } = await params;
  try {
    const ctx = await authorize(oid, "MEMBER");

    // Per-org rate limit (v3 §17): cap upload bursts per workspace.
    const rl = checkRateLimit(oid, "datasets", 30);
    if (!rl.ok) {
      return rateLimitResponse(rl, "Rate limit exceeded: too many uploads this minute for this workspace. Please slow down.");
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "Attach a file in the 'file' field." }, { status: 400 });
    }
    if (file.size > CSV_MAX) {
      return Response.json({ error: `File too large (max ${CSV_MAX / 1048576} MB).` }, { status: 413 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const name = file.name.replace(/\.(csv|tsv|txt|xlsx|xls|pdf|docx|doc|md)$/i, "");

    let built;
    try {
      built = await buildVersionData(
        oid,
        {
          buf,
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          uploadedById: ctx.userId,
          sourceName: name,
        },
        { purgeAt: await purgeAtFor(oid) },
      );
    } catch (e) {
      if (e instanceof IngestError) return Response.json({ error: e.message }, { status: e.status });
      throw e;
    }

    const source = await prisma.source.create({
      data: {
        orgId: oid,
        kind: built.kind,
        name,
        versions: { create: { version: 1, ...built.data } },
      },
      include: { versions: true },
    });
    const v1 = source.versions[0];

    await audit({
      orgId: oid, actorId: ctx.userId, action: "dataset.upload",
      targetType: "source", targetId: source.id,
      metadata: {
        versionId: v1.id, version: 1, filename: file.name, sizeBytes: file.size,
        rows: v1.rowCount, sampled: v1.sampled,
        ...(v1.status === "NEEDS_SHEET_PICK"
          ? { sheets: v1.availableSheets }
          : { normalizations: (v1.normalizations as unknown[] | null)?.length ?? 0 }),
      },
      req,
    });

    return Response.json(
      {
        dataset: {
          id: source.id,
          status: v1.status,
          rowCount: v1.rowCount,
          ...(v1.status === "NEEDS_SHEET_PICK" ? { availableSheets: v1.availableSheets } : {}),
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return authzErrorResponse(err) ?? Response.json({ error: "Upload failed." }, { status: 500 });
  }
}
