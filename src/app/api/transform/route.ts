/**
 * POST /api/transform (API_CONTRACTS §4), the only AI-only route. `guardAiRoute` runs first:
 * signed out → 401 `auth_required`; then body validation; then AI readiness (409 `ai_required`);
 * then the requestId and input-size rules and the persistent in-flight lease and quotas. The
 * Gemini call gets the lease signal (client abort + AI_TIMEOUT_MS) and settles the lease
 * (reconcile, record usage, release) when the stream ends for any reason.
 */
import { schemas, type TransformRequest } from "@/lib/contracts";
import { errorResponse } from "@/lib/ai/errors";
import { aiTransform } from "@/lib/ai/gemini/engine";
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
    return await ndjsonResponse(aiTransform(lease.input, lease), request.signal, lease.release);
  } catch (err) {
    lease?.release();
    return errorResponse(err);
  }
}
