/**
 * Server environment, validated with Zod. Server-only: import this module only from route handlers,
 * `src/lib/ai/**` and `src/lib/server/**`.
 *
 * AI runs only on Google Gemini's free tier, with the app owner's single key (`GEMINI_API_KEY`).
 * Secrets are reduced to booleans while parsing, so nothing downstream can log, return or echo a key.
 * The one module that needs a secret's value reads it from `process.env` itself, at the point of use
 * (`quota.ts` for `SUPABASE_SECRET_KEY`; the later Gemini adapter for `GEMINI_API_KEY`).
 *
 * App-wide ceilings: when the operator supplies the project's verified RPM/TPM/RPD
 * (`GEMINI_PROJECT_*`, copied from https://aistudio.google.com/rate-limit), the ceilings are
 * `AI_GLOBAL_SAFETY_RATIO` (0.7) × those, capped by any explicit `AI_GLOBAL_*`. When they are not
 * supplied, conservative configurable defaults apply (`AI_GLOBAL_RPM` 5, `AI_GLOBAL_TPM` 100,000,
 * `AI_GLOBAL_RPD` 100). These are PromptHub's own safeguards, not Google's limits.
 */
import "server-only";
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
  // Thinking tokens count as output on Gemini 3.x, so Detailed prompts need room for both.
  maxOutputTokens: 4096,
  timeoutMs: 30_000,
  globalSafetyRatio: 0.7,
} as const;

/** Conservative app-wide ceilings used when the project's own limits weren't supplied. */
export const AI_GLOBAL_DEFAULTS = { rpm: 5, tpm: 100_000, rpd: 100 } as const;

export const THINKING_LEVELS = ["low", "medium", "high"] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];
/** Gemini 3.8 Flash supports low/medium/high ("minimal" errors there). */
export const DEFAULT_THINKING_LEVEL: ThinkingLevel = "low";

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

/** One of low | medium | high (case-insensitive). Anything else, including "minimal" → "low". */
const thinkingLevel = z
  .string()
  .optional()
  .transform((raw): ThinkingLevel => {
    const t = raw?.trim().toLowerCase() ?? "";
    return (THINKING_LEVELS as readonly string[]).includes(t) ? (t as ThinkingLevel) : DEFAULT_THINKING_LEVEL;
  });

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
  AI_GLOBAL_RPM: requiredPositiveInt,
  AI_GLOBAL_TPM: requiredPositiveInt,
  AI_GLOBAL_RPD: requiredPositiveInt,
  GEMINI_THINKING_LEVEL: thinkingLevel,
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

/** Explicit app-wide ceilings (`AI_GLOBAL_RPM/TPM/RPD`), or null when not set. */
export interface GlobalOverrides {
  rpm: number | null;
  tpm: number | null;
  rpd: number | null;
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
  /** Explicit AI_GLOBAL_* values. Optional so hand-built test envs stay valid. */
  global?: GlobalOverrides;
  /** `GEMINI_THINKING_LEVEL`, validated (default "low"). */
  thinkingLevel?: ThinkingLevel;
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
    global: { rpm: e.AI_GLOBAL_RPM, tpm: e.AI_GLOBAL_TPM, rpd: e.AI_GLOBAL_RPD },
    thinkingLevel: e.GEMINI_THINKING_LEVEL,
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

export type LimitsBasis = "project-ratio" | "conservative-defaults" | "mixed";

export interface GlobalCeilings {
  rpm: number;
  tpm: number;
  rpd: number;
  basis: LimitsBasis;
  /** True when at least one AI_GLOBAL_* value was set explicitly. */
  explicit?: boolean;
}

/**
 * The app-wide ceilings in force. Per limit: the supplied project value × the safety ratio, capped
 * by an explicit AI_GLOBAL_* value; without a project value, the explicit value or the conservative
 * default.
 */
export function globalCeilings(env: ServerEnv): GlobalCeilings {
  const g = env.global ?? { rpm: null, tpm: null, rpd: null };
  const pick = (k: "rpm" | "tpm" | "rpd"): number => {
    const project = env.project[k];
    const explicit = g[k];
    if (project !== null) {
      const fromProject = safetyCeiling(project, env.project.safetyRatio);
      return explicit !== null ? Math.min(fromProject, explicit) : fromProject;
    }
    return explicit ?? AI_GLOBAL_DEFAULTS[k];
  };
  const supplied = (["rpm", "tpm", "rpd"] as const).filter((k) => env.project[k] !== null).length;
  return {
    rpm: pick("rpm"),
    tpm: pick("tpm"),
    rpd: pick("rpd"),
    basis: supplied === 3 ? "project-ratio" : supplied === 0 ? "conservative-defaults" : "mixed",
    explicit: g.rpm !== null || g.tpm !== null || g.rpd !== null,
  };
}

/** Human description of the ceilings, for the status response and docs. */
export function describeCeilings(c: GlobalCeilings, ratio: number): string {
  const nums = `${c.rpm} requests/min, ${c.tpm.toLocaleString("en-US")} tokens/min, ${c.rpd} requests/day app-wide`;
  const pct = `${Math.round(ratio * 100)}%`;
  if (c.basis === "project-ratio") return `${pct} of supplied project limits: ${nums}.`;
  if (c.basis === "mixed") return `Partly ${pct} of supplied project limits, partly conservative defaults: ${nums}.`;
  if (c.explicit) return `App-wide limits set on this server (project limits not supplied): ${nums}.`;
  return `Conservative defaults (project limits not supplied): ${nums}.`;
}
