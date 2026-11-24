/**
 * Maps errors from the Gemini API to `AppError`. Server-only. Written ahead of Phase 3 so the
 * mapping is tested before any call exists.
 *
 * Policy: no retries and no fallback (no other model, provider or paid tier). A free-tier
 * `429 RESOURCE_EXHAUSTED` becomes `quota_exhausted` with `resetsAt`; the provider's own message is
 * logged (redacted) and never forwarded.
 *
 * Google's error body: `{ error: { code, message, status, details: [ { "@type": "...RetryInfo",
 * retryDelay: "30s" }, { "@type": "...QuotaFailure", violations: [{ quotaId, quotaMetric }] } ] } }`.
 */
import { logServerError } from "@/lib/server/log";
import { nextPacificMidnight, secondsUntil } from "@/lib/server/quota-windows";
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

export const PROVIDER_UNAVAILABLE_MESSAGE =
  "Gemini couldn't complete this request right now. Try again in a minute. Basic Mode still works, and your draft is kept.";

/** Pulls `{ code, status, details }` out of an SDK error, a fetch Response body or a plain object. */
function googleError(err: unknown): GoogleErrorShape {
  if (!err || typeof err !== "object") return {};
  const o = err as Record<string, unknown>;
  const inner = (o.error && typeof o.error === "object" ? o.error : null) as GoogleErrorShape | null;
  if (inner) return inner;
  const code = typeof o.code === "number" ? o.code : typeof o.status === "number" ? o.status : undefined;
  const status = typeof o.status === "string" ? o.status : undefined;
  return { code, status, details: Array.isArray(o.details) ? (o.details as GoogleErrorDetail[]) : undefined };
}

function parseDelaySeconds(raw: string | undefined): number | null {
  const m = raw?.match(/^(\d+(?:\.\d+)?)s$/);
  return m ? Math.ceil(Number(m[1])) : null;
}

export function mapGeminiError(err: unknown, now: Date = new Date()): AppError {
  // Callers handle client aborts before mapping; an abort is not a provider failure.
  if (err instanceof AppError) return err;
  const g = googleError(err);
  logServerError("gemini request failed", `${g.code ?? "?"} ${g.status ?? ""}`.trim());

  if (g.code === 429 || g.status === "RESOURCE_EXHAUSTED") {
    const details = g.details ?? [];
    const perDay = details.some((d) => (d.violations ?? []).some((v) => /day/i.test(`${v.quotaId ?? ""}${v.quotaMetric ?? ""}`)));
    const delay = parseDelaySeconds(details.find((d) => d["@type"]?.endsWith("RetryInfo"))?.retryDelay);
    const resetsAt = perDay || delay === null ? nextPacificMidnight(now) : new Date(now.getTime() + delay * 1000).toISOString();
    return new AppError("quota_exhausted", AI_LIMIT_MESSAGES.quota_exhausted, {
      resetsAt,
      retryAfterSec: secondsUntil(new Date(resetsAt), now),
    });
  }
  // Everything else (bad key, permission, region, 5xx, timeout, network) is "provider unavailable".
  // Bad requests from our side are programming errors, but the user sees the same honest message.
  return new AppError("provider_unavailable", PROVIDER_UNAVAILABLE_MESSAGE);
}
