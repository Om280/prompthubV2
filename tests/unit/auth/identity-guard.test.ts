import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { schemas, type StreamEvent } from "@/lib/contracts";
import { AppError } from "@/lib/ai/errors";
import type { AiReadiness } from "@/lib/ai/status";
import { getVerifiedUser, userFromClaims, type ClaimsClient, type VerifiedUser } from "@/lib/server/auth";
import { createConcurrencyLimiter } from "@/lib/server/concurrency";
import { readServerEnv, type ServerEnv } from "@/lib/server/env";
import {
  aiWindows,
  guardAiRoute,
  guardPublicRoute,
  QUOTA_CHECK_FAILED_MESSAGE,
  type AiOperation,
  type GuardDeps,
} from "@/lib/server/guard";
import { createMemoryQuotaStore, type MemoryQuotaStore, type QuotaStore } from "@/lib/server/quota";
import { createRateLimiter } from "@/lib/server/rate-limit";
import { ndjsonResponse } from "@/lib/server/ndjson";

const CLAIMS = {
  sub: "11111111-1111-1111-1111-111111111111",
  role: "authenticated",
  email: "ada@example.com",
  user_metadata: { full_name: "Ada Lovelace", avatar_url: "https://lh3.googleusercontent.com/a/ada" },
};

function client(result: unknown): ClaimsClient {
  return { auth: { getClaims: vi.fn(async () => result) } } as unknown as ClaimsClient;
}

