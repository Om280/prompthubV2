/**
 * Browser auth actions: read the verified session, start Google sign-in, sign out. Client-side.
 *
 * Identity shown in the UI comes from GET /api/session, which the server verifies with
 * `getClaims()`. The browser Supabase client is used only to start the OAuth (PKCE) redirect.
 */
import { schemas, type SessionResponse } from "@/lib/contracts";
import { safeNextPath } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/client";

export const SIGN_IN_FAILED_MESSAGE = "Couldn't start Google sign-in. Check your connection and try again.";
export const SIGN_OUT_FAILED_MESSAGE = "Couldn't sign out. Check your connection and try again.";

export interface AuthDeps {
  fetch?: typeof fetch;
}

/** GET /api/session. Throws on network or contract failure. */
export async function fetchSession(deps: AuthDeps = {}): Promise<SessionResponse> {
  const doFetch = deps.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const res = await doFetch("/api/session", { method: "GET", cache: "no-store", credentials: "same-origin" });
  if (!res.ok) throw new Error(`session ${res.status}`);
  const parsed = schemas.SessionResponse.safeParse(await res.json());
  if (!parsed.success) throw new Error("session response invalid");
  return parsed.data;
}

/** The callback URL Google (via Supabase) returns to, with a sanitised `next`. */
export function callbackUrl(origin: string, next: string): string {
  return `${origin}/auth/callback?next=${encodeURIComponent(safeNextPath(next))}`;
}

/**
 * Starts "Sign in with Google". On success the browser navigates away to Google, so this resolves
 * only on failure (with an error message) or just before the redirect (null).
 */
export async function signInWithGoogle(next: string): Promise<string | null> {
  const supabase = createClient();
  if (!supabase) return "Sign-in isn't set up on this server yet.";
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl(window.location.origin, next) },
    });
    return error ? SIGN_IN_FAILED_MESSAGE : null;
  } catch {
    return SIGN_IN_FAILED_MESSAGE;
  }
}

/** POST /auth/signout. Returns an error message, or null on success. */
export async function signOut(deps: AuthDeps = {}): Promise<string | null> {
  const doFetch = deps.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  try {
    const res = await doFetch("/auth/signout", {
      method: "POST",
      headers: { accept: "application/json" },
      credentials: "same-origin",
    });
    return res.ok ? null : SIGN_OUT_FAILED_MESSAGE;
  } catch {
    return SIGN_OUT_FAILED_MESSAGE;
  }
}
