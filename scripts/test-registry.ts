// P2b verification: registry boots a kernel, loads a stored dataset, runs code,
// enforces the guardrail, and reloads after eviction.
import "dotenv/config";
import { prisma } from "../lib/db";
import { getKernelRegistry } from "../server/exec/registry";

async function main() {
  const ds = await prisma.sourceVersion.findFirst({
    where: { source: { name: "messy_sales_v2" }, status: "READY" },
    orderBy: { createdAt: "desc" },
  });
  if (!ds) throw new Error("messy_sales_v2 source version not found");
  const refs = [{ versionId: ds.id, alias: "df", storageKey: ds.storageKey }];
  const registry = getKernelRegistry();
  const convId = "test-conv-1";

  console.log("1. run groupby (cold boot + load)...");
  let t = Date.now();
  const r1 = await registry.run(convId, refs, "print(df.groupby('Region')['Revenue'].sum())");
  console.log(`   ${Date.now() - t}ms error=${r1.isError} rebuilt=${r1.kernelRebuilt}`);
  console.log("   " + r1.output.split("\n").slice(0, 5).join("\n   "));

  console.log("2. warm run...");
  t = Date.now();
  const r2 = await registry.run(convId, refs, "print(df['Cost'].sum())");
  console.log(`   ${Date.now() - t}ms error=${r2.isError} rebuilt=${r2.kernelRebuilt} → ${r2.output.trim()}`);

  console.log("3. guardrail: import os ...");
  const r3 = await registry.run(convId, refs, "import os\nprint(os.listdir('.'))");
  console.log(`   blocked=${r3.blocked} error=${r3.isError}`);

  console.log("4. evictForVersions + rerun (should rebuild)...");
  await registry.evictForVersions([ds.id]);
  t = Date.now();
  const r4 = await registry.run(convId, refs, "print(len(df))");
  console.log(`   ${Date.now() - t}ms rebuilt=${r4.kernelRebuilt} → ${r4.output.trim()}`);

  registry.releaseConversation(convId);
  const pass = !r1.isError && !r2.isError && r3.blocked === true && !r4.isError && r4.kernelRebuilt === true;
  console.log(pass ? "\nREGISTRY PASS" : "\nREGISTRY FAIL");
  process.exit(pass ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
