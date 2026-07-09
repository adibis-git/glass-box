// KernelHandle — owns one Pyodide worker_thread. Enforces the 15s timeout via
// worker.terminate() (wasm heaps only shrink by thread death), single-flight
// execution, and 4000-char output truncation. The guardrail runs before any
// code reaches the worker.

import * as workerThreads from "node:worker_threads";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { guardCode } from "@/lib/pyodide/guard";
import type { ExecResult } from "@/lib/types";

type Worker = workerThreads.Worker;

// IMPORTANT: never write a literal `new Worker(...)` in this file. Turbopack
// pattern-matches that syntax and tries to bundle the worker script — which
// breaks Pyodide's internal dynamic loading with "Cannot find module as
// expression is too dynamic". The kernel worker is a plain .mjs on disk that
// must be loaded by raw Node, so we spawn it through an aliased constructor
// the bundler doesn't recognize.
const spawnRawNodeWorker: (path: string) => Worker = (path) => {
  const Ctor = workerThreads.Worker;
  return new Ctor(path, {
    // Don't inherit the parent's exec flags (Next dev runs with
    // --enable-source-maps, which corrupts pyodide's stack-based path
    // detection) or NODE_OPTIONS. The worker also gets an explicit indexURL,
    // so this is belt-and-braces.
    execArgv: [],
    env: { ...process.env, NODE_OPTIONS: "" },
  });
};

const EXEC_TIMEOUT_MS = 15_000;
const BOOT_TIMEOUT_MS = 120_000; // first boot may download wheels to the cache
const MAX_OUTPUT = 4_000;

const WORKER_PATH = join(process.cwd(), "server", "exec", "kernel-worker.mjs");
const CACHE_DIR = join(process.cwd(), ".pyodide-cache");

function truncate(s: string): string {
  if (s.length <= MAX_OUTPUT) return s;
  const head = s.slice(0, 2_000);
  const tail = s.slice(-2_000);
  return `${head}\n\n...[truncated ${s.length - MAX_OUTPUT} chars]...\n\n${tail}`;
}

interface WorkerMsg {
  type: string;
  id?: string;
  alias?: string;
  rows?: number;
  cols?: number;
  output?: string;
  isError?: boolean;
  message?: string;
  ms?: number;
}

export class KernelDeadError extends Error {}

export class KernelHandle {
  private worker: Worker;
  private readyPromise: Promise<void>;
  private dead = false;
  private queue: Promise<unknown> = Promise.resolve();
  /** dataframe alias → SourceVersion id currently loaded (registry uses this for eviction/reload). */
  loaded = new Map<string, string>();
  lastUsedAt = Date.now();

  constructor() {
    mkdirSync(CACHE_DIR, { recursive: true });
    this.worker = spawnRawNodeWorker(WORKER_PATH);
    this.readyPromise = new Promise<void>((resolve, reject) => {
      const bootTimer = setTimeout(() => {
        this.kill();
        reject(new KernelDeadError("Python runtime failed to start in time."));
      }, BOOT_TIMEOUT_MS);
      const onMsg = (msg: WorkerMsg) => {
        if (msg.type === "ready") {
          clearTimeout(bootTimer);
          this.worker.off("message", onMsg);
          resolve();
        } else if (msg.type === "init_error") {
          clearTimeout(bootTimer);
          this.worker.off("message", onMsg);
          this.kill();
          reject(new KernelDeadError(`Python runtime failed to start: ${msg.message}`));
        }
      };
      this.worker.on("message", onMsg);
      this.worker.once("error", (e) => {
        clearTimeout(bootTimer);
        this.kill();
        reject(new KernelDeadError(`Kernel crashed: ${e.message}`));
      });
    });
    this.worker.postMessage({ type: "init", packageCacheDir: CACHE_DIR });
  }

  get isDead(): boolean {
    return this.dead;
  }

  ready(): Promise<void> {
    return this.readyPromise;
  }

  /** Serialize all operations on this kernel (single-flight). */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => {});
    return next;
  }

  loadDataframe(alias: string, csv: string, versionId: string): Promise<void> {
    return this.enqueue(async () => {
      if (this.dead) throw new KernelDeadError("Kernel is dead.");
      await this.readyPromise;
      await new Promise<void>((resolve, reject) => {
        const onMsg = (msg: WorkerMsg) => {
          if (msg.type === "df_loaded" && msg.alias === alias) {
            this.worker.off("message", onMsg);
            resolve();
          } else if (msg.type === "df_error" && msg.alias === alias) {
            this.worker.off("message", onMsg);
            reject(new Error(msg.message));
          }
        };
        this.worker.on("message", onMsg);
        this.worker.postMessage({ type: "load_df", alias, csv });
      });
      this.loaded.set(alias, versionId);
      this.lastUsedAt = Date.now();
    });
  }

  run(code: string): Promise<ExecResult> {
    const guard = guardCode(code);
    if (!guard.allowed) {
      return Promise.resolve({ output: guard.message!, isError: true, blocked: true });
    }
    return this.enqueue(async () => {
      if (this.dead) throw new KernelDeadError("Kernel is dead.");
      await this.readyPromise;
      this.lastUsedAt = Date.now();
      const id = `r${Math.random().toString(36).slice(2, 10)}`;

      return new Promise<ExecResult>((resolve) => {
        const timer = setTimeout(() => {
          this.worker.off("message", onMsg);
          this.kill(); // only way to stop a runaway wasm loop
          resolve({
            output:
              "Execution timed out after 15 seconds and the Python runtime was restarted. " +
              "Simplify the approach — avoid unbounded loops, sample the data, or use " +
              "vectorized pandas/numpy operations.",
            isError: true,
            timedOut: true,
          });
        }, EXEC_TIMEOUT_MS);

        const onMsg = (msg: WorkerMsg) => {
          if (msg.type === "result" && msg.id === id) {
            clearTimeout(timer);
            this.worker.off("message", onMsg);
            resolve({ output: truncate(msg.output ?? ""), isError: !!msg.isError });
          }
        };
        this.worker.on("message", onMsg);
        this.worker.postMessage({ type: "run", id, code });
      });
    });
  }

  kill(): void {
    if (this.dead) return;
    this.dead = true;
    this.loaded.clear();
    this.worker.terminate().catch(() => {});
  }
}
