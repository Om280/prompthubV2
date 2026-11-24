/**
 * Server Supabase client for Server Components and Route Handlers (`createServerClient` with the
 * Next 16 async `cookies()` store, using the documented `getAll`/`setAll` pattern). Server-only.
 *
 * Create a new client per request; never share one. Server Components can't write cookies, so
 * `setAll` swallows that error there: the proxy (`src/proxy.ts`) refreshes sessions and writes the
 * cookies instead. Route Handlers can write them, so a refresh or sign-in there sets cookies on the
 * response.
 *
 * Identity on the server always comes from `getVerifiedUser()` (`src/lib/server/auth.ts`), which
 * verifies the access token with `getClaims()`. Never trust `getSession()` here.
 */
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "./config";

/** The request-scoped server client, or null when auth isn't configured. */
export async function createClient(): Promise<SupabaseClient | null> {
  const config = getSupabaseConfig();
  if (!config) return null;
  const cookieStore = await cookies();
  return createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are read-only there. The proxy refreshes the
          // session, so this is safe to ignore.
        }
      },
    },
  });
}
