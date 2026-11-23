/**
 * POST /api/generate (API_CONTRACTS §4). Streams NDJSON `StreamEvent`s: meta, delta*, one terminal.
 * Errors before the first event are JSON errors; after it, a terminal `error` event.
 * Public (Basic Mode): per-IP limit, per-user limit when signed in, and the concurrency cap; the
 * concurrency slot is released when the stream ends, errors or the client goes away.
 */
import { schemas } from "@/lib/contracts";
import { createEngine } from "@/lib/ai/engine";
import { errorResponse } from "@/lib/ai/errors";
import { guardPublicRoute, type RouteLease } from "@/lib/server/guard";
import { parseJsonBody } from "@/lib/server/http";
import { ndjsonResponse } from "@/lib/server/ndjson";

export async function POST(request: Request): Promise<Response> {
  let lease: RouteLease | undefined;
  try {
    lease = await guardPublicRoute(request);
    const body = await parseJsonBody(request, schemas.GenerateRequest);
    const events = createEngine().generate(body, { signal: request.signal });
    return await ndjsonResponse(events, request.signal, lease.release);
  } catch (err) {
    lease?.release();
    return errorResponse(err);
  }
}
