/**
 * POST /api/generate (API_CONTRACTS §4). Streams NDJSON `StreamEvent`s: meta, delta*, one terminal.
 * Errors before the first event are JSON errors; after it, a terminal `error` event.
 */
import { schemas } from "@/lib/contracts";
import { createEngine } from "@/lib/ai/engine";
import { errorResponse } from "@/lib/ai/errors";
import { enforceRateLimit, parseJsonBody } from "@/lib/server/http";
import { ndjsonResponse } from "@/lib/server/ndjson";

export async function POST(request: Request): Promise<Response> {
  try {
    enforceRateLimit(request);
    const body = await parseJsonBody(request, schemas.GenerateRequest);
    const events = createEngine().generate(body, { signal: request.signal });
    return await ndjsonResponse(events, request.signal);
  } catch (err) {
    return errorResponse(err);
  }
}
