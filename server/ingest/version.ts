// Shared "ingest a file into a SourceVersion" pipeline (v3 §2/§14/§15).
//
// Used by both the first upload (datasets POST → Source + version 1) and the
// "upload a new version" route (sources/[sid]/versions → version n+1). Detects
// the modality (tabular CSV/Excel vs. document PDF/DOCX/TXT), runs the matching
// ingest → store → profile steps, and returns the SourceVersion create-data
// (minus `version`/`sourceId`, which the caller supplies) plus the detected
// SourceKind so the caller can create the Source with the right kind.
//
// Tabular ingest throws IngestError on a bad file (caller maps to an HTTP
// status). Document extraction is FAIL-SOFT: a broken/scanned file yields a
// READY-less ERROR version with a message rather than throwing — never a 500.
// Profiling (both kinds) is fail-soft: a domain-read error omits the profile.

import { getStorage } from "@/server/storage";
import { ingestBuffer } from "@/server/ingest";
import { computeColumnProfiles } from "@/server/ingest/profile";
import {
  detectDocumentKind,
  extractDocument,
  DocumentIngestError,
} from "@/server/ingest/document";
import { describeDataset } from "@/lib/agent/datasetIntelligence";
import { describeDocument, fallbackDocProfile } from "@/lib/agent/documentIntelligence";
import type { DatasetProfile } from "@/lib/agent/context";
import type { Prisma, SourceKind } from "@/lib/generated/prisma/client";

export type VersionData = Omit<Prisma.SourceVersionCreateWithoutSourceInput, "version">;

export interface BuiltVersion {
  kind: SourceKind;
  data: VersionData;
}

export interface VersionFileInput {
  buf: Buffer;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedById: string | null;
  /** Source name — feeds the Claude domain read. */
  sourceName: string;
}

/** Ingest + store + profile a file, returning SourceVersion create-data + kind. */
export async function buildVersionData(
  oid: string,
  input: VersionFileInput,
  opts: { purgeAt: Date | null },
): Promise<BuiltVersion> {
  // Modality routing: documents are detected by extension/magic BEFORE the
  // tabular path (which otherwise treats .txt as CSV).
  const docKind = detectDocumentKind(input.buf, input.filename);
  if (docKind) {
    return buildDocumentVersion(oid, input, opts);
  }
  return buildTabularVersion(oid, input, opts);
}

const storageId = () => crypto.randomUUID();
const extOf = (filename: string) => filename.slice(filename.lastIndexOf("."));

async function buildTabularVersion(
  oid: string,
  input: VersionFileInput,
  opts: { purgeAt: Date | null },
): Promise<BuiltVersion> {
  // Ingest first so a bad file never leaves an orphaned storage object.
  const result = ingestBuffer(input.buf, input.filename);

  const storage = getStorage();
  const sid = storageId();
  const originalKey = `org/${oid}/sources/${sid}/original${extOf(input.filename)}`;
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
      kind: "TABULAR",
      data: {
        ...base,
        storageKey: "", // set after sheet pick
        availableSheets: result.needsSheetPick,
        status: "NEEDS_SHEET_PICK",
      },
    };
  }

  const normalizedKey = `org/${oid}/sources/${sid}/normalized.csv`;
  await storage.put(normalizedKey, result.normalizedCsv!);

  // Source intelligence (v3 §4): profile columns + a cached Claude domain read.
  let profile: Prisma.InputJsonValue | undefined;
  try {
    const columns = computeColumnProfiles(result.sampleRows ?? [], result.columnSchema ?? []);
    const domain = await describeDataset(input.sourceName, columns, result.sampleRows ?? []);
    const built: DatasetProfile = { columns, ...(domain ? { domain } : {}) };
    profile = built as unknown as Prisma.InputJsonValue;
  } catch {
    profile = undefined;
  }

  return {
    kind: "TABULAR",
    data: {
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
    },
  };
}

async function buildDocumentVersion(
  oid: string,
  input: VersionFileInput,
  opts: { purgeAt: Date | null },
): Promise<BuiltVersion> {
  const storage = getStorage();
  const sid = storageId();
  const originalKey = `org/${oid}/sources/${sid}/original${extOf(input.filename)}`;
  await storage.put(originalKey, input.buf); // keep the raw upload regardless

  const base = {
    uploadedById: input.uploadedById,
    originalFilename: input.filename,
    mimeType: input.mimeType || "application/octet-stream",
    sizeBytes: BigInt(input.sizeBytes),
    originalStorageKey: originalKey,
  };

  try {
    const extract = await extractDocument(input.buf, input.filename);

    const textKey = `org/${oid}/sources/${sid}/extracted.txt`;
    await storage.put(textKey, extract.text);

    // Document domain read (v3 §14.4), fail-soft → deterministic fallback.
    const profile =
      (await describeDocument(
        input.sourceName,
        extract.text,
        extract.sections,
        extract.pageCount,
        extract.wordCount,
      ).catch(() => null)) ??
      fallbackDocProfile(extract.sections, extract.pageCount, extract.wordCount);

    return {
      kind: "DOCUMENT",
      data: {
        ...base,
        storageKey: textKey, // canonical artifact = the extracted text
        extractedTextKey: textKey,
        profile: profile as unknown as Prisma.InputJsonValue,
        status: "READY",
        purgeAt: opts.purgeAt,
      },
    };
  } catch (e) {
    // Fail-soft: never 500 on a bad document — record an ERROR version so the UI
    // can surface the reason and the user can re-upload.
    const message =
      e instanceof DocumentIngestError ? e.message : "Failed to extract text from this document.";
    return {
      kind: "DOCUMENT",
      data: {
        ...base,
        storageKey: originalKey, // no extracted text; point at the raw upload
        status: "ERROR",
        errorMessage: message,
        purgeAt: opts.purgeAt,
      },
    };
  }
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
