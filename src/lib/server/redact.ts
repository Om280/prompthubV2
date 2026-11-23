/**
 * Masks secrets in strings before they are logged. Server-only, dependency-free (so the error mapper
 * can use it without import cycles).
 */

/** Anything that looks like an OpenRouter key, wherever it appears in a string. */
const KEY_ANYWHERE = /sk-or-[A-Za-z0-9_-]{8,}/g;
/** Bearer tokens (access tokens, or keys sent as Authorization) in logged strings. */
const BEARER_ANYWHERE = /\b(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi;
/** JWTs (three base64url segments, the first starting with "eyJ"), e.g. a Supabase access token. */
const JWT_ANYWHERE = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g;

/** Masks every key-like, bearer-token-like or JWT-like substring. Used by the server error logger. */
export function redact(text: string): string {
  return text
    .replace(KEY_ANYWHERE, "sk-or-[redacted]")
    .replace(BEARER_ANYWHERE, "$1[redacted]")
    .replace(JWT_ANYWHERE, "[redacted-jwt]");
}
