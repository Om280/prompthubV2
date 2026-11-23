/**
 * Next 16 Proxy (formerly middleware): refreshes the Supabase session cookie on each page and API
 * request and guards /account. A no-op when auth isn't configured. Runs on the Node.js runtime (the
 * Proxy default; a `runtime` export isn't allowed here).
 */
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Every path except static assets:
     * - _next/static, _next/image (build output, image optimisation)
     * - favicon.ico and files with a static-asset extension
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|woff2?)$).*)",
  ],
};
