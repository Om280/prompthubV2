/**
 * GET /api/providers (API_CONTRACTS §2). Reports AI availability, which app-wide limits apply, the
 * signed-in user's remaining AI allowance today, and auth status, as `AiStatusResponse`. It never
 * includes keys, tokens or user details.
 *
 * Readiness includes a cached quota-store health check (secret key, privileged, at most once a
 * minute). The user's usage is read through the user's own RLS-protected session, never the secret
 * key, and only after the session verified (`getVerifiedUser`).
 * Node.js runtime is the default; with `cacheComponents` enabled the `runtime` export must not be set.
 */
import { budgetExhaustedUntil } from "@/lib/ai/budget-state";
import { errorResponse } from "@/lib/ai/errors";
import { aiReadinessChecked, aiStatusResponse } from "@/lib/ai/status";
import { getVerifiedUser } from "@/lib/server/auth";
import { readServerEnv } from "@/lib/server/env";
import { readMyUsage } from "@/lib/server/usage";
import { isAuthConfigured } from "@/lib/supabase/config";

export async function GET(request: Request): Promise<Response> {
  // Reading request data makes this handler request-time, so it is never baked into a build-time
  // prerender. It must stay outside try/catch: during the build Next signals the bail-out by
  // throwing here, and that signal must reach Next rather than our error mapper.
  void request.headers.get("accept");
  try {
    const env = readServerEnv();
    const authConfigured = isAuthConfigured();
    const user = authConfigured ? await getVerifiedUser() : null;
    const readiness = await aiReadinessChecked({ env });
    const usage = user && readiness.status === "ready" ? ((await readMyUsage(env)) ?? undefined) : undefined;
    const body = aiStatusResponse({
      authConfigured,
      signedIn: user !== null,
      readiness,
      env,
      budgetExhaustedUntil: budgetExhaustedUntil(),
      usage,
    });
    return Response.json(body, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
