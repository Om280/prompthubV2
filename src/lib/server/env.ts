/**
 * Server environment, validated with Zod. Server-only: import this module only from route handlers,
 * `src/lib/ai/**` and `src/lib/server/**`.
 *
 * AI runs only on Google Gemini's free tier, with the app owner's single key (`GEMINI_API_KEY`).
 * Secrets are reduced to booleans while parsing, so nothing downstream can log, return or echo a key.
 * The one module that needs a secret's value reads it from `process.env` itself, at the point of use
 * (`quota.ts` for `SUPABASE_SECRET_KEY`; the later Gemini adapter for `GEMINI_API_KEY`).
 *
 * There are no hardcoded free-tier numbers: the project's RPM/TPM/RPD come from the operator (copied
 * from https://aistudio.google.com/rate-limit). Until they are set, AI is `not-configured`.
 */
import { z } from "zod";

export const DEFAULT_RATE_LIMIT_PER_MINUTE = 30;
/** In-flight Basic Mode requests per user (per IP when signed out). In-memory; not configurable. */
export const MAX_CONCURRENT_REQUESTS = 2;

export const AI_LIMIT_DEFAULTS = {
  userDailyWorkflows: 5,
  userDailyRefinements: 5,
  userPerMinute: 3,
  ipPerMinute: 10,
  maxConcurrentPerUser: 1,
  inflightTtlSeconds: 120,
  maxInputChars: 20_000,
  maxOutputTokens: 2048,
  timeoutMs: 30_000,
  globalSafetyRatio: 0.7,
} as const;

/** Whole number ≥ 1. Absent or invalid → `fallback`. 0 and negatives clamp to 1 (never disabled). */
const positiveInt = (fallback: number) =>
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

/** Whole number ≥ 1 with no default: absent or invalid → null (AI refuses until it is set). */
const requiredPositiveInt = z
  .string()
  .optional()
  .transform((raw): number | null => {
    const t = raw?.trim() ?? "";
    if (!/^\d+$/.test(t)) return null;
    const n = Number(t);
    return Number.isSafeInteger(n) && n >= 1 ? n : null;
  });

/** A ratio in (0, 1]. Absent or invalid → the default. */
const ratio = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((raw): number => {
      const t = raw?.trim() ?? "";
      if (!/^\d*\.?\d+$/.test(t)) return fallback;
      const n = Number(t);
      return n > 0 && n <= 1 ? n : fallback;
    });

/** On unless explicitly "false", "0", "off" or "no" (the emergency switch). */
const enabledFlag = z
  .string()
  .optional()
  .transform((raw) => !/^(false|0|off|no)$/i.test(raw?.trim() ?? ""));

const present = z
  .string()
  .optional()
  .transform((v) => typeof v === "string" && v.trim().length > 0);

const trimmedOrNull = z
  .string()
  .optional()
  .transform((v) => (typeof v === "string" && v.trim() ? v.trim() : null));

const EnvSchema = z.object({
  RATE_LIMIT_PER_MINUTE: positiveInt(DEFAULT_RATE_LIMIT_PER_MINUTE),
  AI_ENABLED: enabledFlag,
  GEMINI_API_KEY: present,
  GEMINI_MODEL: trimmedOrNull,
  SUPABASE_SECRET_KEY: present,
  GEMINI_PROJECT_RPM: requiredPositiveInt,
  GEMINI_PROJECT_TPM: requiredPositiveInt,
  GEMINI_PROJECT_RPD: requiredPositiveInt,
  AI_GLOBAL_SAFETY_RATIO: ratio(AI_LIMIT_DEFAULTS.globalSafetyRatio),
  AI_USER_DAILY_WORKFLOWS: positiveInt(AI_LIMIT_DEFAULTS.userDailyWorkflows),
  AI_USER_DAILY_REFINEMENTS: positiveInt(AI_LIMIT_DEFAULTS.userDailyRefinements),
  AI_USER_PER_MINUTE: positiveInt(AI_LIMIT_DEFAULTS.userPerMinute),
  AI_IP_PER_MINUTE: positiveInt(AI_LIMIT_DEFAULTS.ipPerMinute),
  AI_MAX_CONCURRENT_PER_USER: positiveInt(AI_LIMIT_DEFAULTS.maxConcurrentPerUser),
  AI_INFLIGHT_TTL_SECONDS: positiveInt(AI_LIMIT_DEFAULTS.inflightTtlSeconds),
  AI_MAX_INPUT_CHARS: positiveInt(AI_LIMIT_DEFAULTS.maxInputChars),
  AI_MAX_OUTPUT_TOKENS: positiveInt(AI_LIMIT_DEFAULTS.maxOutputTokens),
  AI_TIMEOUT_MS: positiveInt(AI_LIMIT_DEFAULTS.timeoutMs),
});

