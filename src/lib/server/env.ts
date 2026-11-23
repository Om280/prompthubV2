/**
 * Server environment, validated with Zod. Server-only: import this module only from route handlers,
 * `src/lib/ai/**` and `src/lib/server/**`.
 *
 * PromptHub holds no AI provider keys. AI (when it ships) runs on each signed-in user's own
 * OpenRouter key, sent per request and never stored (see `user-key.ts`). The only server settings
 * are the abuse limits below; Supabase's public URL and publishable key live in
 * `src/lib/supabase/config.ts`.
 */
import { z } from "zod";

export const DEFAULT_RATE_LIMIT_PER_MINUTE = 30;
export const DEFAULT_RATE_LIMIT_PER_USER_PER_MINUTE = 20;
/** In-flight requests per user (per IP when signed out). Not configurable. */
export const MAX_CONCURRENT_REQUESTS = 2;

/**
 * A whole-number limit. Absent or not a whole number → the default. Values below 1 clamp to 1: a
 * limiter can be loosened (e.g. for e2e runs) but never disabled.
 */
const perMinute = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((raw): number => {
      const t = raw?.trim() ?? "";
      if (!/^-?\d+$/.test(t)) return fallback;
      const n = Number(t);
      if (!Number.isSafeInteger(n)) return fallback;
      return Math.max(1, n);
    });

const EnvSchema = z.object({
  RATE_LIMIT_PER_MINUTE: perMinute(DEFAULT_RATE_LIMIT_PER_MINUTE),
  RATE_LIMIT_PER_USER_PER_MINUTE: perMinute(DEFAULT_RATE_LIMIT_PER_USER_PER_MINUTE),
});

export interface ServerEnv {
  /** Requests per minute per IP across the API routes; always ≥ 1. */
  rateLimitPerMinute: number;
  /** Requests per minute per verified user across the API routes; always ≥ 1. */
  rateLimitPerUserPerMinute: number;
}

/** Reads the environment on each call so tests and restarts see current values. */
export function readServerEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  const parsed = EnvSchema.safeParse({
    RATE_LIMIT_PER_MINUTE: source.RATE_LIMIT_PER_MINUTE,
    RATE_LIMIT_PER_USER_PER_MINUTE: source.RATE_LIMIT_PER_USER_PER_MINUTE,
  });
  if (!parsed.success) {
    // Only possible with non-string values; fall back to the defaults rather than failing requests.
    return {
      rateLimitPerMinute: DEFAULT_RATE_LIMIT_PER_MINUTE,
      rateLimitPerUserPerMinute: DEFAULT_RATE_LIMIT_PER_USER_PER_MINUTE,
    };
  }
  return {
    rateLimitPerMinute: parsed.data.RATE_LIMIT_PER_MINUTE,
    rateLimitPerUserPerMinute: parsed.data.RATE_LIMIT_PER_USER_PER_MINUTE,
  };
}
