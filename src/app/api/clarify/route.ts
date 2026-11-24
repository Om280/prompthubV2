/**
 * POST /api/clarify (API_CONTRACTS §3). JSON in, JSON out. Public (Basic Mode): per-IP limit, per-user
 * limit when signed in, and the concurrency cap.
 */
import { schemas } from "@/lib/contracts";
import { createEngine } from "@/lib/ai/engine";
import { errorResponse } from "@/lib/ai/errors";
import { guardPublicRoute, type RouteLease } from "@/lib/server/guard";
import { parseJsonBody } from "@/lib/server/http";

export async function POST(request: Request): Promise<Response> {
  let lease: RouteLease | undefined;
  try {
    lease = await guardPublicRoute(request);
    const body = await parseJsonBody(request, schemas.ClarifyRequest);
    const result = await createEngine().clarify(body, { signal: request.signal });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  } finally {
    lease?.release();
  }
}
