/**
 * Masks secrets in strings before they are logged. Server-only, dependency-free (so the error mapper
 * can use it without import cycles).
 */
// import "server-only" is added once the Vitest alias for it exists (see the Gemini report).

/** Google API keys (the Gemini key format), wherever they appear in a string. */
const GOOGLE_KEY_ANYWHERE = /AIza[0-9A-Za-z_-]{35}/g;
/** Bearer tokens in logged strings. */
const BEARER_ANYWHERE = /\b(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi;
/** JWTs (three base64url segments, the first starting with "eyJ"), e.g. a Supabase access token. */
const JWT_ANYWHERE = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g;

/** Secret env values that must never be printed, even if their format is unusual. */
const SECRET_ENV = ["GEMINI_API_KEY", "SUPABASE_SECRET_KEY"] as const;

/**
 * Masks Google API keys, bearer tokens, JWTs and the literal values of `GEMINI_API_KEY` and
 * `SUPABASE_SECRET_KEY` (read at call time). Used by the server error logger.
 */
export function redact(text: string, env: Record<string, string | undefined> = process.env): string {
  let out = text;
  for (const name of SECRET_ENV) {
    const value = env[name]?.trim();
    // Very short values would mask ordinary words; real keys are long.
    if (value && value.length >= 8) out = out.split(value).join(`[redacted-${name.toLowerCase()}]`);
  }
  return out
    .replace(GOOGLE_KEY_ANYWHERE, "[redacted-google-key]")
    .replace(BEARER_ANYWHERE, "$1[redacted]")
    .replace(JWT_ANYWHERE, "[redacted-jwt]");
}
