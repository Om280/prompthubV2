/**
 * Client side of the Gemini integration: which engine the client asks for, error details the UI
 * needs (codes, resetsAt), and the session reducer's handling of truncated (partial) results.
 */
import { describe, expect, it, vi } from "vitest";
import type { AiStatusResponse, VersionRecord } from "@/lib/contracts";
import { createApiClient, fallbackError } from "@/lib/client/api";
import { ClientError } from "@/lib/client/types";
import { initialSession, sessionReducer, TRUNCATED_MESSAGE, type SessionState } from "@/hooks/use-session";

const status = (mode: "ai" | "basic"): AiStatusResponse => ({
  mode,
  ai: { provider: "gemini", tier: "free", model: "gemini-3.8-flash", status: mode === "ai" ? "ready" : "sign-in-required", message: "m" },
  auth: { configured: true, signedIn: mode === "ai" },
});

function client(statusBody: AiStatusResponse | null) {
  const bodies: Record<string, unknown>[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/api/providers")) {
      return statusBody ? Response.json(statusBody) : new Response("nope", { status: 500 });
    }
    bodies.push(JSON.parse(String(init?.body)));
    if (url.endsWith("/api/clarify")) return Response.json({ questions: [], engine: { kind: "basic" } });
    return new Response(`${JSON.stringify({ type: "meta", engine: { kind: "basic" }, requestId: "r" })}\n${JSON.stringify({ type: "done", text: "t" })}\n`, {
      headers: { "content-type": "application/x-ndjson" },
    });
  });
  return { c: createApiClient({ fetch: fetchMock as unknown as typeof fetch }), bodies };
}

const REQ = { idea: "x", target: "gemini" as const, length: "balanced" as const };
const ids = { requestId: "0b8f5a8e-2a49-4b8e-9d5c-3b7b1c2a9f00", workflowId: "5b3c1d2e-7f8a-4b9c-8d0e-1f2a3b4c5d6e" };

describe("engine selection in the API client", () => {
  it("asks for AI only after the status says mode 'ai'; sends the client's ids", async () => {
    const { c, bodies } = client(status("ai"));
    await c.clarify({ ...REQ, ...ids });
    expect(bodies[0].engine).toBeUndefined(); // no status read yet → Basic Mode
    await c.getAiStatus();
    expect(c.engine).toBe("ai");
    await c.clarify({ ...REQ, ...ids });
    for await (const _ of c.generate({ ...REQ, answers: [], ...ids })) void _;
    expect(bodies[1]).toEqual({ engine: "ai", ...REQ, ...ids });
    expect(bodies[2]).toMatchObject({ engine: "ai", requestId: ids.requestId, workflowId: ids.workflowId });
  });

  it("Basic Mode when the status says basic, when it fails, or when the user prefers Basic Mode", async () => {
    const basic = client(status("basic"));
    await basic.c.getAiStatus();
    await basic.c.clarify(REQ);
    expect(basic.bodies[0].engine).toBeUndefined();

    const failing = client(null);
    await failing.c.getAiStatus().catch(() => {});
    expect(failing.c.engine).toBe("basic");

    const pref = client(status("ai"));
    await pref.c.getAiStatus();
    pref.c.setEnginePreference?.("basic");
    await pref.c.clarify(REQ);
    expect(pref.bodies[0].engine).toBeUndefined();
    pref.c.setEnginePreference?.("auto");
    expect(pref.c.engine).toBe("ai");
  });

  it("surfaces the server's quota errors with resetsAt; a bare 503 reads as quota_exhausted", async () => {
    const resetsAt = "2026-11-25T08:00:00.000Z";
    const fetchMock = vi.fn(async () =>
      Response.json(
        { error: { code: "quota_exhausted", message: "Google's free Gemini quota is used up.", resetsAt, retryAfterSec: 60 } },
        { status: 503, headers: { "retry-after": "60" } },
      ),
    );
    const c = createApiClient({ fetch: fetchMock as unknown as typeof fetch });
    const err = await c.clarify(REQ).catch((e) => e);
    expect(err).toBeInstanceOf(ClientError);
    expect((err as ClientError).error).toMatchObject({ code: "quota_exhausted", resetsAt, retryAfterSec: 60 });
    expect(fallbackError(503, "generate").code).toBe("quota_exhausted");
  });
});

describe("session reducer: truncated results are partial, never passed off as complete", () => {
  const ready = (): SessionState => {
    const v: VersionRecord = { id: "v1", promptId: "p", content: "old", source: "generated", engine: { kind: "basic" }, createdAt: 1 };
    return { ...initialSession(), phase: "ready", promptId: "p", versions: [v], draft: "old", generated: { idea: "x", target: "chatgpt", length: "balanced" } };
  };

  it("done with truncated → a partial version plus a clear notice with retry", () => {
    let s = sessionReducer(ready(), { type: "streamStart", activity: "expand" });
    s = sessionReducer(s, { type: "streamMeta", engine: { kind: "ai", provider: "gemini", tier: "free", model: "gemini-3.8-flash" } });
    s = sessionReducer(s, { type: "streamDone", text: "half a prompt", id: "v2", promptId: "p", now: 2, truncated: true });
    expect(s.versions.at(-1)).toMatchObject({ content: "half a prompt", partial: true, source: "expanded" });
    expect(s.phase).toBe("error");
    expect(s.error).toMatchObject({ message: TRUNCATED_MESSAGE, code: "invalid_output", retry: "expand" });
  });

  it("errors keep resetsAt for the UI, and the draft is kept", () => {
    let s = sessionReducer(ready(), { type: "streamStart", activity: "improve" });
    s = sessionReducer(s, { type: "streamError", message: "used up", code: "user_daily_limit", resetsAt: "2026-11-25T08:00:00.000Z" });
    expect(s.error).toMatchObject({ code: "user_daily_limit", resetsAt: "2026-11-25T08:00:00.000Z" });
    expect(s.draft).toBe("old");
    expect(s.versions).toHaveLength(1);
  });
});
