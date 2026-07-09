# Deploying Glass Box (Docker Compose + Cloudflare Tunnel)

An always-on, publicly-reachable-over-HTTPS deployment that survives reboots and
needs no host ports. Three long-running services — Postgres, the app, and a
Cloudflare Tunnel connector — plus a one-off migration.

```
                 Cloudflare edge (HTTPS)
                          │  (outbound tunnel, no inbound ports)
                   ┌──────┴───────┐
                   │ cloudflared  │
                   └──────┬───────┘
        internal network  │  http://app:3000
                   ┌──────┴───────┐      ┌──────────────┐
                   │     app      │──────│      db      │
                   │ Next.js SSR  │ 5432 │ postgres:16  │
                   │ + Pyodide    │      └──────────────┘
                   └──────────────┘
        volumes: appdata:/data  pyodide_cache:/app/.pyodide-cache  pgdata
```

## Why not `next dev` / `prisma dev`?
Serverless and localhost dev servers can't stay up with the laptop off and
aren't public. This stack is a real production build: `next build` → standalone
`node server.js`, Postgres in a container, and an outbound Cloudflare Tunnel for
public HTTPS. All three services are `restart: unless-stopped`, so a VPS reboot
brings them back (as long as the Docker daemon is enabled on boot — see below).

## Prerequisites
- Docker + the Compose v2 plugin (`docker compose version`).
- Public HTTPS is handled by a Cloudflare **quick tunnel** by default — no
  Cloudflare account, token, or DNS needed. (For a *stable* hostname that
  survives restarts, see "Stable URL" below.)

## Configure
```bash
cp .env.production.example .env
# Edit .env:
#   POSTGRES_PASSWORD           strong password
#   DATABASE_URL / MIGRATE_...  same password, host `db`
#   AUTH_SECRET                 node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
#   AUTH_URL                    set AFTER the tunnel is up (its printed URL) — see below
#   OPENROUTER_API_KEY          + AGENT_PROVIDER=openrouter   (or ANTHROPIC_API_KEY)
#   MAX_KERNELS                 size to `free -h` (~300-700MB RAM per kernel)
```
`.env` is git-ignored. Never commit it.

## Bring it up
```bash
# 1) Build images and start Postgres first.
docker compose up -d --build db

# 2) Apply the schema once (engineless Prisma db push against the db service).
#    Runs from the builder image, which has the Prisma CLI + schema.
docker compose run --rm migrate

# 3) Start the app + tunnel.
docker compose up -d app cloudflared

# 4) Grab the public URL the quick tunnel printed, then point AUTH_URL at it
#    (Auth.js rejects logins whose origin != AUTH_URL) and restart the app:
URL=$(docker compose logs cloudflared | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | head -1)
echo "$URL"
sed -i -E "s#^AUTH_URL=.*#AUTH_URL=$URL#" .env
docker compose up -d app        # reloads AUTH_URL

# 5) Watch the app boot.
docker compose logs -f app
```
Re-running is safe: the schema lives in the `pgdata` volume, so `migrate` only
needs to run again when `prisma/schema.prisma` changes.

## ⚠️ The quick-tunnel URL is ephemeral
A quick tunnel's `*.trycloudflare.com` URL is **regenerated every time the
`cloudflared` container restarts** (crash, `docker compose restart`, or a VPS
reboot). When that happens the old link dies and logins break until you redo
step 4 (grab the new URL → update `AUTH_URL` → restart `app`). The tunnel runs
on the VPS, so your laptop being off is fine — only a *restart* rotates the URL.

## Stable URL (named tunnel — survives reboots)
For a fixed hostname, use a named Cloudflare tunnel instead:
1. Cloudflare Zero Trust → Networks → Tunnels → create a tunnel; add a **public
   hostname** route → `http://app:3000`. Copy the **connector token**.
