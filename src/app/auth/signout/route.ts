/**
 * POST /auth/signout. POST only (other methods get 405 from Next), same-origin only (Origin, or
 * Sec-Fetch-Site when Origin is absent), so another site can't sign a user out. Clears the session
 * cookies via `signOut({ scope: "local" })` (this browser only) and redirects to "/" — or answers
 * JSON when the client asks for it (`Accept: application/json`).
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { logServerError } from "@/lib/server/log";
import { createClient } from "@/lib/supabase/server";

const NO_STORE = "private, no-store";

/** True when the request provably comes from this origin. */
export function isSameOrigin(request: Request): boolean {
  const expected = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin !== null) return origin === expected;
  return request.headers.get("sec-fetch-site") === "same-origin";
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) {
    return Response.json(
      { error: { code: "invalid_request", message: "Sign-out must come from PromptHub itself." } },
      { status: 403, headers: { "Cache-Control": NO_STORE } },
    );
  }

  const supabase = await createClient();
  if (supabase) {
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) logServerError("sign-out reported an error", error);
    } catch (err) {
      // Cookies are cleared locally even when the Auth server can't be reached.
      logServerError("sign-out failed", err);
    }
  }

  // Belt and braces: drop any remaining Supabase auth cookies (including chunked ones).
  try {
    const store = await cookies();
    for (const c of store.getAll()) {
      if (/^sb-.+-auth-token(?:\.\d+)?$/.test(c.name)) store.delete(c.name);
    }
  } catch (err) {
    logServerError("clearing auth cookies failed", err);
  }

  if (request.headers.get("accept")?.includes("application/json")) {
    return Response.json({ signedOut: true }, { headers: { "Cache-Control": NO_STORE } });
  }
  const res = NextResponse.redirect(new URL("/", request.url), 303);
  res.headers.set("Cache-Control", NO_STORE);
  return res;
}
