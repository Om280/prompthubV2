/**
 * Route guards: identity, input caps, quotas and concurrency in one call. Server-only.
 *
 * Every AI route MUST start with `guardAiRoute(request, …)`; public Basic Mode routes start with
 * `guardPublicRoute(request)`. Both return a lease whose `release()` must run when the request ends:
 * pass it to `ndjsonResponse` for streams (it runs on done, error and client cancel), call it in
 * `finally` for JSON routes, and in the error path when anything throws before the response exists.
 * `release()` is idempotent and also runs when the request is aborted.
 *
 * AI routes (persistent and atomic, via Supabase functions behind `QuotaStore`; never in-memory):
 *   1. verified user (`getClaims`)                          → 401 auth_required
 *   2. parse + validate the body                            → 400 invalid_request
 *   3. AI ready (switch on, Gemini key, free-tier model, quota store, project limits, built)
 *                                                           → 409 ai_required
 *      (before the AI-only checks, so a client that can't use AI gets the honest answer)
 *   3b. `requestId` (and `workflowId` for clarify/generate) present; idea + answers + prompt text
 *      ≤ AI_MAX_INPUT_CHARS                                 → 400 invalid_request
 *   4. in-flight lease with TTL: 1 per user, same request already running → 409 duplicate_request,
 *      another one running → 429 too_many_concurrent
 *   5. `ai_consume`, all-or-nothing, idempotent per `requestId` (workflow bucket per `workflowId`):
 *        user:<id>:min (3)  ip:<ip>:min (10)                → 429 rate_limited
 *        user:<id>:workflows:day (5) | user:<id>:refinements:day (5) → 429 user_daily_limit
 *        global:rpm, global:tpm (token estimate)            → 429 rate_limited (app at capacity)
 *        global:rpd                                         → 503 daily_budget_exhausted
 *      Global ceilings are AI_GLOBAL_SAFETY_RATIO (0.7) × the project's verified RPM/TPM/RPD.
 *      Day windows reset at midnight America/Los_Angeles.
 * After the call: `reconcileTokens(actual)` corrects the TPM estimate; `recordUsage(...)` writes
 * metadata (tokens, op, model, status, duration; never prompt text).
 *
 * Public Basic Mode routes never touch Gemini, so in-memory is fine: per-IP window, then at most 2
 * in-flight requests per user (per IP when signed out).
 *
 * Identity only ever comes from `getVerifiedUser()`. Headers such as `x-user-id` and ids in the body
 * are ignored.
 */
import { createHash, randomUUID } from "node:crypto";
import { aiCallSignal } from "@/lib/ai/cancellation";
import {
  AI_LIMIT_MESSAGES,
  AI_REQUIRED_MESSAGE,
  AppError,
  AUTH_NOT_CONFIGURED_MESSAGE,
  AUTH_REQUIRED_MESSAGE,
} from "@/lib/ai/errors";
import { aiReadiness, type AiReadiness } from "@/lib/ai/status";
import { isAuthConfigured } from "@/lib/supabase/config";
import { getVerifiedUser, type VerifiedUser } from "./auth";
import { requestConcurrency, type ConcurrencyLimiter } from "./concurrency";
import { MAX_CONCURRENT_REQUESTS, readServerEnv, safetyCeiling, type ServerEnv } from "./env";
import { logServerError } from "./log";
import { getQuotaStore, type QuotaStore, type QuotaWindowSpec } from "./quota";
import { secondsUntil } from "./quota-windows";
import { clientKey, ipRateLimiter, type RateLimiter } from "./rate-limit";

export type AiOperation = "clarify" | "generate" | "improve" | "shorten" | "expand" | "tone" | "regenerate";

/** Operations that start or continue a prompt workflow (counted once per `workflowId` per day). */
export const WORKFLOW_OPERATIONS: readonly AiOperation[] = ["clarify", "generate"];
/** Operations counted against the daily refinement limit. */
export const REFINEMENT_OPERATIONS: readonly AiOperation[] = ["improve", "shorten", "expand", "tone", "regenerate"];

