/**
 * The AI paths of the routes, end to end inside the process: verified user (mocked at
 * getVerifiedUser), the real guard with the memory quota store, the Gemini engine with an AI SDK
 * mock model in place of the provider. No network calls.
 */
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModel } from "ai";
import { schemas, type StreamEvent } from "@/lib/contracts";
import type { VerifiedUser } from "@/lib/server/auth";
import type { MemoryQuotaStore } from "@/lib/server/quota";

const h = vi.hoisted(() => ({
  user: null as VerifiedUser | null,
  model: null as LanguageModel | null,
  store: null as MemoryQuotaStore | null,
  health: "ok" as string,
  usage: vi.fn(),
}));

vi.mock("@/lib/server/auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/server/auth")>()),
  getVerifiedUser: async () => h.user,
}));
vi.mock("@/lib/ai/gemini/provider", () => ({
  createGeminiModel: (id: string) => {
    if (!h.model) throw new Error("no model");
    expect(id).toBe("gemini-3.8-flash");
    return h.model;
  },
}));
vi.mock("@/lib/server/quota", async (orig) => {
  const actual = await orig<typeof import("@/lib/server/quota")>();
  return {
    ...actual,
    isQuotaStoreConfigured: () => true,
    getQuotaStore: () => h.store!,
    quotaHealth: async () => h.health,
  };
});
vi.mock("@/lib/server/usage", () => ({ readMyUsage: h.usage }));

import { POST as clarify } from "@/app/api/clarify/route";
import { POST as generate } from "@/app/api/generate/route";
import { POST as transform } from "@/app/api/transform/route";
import { GET as providers } from "@/app/api/providers/route";
import { createMemoryQuotaStore } from "@/lib/server/quota";
import { resetGuards } from "@/lib/server/guard";
import { resetBudgetState } from "@/lib/ai/budget-state";

const ADA: VerifiedUser = { id: "6c1f6f5e-0d6b-4b55-9c0e-6d1f7d1b2a10", email: "ada@example.com", name: "Ada", avatarUrl: null };
const ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  GEMINI_API_KEY: "AIzaSyFAKEtestKEY0123456789abcdefghijklm",
  GEMINI_MODEL: "gemini-3.8-flash",
  SUPABASE_SECRET_KEY: "sb_secret_fake_for_tests_only",
};
const saved: Record<string, string | undefined> = {};

const usageV4 = { inputTokens: { total: 50, noCache: 50, cacheRead: 0, cacheWrite: undefined }, outputTokens: { total: 30, text: 25, reasoning: 5 } };
const jsonModel = (o: unknown) =>
  new MockLanguageModelV4({
    doGenerate: async () => ({ content: [{ type: "text", text: JSON.stringify(o) }], finishReason: { unified: "stop", raw: "STOP" }, usage: usageV4, warnings: [] }),
  });

const BRIEF = {
  category: "planning",
  title: "Lisbon weekend",
  task: "Plan a 3-day trip to Lisbon",
  context: [],
  requirements: [],
  constraints: [],
  outputFormat: "a day-by-day itinerary",
  tone: "neutral",
};

let ip = 0;
function post(path: string, body: unknown, signal?: AbortSignal) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `10.9.0.${++ip % 250}` },
    body: JSON.stringify(body),
    signal,
  });
}
const lines = async (res: Response) =>
  (await res.text())
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as StreamEvent);
const flush = () => new Promise((r) => setTimeout(r, 10));

const aiGen = (over: Record<string, unknown> = {}) => ({
  idea: "plan a 3-day trip to Lisbon",
  target: "gemini",
  length: "balanced",
  answers: [],
  engine: "ai",
  requestId: randomUUID(),
  workflowId: randomUUID(),
  ...over,
});

