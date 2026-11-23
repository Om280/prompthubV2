import { describe, expect, it, vi } from "vitest";
import type { GenerateRequest, StreamEvent } from "@/lib/contracts";
import { createApiClient, ERROR_COPY } from "@/lib/client/api";
import { DROPPED_ERROR } from "@/lib/client/ndjson";
import { ClientError } from "@/lib/client/types";

const GEN: GenerateRequest = { idea: "Write a cold email", target: "claude", length: "balanced", answers: [] };

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

function ndjson(lines: unknown[], tail = ""): Response {
  const text = lines.map((l) => `${JSON.stringify(l)}\n`).join("") + tail;
  return new Response(text, { status: 200, headers: { "content-type": "application/x-ndjson; charset=utf-8" } });
}

async function collect(it: AsyncIterable<StreamEvent>) {
  const out: StreamEvent[] = [];
  for await (const ev of it) out.push(ev);
  return out;
}

function clientWith(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn(impl);
  return { client: createApiClient({ fetch: fetchMock as unknown as typeof fetch }), fetchMock };
}

async function clarifyError(res: Response | Error) {
  const { client } = clientWith(async () => {
    if (res instanceof Error) throw res;
    return res;
  });
  try {
    await client.clarify({ idea: "x", target: "chatgpt", length: "balanced" });
  } catch (e) {
    expect(e).toBeInstanceOf(ClientError);
    return (e as ClientError).error;
  }
  throw new Error("expected clarify to throw");
}

describe("api client", () => {
  it("is the real client", () => {
    expect(createApiClient({ fetch: vi.fn() as unknown as typeof fetch }).kind).toBe("api");
  });

  it("reads the AI status from /api/providers and validates it", async () => {
    const status = {
      mode: "basic",
      ai: { gateway: "openrouter", status: "unavailable", message: "Coming later." },
      auth: { configured: true, signedIn: false },
    };
    const { client, fetchMock } = clientWith(async () => jsonResponse(200, status));
    await expect(client.getAiStatus()).resolves.toEqual(status);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/providers");
  });

  it("rejects an AI status that doesn't match the contract (e.g. the old provider list)", async () => {
    const { client } = clientWith(async () => jsonResponse(200, { mode: "basic", providers: [], default: null }));
    await expect(client.getAiStatus()).rejects.toBeInstanceOf(ClientError);
  });

  it("maps a bare 401 to auth_required", async () => {
    expect(await clarifyError(new Response("", { status: 401 }))).toEqual({
      code: "auth_required",
      message: ERROR_COPY.authRequired,
    });
  });

  it("posts clarify as JSON and validates the response", async () => {
    const { client, fetchMock } = clientWith(async () =>
      jsonResponse(200, { questions: [{ id: "q1", question: "Who reads it?", suggestions: ["Me"] }], engine: { kind: "basic" } }),
    );
    const res = await client.clarify({ idea: "x", target: "gemini", length: "concise" });
    expect(res.questions[0].id).toBe("q1");
    const init = fetchMock.mock.calls[0][1]!;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ idea: "x", target: "gemini", length: "concise" });
  });

  it("uses the server's error body when it is a valid ApiError", async () => {
    const error = { code: "invalid_request", message: "The idea is empty.", issues: [{ path: "idea", message: "Required" }] };
    expect(await clarifyError(jsonResponse(400, { error }))).toEqual(error);
  });

  it("maps statuses when the body is not a valid error", async () => {
    expect(await clarifyError(new Response("oops", { status: 400 }))).toMatchObject({ code: "invalid_request" });
    expect(await clarifyError(new Response("", { status: 413 }))).toEqual({
      code: "invalid_request",
      message: ERROR_COPY.ideaTooLong,
    });
    expect(await clarifyError(new Response("", { status: 429, headers: { "retry-after": "42" } }))).toEqual({
      code: "rate_limited",
      message: ERROR_COPY.rateLimited,
      retryAfterSec: 42,
    });
    expect(await clarifyError(new Response("", { status: 502 }))).toEqual({
      code: "provider_unavailable",
      message: ERROR_COPY.provider,
    });
    expect(await clarifyError(new Response("<html>", { status: 500 }))).toMatchObject({ code: "internal" });
  });

  it("adds retryAfterSec from the header to a rate_limited body without it", async () => {
    const err = await clarifyError(
      jsonResponse(429, { error: { code: "rate_limited", message: "Slow down." } }, { "retry-after": "10" }),
    );
    expect(err).toEqual({ code: "rate_limited", message: "Slow down.", retryAfterSec: 10 });
  });

  it("reports a network failure with its own message", async () => {
    expect(await clarifyError(new TypeError("Failed to fetch"))).toEqual({ code: "internal", message: ERROR_COPY.network });
  });

  it("rejects a 200 with an invalid body", async () => {
    expect(await clarifyError(jsonResponse(200, { questions: "nope" }))).toMatchObject({ code: "internal" });
  });

  it("streams generate events and sends the request body", async () => {
    const { client, fetchMock } = clientWith(async () =>
      ndjson([
        { type: "meta", engine: { kind: "basic" }, requestId: "r" },
        { type: "delta", text: "Full text" },
        { type: "done", text: "Full text", title: "Cold email" },
      ]),
    );
    const events = await collect(client.generate(GEN));
    expect(events.map((e) => e.type)).toEqual(["meta", "delta", "done"]);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/generate");
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual(GEN);
  });

  it("turns a non-2xx stream response into one error event (409 ai_required)", async () => {
    const error = { code: "ai_required", message: "Improve needs an AI provider." };
    const { client } = clientWith(async () => jsonResponse(409, { error }));
    const events = await collect(
      client.transform({ action: "improve", text: "x", target: "claude", length: "balanced" }),
    );
    expect(events).toEqual([{ type: "error", error }]);
  });

  it("maps a 413 on transform to the 20,000 character message", async () => {
    const { client } = clientWith(async () => new Response("", { status: 413 }));
    const events = await collect(client.transform({ action: "shorten", text: "x", target: "claude", length: "balanced" }));
    expect(events).toEqual([{ type: "error", error: { code: "invalid_request", message: ERROR_COPY.promptTooLong } }]);
  });

  it("yields a network error event instead of throwing", async () => {
    const { client } = clientWith(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await collect(client.generate(GEN))).toEqual([
      { type: "error", error: { code: "internal", message: ERROR_COPY.network } },
    ]);
  });

  it("ends a stream with no terminal event as a dropped connection", async () => {
    const { client } = clientWith(async () =>
      ndjson([{ type: "meta", engine: { kind: "basic" }, requestId: "r" }, { type: "delta", text: "Half" }]),
    );
    const events = await collect(client.generate(GEN));
    expect(events[events.length - 1]).toEqual({ type: "error", error: DROPPED_ERROR });
  });

  it("yields nothing when aborted before the response", async () => {
    const ctrl = new AbortController();
    const { client } = clientWith(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    );
    const it = client.generate(GEN, ctrl.signal);
    const pending = collect(it);
    ctrl.abort();
    expect(await pending).toEqual([]);
  });

  it("rethrows an abort from clarify as an AbortError, not a ClientError", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const { client } = clientWith(async () => {
      throw new DOMException("Aborted", "AbortError");
    });
    await expect(client.clarify({ idea: "x", target: "chatgpt", length: "balanced" }, ctrl.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});
