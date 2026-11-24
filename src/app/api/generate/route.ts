/**
 * POST /api/generate (API_CONTRACTS §4). Streams NDJSON `StreamEvent`s: meta, delta*, one terminal.
 * Errors before the first event are JSON errors; after it, a terminal `error` event.
 *
 * - `engine: "ai"` → Gemini free tier through `guardAiRoute`; `regenerate: true` counts as a
 *   refinement, otherwise as the idea's workflow. Never falls back to Basic Mode.
 * - otherwise → Basic Mode (public): per-IP limit, per-user limit when signed in, concurrency cap.
 * Every lease is released when the stream ends, errors or the client goes away.
 */
import { schemas, type GenerateRequest } from "@/lib/contracts";
import { createEngine } from "@/lib/ai/engine";
import { errorResponse } from "@/lib/ai/errors";
import { aiGenerate } from "@/lib/ai/gemini/engine";
import { guardAiRoute, guardPublicRoute, type RouteLease } from "@/lib/server/guard";
import { parseJsonBody } from "@/lib/server/http";
import { ndjsonResponse } from "@/lib/server/ndjson";

export async function POST(request: Request): Promise<Response> {
  let lease: RouteLease | undefined;
  try {
    const body = await parseJsonBody(request, schemas.GenerateRequest);
    if (body.engine === "ai") {
      const ai = await guardAiRoute<GenerateRequest>(request, {
        operation: (b) => (b.regenerate ? "regenerate" : "generate"),
        readInput: async () => body,
        inputText: (b) => [b.idea, ...b.answers.map((a) => a.answer)].join("\n"),
        ids: (b) => ({ requestId: b.requestId, workflowId: b.workflowId }),
      });
      lease = ai;
      return await ndjsonResponse(aiGenerate(ai.input, ai), request.signal, ai.release);
    }
    lease = await guardPublicRoute(request);
    const events = createEngine().generate(body, { signal: request.signal });
    return await ndjsonResponse(events, request.signal, lease.release);
  } catch (err) {
    lease?.release();
    return errorResponse(err);
  }
}