export const TOO_MANY_CONCURRENT_MESSAGE = `You already have ${MAX_CONCURRENT_REQUESTS} requests running. Wait for one to finish.`;
export const QUOTA_CHECK_FAILED_MESSAGE =
  "PromptHub couldn't check your AI limits right now. Try again in a minute. Basic Mode still works, and your draft is kept.";

export interface RouteLease {
  /** The verified user, or null on public routes when signed out. */
  user: VerifiedUser | null;
  /** Frees this request's concurrency slot. Idempotent. */
  release(): void;
}

export interface AiUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  status: "ok" | "error" | "aborted" | "timeout";
}

export interface AiRouteLease<T> extends RouteLease {
  user: VerifiedUser;
  input: T;
  requestId: string;
  /** SHA-256 of user, operation and input. Stored instead of any prompt text. */
  requestHash: string;
  model: string;
  /** Tokens charged to the TPM bucket at reservation (input estimate + max output). */
  estimatedTokens: number;
  /** True when this `requestId` was already counted (a retry); nothing was charged again. */
  replay: boolean;
  /** Aborts on client disconnect or after AI_TIMEOUT_MS. Pass it to the Gemini call. */
  signal: AbortSignal;
  maxOutputTokens: number;
  /** Corrects the TPM charge with the actual token count. Never throws. */
  reconcileTokens(actualTotalTokens: number): Promise<void>;
  /** Writes usage metadata (no prompt text). Never throws. */
  recordUsage(usage: AiUsage): Promise<void>;
}

export interface AiRequestIds {
  requestId?: string;
  workflowId?: string;
}

export interface AiGuardOptions<T> {
  /** Fixed, or read from the validated input (e.g. a transform's `action`). */
  operation: AiOperation | ((input: T) => AiOperation);
  /** Parses and validates the body (throws `invalid_request`). Runs after the auth check. */
  readInput: () => Promise<T>;
  /** Idea, answers and prompt text, combined: counted against `AI_MAX_INPUT_CHARS`. */
  inputText: (input: T) => string;
  ids: (input: T) => AiRequestIds;
}

export interface GuardDeps {
  getUser?: () => Promise<VerifiedUser | null>;
  authConfigured?: () => boolean;
  readiness?: () => AiReadiness;
  store?: () => QuotaStore;
  env?: () => ServerEnv;
  now?: () => Date;
  ipLimiter?: RateLimiter;
  concurrency?: ConcurrencyLimiter;
}

const ipOf = (request: Request) => clientKey(request);

function onAbort(request: Request, release: () => void): () => void {
  const wrapped = () => {
    request.signal?.removeEventListener("abort", wrapped);
    release();
  };
  if (request.signal?.aborted) wrapped();
  else request.signal?.addEventListener("abort", wrapped, { once: true });
  return wrapped;
}

function hashRequest(userId: string, operation: AiOperation, input: unknown): string {
  const { requestId: _r, workflowId: _w, ...content } = (input ?? {}) as Record<string, unknown>;
  return createHash("sha256").update(JSON.stringify([userId, operation, content])).digest("hex");
}

/** Rough token estimate for the TPM reservation: ~4 characters per token, plus the output cap. */
export function estimateTokens(inputChars: number, maxOutputTokens: number): number {
  return Math.ceil(inputChars / 4) + maxOutputTokens;
}

/** Maps a failed bucket to the contract error, with its reset time. */
export function limitError(bucket: string, resetsAt: Date, now: Date = new Date()): AppError {
  const extras = { resetsAt: resetsAt.toISOString(), retryAfterSec: secondsUntil(resetsAt, now) };
  if (bucket === "global:rpd") return new AppError("daily_budget_exhausted", AI_LIMIT_MESSAGES.daily_budget_exhausted, extras);
  if (bucket.startsWith("global:")) return new AppError("rate_limited", AI_LIMIT_MESSAGES.global_busy, extras);
  if (bucket.startsWith("ip:")) return new AppError("rate_limited", AI_LIMIT_MESSAGES.ip_per_minute, extras);
  if (bucket.endsWith(":workflows:day")) return new AppError("user_daily_limit", AI_LIMIT_MESSAGES.user_daily_workflows, extras);
  if (bucket.endsWith(":refinements:day")) return new AppError("user_daily_limit", AI_LIMIT_MESSAGES.user_daily_refinements, extras);
  return new AppError("rate_limited", AI_LIMIT_MESSAGES.user_per_minute, extras);
}

