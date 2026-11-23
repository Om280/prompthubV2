/**
 * Server environment, validated with Zod. Server-only: import this module only from route handlers
 * and `src/lib/ai/**` (the `server-only` package isn't installed yet; see the Phase 2 report).
 *
 * The parsed result never holds key values: keys are reduced to booleans during parsing, so nothing
 * downstream can log, return or echo a key or a fragment of one.
 */
import { z } from "zod";
import type { ProviderId } from "@/lib/contracts";

export const PROVIDER_IDS: readonly ProviderId[] = ["anthropic", "openai", "google"];

/** Env var holding each provider's key. Google's differs from the AI SDK default on purpose. */
export const KEY_ENV: Record<ProviderId, "OPENAI_API_KEY" | "ANTHROPIC_API_KEY" | "GEMINI_API_KEY"> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GEMINI_API_KEY",
};

/** A key counts as present when it has any non-whitespace character. Reduced to a boolean here. */
const keyPresent = z
  .string()
  .optional()
  .transform((v) => typeof v === "string" && v.trim().length > 0);

/** Comma-separated provider ids; unknown entries are ignored, missing ones appended in default order. */
const providerOrder = z
  .string()
  .optional()
  .transform((raw): ProviderId[] => {
    const listed = (raw ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s): s is ProviderId => (PROVIDER_IDS as readonly string[]).includes(s));
    const unique = [...new Set(listed)];
    return [...unique, ...PROVIDER_IDS.filter((p) => !unique.includes(p))];
  });

export const DEFAULT_RATE_LIMIT_PER_MINUTE = 30;

/**
 * Requests per minute per IP on the AI routes. Absent or not a whole number → default.
 * Values below 1 clamp to 1: the limiter can be loosened (e.g. for e2e runs) but never disabled.
 */
const rateLimitPerMinute = z
  .string()
  .optional()
  .transform((raw): number => {
    const t = raw?.trim() ?? "";
    if (!/^-?\d+$/.test(t)) return DEFAULT_RATE_LIMIT_PER_MINUTE;
    const n = Number(t);
    if (!Number.isSafeInteger(n)) return DEFAULT_RATE_LIMIT_PER_MINUTE;
    return Math.max(1, n);
  });

const EnvSchema = z.object({
  OPENAI_API_KEY: keyPresent,
  ANTHROPIC_API_KEY: keyPresent,
  GEMINI_API_KEY: keyPresent,
  PROVIDER_ORDER: providerOrder,
  RATE_LIMIT_PER_MINUTE: rateLimitPerMinute,
});

export interface ServerEnv {
  /** Which provider keys are set. Booleans only. */
  keys: Record<ProviderId, boolean>;
  /** Fallback order, every provider exactly once. */
  providerOrder: ProviderId[];
  /** AI-route limit per IP per minute; always ≥ 1. */
  rateLimitPerMinute: number;
}

/** Reads the environment on each call so tests and restarts see current values. */
export function readServerEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  const parsed = EnvSchema.safeParse({
    OPENAI_API_KEY: source.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: source.ANTHROPIC_API_KEY,
    GEMINI_API_KEY: source.GEMINI_API_KEY,
    PROVIDER_ORDER: source.PROVIDER_ORDER,
    RATE_LIMIT_PER_MINUTE: source.RATE_LIMIT_PER_MINUTE,
  });
  if (!parsed.success) {
    // Only possible with non-string values; treat as "nothing configured" rather than failing requests.
    return {
      keys: { openai: false, anthropic: false, google: false },
      providerOrder: [...PROVIDER_IDS],
      rateLimitPerMinute: DEFAULT_RATE_LIMIT_PER_MINUTE,
    };
  }
  const e = parsed.data;
  return {
    keys: { openai: e.OPENAI_API_KEY, anthropic: e.ANTHROPIC_API_KEY, google: e.GEMINI_API_KEY },
    providerOrder: e.PROVIDER_ORDER,
    rateLimitPerMinute: e.RATE_LIMIT_PER_MINUTE,
  };
}
