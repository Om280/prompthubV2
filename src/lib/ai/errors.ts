/**
 * Error mapping to the contract `ApiError` (API_CONTRACTS §5). Server-only.
 * Messages are user-facing and specific; they never include provider internals or env values.
 */
import type { ApiError, ApiErrorCode } from "@/lib/contracts";
import { logServerError } from "@/lib/server/log";

export const STATUS_FOR: Record<ApiErrorCode, number> = {
  invalid_request: 400,
  auth_required: 401,
  ai_required: 409,
  rate_limited: 429,
  too_many_concurrent: 429,
  provider_unavailable: 502,
  invalid_output: 502,
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
  "Improve, Shorten, Expand and Tone need AI. AI with your own OpenRouter key is coming in a later update.";

export const AUTH_REQUIRED_MESSAGE = "Sign in with Google to use AI features.";
export const AUTH_NOT_CONFIGURED_MESSAGE =
  "AI features need you to sign in, and sign-in isn't set up on this server yet.";

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  // Log a minimal, redacted description server-side; never forward it to the client.
  logServerError("unhandled server error", err);
  return new AppError("internal", INTERNAL_MESSAGE);
}

export function toApiError(err: unknown): ApiError {
  return toAppError(err).toApiError();
}

/** JSON error response: `{ error: ApiError }` with the mapped status (and Retry-After on 429). */
export function errorResponse(err: unknown): Response {
  const e = toAppError(err);
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (e.code === "rate_limited" && e.extras.retryAfterSec !== undefined) {
    headers["Retry-After"] = String(e.extras.retryAfterSec);
  }
  return Response.json({ error: e.toApiError() }, { status: e.status, headers });
}
