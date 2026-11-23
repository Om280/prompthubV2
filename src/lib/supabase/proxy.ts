/**
 * Session refresher for `src/proxy.ts` (Next 16's renamed middleware), following the Supabase SSR
 * pattern: a fresh `createServerClient` per request with `getAll`/`setAll` over the request and
 * response cookies, then `getClaims()`, which verifies the access token and refreshes it when it is
 * about to expire. Refreshed cookies go to Server Components (request cookies) and to the browser
 * (response cookies), together with the no-cache headers `@supabase/ssr` asks for.
 *
 * No-op when auth isn't configured. It never trusts `getSession()`.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "./config";

/** Pages that need a verified user; anyone else is sent to `/?signin=required`. */
const PROTECTED_PAGES = ["/account"];

export function isProtectedPage(pathname: string): boolean {
  return PROTECTED_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const config = getSupabaseConfig();
  if (!config) return NextResponse.next({ request });

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => supabaseResponse.headers.set(key, value));
      },
    },
  });

  // Nothing may run between createServerClient and getClaims (Supabase SSR guidance): getClaims
  // loads and, when needed, refreshes the session through setAll above.
  let verified = false;
  try {
    const { data, error } = await supabase.auth.getClaims();
    verified = !error && typeof data?.claims?.sub === "string";
  } catch {
    // Auth server unreachable: treat as signed out for this request; never block the page.
    verified = false;
  }

  if (!verified && isProtectedPage(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "?signin=required";
    const redirect = NextResponse.redirect(url);
    // Keep any cookie changes (e.g. a cleared, expired session) on the redirect.
    supabaseResponse.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    redirect.headers.set("Cache-Control", "private, no-store");
    return redirect;
  }

  // Return supabaseResponse as built by setAll, so the browser and server stay in sync.
  return supabaseResponse;
}
