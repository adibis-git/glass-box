// Next.js instrumentation — runs once when the server boots.
// Hosts the retention sweeper: SourceVersions whose purgeAt has passed get the
// full hard-delete treatment (kernel eviction → storage objects → row), audited
// as a system action. A Source left with no versions is removed too.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const SWEEP_EVERY_MS = 6 * 60 * 60 * 1000; // 4x daily is plenty

  const sweep = async () => {
    try {
      const { prisma } = await import("@/lib/db");
      const { getStorage } = await import("@/server/storage");
      const { evictKernelsForVersions } = await import("@/server/exec/registry");
      const { audit } = await import("@/lib/audit");

      const due = await prisma.sourceVersion.findMany({
        where: { purgeAt: { lte: new Date() } },
        take: 50,
        include: { source: { select: { orgId: true } } },
      });
      if (due.length === 0) return;

      const storage = getStorage();
      await evictKernelsForVersions(due.map((v) => v.id)).catch(() => {});
      for (const v of due) {
        if (v.storageKey) await storage.delete(v.storageKey).catch(() => {});
        if (v.originalStorageKey) await storage.delete(v.originalStorageKey).catch(() => {});
        await prisma.sourceVersion.delete({ where: { id: v.id } });
        // Drop a source that has no remaining versions.
        const remaining = await prisma.sourceVersion.count({ where: { sourceId: v.sourceId } });
        if (remaining === 0) await prisma.source.delete({ where: { id: v.sourceId } }).catch(() => {});
        await audit({
          orgId: v.source.orgId,
          actorId: null, // system
          action: "dataset.retention_purge",
          targetType: "source",
          targetId: v.sourceId,
          metadata: { versionId: v.id, filename: v.originalFilename, purgeAt: v.purgeAt?.toISOString() },
        });
      }
      console.log(`[retention] purged ${due.length} version(s)`);
    } catch (err) {
      console.error("[retention] sweep failed:", err);
    }
  };

  // First sweep shortly after boot, then on the interval.
  setTimeout(sweep, 30_000).unref?.();
  setInterval(sweep, SWEEP_EVERY_MS).unref?.();
}
