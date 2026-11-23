/**
 * Verified server-side identity. Server-only.
 *
 * `getVerifiedUser()` is the only way server code learns who the user is. It calls
 * `supabase.auth.getClaims()`, which verifies the access token's signature (locally against the
 * project's JWKS for asymmetric keys, or via the Auth server otherwise) and its expiry, refreshing
 * the session first when it is about to expire. It never uses `getSession()`'s user (that is read
 * from a cookie without verification) and never reads a user id from headers, the body or the query.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthUser } from "@/lib/contracts";
import { createClient } from "@/lib/supabase/server";
import { logServerError } from "./log";

export type VerifiedUser = AuthUser;

/** The subset of the Supabase client this module uses; lets tests inject a mock. */
export type ClaimsClient = Pick<SupabaseClient, "auth">;

export interface GetVerifiedUserOptions {
  /** Injected for tests. Defaults to the request-scoped server client (null when not configured). */
  client?: ClaimsClient | null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Maps verified JWT claims to the app's user shape. Returns null when the claims aren't a user. */
export function userFromClaims(claims: Record<string, unknown> | null | undefined): VerifiedUser | null {
  if (!claims) return null;
  const id = str(claims.sub);
  if (!id) return null;
  // Supabase issues `role: "authenticated"` for signed-in users; anything else is not a user session.
  if (claims.role !== undefined && claims.role !== "authenticated") return null;
  const meta = (claims.user_metadata && typeof claims.user_metadata === "object" ? claims.user_metadata : {}) as Record<
    string,
    unknown
  >;
  return {
    id,
    email: str(claims.email) ?? str(meta.email),
    name: str(meta.full_name) ?? str(meta.name),
    avatarUrl: safeAvatarUrl(str(meta.avatar_url) ?? str(meta.picture)),
  };
}

/** Only https avatars (Google's are); anything else is dropped so the UI falls back to initials. */
function safeAvatarUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * The signed-in user for the current request, verified with `getClaims()`, or null when signed out,
 * expired, forged, or when auth isn't configured. A verification failure is "signed out".
 *
 * Errors from reading the request (`cookies()`) are not caught on purpose: during prerendering Next
 * signals "this is request-time" by rejecting there, and that signal must reach Next.
 */
export async function getVerifiedUser(options: GetVerifiedUserOptions = {}): Promise<VerifiedUser | null> {
  const client: ClaimsClient | null = options.client !== undefined ? options.client : await createClient();
  if (!client) return null;
  try {
    const { data, error } = await client.auth.getClaims();
    if (error || !data) return null;
    return userFromClaims(data.claims as unknown as Record<string, unknown>);
  } catch (err) {
    logServerError("session verification failed", err);
    return null;
  }
}
