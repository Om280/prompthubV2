import { readServerEnv } from "./env";

/**
 * In-memory sliding-window rate limiters (ARCHITECTURE §5, "Auth and abuse prevention"). Server-only.
 * Best-effort: each server instance (or serverless worker) keeps its own window, so limits are per
 * instance. A shared store (e.g. Upstash) can replace `createRateLimiter` at deploy time.
 */

export type RateLimitResult = { ok: true; remaining: number } | { ok: false; retryAfterSec: number };

export interface RateLimiter {
  check(key: string): RateLimitResult;
  reset(): void;
}

export interface RateLimiterOptions {
  /** A fixed limit, or a function read on every check (so env changes apply per request). */
  limit: number | (() => number);
  windowMs: number;
  /** Upper bound on tracked keys; the least recently used are dropped first. */
  maxKeys?: number;
  now?: () => number;
}

export function createRateLimiter({ limit, windowMs, maxKeys = 10_000, now = Date.now }: RateLimiterOptions): RateLimiter {
  // Map iteration order is insertion order; re-inserting on each hit keeps it LRU.
  const hits = new Map<string, number[]>();

  return {
    check(key) {
      const t = now();
      const max = Math.max(1, typeof limit === "function" ? limit() : limit);
      const recent = (hits.get(key) ?? []).filter((ts) => t - ts < windowMs);
      hits.delete(key);
      if (recent.length >= max) {
        hits.set(key, recent);
        const retryAfterSec = Math.max(1, Math.ceil((recent[0] + windowMs - t) / 1000));
        return { ok: false, retryAfterSec };
      }
      recent.push(t);
      hits.set(key, recent);
      while (hits.size > maxKeys) {
        const oldest = hits.keys().next().value;
        if (oldest === undefined) break;
        hits.delete(oldest);
      }
      return { ok: true, remaining: max - recent.length };
    },
    reset() {
      hits.clear();
    },
  };
}

/**
 * Per-IP limiter shared by the API routes (clarify, generate, transform): RATE_LIMIT_PER_MINUTE
 * requests per minute per IP (default 30), read from env on each check.
 */
export const ipRateLimiter = createRateLimiter({
  limit: () => readServerEnv().rateLimitPerMinute,
  windowMs: 60_000,
});

/**
 * Per-user limiter, keyed by the verified user id (never a client-sent id):
 * RATE_LIMIT_PER_USER_PER_MINUTE requests per minute per user (default 20).
 */
export const userRateLimiter = createRateLimiter({
  limit: () => readServerEnv().rateLimitPerUserPerMinute,
  windowMs: 60_000,
});

/** Best-effort client address. Behind a proxy the first `x-forwarded-for` hop is the client. */
export function clientKey(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  const first = fwd?.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip")?.trim() || "unknown";
}