beforeEach(() => {
  for (const [k, v] of Object.entries(ENV)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
  h.user = null;
  h.model = jsonModel(BRIEF);
  h.store = createMemoryQuotaStore();
  h.health = "ok";
  h.usage.mockReset();
  resetGuards();
  resetBudgetState();
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("auth is required for every AI request", () => {
  it("signed out → 401 for AI clarify, AI generate and transform; nothing reaches Gemini", async () => {
    const m = jsonModel(BRIEF);
    h.model = m;
    expect((await clarify(post("/api/clarify", { ...aiGen(), answers: undefined }))).status).toBe(401);
    expect((await generate(post("/api/generate", aiGen()))).status).toBe(401);
    expect((await transform(post("/api/transform", { action: "improve", text: "x", target: "claude", length: "balanced", requestId: randomUUID() }))).status).toBe(401);
    expect(m.doGenerateCalls).toHaveLength(0);
  });
});

describe("AI generate route", () => {
  it("signed in: streams meta (Gemini free tier), deltas, done; usage recorded; quota consumed once", async () => {
    h.user = ADA;
    const res = await generate(post("/api/generate", aiGen()));
    expect(res.status).toBe(200);
    const evs = await lines(res);
    for (const e of evs) expect(schemas.StreamEvent.safeParse(e).success).toBe(true);
    expect(evs[0]).toMatchObject({ type: "meta", engine: { kind: "ai", provider: "gemini", tier: "free", model: "gemini-3.8-flash" } });
    expect(evs.at(-1)).toMatchObject({ type: "done", title: "Lisbon weekend" });
    expect((evs.at(-1) as { text: string }).text).toContain("Plan a 3-day trip to Lisbon");
    await flush();
    expect(h.store!.usage).toHaveLength(1);
    expect(h.store!.usage[0]).toMatchObject({ userId: ADA.id, operation: "generate", model: "gemini-3.8-flash", status: "ok", inputTokens: 50, outputTokens: 30 });
    // Global TPM reconciled from the estimate down to the actual 80 tokens.
    const tpm = [...h.store!.counts()].find(([k]) => k.startsWith("global:tpm@"))?.[1];
    expect(tpm).toBe(80);
    // The in-flight lease was released: the next request can run.
    expect((await generate(post("/api/generate", aiGen()))).status).toBe(200);
  });

  it("regenerate counts as a refinement, not a new workflow", async () => {
    h.user = ADA;
    await lines(await generate(post("/api/generate", aiGen({ regenerate: true }))));
    await flush();
    expect(h.store!.usage[0].operation).toBe("regenerate");
    expect([...h.store!.counts().keys()].some((k) => k.includes(":refinements:day@"))).toBe(true);
    expect([...h.store!.counts().keys()].some((k) => k.includes(":workflows:day@"))).toBe(false);
  });

  it("missing workflowId → 400 before anything is consumed", async () => {
    h.user = ADA;
    const res = await generate(post("/api/generate", aiGen({ workflowId: undefined })));
    expect(res.status).toBe(400);
    expect(h.store!.counts().size).toBe(0);
  });

  it("engine ai while AI isn't configured → 409 ai_required, never Basic Mode output", async () => {
    h.user = ADA;
    delete process.env.GEMINI_API_KEY;
    const res = await generate(post("/api/generate", aiGen()));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("ai_required");
  });

  it("migration missing → 409 with the clear reason; Basic Mode keeps working", async () => {
    h.user = ADA;
    h.health = "migration-missing";
    const res = await generate(post("/api/generate", aiGen()));
    expect(res.status).toBe(409);
    expect((await res.json()).error.message).toContain("database migration missing");
    const basic = await generate(post("/api/generate", { ...aiGen(), engine: undefined }));
    expect((await lines(basic))[0]).toMatchObject({ type: "meta", engine: { kind: "basic" } });
  });

  it("Basic Mode is unchanged when the client doesn't ask for AI, even signed in with AI ready", async () => {
    h.user = ADA;
    const m = jsonModel(BRIEF);
    h.model = m;
    const evs = await lines(await generate(post("/api/generate", { idea: "plan a 3-day trip to Lisbon", target: "claude", length: "balanced", answers: [] })));
    expect(evs[0]).toMatchObject({ type: "meta", engine: { kind: "basic" } });
    expect(evs.filter((e) => e.type === "delta")).toHaveLength(1);
    expect(m.doGenerateCalls).toHaveLength(0);
    const c = await (await clarify(post("/api/clarify", { idea: "write an email", target: "gemini", length: "concise" }))).json();
    expect(c.engine).toEqual({ kind: "basic" });
  });

  it("a client disconnect aborts the Gemini call; usage recorded as aborted; lease released", async () => {
    h.user = ADA;
    const seen: AbortSignal[] = [];
    h.model = new MockLanguageModelV4({
      doGenerate: (o) =>
        new Promise((_, reject) => {
          seen.push(o.abortSignal!);
          o.abortSignal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        }),
    });
    const ac = new AbortController();
    const res = await generate(post("/api/generate", aiGen(), ac.signal));
    const reading = lines(res);
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    ac.abort();
    const evs = await reading;
    expect(evs.map((e) => e.type)).toEqual(["meta"]);
    expect(seen[0].aborted).toBe(true);
    await vi.waitFor(() => expect(h.store!.usage[0]?.status).toBe("aborted"));
  });
});

describe("AI clarify and transform routes", () => {
  it("clarify: contract response with AI engine and task type", async () => {
    h.user = ADA;
    h.model = jsonModel({ taskType: "planning", questions: [{ question: "What's your budget?", suggestions: ["Low", "Flexible"], asksForExample: false }] });
    const res = await clarify(post("/api/clarify", { ...aiGen(), answers: undefined }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(schemas.ClarifyResponse.safeParse(body).success).toBe(true);
    expect(body).toMatchObject({ engine: { kind: "ai", provider: "gemini" }, taskType: "planning", questions: [{ id: "q1" }] });
    await flush();
    expect(h.store!.usage[0]).toMatchObject({ operation: "clarify", status: "ok" });
  });

  it("clarify + generate of one workflow count as one daily workflow", async () => {
    h.user = ADA;
    const workflowId = randomUUID();
    h.model = jsonModel({ taskType: "planning", questions: [] });
    await clarify(post("/api/clarify", { ...aiGen({ workflowId }), answers: undefined }));
    h.model = jsonModel(BRIEF);
    await lines(await generate(post("/api/generate", aiGen({ workflowId }))));
    const wf = [...h.store!.counts()].find(([k]) => k.includes(":workflows:day@"))?.[1];
    expect(wf).toBe(1);
  });

  it("transform: streams a Gemini rewrite", async () => {
    h.user = ADA;
    const { convertArrayToReadableStream } = await import("ai/test");
    const text = "Write a haiku about rain in Lisbon.\n\n## Output\n\n- Format: one haiku.";
    h.model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          { type: "stream-start" as const, warnings: [] },
          { type: "text-start" as const, id: "t" },
          { type: "text-delta" as const, id: "t", delta: text.slice(0, 20) },
          { type: "text-delta" as const, id: "t", delta: text.slice(20) },
          { type: "text-end" as const, id: "t" },
          { type: "finish" as const, finishReason: { unified: "stop" as const, raw: "STOP" }, usage: usageV4 },
        ]),
      }),
    });
    const res = await transform(
      post("/api/transform", { action: "improve", text: "Write a haiku about rain.\n\n## Output\n\n- Format: one haiku.", target: "chatgpt", length: "balanced", requestId: randomUUID() }),
    );
    const evs = await lines(res);
    expect(evs.map((e) => e.type)).toEqual(["meta", "delta", "delta", "done"]);
    expect(evs.at(-1)).toMatchObject({ text });
  });
});

