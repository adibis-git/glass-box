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
    const d = await prisma.dataset.findFirst({ where: { id, orgId: oid, deletedAt: null } });
    if (!d) return Response.json({ error: "Dataset not found." }, { status: 404 });
    return Response.json({
      dataset: { ...d, sizeBytes: d.sizeBytes.toString() },
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

    const d = await prisma.dataset.findFirst({ where: { id, orgId: oid } });
    if (!d) return Response.json({ error: "Dataset not found." }, { status: 404 });

    if (!hard) {
      await prisma.dataset.update({ where: { id }, data: { deletedAt: new Date() } });
      await audit({
        orgId: oid, actorId: ctx.userId, action: "dataset.soft_delete",
        targetType: "dataset", targetId: id, metadata: { filename: d.originalFilename }, req,
      });
      return Response.json({ ok: true, mode: "soft" });
    }

    // Hard delete: evict any kernel holding this dataset, remove storage
    // objects, then the row (cascades conversation links).
    const { evictKernelsForDataset } = await import("@/server/exec/registry");
    await evictKernelsForDataset(id).catch(() => {});

    const storage = getStorage();
    if (d.storageKey) await storage.delete(d.storageKey).catch(() => {});
    if (d.originalStorageKey) await storage.delete(d.originalStorageKey).catch(() => {});
    await prisma.dataset.delete({ where: { id } });

    await audit({
      orgId: oid, actorId: ctx.userId, action: "dataset.hard_delete",
      targetType: "dataset", targetId: id,
      metadata: { filename: d.originalFilename, storageKeysDeleted: [d.storageKey, d.originalStorageKey].filter(Boolean) },
      req,
    });
    return Response.json({ ok: true, mode: "hard" });
  } catch (err) {
    return authzErrorResponse(err) ?? Response.json({ error: "Failed." }, { status: 500 });
  }
}
