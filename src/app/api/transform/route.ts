/**
 * POST /api/transform (API_CONTRACTS §4), the only AI-only route. `guardAiRoute` runs first:
 * signed out → 401 `auth_required`; then body validation; then AI readiness (409 `ai_required` in
 * this build, where AI generation isn't built); then the requestId and input-size rules and the
 * persistent in-flight lease and quotas.
 */
import { schemas, type TransformRequest } from "@/lib/contracts";
import { createEngine } from "@/lib/ai/engine";
import { errorResponse } from "@/lib/ai/errors";
import { guardAiRoute, type AiRouteLease } from "@/lib/server/guard";
import { parseJsonBody } from "@/lib/server/http";
import { ndjsonResponse } from "@/lib/server/ndjson";

export async function POST(request: Request): Promise<Response> {
  let lease: AiRouteLease<TransformRequest> | undefined;
  try {
    lease = await guardAiRoute(request, {
      operation: (b) => b.action,
      readInput: () => parseJsonBody(request, schemas.TransformRequest),
      inputText: (b) => `${b.text}${b.idea ?? ""}`,
      ids: (b) => ({ requestId: b.requestId }),
    });
    // The AI integration phase passes lease.signal (client abort + AI_TIMEOUT_MS) to the Gemini call,
    // then lease.reconcileTokens(...) and lease.recordUsage(...).
    const events = await createEngine().transform(lease.input, { signal: lease.signal });
    return await ndjsonResponse(events, request.signal, lease.release);
  } catch (err) {
    lease?.release();
    return errorResponse(err);
  }
}
