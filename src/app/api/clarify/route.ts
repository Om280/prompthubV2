/**
 * POST /api/clarify (API_CONTRACTS §3). JSON in, JSON out.
 *
 * - `engine: "ai"` → Gemini free tier through `guardAiRoute` (verified user, readiness, ids, quotas,
 *   in-flight lease). A failure is a mapped error; it never falls back to Basic Mode.
 * - otherwise → Basic Mode (public): per-IP limit, per-user limit when signed in, concurrency cap.
 * The body is validated first so the route knows which engine was asked for.
 */
import { schemas, type ClarifyRequest } from "@/lib/contracts";
import { createEngine } from "@/lib/ai/engine";
import { errorResponse } from "@/lib/ai/errors";
import { aiClarify } from "@/lib/ai/gemini/engine";
import { guardAiRoute, guardPublicRoute, type RouteLease } from "@/lib/server/guard";
import { parseJsonBody } from "@/lib/server/http";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request): Promise<Response> {
  let lease: RouteLease | undefined;
  try {
    const body = await parseJsonBody(request, schemas.ClarifyRequest);
    if (body.engine === "ai") {
      const ai = await guardAiRoute<ClarifyRequest>(request, {
        operation: "clarify",
        readInput: async () => body,
        inputText: (b) => b.idea,
        ids: (b) => ({ requestId: b.requestId, workflowId: b.workflowId }),
      });
      // aiClarify settles the lease (usage, release) itself, on success and failure.
      return Response.json(await aiClarify(ai.input, ai), { headers: NO_STORE });
    }
    lease = await guardPublicRoute(request);
    const result = await createEngine().clarify(body, { signal: request.signal });
    return Response.json(result, { headers: NO_STORE });
  } catch (err) {
    return errorResponse(err);
  } finally {
    lease?.release();
  }
}