describe("getVerifiedUser (getClaims)", () => {
  it("valid claims → id, email, name, avatar", async () => {
    const user = await getVerifiedUser({ client: client({ data: { claims: CLAIMS, header: {}, signature: new Uint8Array() }, error: null }) });
    expect(user).toEqual({
      id: CLAIMS.sub,
      email: "ada@example.com",
      name: "Ada Lovelace",
      avatarUrl: "https://lh3.googleusercontent.com/a/ada",
    });
    expect(schemas.AuthUser.safeParse(user).success).toBe(true);
  });

  it("no session → null", async () => {
    expect(await getVerifiedUser({ client: client({ data: null, error: null }) })).toBeNull();
  });

  it("expired or forged token (getClaims error) → null", async () => {
    const expired = { data: null, error: Object.assign(new Error("JWT has expired"), { name: "AuthInvalidJwtError" }) };
    expect(await getVerifiedUser({ client: client(expired) })).toBeNull();
    const forged = { data: null, error: Object.assign(new Error("Invalid JWT signature"), { name: "AuthInvalidJwtError" }) };
    expect(await getVerifiedUser({ client: client(forged) })).toBeNull();
  });

  it("a throwing client → null (logged, redacted)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const c = { auth: { getClaims: vi.fn(async () => { throw new Error("boom Bearer eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl"); }) } } as unknown as ClaimsClient;
    expect(await getVerifiedUser({ client: c })).toBeNull();
    expect(spy.mock.calls.join(" ")).not.toContain("eyJhbGciOi");
    spy.mockRestore();
  });

  it("auth not configured (no client) → null", async () => {
    expect(await getVerifiedUser({ client: null })).toBeNull();
  });

  it("only uses getClaims, never getSession or getUser", async () => {
    const getSession = vi.fn();
    const getUser = vi.fn();
    const c = { auth: { getClaims: vi.fn(async () => ({ data: { claims: CLAIMS }, error: null })), getSession, getUser } };
    await getVerifiedUser({ client: c as unknown as ClaimsClient });
    expect(getSession).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("userFromClaims rejects non-user tokens and unsafe avatars", () => {
    expect(userFromClaims({ ...CLAIMS, role: "anon" })).toBeNull();
    expect(userFromClaims({ role: "authenticated" })).toBeNull();
    expect(userFromClaims({ ...CLAIMS, user_metadata: { name: "Ada", picture: "javascript:alert(1)" } })).toMatchObject({
      name: "Ada",
      avatarUrl: null,
    });
    expect(userFromClaims({ sub: "u1" })).toEqual({ id: "u1", email: null, name: null, avatarUrl: null });
  });
});

/* ---------- guards ---------- */

const ADA: VerifiedUser = { id: "user-a", email: "a@example.com", name: "A", avatarUrl: null };
const BOB: VerifiedUser = { id: "user-b", email: "b@example.com", name: "B", avatarUrl: null };

const READY: AiReadiness = { status: "ready", model: "gemini-3.5-flash-lite", message: "ok" };

const BASE_ENV = readServerEnv({ GEMINI_PROJECT_RPM: "1000", GEMINI_PROJECT_TPM: "10000000", GEMINI_PROJECT_RPD: "100000" });

function testEnv(ai: Partial<ServerEnv["ai"]> = {}, project: Partial<ServerEnv["project"]> = {}): ServerEnv {
  return {
    ...BASE_ENV,
    ai: { ...BASE_ENV.ai, userPerMinute: 1000, ipPerMinute: 1000, ...ai },
    project: { ...BASE_ENV.project, ...project },
  };
}

function aiDeps(over: Partial<GuardDeps> & { memory?: MemoryQuotaStore } = {}) {
  const memory = over.memory ?? createMemoryQuotaStore();
  const deps: GuardDeps = {
    getUser: async () => null,
    authConfigured: () => true,
    readiness: () => READY,
    store: () => memory,
    env: () => testEnv(),
    ...over,
  };
  return { deps, memory };
}

const req = (headers: Record<string, string> = {}, signal?: AbortSignal) =>
  new Request("http://localhost/api/transform", { method: "POST", headers: { "x-forwarded-for": "9.9.9.9", ...headers }, signal });

interface In {
  text: string;
  requestId?: string;
  workflowId?: string;
}

/** A fresh requestId per call unless given; distinct text so dedup doesn't interfere unless fixed. */
let inputSeq = 0;
function opts(i: Partial<In> = {}, operation: AiOperation = "improve") {
  const input: In = { text: i.text ?? `prompt ${++inputSeq}`, requestId: "requestId" in i ? i.requestId : randomUUID(), workflowId: i.workflowId };
  return {
    operation,
    readInput: async () => input,
    inputText: (x: In) => x.text,
    ids: (x: In) => ({ requestId: x.requestId, workflowId: x.workflowId }),
  };
}

async function rejection(p: Promise<unknown>): Promise<AppError> {
  const e = await p.then(
    () => null,
    (x: unknown) => x,
  );
  expect(e).toBeInstanceOf(AppError);
  return e as AppError;
}

const flush = () => new Promise((r) => setTimeout(r, 0));
async function ok(p: Promise<{ release(): void }>) {
  (await p).release();
  await flush();
}

describe("guardAiRoute: identity and input", () => {
  it("signed out → 401 auth_required, before reading the body", async () => {
    const readInput = vi.fn(async () => ({ text: "x" }));
    const { deps } = aiDeps();
    const e = await rejection(
      guardAiRoute(req(), { operation: "improve", readInput, inputText: (i) => i.text, ids: () => ({}) }, deps),
    );
    expect(e.code).toBe("auth_required");
    expect(e.status).toBe(401);
    expect(readInput).not.toHaveBeenCalled();
  });

  it("identity only from verified claims: a spoofed x-user-id header doesn't sign anyone in", async () => {
    const { deps } = aiDeps();
    expect((await rejection(guardAiRoute(req({ "x-user-id": ADA.id, authorization: "Bearer forged" }), opts(), deps))).code).toBe(
      "auth_required",
    );
  });

  it("AI not ready (this build, switched off, or not configured) → 409 ai_required, nothing consumed", async () => {
    for (const r of [
      { status: "unavailable", model: "gemini-3.5-flash-lite", message: "later" },
      { status: "not-configured", model: null, message: "no key" },
    ] as AiReadiness[]) {
      const { deps, memory } = aiDeps({ getUser: async () => ADA, readiness: () => r });
      expect((await rejection(guardAiRoute(req(), opts(), deps))).code).toBe("ai_required");
      expect(memory.counts().size).toBe(0);
    }
  });

  it("requestId is required (UUID); workflowId too for clarify/generate", async () => {
    const { deps } = aiDeps({ getUser: async () => ADA });
    expect((await rejection(guardAiRoute(req(), opts({ requestId: undefined }), deps))).extras.issues?.[0].path).toBe("requestId");
    expect((await rejection(guardAiRoute(req(), opts({ requestId: "not-a-uuid" }), deps))).code).toBe("invalid_request");
    expect((await rejection(guardAiRoute(req(), opts({}, "generate"), deps))).extras.issues?.[0].path).toBe("workflowId");
  });

  it("idea + answers + prompt over AI_MAX_INPUT_CHARS (default 20,000) → 400, nothing consumed", async () => {
    const { deps, memory } = aiDeps({ getUser: async () => ADA });
    expect(BASE_ENV.ai.maxInputChars).toBe(20_000);
    const e = await rejection(guardAiRoute(req(), opts({ text: "x".repeat(20_001) }), deps));
    expect(e.code).toBe("invalid_request");
    expect(e.message).toContain("20,000 characters in total");
    expect(memory.counts().size).toBe(0);
  });

  it("signed in and ready → lease with the verified user, model, hash, estimate and signal", async () => {
    const { deps } = aiDeps({ getUser: async () => ADA });
    const lease = await guardAiRoute(req({ "x-user-id": BOB.id }), opts({ text: "x".repeat(400) }), deps);
    expect(lease.user).toEqual(ADA);
    expect(lease.model).toBe("gemini-3.5-flash-lite");
    expect(lease.requestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(lease.estimatedTokens).toBe(100 + BASE_ENV.ai.maxOutputTokens);
    expect(lease.signal.aborted).toBe(false);
    expect(lease.replay).toBe(false);
    lease.release();
  });
});

describe("guardAiRoute: persistent quotas (memory store)", () => {
  it("defaults: 5 workflows/day, 5 refinements/day, 3/min per user, 10/min per IP, 1 in flight, 0.7 safety ratio", () => {
    const d = readServerEnv({});
    expect(d.ai).toMatchObject({
      userDailyWorkflows: 5,
      userDailyRefinements: 5,
      userPerMinute: 3,
      ipPerMinute: 10,
      maxConcurrentPerUser: 1,
      maxInputChars: 20_000,
    });
    expect(d.project).toEqual({ rpm: null, tpm: null, rpd: null, safetyRatio: 0.7 });
  });

  it("5 workflows a day; clarify + generate of the same workflow count once", async () => {
    const { deps } = aiDeps({ getUser: async () => ADA });
    for (let i = 0; i < 5; i++) {
      const workflowId = randomUUID();
      await ok(guardAiRoute(req(), opts({ workflowId }, "clarify"), deps));
      await ok(guardAiRoute(req(), opts({ workflowId }, "generate"), deps));
    }
    const e = await rejection(guardAiRoute(req(), opts({ workflowId: randomUUID() }, "clarify"), deps));
    expect(e.code).toBe("user_daily_limit");
    expect(e.status).toBe(429);
    expect(e.message).toContain("prompt workflows");
    expect(e.message).toContain("Basic Mode still works");
    expect(e.extras.resetsAt).toMatch(/T0[78]:00:00\.000Z$/); // next Pacific midnight
    // Refinements are a separate allowance.
    await ok(guardAiRoute(req(), opts(), deps));
  });

  it("5 refinements a day across improve, shorten, expand, tone and regenerate", async () => {
    const { deps } = aiDeps({ getUser: async () => ADA });
    for (const op of ["improve", "shorten", "expand", "tone", "regenerate"] as AiOperation[]) {
      await ok(guardAiRoute(req(), opts({}, op), deps));
    }
    const e = await rejection(guardAiRoute(req(), opts({}, "improve"), deps));
    expect(e.code).toBe("user_daily_limit");
    expect(e.message).toContain("refinements");
  });

  it("3 per minute per user → 429 rate_limited", async () => {
    const { deps } = aiDeps({ getUser: async () => ADA, env: () => testEnv({ userPerMinute: 3, userDailyRefinements: 100 }) });
    for (let i = 0; i < 3; i++) await ok(guardAiRoute(req(), opts(), deps));
    const e = await rejection(guardAiRoute(req(), opts(), deps));
    expect(e.code).toBe("rate_limited");
    expect(e.extras.retryAfterSec).toBeGreaterThan(0);
  });

  it("10 per minute per IP, across users", async () => {
    let n = 0;
    const users = Array.from({ length: 11 }, (_, i) => ({ ...ADA, id: `user-${i}` }));
    const { deps } = aiDeps({ getUser: async () => users[n], env: () => testEnv({ ipPerMinute: 10 }) });
    for (; n < 10; n++) await ok(guardAiRoute(req(), opts(), deps));
    const e = await rejection(guardAiRoute(req(), opts(), deps));
    expect(e.code).toBe("rate_limited");
    expect(e.message).toContain("network");
  });

  it("global RPD at 70% of the project's RPD → 503 daily_budget_exhausted, for everyone", async () => {
    let current = ADA;
    const { deps } = aiDeps({ getUser: async () => current, env: () => testEnv({}, { rpd: 3 }) });
    // floor(3 × 0.7) = 2
    await ok(guardAiRoute(req(), opts(), deps));
    await ok(guardAiRoute(req(), opts(), deps));
    current = BOB;
    const e = await rejection(guardAiRoute(req(), opts(), deps));
    expect(e.code).toBe("daily_budget_exhausted");
    expect(e.status).toBe(503);
  });

  it("global RPM and TPM ceilings → 429 rate_limited (app at capacity)", async () => {
    const rpm = aiDeps({ getUser: async () => ADA, env: () => testEnv({}, { rpm: 2 }) }); // ceiling 1
    await ok(guardAiRoute(req(), opts(), rpm.deps));
    expect((await rejection(guardAiRoute(req(), opts(), rpm.deps))).message).toContain("capacity");
    // TPM: the estimate (input/4 + max output) must fit under 70% of TPM.
    const tpm = aiDeps({ getUser: async () => ADA, env: () => testEnv({ maxOutputTokens: 100 }, { tpm: 200 }) }); // ceiling 140
    await ok(guardAiRoute(req(), opts({ text: "x".repeat(40) }), tpm.deps)); // 110 tokens
    expect((await rejection(guardAiRoute(req(), opts({ text: "x".repeat(40) }), tpm.deps))).code).toBe("rate_limited");
  });

  it("TPM is reconciled with actual tokens after the call", async () => {
    const { deps, memory } = aiDeps({ getUser: async () => ADA, env: () => testEnv({ maxOutputTokens: 100 }, { tpm: 200 }) });
    const lease = await guardAiRoute(req(), opts({ text: "x".repeat(40) }), deps);
    await lease.reconcileTokens(30); // estimate 110 → actual 30
    lease.release();
    await flush();
    const tpmCount = [...memory.counts()].find(([k]) => k.startsWith("global:tpm@"))?.[1];
    expect(tpmCount).toBe(30);
    // Freed capacity is usable again.
    await ok(guardAiRoute(req(), opts({ text: "x".repeat(40) }), deps));
  });

  it("consumption is all-or-nothing: a refused request increments no window", async () => {
    const { deps, memory } = aiDeps({ getUser: async () => ADA, env: () => testEnv({ userDailyRefinements: 1 }) });
    await ok(guardAiRoute(req(), opts(), deps));
    const before = new Map(memory.counts());
    await rejection(guardAiRoute(req(), opts(), deps));
    expect(memory.counts()).toEqual(before);
  });

  it("idempotency: a retry with the same requestId is not counted again", async () => {
    const { deps, memory } = aiDeps({ getUser: async () => ADA, env: () => testEnv({ userDailyRefinements: 1 }) });
    const requestId = randomUUID();
    await ok(guardAiRoute(req(), opts({ requestId, text: "same" }), deps));
    const before = new Map(memory.counts());
    const retry = await guardAiRoute(req(), opts({ requestId, text: "same" }), deps);
    expect(retry.replay).toBe(true);
    retry.release();
    expect(memory.counts()).toEqual(before);
  });

  it("dedup: the same request while it is still running → 409 duplicate_request", async () => {
    const { deps } = aiDeps({ getUser: async () => ADA, env: () => testEnv({ maxConcurrentPerUser: 3 }) });
    const requestId = randomUUID();
    const first = await guardAiRoute(req(), opts({ requestId }), deps);
    const e = await rejection(guardAiRoute(req(), opts({ requestId }), deps));
    expect(e.code).toBe("duplicate_request");
    expect(e.status).toBe(409);
    // Identical content under another id is a duplicate too.
    expect((await rejection(guardAiRoute(req(), opts({ text: "dup" }), deps).then(() => guardAiRoute(req(), opts({ text: "dup" }), deps)))).code).toBe(
      "duplicate_request",
    );
    first.release();
  });

  it("concurrency: a second in-flight request → 429 too_many_concurrent; release frees it", async () => {
    const { deps } = aiDeps({ getUser: async () => ADA });
    const a = await guardAiRoute(req(), opts(), deps);
    expect((await rejection(guardAiRoute(req(), opts(), deps))).code).toBe("too_many_concurrent");
    a.release();
    a.release(); // idempotent
    await flush();
    await ok(guardAiRoute(req(), opts(), deps));
  });

  it("the in-flight lease has a TTL, so a lost release doesn't lock the user out", async () => {
    let now = new Date("2026-11-24T12:00:00Z");
    const memory = createMemoryQuotaStore(() => now);
    const { deps } = aiDeps({ getUser: async () => ADA, memory, now: () => now, env: () => testEnv({ inflightTtlSeconds: 60 }) });
    await guardAiRoute(req(), opts(), deps); // never released (crash)
    expect((await rejection(guardAiRoute(req(), opts(), deps))).code).toBe("too_many_concurrent");
    now = new Date("2026-11-24T12:01:01Z");
    await ok(guardAiRoute(req(), opts(), deps));
  });

  it("a refused request releases its slot", async () => {
    const { deps } = aiDeps({ getUser: async () => ADA, env: () => testEnv({ userDailyRefinements: 1 }) });
    await ok(guardAiRoute(req(), opts(), deps));
    await rejection(guardAiRoute(req(), opts(), deps)); // daily limit, after taking a slot
    await flush();
    expect((await rejection(guardAiRoute(req(), opts(), deps))).code).toBe("user_daily_limit"); // not too_many_concurrent
  });

  it("the slot is released when the client aborts, and the lease signal aborts too", async () => {
    const { deps } = aiDeps({ getUser: async () => ADA });
    const ac = new AbortController();
    const lease = await guardAiRoute(req({}, ac.signal), opts(), deps);
    expect((await rejection(guardAiRoute(req(), opts(), deps))).code).toBe("too_many_concurrent");
    ac.abort();
    expect(lease.signal.aborted).toBe(true);
    await flush();
    await ok(guardAiRoute(req(), opts(), deps));
  });

  it("the slot is released when the stream ends with an error", async () => {
    const { deps } = aiDeps({ getUser: async () => ADA });
    async function* boom(): AsyncGenerator<StreamEvent> {
      yield { type: "meta", engine: { kind: "basic" }, requestId: "r" };
      throw new Error("mid-stream");
    }
    vi.spyOn(console, "error").mockImplementation(() => {});
    const lease = await guardAiRoute(req(), opts(), deps);
    await (await ndjsonResponse(boom(), undefined, lease.release)).text();
    await flush();
    await ok(guardAiRoute(req(), opts(), deps));
    vi.restoreAllMocks();
  });

  it("cross-user: A's limits and in-flight request don't affect B", async () => {
    let current = ADA;
    const { deps } = aiDeps({ getUser: async () => current, env: () => testEnv({ userDailyRefinements: 1 }) });
    await ok(guardAiRoute(req(), opts(), deps));
    await guardAiRoute(req(), opts({ workflowId: randomUUID() }, "clarify"), deps); // A holds its slot
    expect((await rejection(guardAiRoute(req(), opts(), deps))).code).toBe("too_many_concurrent");
    current = BOB;
    const b = await guardAiRoute(req(), opts(), deps);
    expect(b.user.id).toBe(BOB.id);
  });

  it("a failing quota store fails closed with a clear message", async () => {
    const broken: QuotaStore = {
      consume: async () => {
        throw new Error("db down");
      },
      adjust: async () => {},
      acquireInflight: async () => "ok",
      releaseInflight: vi.fn(async () => {}),
      recordUsage: async () => {},
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { deps } = aiDeps({ getUser: async () => ADA, store: () => broken });
    const e = await rejection(guardAiRoute(req(), opts(), deps));
    expect(e.code).toBe("internal");
    expect(e.message).toBe(QUOTA_CHECK_FAILED_MESSAGE);
    expect(broken.releaseInflight).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("recordUsage writes metadata only (tokens, op, model, status, duration), never the prompt", async () => {
    const { deps, memory } = aiDeps({ getUser: async () => ADA });
    const lease = await guardAiRoute(req(), opts({ text: "my private idea" }, "shorten"), deps);
    await lease.recordUsage({ inputTokens: 10, outputTokens: 20, status: "ok" });
    expect(memory.usage).toHaveLength(1);
    expect(JSON.stringify(memory.usage)).not.toContain("my private idea");
    expect(memory.usage[0]).toMatchObject({
      userId: ADA.id,
      requestId: lease.requestId,
      operation: "shorten",
      model: "gemini-3.5-flash-lite",
      inputTokens: 10,
      outputTokens: 20,
      status: "ok",
    });
    expect(memory.usage[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it("aiWindows lists the documented buckets", () => {
    const env = testEnv({}, { rpm: 10, tpm: 1000, rpd: 100 });
    const w = aiWindows(ADA, "1.2.3.4", "generate", { requestId: "r", workflowId: "w" }, 50, env);
    expect(w.map((x) => [x.bucket, x.window, x.limit, x.amount ?? 1, x.key])).toEqual([
      ["user:user-a:min", "minute", env.ai.userPerMinute, 1, "r"],
      ["ip:1.2.3.4:min", "minute", env.ai.ipPerMinute, 1, "r"],
      ["user:user-a:workflows:day", "day", 5, 1, "wf:w"],
      ["global:rpm", "minute", 7, 1, "r"],
      ["global:tpm", "minute", 700, 50, "r"],
      ["global:rpd", "day", 70, 1, "r"],
    ]);
    expect(aiWindows(ADA, "ip", "tone", { requestId: "r" }, 1, env)[2].bucket).toBe("user:user-a:refinements:day");
  });
});

describe("guardPublicRoute (Basic Mode, in-memory)", () => {
  const pub = (over: Partial<GuardDeps> = {}): GuardDeps => ({
    getUser: async () => null,
    ipLimiter: createRateLimiter({ limit: 100, windowMs: 60_000, now: () => 0 }),
    concurrency: createConcurrencyLimiter(2),
    ...over,
  });

  it("anonymous: concurrency per IP", async () => {
    const d = pub();
    const a = await guardPublicRoute(req(), d);
    await guardPublicRoute(req(), d);
    expect((await rejection(guardPublicRoute(req(), d))).code).toBe("too_many_concurrent");
    (await guardPublicRoute(req({ "x-forwarded-for": "8.8.8.8" }), d)).release();
    a.release();
    expect(a.user).toBeNull();
  });

  it("signed in: concurrency is keyed by user, not IP", async () => {
    const d = pub({ getUser: async () => ADA });
    await guardPublicRoute(req({ "x-forwarded-for": "1.1.1.1" }), d);
    await guardPublicRoute(req({ "x-forwarded-for": "1.1.1.2" }), d);
    expect((await rejection(guardPublicRoute(req({ "x-forwarded-for": "1.1.1.3" }), d))).code).toBe("too_many_concurrent");
  });

  it("IP limit comes first and doesn't need auth", async () => {
    const getUser = vi.fn(async () => null);
    const d = pub({ getUser, ipLimiter: createRateLimiter({ limit: 1, windowMs: 60_000, now: () => 0 }) });
    (await guardPublicRoute(req(), d)).release();
    expect((await rejection(guardPublicRoute(req(), d))).code).toBe("rate_limited");
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it("releases on abort", async () => {
    const d = pub();
    const ac = new AbortController();
    await guardPublicRoute(req({}, ac.signal), d);
    await guardPublicRoute(req(), d);
    ac.abort();
    (await guardPublicRoute(req(), d)).release();
  });
});

describe("contracts", () => {
  it("ApiErrorCode includes the auth and AI quota codes", () => {
    for (const code of ["auth_required", "too_many_concurrent", "quota_exhausted", "user_daily_limit", "daily_budget_exhausted", "duplicate_request"]) {
      expect(schemas.ApiError.safeParse({ code, message: "x" }).success, code).toBe(true);
    }
    expect(schemas.ApiError.safeParse({ code: "quota_exhausted", message: "x", resetsAt: "2026-11-24T08:00:00.000Z" }).success).toBe(true);
  });

  it("Engine ai is Gemini free tier only", () => {
    expect(schemas.Engine.safeParse({ kind: "ai", provider: "gemini", tier: "free", model: "gemini-3.5-flash-lite" }).success).toBe(true);
    expect(schemas.Engine.safeParse({ kind: "ai", provider: "gemini", tier: "paid", model: "x" }).success).toBe(false);
    expect(schemas.Engine.safeParse({ kind: "ai", provider: "openai", tier: "free", model: "x" }).success).toBe(false);
  });

  it("requests accept a UUID requestId / workflowId and reject other values", () => {
    const base = { idea: "x", target: "claude", length: "balanced", answers: [] };
    const id = randomUUID();
    expect(schemas.GenerateRequest.parse({ ...base, requestId: id, workflowId: id })).toMatchObject({ requestId: id, workflowId: id });
    expect(schemas.GenerateRequest.safeParse({ ...base, requestId: "nope" }).success).toBe(false);
    expect(schemas.TransformRequest.safeParse({ action: "improve", text: "x", target: "claude", length: "balanced", requestId: id }).success).toBe(true);
  });

  it("SessionResponse and AuthUser", () => {
    expect(schemas.SessionResponse.safeParse({ configured: false, user: null }).success).toBe(true);
    expect(schemas.SessionResponse.safeParse({ configured: true, user: { id: "" } }).success).toBe(false);
  });

  it("requests no longer carry a preferred provider (stripped)", () => {
    const r = schemas.GenerateRequest.parse({ idea: "x", target: "claude", length: "balanced", answers: [], preferredProvider: "openai" });
    expect(r).not.toHaveProperty("preferredProvider");
  });
});
