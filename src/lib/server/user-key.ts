/**
 * The user's own OpenRouter key, for future AI routes. Server-only.
 *
 * The browser keeps the key in memory only (`src/lib/client/ai-key.ts`) and sends it per request in
 * the `X-OpenRouter-Key` header. The server reads it from that header and nowhere else (never the
 * body, a cookie, the query string or the environment), validates its shape, uses it for that one
 * request and forgets it. It is never logged, stored, returned or echoed in an error: every server
 * log line goes through `redact()`.
 *
 * No route reads it yet: AI generation isn't built. Future AI routes call `guardAiRoute()` first,
 * then `readUserKey()`.
 */
import { AppError } from "@/lib/ai/errors";

export { redact } from "./redact";

export const USER_KEY_HEADER = "x-openrouter-key";

/**
 * OpenRouter keys look like `sk-or-v1-` followed by 64 hex characters. The check is deliberately a
 * little looser (any version, 32–128 url-safe characters) so a format tweak upstream doesn't lock
 * users out; OpenRouter itself is the real check.
 */
const KEY_SHAPE = /^sk-or-(?:v\d+-)?[A-Za-z0-9_-]{32,128}$/;

export const KEY_REQUIRED_MESSAGE =
  "Connect your OpenRouter key to use AI features. It stays in this browser tab's memory only.";
export const KEY_INVALID_MESSAGE =
  "That doesn't look like an OpenRouter key. Copy the key from openrouter.ai/keys and try again.";

export function isUserKeyShape(value: string): boolean {
  return KEY_SHAPE.test(value);
}

/**
 * Reads the key from the `X-OpenRouter-Key` header. Missing → `null` (the caller decides whether a
 * key is required); present but malformed → 400 `invalid_request`, without echoing the value.
 */
export function readUserKey(request: Request): string | null {
  const raw = request.headers.get(USER_KEY_HEADER);
  if (raw === null || raw.trim() === "") return null;
  const key = raw.trim();
  if (!isUserKeyShape(key)) {
    throw new AppError("invalid_request", KEY_INVALID_MESSAGE, {
      issues: [{ path: "X-OpenRouter-Key", message: "Not an OpenRouter key" }],
    });
  }
  return key;
}

/** Like `readUserKey`, but a missing key is an error too (400 `invalid_request`). */
export function requireUserKey(request: Request): string {
  const key = readUserKey(request);
  if (key === null) {
    throw new AppError("invalid_request", KEY_REQUIRED_MESSAGE, {
      issues: [{ path: "X-OpenRouter-Key", message: "Required" }],
    });
  }
  return key;
}
