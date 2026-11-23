/**
 * POST /api/clarify (API_CONTRACTS §3). JSON in, JSON out.
 */
import { schemas } from "@/lib/contracts";
import { createEngine } from "@/lib/ai/engine";
import { errorResponse } from "@/lib/ai/errors";
import { enforceRateLimit, parseJsonBody } from "@/lib/server/http";

export async function POST(request: Request): Promise<Response> {
  try {
    enforceRateLimit(request);
    const body = await parseJsonBody(request, schemas.ClarifyRequest);
    const result = await createEngine().clarify(body, { signal: request.signal });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
