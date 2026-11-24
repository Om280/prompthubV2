/**
 * Supabase project settings, shared by the browser and the server.
 *
 * Both values are public by design: the project URL and the publishable key identify the project
 * and are meant to ship to browsers (Row Level Security and the Auth server enforce access). There
 * is no service-role or secret key anywhere in PromptHub.
 *
 * `NEXT_PUBLIC_` values are inlined by `next build`, so they must be set when the app is built.
 * Each is referenced literally (`process.env.NEXT_PUBLIC_…`) so the inlining works.
 * When either is missing or the URL isn't http(s), auth is "not configured": the app runs in Basic
 * Mode without sign-in.
 */
export interface SupabaseConfig {
  url: string;
  publishableKey: string;
}

export function parseSupabaseConfig(url: string | undefined, publishableKey: string | undefined): SupabaseConfig | null {
  const u = url?.trim() ?? "";
  const k = publishableKey?.trim() ?? "";
  if (!u || !k) return null;
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  } catch {
    return null;
  }
  return { url: u.replace(/\/+$/, ""), publishableKey: k };
}

export function getSupabaseConfig(): SupabaseConfig | null {
  return parseSupabaseConfig(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

export function isAuthConfigured(): boolean {
  return getSupabaseConfig() !== null;
}

/** Shown wherever sign-in would be offered when auth isn't configured. */
export const AUTH_NOT_CONFIGURED_REASON = "Sign-in isn't set up on this server yet.";