export interface ProjectQuota {
  /** The verified Gemini project limits (requests/min, tokens/min, requests/day), or null if unset. */
  rpm: number | null;
  tpm: number | null;
  rpd: number | null;
  /** App-wide ceilings are this fraction of the project limits (default 0.7). */
  safetyRatio: number;
}

export interface AiLimits {
  userDailyWorkflows: number;
  userDailyRefinements: number;
  userPerMinute: number;
  ipPerMinute: number;
  maxConcurrentPerUser: number;
  inflightTtlSeconds: number;
  /** Idea, answers and prompt text combined. */
  maxInputChars: number;
  maxOutputTokens: number;
  timeoutMs: number;
}

export interface ServerEnv {
  /** Basic Mode requests per minute per IP; always ≥ 1. */
  rateLimitPerMinute: number;
  /** The emergency switch. false → no Gemini calls at all. */
  aiEnabled: boolean;
  /** `GEMINI_API_KEY` is set. Boolean only. */
  geminiKeyPresent: boolean;
  /** `GEMINI_MODEL` as configured (trimmed), or null. Validated against the allowlist elsewhere. */
  geminiModel: string | null;
  /** `SUPABASE_SECRET_KEY` is set (needed for the persistent quota store). Boolean only. */
  supabaseSecretKeyPresent: boolean;
  project: ProjectQuota;
  ai: AiLimits;
}

const KEYS = Object.keys(EnvSchema.shape) as (keyof typeof EnvSchema.shape)[];

/** Reads the environment on each call so tests and restarts see current values. */
export function readServerEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  const input = Object.fromEntries(KEYS.map((k) => [k, typeof source[k] === "string" ? source[k] : undefined]));
  const e = EnvSchema.parse(input);
  return {
    rateLimitPerMinute: e.RATE_LIMIT_PER_MINUTE,
    aiEnabled: e.AI_ENABLED,
    geminiKeyPresent: e.GEMINI_API_KEY,
    geminiModel: e.GEMINI_MODEL,
    supabaseSecretKeyPresent: e.SUPABASE_SECRET_KEY,
    project: {
      rpm: e.GEMINI_PROJECT_RPM,
      tpm: e.GEMINI_PROJECT_TPM,
      rpd: e.GEMINI_PROJECT_RPD,
      safetyRatio: e.AI_GLOBAL_SAFETY_RATIO,
    },
    ai: {
      userDailyWorkflows: e.AI_USER_DAILY_WORKFLOWS,
      userDailyRefinements: e.AI_USER_DAILY_REFINEMENTS,
      userPerMinute: e.AI_USER_PER_MINUTE,
      ipPerMinute: e.AI_IP_PER_MINUTE,
      maxConcurrentPerUser: e.AI_MAX_CONCURRENT_PER_USER,
      inflightTtlSeconds: e.AI_INFLIGHT_TTL_SECONDS,
      maxInputChars: e.AI_MAX_INPUT_CHARS,
      maxOutputTokens: e.AI_MAX_OUTPUT_TOKENS,
      timeoutMs: e.AI_TIMEOUT_MS,
    },
  };
}

/** The app-wide ceiling for one project limit: floor(limit × ratio), at least 1. */
export function safetyCeiling(limit: number, ratio: number): number {
  return Math.max(1, Math.floor(limit * ratio));
}
