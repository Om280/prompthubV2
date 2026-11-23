/**
 * NDJSON streaming for the contract `StreamEvent`s (API_CONTRACTS §4). Server-only.
 * Guarantees: exactly one terminal event (`done` or `error`), always last; nothing after it.
 * When the client aborts, the source iterator is closed (which cancels the provider call in Phase 3).
 */
import type { StreamEvent } from "@/lib/contracts";
import { toApiError } from "@/lib/ai/errors";

export const NDJSON_CONTENT_TYPE = "application/x-ndjson; charset=utf-8";

const isTerminal = (e: StreamEvent) => e.type === "done" || e.type === "error";

/**
 * Builds the streaming response. The first event is pulled before the response is created, so a
 * failure before `meta` (validation, no engine) surfaces as a normal JSON error from the caller.
 */
export async function ndjsonResponse(events: AsyncIterable<StreamEvent>, signal?: AbortSignal): Promise<Response> {
  const it = events[Symbol.asyncIterator]();
  const first = await it.next();
  const encoder = new TextEncoder();
  const line = (e: StreamEvent) => encoder.encode(`${JSON.stringify(e)}\n`);
  let finished = false;

  const close = async (controller: ReadableStreamDefaultController<Uint8Array>) => {
    if (finished) return;
    finished = true;
    controller.close();
    await it.return?.();
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      if (first.done) {
        controller.enqueue(line({ type: "error", error: toApiError(new Error("empty event stream")) }));
        await close(controller);
        return;
      }
      controller.enqueue(line(first.value));
      if (isTerminal(first.value)) await close(controller);
    },
    async pull(controller) {
      if (finished) return;
      if (signal?.aborted) {
        await close(controller);
        return;
      }
      try {
        const r = await it.next();
        if (r.done) {
          // Source ended without a terminal event: report it instead of leaving the client hanging.
          controller.enqueue(line({ type: "error", error: toApiError(new Error("stream ended without done")) }));
          await close(controller);
          return;
        }
        controller.enqueue(line(r.value));
        if (isTerminal(r.value)) await close(controller);
      } catch (err) {
        if (signal?.aborted) {
          await close(controller);
          return;
        }
        controller.enqueue(line({ type: "error", error: toApiError(err) }));
        await close(controller);
      }
    },
    async cancel() {
      finished = true;
      await it.return?.();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": NDJSON_CONTENT_TYPE,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