2. In `docker-compose.yml`, swap the `cloudflared` service to the token form
   (the exact lines are in a comment right above the quick-tunnel `command`).
3. Put the token in `.env` as `CLOUDFLARE_TUNNEL_TOKEN`, set `AUTH_URL` to the
   fixed hostname, and `docker compose up -d cloudflared app`.
Now the URL is constant across reboots and `AUTH_URL` never needs updating.

## Verify (the make-or-break bit: the in-container Python kernel)
1. Open `https://<your-tunnel-hostname>` — sign up, create an org.
2. Upload `public/samples/sales_prospects.csv` and ask a question.
3. First analysis takes ~6-10s extra while the kernel boots and downloads the
   pandas/numpy wheels **once** into the `pyodide_cache` volume. Confirm the run
   returns real numeric output and a chart, and that the glass-box trace shows
   generated Python actually executing.
4. Logs should show a clean kernel boot, no `Cannot find module 'pyodide'`:
   ```bash
   docker compose logs app | grep -iE 'pyodide|kernel|ready|error'
   ```

## The Docker gotchas this image handles
Next.js standalone strips anything it doesn't statically trace. The Dockerfile
adds back what the kernel needs:
1. **pyodide** is `serverExternalPackages` → absent from standalone. Copied to
   `/app/node_modules/pyodide` (with `cp -RL` to deref pnpm's symlink), along
   with its lone runtime dep **ws**.
2. **`server/exec/kernel-worker.mjs`** is spawned via a runtime string path
   (`process.cwd()/server/exec/kernel-worker.mjs`), not an import — so `server/`
   is copied into the standalone root (cwd = `/app`).
3. **public/** (demo CSVs) and **.next/static** aren't copied by standalone —
   both are copied in.
4. **Pyodide wheels** download from the CDN on first kernel boot; the
   `pyodide_cache` volume (`/app/.pyodide-cache`, = `CACHE_DIR`) persists them.
5. **Prisma 7** is engineless (driver adapter) — the client is bundled straight
   into the standalone server chunks, so no engine binary or client copy needed.

## Survives-reboot checklist
- `restart: unless-stopped` on db, app, cloudflared. ✅ (in compose)
- Docker daemon enabled on boot:
  ```bash
  systemctl is-enabled docker    # want: enabled
  sudo systemctl enable docker   # if it prints "disabled"
  ```

## Operate
```bash
docker compose ps                    # status
docker compose logs -f app           # app logs
docker compose restart app           # restart app
docker compose pull cloudflared && docker compose up -d cloudflared   # update tunnel
docker compose down                  # stop (volumes/data kept)
docker compose down -v               # stop AND delete all data (danger)
```

## Resource notes
Each Pyodide kernel holds ~300-700MB RSS; `MAX_KERNELS` caps concurrency (one
kernel per active conversation, LRU + TTL evicted). This VPS runs other
projects — check `free -h` before raising it.

## Evals
`scripts/eval.mjs` is an end-to-end smoke test (no deps beyond Node built-ins +
`fetch`). It signs up or logs in, uploads `public/samples/sales_prospects.csv`,
opens a conversation, and asserts the intelligence contract holds:
- **(a)** a quick-fact question returns **no** report event,
- **(b)** a decision question **does** return a report event,
- **(c)** starter questions were generated for the conversation.

```bash
node scripts/eval.mjs <url>
# e.g. against the deployed tunnel:
node scripts/eval.mjs https://<your-tunnel-hostname>.trycloudflare.com
```
Optional args/env: `node scripts/eval.mjs <url> [email] [password]`, or
`BASE_URL` / `EVAL_EMAIL` / `EVAL_PASSWORD`. It prints `PASS`/`FAIL` per check and
exits non-zero if any check fails, so it drops straight into CI or a post-deploy
gate. The two runs exercise the live agent, so a model provider must be
configured (`AGENT_PROVIDER` + key) and the first run pays the one-time kernel
warm-up.
