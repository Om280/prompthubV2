/**
 * Error mapping to the contract `ApiError` (API_CONTRACTS §5). Server-only.
 * Messages are user-facing and specific; they never include provider internals or env values.
 */
import type { ApiError, ApiErrorCode } from "@/lib/contracts";

export const STATUS_FOR: Record<ApiErrorCode, number> = {
  invalid_request: 400,
  ai_required: 409,
  rate_limited: 429,
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
  "Improve, Shorten, Expand and Tone need an AI provider. This build runs in Basic Mode.";

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  // Log a minimal, key-free description server-side; never forward it to the client.
  console.error("[prompthub] unhandled server error:", err instanceof Error ? `${err.name}: ${err.message}` : typeof err);
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
