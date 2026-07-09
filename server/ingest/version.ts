// Shared "ingest a file into a SourceVersion" pipeline (v3 §2/§15).
//
// Used by both the first upload (datasets POST → Source + version 1) and the
// "upload a new version" route (sources/[sid]/versions → version n+1). Runs the
// same ingest → normalize → store → profile steps and returns the SourceVersion
// create-data (minus `version`/`sourceId`, which the caller supplies).
//
// Throws IngestError on a bad file (caller maps to an HTTP status). Profiling is
// fail-soft: a domain-read error never blocks the upload — the profile is omitted.

import { getStorage } from "@/server/storage";
import { ingestBuffer } from "@/server/ingest";
import { computeColumnProfiles } from "@/server/ingest/profile";
import { describeDataset } from "@/lib/agent/datasetIntelligence";
import type { DatasetProfile } from "@/lib/agent/context";
import type { Prisma } from "@/lib/generated/prisma/client";

export type VersionData = Omit<
  Prisma.SourceVersionCreateWithoutSourceInput,
  "version"
>;

export interface VersionFileInput {
  buf: Buffer;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedById: string | null;
  /** Source name — feeds the Claude domain read. */
  sourceName: string;
}

/** Ingest + store + profile a file, returning SourceVersion create-data. */
export async function buildVersionData(
  oid: string,
  input: VersionFileInput,
  opts: { purgeAt: Date | null },
): Promise<VersionData> {
  // Ingest first so a bad file never leaves an orphaned storage object.
  const result = ingestBuffer(input.buf, input.filename);

  const storage = getStorage();
  const storageId = crypto.randomUUID();
  const ext = input.filename.slice(input.filename.lastIndexOf("."));
  const originalKey = `org/${oid}/sources/${storageId}/original${ext}`;
  await storage.put(originalKey, input.buf);

  const base = {
    uploadedById: input.uploadedById,
    originalFilename: input.filename,
    mimeType: input.mimeType || "application/octet-stream",
    sizeBytes: BigInt(input.sizeBytes),
    originalStorageKey: originalKey,
  };

  // Multi-sheet Excel: defer until the user picks a sheet (finished by the
  // datasets/[id]/sheet route, which resolves the source's pending version).
  if (result.needsSheetPick) {
    return {
      ...base,
      storageKey: "", // set after sheet pick
      availableSheets: result.needsSheetPick,
      status: "NEEDS_SHEET_PICK",
    };
  }

  const normalizedKey = `org/${oid}/sources/${storageId}/normalized.csv`;
  await storage.put(normalizedKey, result.normalizedCsv!);

  // Source intelligence (v3 §4): profile columns + a cached Claude domain read.
  let profile: Prisma.InputJsonValue | undefined;
  try {
    const columns = computeColumnProfiles(
      result.sampleRows ?? [],
      result.columnSchema ?? [],
    );
    const domain = await describeDataset(input.sourceName, columns, result.sampleRows ?? []);
    const built: DatasetProfile = { columns, ...(domain ? { domain } : {}) };
    profile = built as unknown as Prisma.InputJsonValue;
  } catch {
    profile = undefined;
  }

  return {
    ...base,
    storageKey: normalizedKey,
    rowCount: result.rowCount,
    columnSchema: result.columnSchema as unknown as Prisma.InputJsonValue,
    sampleRows: result.sampleRows as unknown as Prisma.InputJsonValue,
    sampled: result.sampled ?? false,
    normalizations: result.normalizations as unknown as Prisma.InputJsonValue,
    ...(profile ? { profile } : {}),
    status: "READY",
    purgeAt: opts.purgeAt,
  };
}

/** purgeAt for a new version, honoring the org's retention window. */
export async function purgeAtFor(orgId: string): Promise<Date | null> {
  const { prisma } = await import("@/lib/db");
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { retentionDays: true },
  });
  if (!org?.retentionDays) return null;
  return new Date(Date.now() + org.retentionDays * 86_400_000);
}
