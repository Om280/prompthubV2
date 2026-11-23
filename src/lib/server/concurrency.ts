/**
 * In-flight request limiter. Server-only, in-memory, per instance (like the rate limiters).
 *
 * `acquire(key)` returns a lease, or null when `key` already holds `max` leases. A lease's
 * `release()` is idempotent, so callers can release on completion, abort and error without counting
 * twice.
 */
import { MAX_CONCURRENT_REQUESTS } from "./env";

export interface Lease {
  release(): void;
}

export interface ConcurrencyLimiter {
  acquire(key: string): Lease | null;
  inFlight(key: string): number;
  reset(): void;
  readonly max: number;
}

export function createConcurrencyLimiter(max: number): ConcurrencyLimiter {
  const counts = new Map<string, number>();
  return {
    max,
    acquire(key) {
      const n = counts.get(key) ?? 0;
      if (n >= max) return null;
      counts.set(key, n + 1);
      let released = false;
      return {
        release() {
          if (released) return;
          released = true;
          const left = (counts.get(key) ?? 1) - 1;
          if (left <= 0) counts.delete(key);
          else counts.set(key, left);
        },
      };
    },
    inFlight(key) {
      return counts.get(key) ?? 0;
    },
    reset() {
      counts.clear();
    },
  };
}

/** Shared limiter: at most 2 in-flight requests per verified user, or per IP when signed out. */
export const requestConcurrency = createConcurrencyLimiter(MAX_CONCURRENT_REQUESTS);
