/**
 * Error mapping to the contract `ApiError` (API_CONTRACTS §5). Server-only.
 * Messages are user-facing and specific; they never include provider internals or env values.
 */
// import "server-only" is added once the Vitest alias for it exists (see the Gemini report).
import type { ApiError, ApiErrorCode } from "@/lib/contracts";
import { logServerError } from "@/lib/server/log";

export const STATUS_FOR: Record<ApiErrorCode, number> = {
  invalid_request: 400,
  auth_required: 401,
  ai_required: 409,
  duplicate_request: 409,
  rate_limited: 429,
  too_many_concurrent: 429,
  user_daily_limit: 429,
  provider_unavailable: 502,
  invalid_output: 502,
  quota_exhausted: 503,
  daily_budget_exhausted: 503,
  internal: 500,
};

export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly extras: Omit<ApiError, "code" | "message">;

  constructor(code: ApiErrorCode, message: string, extras: Omit<ApiError, "code" | "message"> = {}, status?: number) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.extras = extras;
    this.status = status ?? STATUS_FOR[code];
  }

  toApiError(): ApiError {
    return { code: this.code, message: this.message, ...this.extras };
  }
}

export const INTERNAL_MESSAGE =
  "Something went wrong on the server. Try again, and reload the page if it keeps happening.";

export const AI_REQUIRED_MESSAGE =
  "Improve, Shorten, Expand and Tone need AI, which isn't available on this server right now. Basic Mode still works, and your prompt is kept.";
export const AI_PROMPT_REQUIRED_MESSAGE =
  "AI prompt writing isn't available on this server right now. Basic Mode still works, and your draft is kept.";

export const AUTH_REQUIRED_MESSAGE = "Sign in with Google to use AI features.";
export const AUTH_NOT_CONFIGURED_MESSAGE =
  "AI features need you to sign in, and sign-in isn't set up on this server yet.";

/** Said at the end of every AI limit message. */
const STILL_WORKS = "Basic Mode still works, and your draft is kept.";

/** Default copy for the AI quota and request-control errors. */
export const AI_LIMIT_MESSAGES = {
  quota_exhausted: `Google's free Gemini quota for PromptHub is used up for now. ${STILL_WORKS}`,
  user_daily_workflows: `You've used today's AI prompt workflows. They reset at midnight Pacific time. ${STILL_WORKS}`,
  user_daily_refinements: `You've used today's AI refinements (Improve, Shorten, Expand, Tone, Regenerate). They reset at midnight Pacific time. ${STILL_WORKS}`,
  user_per_minute: `You're sending AI requests faster than allowed. Wait a minute and try again. ${STILL_WORKS}`,
  ip_per_minute: `Too many AI requests from this network in the last minute. Wait a minute and try again. ${STILL_WORKS}`,
  global_busy: `PromptHub's AI is at capacity right now. Try again in a minute. ${STILL_WORKS}`,
  daily_budget_exhausted: `PromptHub's free AI capacity for today is used up. It resets at midnight Pacific time. ${STILL_WORKS}`,
  duplicate_request: `That request is already running. Wait for it to finish. ${STILL_WORKS}`,
  too_many_concurrent: `You already have an AI request running. Wait for it to finish. ${STILL_WORKS}`,
  ai_disabled: `AI is turned off on this server right now. ${STILL_WORKS}`,
} as const;

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  // Log a minimal, redacted description server-side; never forward it to the client.
  logServerError("unhandled server error", err);
  return new AppError("internal", INTERNAL_MESSAGE);
}

export function toApiError(err: unknown): ApiError {
  return toAppError(err).toApiError();
}

/** JSON error response: `{ error: ApiError }` with the mapped status, and Retry-After when known. */
export function errorResponse(err: unknown): Response {
  const e = toAppError(err);
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (e.extras.retryAfterSec !== undefined && (e.status === 429 || e.status === 503)) {
    headers["Retry-After"] = String(e.extras.retryAfterSec);
  }
  return Response.json({ error: e.toApiError() }, { status: e.status, headers });
}
