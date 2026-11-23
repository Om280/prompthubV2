/**
 * GET /api/providers (API_CONTRACTS §2). Reports which engines are available; never includes keys.
 * Node.js runtime is the default; with `cacheComponents` enabled the `runtime` export must not be set.
 */
import { errorResponse } from "@/lib/ai/errors";
import { buildRegistry, providersResponse } from "@/lib/ai/registry";

export async function GET(request: Request): Promise<Response> {
  // Reading request data makes this handler request-time, so env is read per request and never baked
  // into a build-time prerender. It must stay outside try/catch: during the build Next signals the
  // bail-out by throwing here, and that signal must reach Next rather than our error mapper.
  void request.headers.get("accept");
  try {
    return Response.json(providersResponse(buildRegistry()), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
