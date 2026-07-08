import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained production server (.next/standalone/server.js) so the
  // Docker runtime image needs no dev deps and no `next start`. The standalone
  // bundle deliberately EXCLUDES pyodide (serverExternalPackages below) and the
  // raw kernel worker under server/exec, and does not copy public/ or
  // .next/static — the Dockerfile copies all of those back in.
  output: "standalone",

  // pyodide must NEVER be bundled by Turbopack/webpack: the kernel worker
  // (server/exec/kernel-worker.mjs) is a plain Node worker_thread that loads
  // pyodide from node_modules at runtime, and pyodide's internal dynamic
  // imports break under bundling ("Cannot find module as expression is too
  // dynamic"). Keeping it external is defense-in-depth alongside the aliased
  // worker spawn in server/exec/kernel.ts.
  serverExternalPackages: ["pyodide"],
};

export default nextConfig;
