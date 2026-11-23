/**
 * GET /api/providers (API_CONTRACTS §2). Reports AI availability and auth status as
 * `AiStatusResponse`. It never includes keys, tokens or user details.
 * Node.js runtime is the default; with `cacheComponents` enabled the `runtime` export must not be set.
 */
import { aiStatusResponse } from "@/lib/ai/status";
import { errorResponse } from "@/lib/ai/errors";
import { getVerifiedUser } from "@/lib/server/auth";
import { isAuthConfigured } from "@/lib/supabase/config";

export async function GET(request: Request): Promise<Response> {
  // Reading request data makes this handler request-time, so it is never baked into a build-time
  // prerender. It must stay outside try/catch: during the build Next signals the bail-out by
  // throwing here, and that signal must reach Next rather than our error mapper.
  void request.headers.get("accept");
  try {
    const authConfigured = isAuthConfigured();
    const user = authConfigured ? await getVerifiedUser() : null;
    return Response.json(aiStatusResponse({ authConfigured, signedIn: user !== null }), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
