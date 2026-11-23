/**
 * Route-boundary helpers: body size cap, JSON parsing, Zod validation, rate limiting. Server-only.
 */
import type { z } from "zod";
import { AppError } from "@/lib/ai/errors";
import { aiRateLimiter, clientKey, type RateLimiter } from "./rate-limit";

export const MAX_BODY_BYTES = 64 * 1024;

const TOO_LARGE =
  "The request is larger than 64 KB. Shorten the idea or the pasted material and try again.";

/** Reads the body as text, stopping as soon as it passes the cap. Oversize → 413 invalid_request. */
export async function readBodyText(request: Request, limit = MAX_BODY_BYTES): Promise<string> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) {
    throw new AppError("invalid_request", TOO_LARGE, {}, 413);
  }
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      throw new AppError("invalid_request", TOO_LARGE, {}, 413);
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

/** Parses and validates a JSON body against a contract schema. Failures → 400 invalid_request with issues. */
export async function parseJsonBody<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S>> {
  const text = await readBodyText(request);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new AppError("invalid_request", "The request body must be valid JSON.", {
      issues: [{ path: "", message: "Body is not valid JSON" }],
    });
  }
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({
      path: i.path.map(String).join("."),
      message: i.message,
    }));
    const fields = [...new Set(issues.map((i) => i.path || "body"))].join(", ");
    throw new AppError("invalid_request", `Some fields are missing or invalid: ${fields}.`, { issues });
  }
  return result.data;
}

/** Applies the shared AI-route limiter. Over the limit → 429 rate_limited with retryAfterSec. */
export function enforceRateLimit(request: Request, limiter: RateLimiter = aiRateLimiter): void {
  const r = limiter.check(clientKey(request));
  if (!r.ok) {
    throw new AppError(
      "rate_limited",
      `Too many requests in a short time. Wait ${r.retryAfterSec} second${r.retryAfterSec === 1 ? "" : "s"} and try again.`,
      { retryAfterSec: r.retryAfterSec },
    );
  }
}