describe("GET /api/providers", () => {
  it("ready + signed in: reads usage through the RLS reader (no user id passed) and reports the limits basis", async () => {
    h.user = ADA;
    h.usage.mockResolvedValue({
      workflows: { used: 2, limit: 5, remaining: 3 },
      refinements: { used: 0, limit: 5, remaining: 5 },
      resetsAt: "2026-11-25T08:00:00.000Z",
    });
    const body = await (await providers(new Request("http://localhost/api/providers"))).json();
    expect(schemas.AiStatusResponse.safeParse(body).success).toBe(true);
    expect(body).toMatchObject({
      mode: "ai",
      ai: { status: "ready", model: "gemini-3.8-flash", limits: { basis: "conservative-defaults" } },
      usage: { workflows: { remaining: 3 } },
    });
    expect(body.ai.limits.description).toContain("Conservative defaults (project limits not supplied)");
    expect(h.usage).toHaveBeenCalledTimes(1);
    // Only the env is passed: identity comes from the session inside the database (auth.uid()).
    expect(h.usage.mock.calls[0]).toHaveLength(1);
    expect(JSON.stringify(h.usage.mock.calls[0])).not.toContain(ADA.id);
    expect(JSON.stringify(body)).not.toMatch(/AIza|sb_secret|ada@example/);
  });

  it("signed out (even with a spoofed x-user-id): no usage read at all", async () => {
    const res = await providers(new Request("http://localhost/api/providers", { headers: { "x-user-id": ADA.id } }));
    const body = await res.json();
    expect(body.ai.status).toBe("sign-in-required");
    expect(body.usage).toBeUndefined();
    expect(h.usage).not.toHaveBeenCalled();
  });

  it("project limits supplied → '70% of supplied project limits'", async () => {
    Object.assign(process.env, { GEMINI_PROJECT_RPM: "15", GEMINI_PROJECT_TPM: "250000", GEMINI_PROJECT_RPD: "1000" });
    try {
      const body = await (await providers(new Request("http://localhost/api/providers"))).json();
      expect(body.ai.limits).toEqual({
        basis: "project-ratio",
        description: "70% of supplied project limits: 10 requests/min, 175,000 tokens/min, 700 requests/day app-wide.",
      });
    } finally {
      for (const k of ["GEMINI_PROJECT_RPM", "GEMINI_PROJECT_TPM", "GEMINI_PROJECT_RPD"]) delete process.env[k];
    }
  });

  it("migration missing → unavailable with the reason, Basic Mode", async () => {
    h.user = ADA;
    h.health = "migration-missing";
    const body = await (await providers(new Request("http://localhost/api/providers"))).json();
    expect(body).toMatchObject({ mode: "basic", ai: { status: "unavailable", message: expect.stringContaining("database migration missing") } });
    expect(h.usage).not.toHaveBeenCalled();
  });
});
