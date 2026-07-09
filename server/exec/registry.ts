// KernelRegistry — conversationId → KernelHandle, with LRU cap + idle TTL.
// Kernels are recreated transparently (dataframes reloaded from storage) after
// a timeout kill, eviction, or process restart.
//
// globalThis singleton so Next.js dev HMR doesn't leak worker threads.

import { KernelHandle } from "./kernel";
import { getStorage } from "@/server/storage";
import type { ExecResult } from "@/lib/types";

const MAX_KERNELS = Number(process.env.MAX_KERNELS ?? 4);
const IDLE_TTL_MS = 15 * 60_000;
const SWEEP_EVERY_MS = 60_000;

export interface DatasetRef {
  /** The pinned SourceVersion id — kernel identity for load/reload/eviction. */
  versionId: string;
  alias: string;
  storageKey: string;
}

class KernelRegistry {
  private kernels = new Map<string, KernelHandle>(); // conversationId → kernel

  constructor() {
    const t = setInterval(() => this.sweep(), SWEEP_EVERY_MS);
    // Don't hold the process open for the sweeper.
    if (typeof t.unref === "function") t.unref();
  }

  private sweep() {
    const now = Date.now();
    for (const [cid, k] of this.kernels) {
      if (k.isDead || now - k.lastUsedAt > IDLE_TTL_MS) {
        k.kill();
        this.kernels.delete(cid);
      }
    }
  }

  private evictLruIfNeeded() {
    const alive = [...this.kernels.entries()].filter(([, k]) => !k.isDead);
    if (alive.length < MAX_KERNELS) return;
    alive.sort((a, b) => a[1].lastUsedAt - b[1].lastUsedAt);
    const toEvict = alive.slice(0, alive.length - MAX_KERNELS + 1);
    for (const [cid, k] of toEvict) {
      k.kill();
      this.kernels.delete(cid);
    }
  }

  /** Ensure a live kernel for the conversation with all datasets loaded. */
  private async ensure(conversationId: string, datasets: DatasetRef[]): Promise<{
    kernel: KernelHandle;
    rebuilt: boolean;
  }> {
    let kernel = this.kernels.get(conversationId);
    let rebuilt = false;

    if (!kernel || kernel.isDead) {
      this.evictLruIfNeeded();
      kernel = new KernelHandle();
      this.kernels.set(conversationId, kernel);
      rebuilt = true;
      await kernel.ready();
    }

    const storage = getStorage();
    for (const d of datasets) {
      // (Re)load when the alias isn't loaded yet, or the conversation adopted a
      // different SourceVersion for this alias (v3 §15.1) — reload the dataframe.
      if (kernel.loaded.get(d.alias) !== d.versionId) {
        const csv = await storage.getText(d.storageKey);
        await kernel.loadDataframe(d.alias, csv, d.versionId);
      }
    }
    return { kernel, rebuilt };
  }

  /**
   * Execute code for a conversation. Returns the result plus whether the kernel
   * had to be rebuilt (so the agent can be told earlier in-memory state is gone).
   */
  async run(
    conversationId: string,
    datasets: DatasetRef[],
    code: string,
  ): Promise<ExecResult & { kernelRebuilt?: boolean }> {
    try {
      const { kernel, rebuilt } = await this.ensure(conversationId, datasets);
      const res = await kernel.run(code);
      // A timeout killed the kernel — drop it so the next run rebuilds.
      if (res.timedOut) this.kernels.delete(conversationId);
      return { ...res, kernelRebuilt: rebuilt };
    } catch (err) {
      // Kernel died mid-flight (crash) — clear and surface a retryable error.
      this.kernels.delete(conversationId);
      return {
        output: `Python runtime error: ${err instanceof Error ? err.message : String(err)}. The runtime was restarted — retry the step.`,
        isError: true,
      };
    }
  }

  /** Boot the runtime + load dataframes ahead of the first question. */
  async warm(conversationId: string, datasets: DatasetRef[]): Promise<void> {
    await this.ensure(conversationId, datasets);
  }

  releaseConversation(conversationId: string): void {
    const k = this.kernels.get(conversationId);
    if (k) k.kill();
    this.kernels.delete(conversationId);
  }

  /** Evict any kernel holding one of the given SourceVersion ids. */
  async evictForVersions(versionIds: string[]): Promise<void> {
    const set = new Set(versionIds);
    for (const [cid, k] of this.kernels) {
      if ([...k.loaded.values()].some((id) => set.has(id))) {
        k.kill();
        this.kernels.delete(cid);
      }
    }
  }
}

const g = globalThis as unknown as { __gbKernelRegistry?: KernelRegistry };
export function getKernelRegistry(): KernelRegistry {
  if (!g.__gbKernelRegistry) g.__gbKernelRegistry = new KernelRegistry();
  return g.__gbKernelRegistry;
}

export async function evictKernelsForVersions(versionIds: string[]): Promise<void> {
  await getKernelRegistry().evictForVersions(versionIds);
}
