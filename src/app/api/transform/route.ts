/**
 * POST /api/transform (API_CONTRACTS §4). Needs an AI provider: in Basic Mode it returns
 * 409 `ai_required` after validating the request.
 */
import { schemas } from "@/lib/contracts";
import { createEngine } from "@/lib/ai/engine";
import { errorResponse } from "@/lib/ai/errors";
import { enforceRateLimit, parseJsonBody } from "@/lib/server/http";
import { ndjsonResponse } from "@/lib/server/ndjson";

export async function POST(request: Request): Promise<Response> {
  try {
    enforceRateLimit(request);
    const body = await parseJsonBody(request, schemas.TransformRequest);
    const events = await createEngine().transform(body, { signal: request.signal });
    return await ndjsonResponse(events, request.signal);
  } catch (err) {
    return errorResponse(err);
  }
}
