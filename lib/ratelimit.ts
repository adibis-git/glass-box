// In-process, per-org sliding-window rate limiter (v3 §17 SaaS surface).
//
// Single-instance only: state lives in a Map in this process's memory, so it
// resets on redeploy and is NOT shared across horizontally-scaled replicas.
// That's intentional and sufficient for the current single-container deploy
// (see DEPLOY.md) — swap for a shared store (Redis/Upstash) when scaling out.
//
// Keyed by `${bucket}:${orgId}` so each org gets its own budget per action
// class ("messages", "datasets", …). No LLM, no I/O — a few array ops.

const WINDOW_MS = 60_000;

/** Timestamps (ms) of recent hits per key, oldest-first. */
const hits = new Map<string, number[]>();

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  /** ms until the next hit would be allowed (0 when ok). */
  retryAfterMs: number;
}

/**
 * Record + evaluate one hit against a sliding 60s window.
 * Returns ok=false (and does NOT consume budget) once `limitPerMin` is reached.
 */
export function checkRateLimit(orgId: string, bucket: string, limitPerMin: number): RateLimitResult {
  const now = Date.now();
  const key = `${bucket}:${orgId}`;
  const cutoff = now - WINDOW_MS;

  const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);

  if (recent.length >= limitPerMin) {
    hits.set(key, recent);
    const retryAfterMs = Math.max(0, recent[0] + WINDOW_MS - now);
    return { ok: false, limit: limitPerMin, remaining: 0, retryAfterMs };
  }

  recent.push(now);
  hits.set(key, recent);
  return { ok: true, limit: limitPerMin, remaining: limitPerMin - recent.length, retryAfterMs: 0 };
}

/** Uniform 429 Response for a failed check. */
export function rateLimitResponse(result: RateLimitResult, message: string): Response {
  return Response.json(
    { error: message, retryAfterMs: result.retryAfterMs, limit: result.limit },
    { status: 429, headers: { "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)) } },
  );
}
