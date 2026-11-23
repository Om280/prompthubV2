import { schemas, type ApiError, type StreamEvent } from "@/lib/contracts";
import { isAbortError } from "./types";

/** Shown when a stream ends without `done` or `error` (DESIGN §8). */
export const DROPPED_MESSAGE = "The connection dropped while writing. Kept what was written so far.";
/** Shown when the server sends a line that is not a valid StreamEvent. */
export const UNREADABLE_MESSAGE = "The server sent a response PromptHub couldn't read. Try again.";

export const DROPPED_ERROR: ApiError = { code: "internal", message: DROPPED_MESSAGE };
export const UNREADABLE_ERROR: ApiError = { code: "internal", message: UNREADABLE_MESSAGE };

/**
 * Splits a byte stream into text lines. Decodes with `stream: true`, so a multi-byte UTF-8
 * character split across two chunks is joined before decoding. A trailing line without "\n" is
 * yielded when the stream ends. "\r\n" endings are accepted.
 */
export async function* readLines(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let finished = false;
  const onAbort = () => void reader.cancel().catch(() => {});
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    while (true) {
      if (signal?.aborted) return;
      const { value, done } = await reader.read();
      if (done) {
        finished = true;
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let nl = buffer.indexOf("\n");
      while (nl !== -1) {
        const line = buffer.slice(0, nl).replace(/\r$/, "");
        buffer = buffer.slice(nl + 1);
        if (line.trim()) yield line;
        nl = buffer.indexOf("\n");
      }
    }
    buffer += decoder.decode();
    const rest = buffer.replace(/\r$/, "");
    if (rest.trim()) yield rest;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    // The consumer stopped early (terminal event, abort): free the connection.
    if (!finished) void reader.cancel().catch(() => {});
    try {
      reader.releaseLock();
    } catch {
      // A pending read can keep the lock in older runtimes; cancel() above settles it.
    }
  }
}

/** Parses one NDJSON line into a contract-valid StreamEvent, or null. */
export function parseEventLine(line: string): StreamEvent | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  const parsed = schemas.StreamEvent.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Reads a `application/x-ndjson` body into typed events (API_CONTRACTS §4). Guarantees exactly one
 * terminal event unless aborted:
 * - an invalid line ends the stream with an `internal` error;
 * - a body that ends (or breaks) without `done`/`error` ends with the "connection dropped" error;
 * - anything after the terminal event is ignored;
 * - when `signal` aborts, the generator returns quietly with no terminal event.
 */
export async function* readEventStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  try {
    for await (const line of readLines(body, signal)) {
      if (signal?.aborted) return;
      const ev = parseEventLine(line);
      if (!ev) {
        yield { type: "error", error: UNREADABLE_ERROR };
        return;
      }
      yield ev;
      if (ev.type === "done" || ev.type === "error") return;
    }
  } catch (e) {
    if (signal?.aborted || isAbortError(e)) return;
    yield { type: "error", error: DROPPED_ERROR };
    return;
  }
  if (signal?.aborted) return;
  yield { type: "error", error: DROPPED_ERROR };
}
