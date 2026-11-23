import { describe, expect, it } from "vitest";
import type { StreamEvent } from "@/lib/contracts";
import {
  DROPPED_ERROR,
  parseEventLine,
  readEventStream,
  readLines,
  UNREADABLE_ERROR,
} from "@/lib/client/ndjson";

const enc = new TextEncoder();

function bytesStream(chunks: Uint8Array[], opts: { failAfter?: boolean } = {}): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(chunks[i++]);
      else if (opts.failAfter) controller.error(new TypeError("network error"));
      else controller.close();
    },
  });
}

const textStream = (chunks: string[], opts?: { failAfter?: boolean }) =>
  bytesStream(
    chunks.map((c) => enc.encode(c)),
    opts,
  );

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

const META = { type: "meta", engine: { kind: "basic" }, requestId: "r1" } as const;
const line = (ev: unknown) => `${JSON.stringify(ev)}\n`;

describe("readLines", () => {
  it("joins lines split across chunks and handles CRLF and a final line without newline", async () => {
    const lines = await collect(readLines(textStream(['{"a":', '1}\r\n{"b"', ":2}\n\n", '{"c":3}'])));
    expect(lines).toEqual(['{"a":1}', '{"b":2}', '{"c":3}']);
  });

  it("decodes a multi-byte UTF-8 character split across chunks", async () => {
    const bytes = enc.encode(`${JSON.stringify({ t: "Café 😀 naïve" })}\n`);
    // Split inside the 4-byte emoji and inside the 2-byte "é".
    const emoji = bytes.indexOf(0xf0);
    const e = bytes.indexOf(0xc3);
    const parts = [bytes.slice(0, e + 1), bytes.slice(e + 1, emoji + 2), bytes.slice(emoji + 2)];
    const lines = await collect(readLines(bytesStream(parts)));
    expect(JSON.parse(lines[0])).toEqual({ t: "Café 😀 naïve" });
  });
});

describe("parseEventLine", () => {
  it("accepts contract events and rejects invalid JSON or shapes", () => {
    expect(parseEventLine(JSON.stringify(META))).toEqual(META);
    expect(parseEventLine("{nope")).toBeNull();
    expect(parseEventLine(JSON.stringify({ type: "delta" }))).toBeNull();
    expect(parseEventLine(JSON.stringify({ type: "unknown", text: "x" }))).toBeNull();
  });
});

describe("readEventStream", () => {
  it("yields meta, one delta and done (Basic Mode shape), byte by byte", async () => {
    const body = line(META) + line({ type: "delta", text: "# Rôle\n" }) + line({ type: "done", text: "# Rôle\n", title: "T" });
    const bytes = enc.encode(body);
    const chunks = Array.from(bytes, (b) => new Uint8Array([b]));
    const events = await collect(readEventStream(bytesStream(chunks)));
    expect(events.map((e) => e.type)).toEqual(["meta", "delta", "done"]);
    expect(events[2]).toEqual({ type: "done", text: "# Rôle\n", title: "T" });
  });

  it("ends with the connection-dropped error when no terminal event arrives", async () => {
    const events = await collect(readEventStream(textStream([line(META), line({ type: "delta", text: "Half" })])));
    expect(events.map((e) => e.type)).toEqual(["meta", "delta", "error"]);
    expect(events[2]).toEqual({ type: "error", error: DROPPED_ERROR });
    expect(DROPPED_ERROR.message).toBe("The connection dropped while writing. Kept what was written so far.");
  });

  it("treats a body that breaks mid-stream as a dropped connection", async () => {
    const events = await collect(readEventStream(textStream([line(META), '{"type":"del'], { failAfter: true })));
    expect(events[events.length - 1]).toEqual({ type: "error", error: DROPPED_ERROR });
  });

  it("stops at an invalid line with an internal error", async () => {
    const events = await collect(
      readEventStream(textStream([line(META), "not json\n", line({ type: "done", text: "x" })])),
    );
    expect(events).toEqual([META, { type: "error", error: UNREADABLE_ERROR }]);
  });

  it("passes a server error event through and ignores anything after the terminal event", async () => {
    const err = { type: "error", error: { code: "rate_limited", message: "Too many requests.", retryAfterSec: 30 } };
    const events = await collect(readEventStream(textStream([line(META), line(err), line({ type: "done", text: "late" })])));
    expect(events).toEqual([META, err]);
  });

  it("returns quietly with no terminal event when aborted", async () => {
    const ctrl = new AbortController();
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++;
        if (pulls === 1) controller.enqueue(enc.encode(line(META)));
        // Afterwards never resolves: a stalled server.
        return new Promise(() => {});
      },
    });
    const out: StreamEvent[] = [];
    for await (const ev of readEventStream(body, ctrl.signal)) {
      out.push(ev);
      ctrl.abort();
    }
    expect(out).toEqual([META]);
  });
});
