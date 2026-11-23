/**
 * POST /api/transform (API_CONTRACTS §4), the only AI-only route. `guardAiRoute` runs first: signed
 * out → 401 `auth_required`; then the per-user and per-IP limits and the concurrency cap. This build
 * has no AI generation, so a signed-in user gets 409 `ai_required` after validation.
 */
import { schemas } from "@/lib/contracts";
import { createEngine } from "@/lib/ai/engine";
import { errorResponse } from "@/lib/ai/errors";
import { guardAiRoute, type AiRouteLease } from "@/lib/server/guard";
import { parseJsonBody } from "@/lib/server/http";
import { ndjsonResponse } from "@/lib/server/ndjson";

export async function POST(request: Request): Promise<Response> {
  let lease: AiRouteLease | undefined;
  try {
    lease = await guardAiRoute(request);
    const body = await parseJsonBody(request, schemas.TransformRequest);
    // Phase 3: read the user's key here with `requireUserKey(request)` (src/lib/server/user-key.ts).
    const events = await createEngine().transform(body, { signal: request.signal });
    return await ndjsonResponse(events, request.signal, lease.release);
  } catch (err) {
    lease?.release();
    return errorResponse(err);
  }
}
