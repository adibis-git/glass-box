// Upload a NEW version of an existing Source (v3 §15.1). Runs the same
// ingest + profile pipeline as the first upload, appending SourceVersion(n+1).
// A conversation attached to this source can then adopt the new version via
// PATCH /conversations/[id] (updates the pinned ConversationSource.versionId).

import { prisma } from "@/lib/db";
import { authorize, authzErrorResponse } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { IngestError, CSV_MAX } from "@/server/ingest";
import { buildVersionData, purgeAtFor } from "@/server/ingest/version";

export const runtime = "nodejs";
export const maxDuration = 120;

type Params = { params: Promise<{ oid: string; sid: string }> };

export async function POST(req: Request, { params }: Params) {
  const { oid, sid } = await params;
  try {
    const ctx = await authorize(oid, "MEMBER");

    const source = await prisma.source.findFirst({
      where: { id: sid, orgId: oid },
      select: {
        kind: true,
        name: true,
        versions: { orderBy: { version: "desc" }, take: 1, select: { version: true } },
      },
    });
    if (!source) return Response.json({ error: "Source not found." }, { status: 404 });

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "Attach a file in the 'file' field." }, { status: 400 });
    }
    if (file.size > CSV_MAX) {
      return Response.json({ error: `File too large (max ${CSV_MAX / 1048576} MB).` }, { status: 413 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const nextVersion = (source.versions[0]?.version ?? 0) + 1;

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
          sourceName: source.name,
        },
        { purgeAt: await purgeAtFor(oid) },
      );
    } catch (e) {
      if (e instanceof IngestError) return Response.json({ error: e.message }, { status: e.status });
      throw e;
    }

    // A version must match its source's modality (don't mix tabular + document).
    if (built.kind !== source.kind) {
      return Response.json(
        {
          error: `This source holds ${source.kind.toLowerCase()} files — upload a matching ${
            source.kind === "DOCUMENT" ? "PDF/DOCX/TXT" : "CSV/Excel"
          } file.`,
        },
        { status: 400 },
      );
    }

    const version = await prisma.sourceVersion.create({
      data: { sourceId: sid, version: nextVersion, ...built.data },
    });

    await audit({
      orgId: oid, actorId: ctx.userId, action: "source.version_upload",
      targetType: "source", targetId: sid,
      metadata: {
        versionId: version.id, version: nextVersion, filename: file.name,
        sizeBytes: file.size, rows: version.rowCount, status: version.status,
      },
      req,
    });

    return Response.json(
      {
        version: {
          id: version.id,
          version: version.version,
          status: version.status,
          rowCount: version.rowCount,
          ...(version.status === "NEEDS_SHEET_PICK" ? { availableSheets: version.availableSheets } : {}),
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return authzErrorResponse(err) ?? Response.json({ error: "Upload failed." }, { status: 500 });
  }
}
