/**
 * Post-sign-in redirect targets. Shared by the browser (building `redirectTo`) and /auth/callback.
 *
 * Only same-origin, path-only targets are allowed: a single leading "/", no "//" (protocol-relative),
 * no backslashes (browsers treat "/\evil.com" as "//evil.com"), no control characters, no scheme.
 * Anything else becomes "/".
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  // Backslashes anywhere and control characters (incl. tab/newline, which URL parsing strips).
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return "/";
  try {
    const base = "http://prompthub.invalid";
    const url = new URL(raw, base);
    if (url.origin !== base) return "/";
    const path = `${url.pathname}${url.search}${url.hash}`;
    return path.startsWith("//") ? "/" : path;
  } catch {
    return "/";
  }
}

/** Codes the callback puts in `/?auth_error=`. The UI maps each to a message; nothing else is shown. */
export const AUTH_ERROR_CODES = ["missing_code", "exchange_failed", "access_denied", "provider_error", "not_configured"] as const;
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  missing_code: "Sign-in didn't finish: Google didn't send PromptHub a sign-in code. Try signing in again.",
  exchange_failed: "Sign-in didn't finish: the sign-in link expired or was already used. Try signing in again.",
  access_denied: "Sign-in was cancelled. You can keep using Basic Mode, or sign in again any time.",
  provider_error: "Google couldn't complete the sign-in. Try again in a minute.",
  not_configured: "Sign-in isn't set up on this server yet.",
};

export function authErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return (AUTH_ERROR_CODES as readonly string[]).includes(code)
    ? AUTH_ERROR_MESSAGES[code as AuthErrorCode]
    : AUTH_ERROR_MESSAGES.provider_error;
}
