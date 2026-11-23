/**
 * Browser Supabase client (`@supabase/ssr` `createBrowserClient`). Client-side only.
 *
 * The session lives in cookies (set by `@supabase/ssr`) so the server can verify it. PKCE is the
 * default flow of `@supabase/ssr`: the code verifier is kept in a cookie until /auth/callback
 * exchanges the code. `createBrowserClient` returns a singleton in the browser.
 */
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./config";

/** The browser client, or null when auth isn't configured on this build. */
export function createClient(): SupabaseClient | null {
  const config = getSupabaseConfig();
  if (!config) return null;
  return createBrowserClient(config.url, config.publishableKey);
}
