// A "dataset" is a Source; `id` is the Source id (v3 §2). GET returns the source
// merged with its latest live version; DELETE soft/hard-deletes the whole source.

import { prisma } from "@/lib/db";
import { authorize, authzErrorResponse } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { getStorage } from "@/server/storage";

export const runtime = "nodejs";

type Params = { params: Promise<{ oid: string; id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { oid, id } = await params;
  try {
    await authorize(oid, "VIEWER");
    const source = await prisma.source.findFirst({
      where: { id, orgId: oid },
      include: {
        versions: { where: { deletedAt: null }, orderBy: { version: "desc" } },
      },
    });
    const v = source?.versions[0];
    if (!source || !v) return Response.json({ error: "Dataset not found." }, { status: 404 });
    return Response.json({
      dataset: {
        ...v,
        id: source.id,
        name: source.name,
        kind: source.kind,
        version: v.version,
        versionCount: source.versions.length,
        sizeBytes: v.sizeBytes.toString(),
      },
    });
  } catch (err) {
    return authzErrorResponse(err) ?? Response.json({ error: "Failed." }, { status: 500 });
  }
}

/** Soft delete by default; ?hard=true for full GDPR purge (rows + stored files). */
export async function DELETE(req: Request, { params }: Params) {
  const { oid, id } = await params;
  try {
    const ctx = await authorize(oid, "ADMIN");
    const hard = new URL(req.url).searchParams.get("hard") === "true";

    const source = await prisma.source.findFirst({
      where: { id, orgId: oid },
      include: { versions: true },
    });
    if (!source) return Response.json({ error: "Dataset not found." }, { status: 404 });

    if (!hard) {
      // Soft delete = tombstone every version so the source drops from listings.
      await prisma.sourceVersion.updateMany({
        where: { sourceId: id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      await audit({
        orgId: oid, actorId: ctx.userId, action: "dataset.soft_delete",
        targetType: "source", targetId: id, metadata: { name: source.name }, req,
      });
      return Response.json({ ok: true, mode: "soft" });
    }

    // Hard delete: evict any kernel holding a version, remove all storage
    // objects, then the Source row (cascades versions + conversation links).
    const { evictKernelsForVersions } = await import("@/server/exec/registry");
    await evictKernelsForVersions(source.versions.map((v) => v.id)).catch(() => {});

    const storage = getStorage();
    for (const v of source.versions) {
      if (v.storageKey) await storage.delete(v.storageKey).catch(() => {});
      if (v.originalStorageKey) await storage.delete(v.originalStorageKey).catch(() => {});
    }
    await prisma.source.delete({ where: { id } });

    await audit({
      orgId: oid, actorId: ctx.userId, action: "dataset.hard_delete",
      targetType: "source", targetId: id,
      metadata: { name: source.name, versions: source.versions.length },
      req,
    });
    return Response.json({ ok: true, mode: "hard" });
  } catch (err) {
    return authzErrorResponse(err) ?? Response.json({ error: "Failed." }, { status: 500 });
  }
}
