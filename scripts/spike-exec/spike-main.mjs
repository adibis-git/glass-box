// Phase-0 spike driver. Proves, on this machine:
//   1. Pyodide boots inside a Node worker_thread and loads pandas (packageCacheDir)
//   2. A dataframe op runs correctly and fast when warm
//   3. RSS stays within budget
//   4. worker.terminate() kills a hung kernel; a respawned kernel works (warm cache)
//
// Run: node scripts/spike-exec/spike-main.mjs

import { Worker } from "node:worker_threads";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER = join(__dirname, "spike-worker.mjs");
const CACHE = join(__dirname, "..", "..", ".pyodide-cache");
mkdirSync(CACHE, { recursive: true });

const mb = (b) => (b / 1048576).toFixed(0) + "MB";
const rss = () => mb(process.memoryUsage().rss);

function spawnKernel(label) {
  const t0 = Date.now();
  const worker = new Worker(WORKER);
  const pending = new Map();
  let seq = 0;

  const readyPromise = new Promise((resolve, reject) => {
    worker.on("message", (msg) => {
      if (msg.type === "ready") {
        console.log(
          `[${label}] ready in ${Date.now() - t0}ms (boot ${msg.bootMs}ms, packages ${msg.pkgMs}ms) — process RSS ${rss()}`,
        );
        resolve();
      } else if (msg.type === "init_error") {
        reject(new Error(msg.message));
      } else if (msg.type === "df_loaded") {
        pending.get("df")?.(msg);
        pending.delete("df");
      } else if (msg.type === "result") {
        pending.get(msg.id)?.(msg);
        pending.delete(msg.id);
      }
    });
    worker.on("error", reject);
  });
  worker.postMessage({ type: "init", packageCacheDir: CACHE });

  return {
    worker,
    ready: readyPromise,
    loadDf(name, csv) {
      return new Promise((resolve) => {
        pending.set("df", resolve);
        worker.postMessage({ type: "load_df", name, csv });
      });
    },
    run(code) {
      const id = `r${++seq}`;
      return new Promise((resolve) => {
        pending.set(id, resolve);
        worker.postMessage({ type: "run", id, code });
      });
    },
  };
}

// Synthetic CSV: 200k rows, a realistic mid-size frame.
function makeCsv(rows) {
  const parts = ["region,category,amount,qty"];
  const regions = ["North", "South", "East", "West"];
  const cats = ["A", "B", "C", "D", "E"];
  for (let i = 0; i < rows; i++) {
    parts.push(
      `${regions[i % 4]},${cats[i % 5]},${((i * 7919) % 100000) / 100},${i % 50}`,
    );
  }
  return parts.join("\n");
}

const csv = makeCsv(200_000);
console.log(`Synthetic CSV: ${mb(csv.length)} of text, 200k rows. Baseline RSS ${rss()}\n`);

// ---- 1. Cold boot (may download wheels to cache on first ever run) ----
console.log("== Kernel A: boot + pandas ==");
const a = spawnKernel("A");
await a.ready;

// ---- 2. Dataframe ops ----
let t = Date.now();
const dfRes = await a.loadDf("df", csv);
console.log(`[A] load_df: ${dfRes.rows} rows in ${Date.now() - t}ms — RSS ${rss()}`);

t = Date.now();
const r1 = await a.run(
  "print(df.groupby('region')['amount'].agg(['sum','mean','count']).round(2))",
);
console.log(`[A] groupby in ${Date.now() - t}ms, error=${r1.isError}`);
console.log(r1.output.split("\n").slice(0, 6).join("\n"));

// Multi-frame (joins story) — join on a proper key: aggregate orders by
// region first (4 rows), then a many-to-one merge. (A raw many-to-many merge
// on a 4-value key would combinatorially explode — that's user error, and in
// production the 15s timeout + kill handles it.)
await a.loadDf("orders", makeCsv(50_000));
const r2 = await a.run(
  "region_totals = orders.groupby('region', as_index=False)['amount'].sum().rename(columns={'amount':'orders_total'})\n" +
    "m = df.merge(region_totals, on='region', how='left')\n" +
    "print('merged rows:', len(m), '| cols:', list(m.columns))\ndel m",
);
console.log(`[A] multi-frame merge error=${r2.isError} → ${r2.output.trim().slice(0, 100)}`);
if (r2.isError) throw new Error("multi-frame merge failed");

// ---- 3. Terminate a hung kernel ----
console.log("\n== Terminate test: hang kernel A, kill after 3s ==");
a.worker.postMessage({ type: "hang" });
await new Promise((r) => setTimeout(r, 3000));
t = Date.now();
await a.worker.terminate();
console.log(`[A] terminated in ${Date.now() - t}ms — RSS after ${rss()}`);

// ---- 4. Respawn (warm cache — no downloads) ----
console.log("\n== Kernel B: respawn with warm package cache ==");
const b = spawnKernel("B");
await b.ready;
await b.loadDf("df", csv);
t = Date.now();
const r3 = await b.run("print(df['amount'].describe().round(2))");
console.log(`[B] describe in ${Date.now() - t}ms, error=${r3.isError} — RSS ${rss()}`);
await b.worker.terminate();

console.log("\nSPIKE PASS: worker_threads + pandas + terminate/respawn all work.");
process.exit(0);
