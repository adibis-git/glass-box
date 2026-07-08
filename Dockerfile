# syntax=docker/dockerfile:1
#
# Glass Box — production image.
#
# The make-or-break part is the in-container Pyodide kernel. Next.js standalone
# output strips everything it doesn't statically trace, and this app deliberately
# keeps two things OUT of the trace:
#   • pyodide           — serverExternalPackages in next.config.ts (its dynamic
#                         imports break when bundled). Not in .next/standalone.
#   • server/exec/kernel-worker.mjs — spawned via a runtime string path, not an
#                         import, so the tracer can't follow it.
# Both (plus public/ and .next/static, which standalone never copies) are added
# back in the runner stage below.

######################## builder ########################
FROM node:22-slim AS builder
WORKDIR /app

# openssl + ca-certs: TLS for outbound (OpenRouter, Pyodide CDN) and Prisma.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable

# Install deps against the lockfile (cached unless manifests change).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack pnpm install --frozen-lockfile

# Build. `prisma generate` emits the engineless client into lib/generated/prisma
# (Prisma 7 driver-adapter — no query-engine binary). `pnpm build` then bundles
# that client straight into the standalone server chunks.
#
# next build collects page data for API routes, which imports lib/db.ts — that
# constructs the Prisma adapter at module load and throws if DATABASE_URL is
# unset. A throwaway build-time URL satisfies it (no connection is made at
# build); the real URL is injected at runtime by compose env_file and overrides.
COPY . .
RUN corepack pnpm exec prisma generate \
 && DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    AUTH_SECRET="build-only-not-used-at-runtime" \
    corepack pnpm build

# Stage the two runtime-external Node packages with symlinks DEREFERENCED
# (pnpm stores them as symlinks into .pnpm; a plain copy would carry a dead link).
# pyodide's only runtime dep is ws, which lives beside it under .pnpm.
RUN set -eux; \
    mkdir -p /ext; \
    cp -RL node_modules/pyodide /ext/pyodide; \
    WS_DIR="$(find node_modules/.pnpm -maxdepth 3 -type d -path '*/ws@*/node_modules/ws' | head -1)"; \
    cp -RL "$WS_DIR" /ext/ws

######################## runner ########################
FROM node:22-slim AS runner
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# 1) The self-contained server + its traced node_modules (Prisma client is
#    bundled into the chunks here — verified, no separate copy needed).
COPY --from=builder /app/.next/standalone ./
# 2) Assets standalone never copies.
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# 3) The raw kernel worker (loaded by cwd-relative string path at runtime).
#    process.cwd() is /app, and kernel.ts spawns /app/server/exec/kernel-worker.mjs.
COPY --from=builder /app/server ./server
# 4) The runtime-external packages the worker require()s.
COPY --from=builder /ext/pyodide ./node_modules/pyodide
COPY --from=builder /ext/ws ./node_modules/ws

# Writable runtime dirs, owned by the unprivileged node user:
#   /data                  → uploaded dataset files (DATA_DIR, mounted volume)
#   /app/.pyodide-cache    → pandas/numpy wheels downloaded once from the CDN
#                            (CACHE_DIR = <cwd>/.pyodide-cache, mounted volume)
# Empty named volumes inherit these owners/perms on first creation.
RUN mkdir -p /data /app/.pyodide-cache \
 && chown -R node:node /data /app/.pyodide-cache

USER node
EXPOSE 3000

# The standalone entrypoint. No `next start`, no dev server.
CMD ["node", "server.js"]
