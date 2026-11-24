/**
 * GET /auth/callback: the OAuth (PKCE) return leg. Supabase redirects here with `?code=…` after
 * Google approves; the code is exchanged for a session (cookies set on the redirect), then the user
 * goes to `next` — same-origin, path-only, else "/". Failures go to `/?auth_error=<code>`; the UI
 * maps the code to a message, so nothing from the query string is ever reflected.
 */
import { NextResponse } from "next/server";
import { safeNextPath, type AuthErrorCode } from "@/lib/auth/safe-next";
import { logServerError } from "@/lib/server/log";
import { createClient } from "@/lib/supabase/server";

const NO_STORE = { "Cache-Control": "private, no-store" };

function redirectTo(request: Request, path: string): NextResponse {
  const res = NextResponse.redirect(new URL(path, request.url), 303);
  for (const [k, v] of Object.entries(NO_STORE)) res.headers.set(k, v);
  return res;
}

function fail(request: Request, code: AuthErrorCode): NextResponse {
  return redirectTo(request, `/?auth_error=${code}`);
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const next = safeNextPath(url.searchParams.get("next"));
  const providerError = url.searchParams.get("error");
  if (providerError) return fail(request, providerError === "access_denied" ? "access_denied" : "provider_error");

  const code = url.searchParams.get("code");
  if (!code || code.length > 512) return fail(request, "missing_code");

  const supabase = await createClient();
  if (!supabase) return fail(request, "not_configured");

  try {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      logServerError("code exchange failed", error);
      return fail(request, "exchange_failed");
    }
  } catch (err) {
    logServerError("code exchange failed", err);
    return fail(request, "exchange_failed");
  }
  return redirectTo(request, next);
}