/** The windows one AI request consumes. Exported for tests and docs. */
export function aiWindows(
  user: VerifiedUser,
  ip: string,
  operation: AiOperation,
  ids: { requestId: string; workflowId?: string },
  estimatedTokens: number,
  env: ServerEnv,
): QuotaWindowSpec[] {
  const { rpm, tpm, rpd, safetyRatio } = env.project;
  if (rpm === null || tpm === null || rpd === null) throw new AppError("ai_required", AI_REQUIRED_MESSAGE);
  const key = ids.requestId;
  const daily: QuotaWindowSpec = WORKFLOW_OPERATIONS.includes(operation)
    ? { bucket: `user:${user.id}:workflows:day`, window: "day", limit: env.ai.userDailyWorkflows, key: `wf:${ids.workflowId}` }
    : { bucket: `user:${user.id}:refinements:day`, window: "day", limit: env.ai.userDailyRefinements, key };
  return [
    { bucket: `user:${user.id}:min`, window: "minute", limit: env.ai.userPerMinute, key },
    { bucket: `ip:${ip}:min`, window: "minute", limit: env.ai.ipPerMinute, key },
    daily,
    { bucket: "global:rpm", window: "minute", limit: safetyCeiling(rpm, safetyRatio), key },
    { bucket: "global:tpm", window: "minute", limit: safetyCeiling(tpm, safetyRatio), amount: estimatedTokens, key },
    { bucket: "global:rpd", window: "day", limit: safetyCeiling(rpd, safetyRatio), key },
  ];
}

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export async function guardAiRoute<T>(
  request: Request,
  options: AiGuardOptions<T>,
  deps: GuardDeps = {},
): Promise<AiRouteLease<T>> {
  const now = deps.now ?? (() => new Date());

  // 1. Identity.
  const user = await (deps.getUser ?? (() => getVerifiedUser()))();
  if (!user) {
    const configured = (deps.authConfigured ?? isAuthConfigured)();
    throw new AppError("auth_required", configured ? AUTH_REQUIRED_MESSAGE : AUTH_NOT_CONFIGURED_MESSAGE);
  }

  // 2. Input.
  const env = (deps.env ?? readServerEnv)();
  const input = await options.readInput();

  // 3. Is AI available at all? (Never consume quota for a request that can't run.)
  const readiness = (deps.readiness ?? (() => aiReadiness({ env })))();
  if (readiness.status !== "ready") throw new AppError("ai_required", AI_REQUIRED_MESSAGE);

  // 3b. AI-only input rules: ids and total size.
  const operation = typeof options.operation === "function" ? options.operation(input) : options.operation;
  const ids = options.ids(input);
  if (!isUuid(ids.requestId)) {
    throw new AppError("invalid_request", "AI requests need a requestId (a UUID). Reload the page and try again.", {
      issues: [{ path: "requestId", message: "Required UUID" }],
    });
  }
  if (WORKFLOW_OPERATIONS.includes(operation) && !isUuid(ids.workflowId)) {
    throw new AppError("invalid_request", "AI prompt requests need a workflowId (a UUID). Reload the page and try again.", {
      issues: [{ path: "workflowId", message: "Required UUID" }],
    });
  }
  const requestId = ids.requestId;
  const chars = options.inputText(input).length;
  if (chars > env.ai.maxInputChars) {
    throw new AppError(
      "invalid_request",
      `AI requests can be up to ${env.ai.maxInputChars.toLocaleString("en-US")} characters in total (idea, answers and prompt); this one has ${chars.toLocaleString("en-US")}. Shorten it and try again. Basic Mode still works.`,
      { issues: [{ path: "", message: `Over ${env.ai.maxInputChars} characters` }] },
    );
  }

  // 4–5. Persistent in-flight lease, then quotas.
  const store = (deps.store ?? getQuotaStore)();
  const requestHash = hashRequest(user.id, operation, input);
  const estimatedTokens = estimateTokens(chars, env.ai.maxOutputTokens);
  const startedAt = now().getTime();
  let acquired = false;
  let released = false;
  const release = () => {
    if (released || !acquired) return;
    released = true;
    void store.releaseInflight(requestId).catch((err) => logServerError("releasing an AI slot failed", err));
  };

  let replay = false;
  let reservedAt: Date;
  try {
    const slot = await store.acquireInflight(
      `inflight:user:${user.id}`,
      requestId,
      requestHash,
      env.ai.maxConcurrentPerUser,
      env.ai.inflightTtlSeconds,
    );
    if (slot === "duplicate") throw new AppError("duplicate_request", AI_LIMIT_MESSAGES.duplicate_request);
    if (slot === "busy") throw new AppError("too_many_concurrent", AI_LIMIT_MESSAGES.too_many_concurrent);
    acquired = true;

    const result = await store.consume(
      aiWindows(user, ipOf(request), operation, { requestId, workflowId: ids.workflowId }, estimatedTokens, env),
    );
    if (!result.ok) throw limitError(result.bucket, result.resetsAt, now());
    replay = result.replay;
    reservedAt = result.reservedAt;
  } catch (err) {
    release();
    if (err instanceof AppError) throw err;
    logServerError("AI quota check failed", err);
    throw new AppError("internal", QUOTA_CHECK_FAILED_MESSAGE);
  }

  const releaseOnce = onAbort(request, release);
  let reconciled = false;
  return {
    user,
    input,
    requestId,
    requestHash,
    model: readiness.model,
    estimatedTokens,
    replay,
    signal: aiCallSignal(request.signal, env.ai.timeoutMs),
    maxOutputTokens: env.ai.maxOutputTokens,
    release: releaseOnce,
    async reconcileTokens(actual) {
      if (reconciled || replay || !Number.isFinite(actual)) return;
      reconciled = true;
      try {
        await store.adjust("global:tpm", "minute", reservedAt, Math.max(0, Math.round(actual)) - estimatedTokens);
      } catch (err) {
        logServerError("reconciling AI tokens failed", err);
      }
    },
    async recordUsage(usage) {
      try {
        await store.recordUsage({
          userId: user.id,
          requestId,
          operation,
          model: readiness.model,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          status: usage.status,
          durationMs: Math.max(0, now().getTime() - startedAt),
          requestHash,
        });
      } catch (err) {
        logServerError("recording AI usage failed", err);
      }
    },
  };
}

