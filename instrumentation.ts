// Next.js instrumentation — runs once when the server boots.
// Hosts the retention sweeper: datasets whose purgeAt has passed get the full
// hard-delete treatment (kernel eviction → storage objects → row), audited as
// a system action.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const SWEEP_EVERY_MS = 6 * 60 * 60 * 1000; // 4x daily is plenty

  const sweep = async () => {
    try {
      const { prisma } = await import("@/lib/db");
      const { getStorage } = await import("@/server/storage");
      const { evictKernelsForDataset } = await import("@/server/exec/registry");
      const { audit } = await import("@/lib/audit");

      const due = await prisma.dataset.findMany({
        where: { purgeAt: { lte: new Date() } },
        take: 50,
      });
      if (due.length === 0) return;

      const storage = getStorage();
      for (const d of due) {
        await evictKernelsForDataset(d.id).catch(() => {});
        if (d.storageKey) await storage.delete(d.storageKey).catch(() => {});
        if (d.originalStorageKey) await storage.delete(d.originalStorageKey).catch(() => {});
        await prisma.dataset.delete({ where: { id: d.id } });
        await audit({
          orgId: d.orgId,
          actorId: null, // system
          action: "dataset.retention_purge",
          targetType: "dataset",
          targetId: d.id,
          metadata: { filename: d.originalFilename, purgeAt: d.purgeAt?.toISOString() },
        });
      }
      console.log(`[retention] purged ${due.length} dataset(s)`);
    } catch (err) {
      console.error("[retention] sweep failed:", err);
    }
  };

  // First sweep shortly after boot, then on the interval.
  setTimeout(sweep, 30_000).unref?.();
  setInterval(sweep, SWEEP_EVERY_MS).unref?.();
}
