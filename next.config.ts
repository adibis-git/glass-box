import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pyodide must NEVER be bundled by Turbopack/webpack: the kernel worker
  // (server/exec/kernel-worker.mjs) is a plain Node worker_thread that loads
  // pyodide from node_modules at runtime, and pyodide's internal dynamic
  // imports break under bundling ("Cannot find module as expression is too
  // dynamic"). Keeping it external is defense-in-depth alongside the aliased
  // worker spawn in server/exec/kernel.ts.
  serverExternalPackages: ["pyodide"],
};

export default nextConfig;