/**
 * Guard for public Basic Mode routes (clarify, generate). Throws 429 `rate_limited` (per IP) or 429
 * `too_many_concurrent` (per user when signed in, else per IP). In-memory: these routes never call
 * Gemini.
 */
export async function guardPublicRoute(request: Request, deps: GuardDeps = {}): Promise<RouteLease> {
  const r = (deps.ipLimiter ?? ipRateLimiter).check(`ip:${ipOf(request)}`);
  if (!r.ok) {
    throw new AppError(
      "rate_limited",
      `Too many requests in a short time. Wait ${r.retryAfterSec} second${r.retryAfterSec === 1 ? "" : "s"} and try again.`,
      { retryAfterSec: r.retryAfterSec },
    );
  }
  const user = await (deps.getUser ?? (() => getVerifiedUser()))();
  const key = user ? `user:${user.id}` : `ip:${ipOf(request)}`;
  const lease = (deps.concurrency ?? requestConcurrency).acquire(key);
  if (!lease) throw new AppError("too_many_concurrent", TOO_MANY_CONCURRENT_MESSAGE);
  return { user, release: onAbort(request, () => lease.release()) };
}

/** Test helper: clears the in-memory limiters used by public routes. */
export function resetGuards(): void {
  ipRateLimiter.reset();
  requestConcurrency.reset();
}

/** For callers that need an id when the client didn't send one (e.g. tests). */
export const newRequestId = (): string => randomUUID();
