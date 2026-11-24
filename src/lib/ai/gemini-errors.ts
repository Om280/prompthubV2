/**
 * Maps errors from the Gemini API (through the AI SDK) to `AppError`. Server-only.
 *
 * Policy: no retries and no fallback (no other model, provider or paid tier). A free-tier
 * `429 RESOURCE_EXHAUSTED` becomes `quota_exhausted` with `resetsAt`. The provider's own message is
 * never logged or forwarded: only its numeric code and status name are logged (redacted).
 *
 * Google's error body: `{ error: { code, message, status, details: [ { "@type": "...RetryInfo",
 * retryDelay: "30s" }, { "@type": "...QuotaFailure", violations: [{ quotaId, quotaMetric }] } ] } }`.
 * The AI SDK's `APICallError` carries it parsed in `data` and the HTTP status in `statusCode`; a
 * `RetryError` (not expected with `maxRetries: 0`) wraps it in `lastError`.
 */
import "server-only";
import { logServerError } from "@/lib/server/log";
import { nextPacificMidnight, secondsUntil } from "@/lib/server/quota-windows";
import { noteBudgetExhausted } from "./budget-state";
import { AI_LIMIT_MESSAGES, AppError } from "./errors";

interface GoogleErrorDetail {
  "@type"?: string;
  retryDelay?: string;
  violations?: { quotaId?: string; quotaMetric?: string }[];
}

interface GoogleErrorShape {
  code?: number;
  status?: string;
  message?: string;
  details?: GoogleErrorDetail[];
}

const STILL_WORKS = "Basic Mode still works, and your draft is kept.";

export const PROVIDER_UNAVAILABLE_MESSAGE = `Gemini couldn't complete this request right now. Try again in a minute. ${STILL_WORKS}`;
export const GEMINI_TIMEOUT_MESSAGE = `Gemini took too long to answer, so PromptHub stopped the request. Try again in a minute. ${STILL_WORKS}`;
export const GEMINI_MODEL_REJECTED_MESSAGE = `AI isn't working on this server right now: Gemini didn't accept the configured model. ${STILL_WORKS}`;
export const GEMINI_KEY_REJECTED_MESSAGE = `AI isn't working on this server right now: Gemini didn't accept the server's credentials. ${STILL_WORKS}`;
export const GEMINI_NETWORK_MESSAGE = `PromptHub couldn't reach Gemini. Try again in a minute. ${STILL_WORKS}`;
export const GEMINI_SAFETY_MESSAGE = `Gemini's safety filters blocked this request. Rephrase it and try again. ${STILL_WORKS}`;
export const GEMINI_INVALID_OUTPUT_MESSAGE = `Gemini's answer didn't come back in the expected shape, even after one retry. Try again. ${STILL_WORKS}`;
export const GEMINI_TRUNCATED_MESSAGE = `Gemini ran out of output room before it finished. Try again, or choose a shorter length. ${STILL_WORKS}`;

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

/** Pulls `{ code, status, details }` out of an SDK error, a fetch Response body or a plain object. */
function googleError(err: unknown): GoogleErrorShape {
  let o = asRecord(err);
  if (!o) return {};
  // RetryError → lastError (defensive: retries are off).
  if (asRecord(o.lastError) && o.name === "AI_RetryError") o = asRecord(o.lastError)!;
  // APICallError: parsed body in `data`, HTTP status in `statusCode`.
  const data = asRecord(o.data);
  const fromData = data && asRecord(data.error) ? (data.error as GoogleErrorShape) : null;
  if (fromData) return { ...fromData, code: fromData.code ?? (typeof o.statusCode === "number" ? o.statusCode : undefined) };
  const inner = asRecord(o.error) as GoogleErrorShape | null;
  if (inner) return inner;
  const code =
    typeof o.code === "number"
      ? o.code
      : typeof o.statusCode === "number"
        ? o.statusCode
        : typeof o.status === "number"
          ? o.status
          : undefined;
  const status = typeof o.status === "string" ? o.status : undefined;
  return { code, status, details: Array.isArray(o.details) ? (o.details as GoogleErrorDetail[]) : undefined };
}

function parseDelaySeconds(raw: string | undefined): number | null {
  const m = raw?.match(/^(\d+(?:\.\d+)?)s$/);
  return m ? Math.ceil(Number(m[1])) : null;
}

/** A network-level failure (DNS, reset, offline) with no HTTP response. */
function isNetworkError(err: unknown): boolean {
  const o = asRecord(err);
  if (!o) return false;
  if (typeof o.statusCode === "number" || asRecord(o.data)) return false;
  const cause = asRecord(o.cause);
  const code = typeof cause?.code === "string" ? cause.code : typeof o.code === "string" ? o.code : "";
  return (
    /^(ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|UND_ERR_\w+)$/.test(code) ||
    (o.name === "TypeError" && /fetch failed/i.test(String(o.message ?? "")))
  );
}

export function mapGeminiError(err: unknown, now: Date = new Date()): AppError {
  // Callers handle client aborts and timeouts before mapping; an abort is not a provider failure.
  if (err instanceof AppError) return err;
  if (isNetworkError(err)) {
    logServerError("gemini request failed", "network");
    return new AppError("provider_unavailable", GEMINI_NETWORK_MESSAGE);
  }
  const g = googleError(err);
  logServerError("gemini request failed", `${g.code ?? "?"} ${g.status ?? ""}`.trim());

  if (g.code === 429 || g.status === "RESOURCE_EXHAUSTED") {
    const details = g.details ?? [];
    const perDay = details.some((d) => (d.violations ?? []).some((v) => /day/i.test(`${v.quotaId ?? ""}${v.quotaMetric ?? ""}`)));
    const delay = parseDelaySeconds(details.find((d) => d["@type"]?.endsWith("RetryInfo"))?.retryDelay);
    const resetsAt = perDay || delay === null ? nextPacificMidnight(now) : new Date(now.getTime() + delay * 1000).toISOString();
    if (perDay) noteBudgetExhausted(resetsAt);
    return new AppError("quota_exhausted", AI_LIMIT_MESSAGES.quota_exhausted, {
      resetsAt,
      retryAfterSec: secondsUntil(new Date(resetsAt), now),
    });
  }
  if (g.code === 404 || g.status === "NOT_FOUND") return new AppError("provider_unavailable", GEMINI_MODEL_REJECTED_MESSAGE);
  if (g.code === 401 || g.code === 403 || g.status === "UNAUTHENTICATED" || g.status === "PERMISSION_DENIED") {
    return new AppError("provider_unavailable", GEMINI_KEY_REJECTED_MESSAGE);
  }
  if (g.code === 504 || g.status === "DEADLINE_EXCEEDED") return new AppError("provider_unavailable", GEMINI_TIMEOUT_MESSAGE);
  // Everything else (region, 5xx, bad request from our side) is "provider unavailable".
  return new AppError("provider_unavailable", PROVIDER_UNAVAILABLE_MESSAGE);
}
