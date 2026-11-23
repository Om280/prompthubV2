import { describe, expect, it, vi } from "vitest";
import { schemas } from "@/lib/contracts";
import { AppError } from "@/lib/ai/errors";
import { getVerifiedUser, userFromClaims, type ClaimsClient, type VerifiedUser } from "@/lib/server/auth";
import { createConcurrencyLimiter } from "@/lib/server/concurrency";
import { guardAiRoute, guardPublicRoute, TOO_MANY_CONCURRENT_MESSAGE, type GuardDeps } from "@/lib/server/guard";
import { createRateLimiter } from "@/lib/server/rate-limit";
import { ndjsonResponse } from "@/lib/server/ndjson";
import type { StreamEvent } from "@/lib/contracts";

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

function deps(over: Partial<GuardDeps> = {}): Required<GuardDeps> {
  return {
    getUser: async () => null,
    authConfigured: () => true,
    ipLimiter: createRateLimiter({ limit: 100, windowMs: 60_000, now: () => 0 }),
    userLimiter: createRateLimiter({ limit: 3, windowMs: 60_000, now: () => 0 }),
    concurrency: createConcurrencyLimiter(2),
    ...over,
  } as Required<GuardDeps>;
}

const req = (headers: Record<string, string> = {}, signal?: AbortSignal) =>
  new Request("http://localhost/api/transform", { method: "POST", headers: { "x-forwarded-for": "9.9.9.9", ...headers }, signal });

async function rejection(p: Promise<unknown>): Promise<AppError> {
  const e = await p.then(
    () => null,
    (x: unknown) => x,
  );
  expect(e).toBeInstanceOf(AppError);
  return e as AppError;
}

describe("guardAiRoute", () => {
  it("signed out → 401 auth_required", async () => {
    const e = await rejection(guardAiRoute(req(), deps()));
    expect(e.code).toBe("auth_required");
    expect(e.status).toBe(401);
    expect(e.message).toBe("Sign in with Google to use AI features.");
  });

  it("identity only from verified claims: a spoofed x-user-id header doesn't sign anyone in", async () => {
    const e = await rejection(guardAiRoute(req({ "x-user-id": ADA.id, authorization: "Bearer forged" }), deps()));
    expect(e.code).toBe("auth_required");
  });

  it("signed in → lease with the verified user", async () => {
    const lease = await guardAiRoute(req({ "x-user-id": BOB.id }), deps({ getUser: async () => ADA }));
    expect(lease.user).toEqual(ADA);
    lease.release();
  });

  it("per-user limit → 429 rate_limited with retryAfterSec, before the IP limit", async () => {
    const d = deps({ getUser: async () => ADA, ipLimiter: createRateLimiter({ limit: 1000, windowMs: 60_000, now: () => 0 }) });
    for (let i = 0; i < 3; i++) (await guardAiRoute(req(), d)).release();
    const e = await rejection(guardAiRoute(req(), d));
    expect(e.code).toBe("rate_limited");
    expect(e.status).toBe(429);
    expect(e.extras.retryAfterSec).toBe(60);
  });

  it("per-IP limit applies to signed-in users too", async () => {
    const d = deps({ getUser: async () => ADA, ipLimiter: createRateLimiter({ limit: 1, windowMs: 60_000, now: () => 0 }) });
    (await guardAiRoute(req(), d)).release();
    expect((await rejection(guardAiRoute(req(), d))).code).toBe("rate_limited");
  });

  it("concurrency: a third in-flight request → 429 too_many_concurrent; releasing frees a slot", async () => {
    const d = deps({ getUser: async () => ADA, userLimiter: createRateLimiter({ limit: 100, windowMs: 60_000 }) });
    const a = await guardAiRoute(req(), d);
    await guardAiRoute(req(), d);
    const e = await rejection(guardAiRoute(req(), d));
    expect(e.code).toBe("too_many_concurrent");
    expect(e.status).toBe(429);
    expect(e.message).toBe(TOO_MANY_CONCURRENT_MESSAGE);
    a.release();
    a.release(); // idempotent: must not free a second slot
    await guardAiRoute(req(), d);
    expect(d.concurrency.inFlight("user:user-a")).toBe(2);
  });

  it("concurrency slot is released when the client aborts", async () => {
    const d = deps({ getUser: async () => ADA, userLimiter: createRateLimiter({ limit: 100, windowMs: 60_000 }) });
    const ac = new AbortController();
    await guardAiRoute(req({}, ac.signal), d);
    await guardAiRoute(req(), d);
    expect(d.concurrency.inFlight("user:user-a")).toBe(2);
    ac.abort();
    expect(d.concurrency.inFlight("user:user-a")).toBe(1);
    (await guardAiRoute(req(), d)).release();
  });

  it("concurrency slot is released when the stream ends, errors or is cancelled", async () => {
    const d = deps({ getUser: async () => ADA, userLimiter: createRateLimiter({ limit: 100, windowMs: 60_000 }) });
    async function* ok(): AsyncGenerator<StreamEvent> {
      yield { type: "meta", engine: { kind: "basic" }, requestId: "r" };
      yield { type: "done", text: "x" };
    }
    async function* boom(): AsyncGenerator<StreamEvent> {
      yield { type: "meta", engine: { kind: "basic" }, requestId: "r" };
      throw new Error("mid-stream");
    }
    async function* long(): AsyncGenerator<StreamEvent> {
      yield { type: "meta", engine: { kind: "basic" }, requestId: "r" };
      yield { type: "delta", text: "a" };
      yield { type: "done", text: "a" };
    }
    vi.spyOn(console, "error").mockImplementation(() => {});
    const l1 = await guardAiRoute(req(), d);
    await (await ndjsonResponse(ok(), undefined, l1.release)).text();
    const l2 = await guardAiRoute(req(), d);
    await (await ndjsonResponse(boom(), undefined, l2.release)).text();
    expect(d.concurrency.inFlight("user:user-a")).toBe(0);
    const l3 = await guardAiRoute(req(), d);
    const res = await ndjsonResponse(long(), undefined, l3.release);
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel();
    expect(d.concurrency.inFlight("user:user-a")).toBe(0);
    vi.restoreAllMocks();
  });

  it("cross-user: A's limits and in-flight requests don't affect B", async () => {
    let current: VerifiedUser = ADA;
    const d = deps({ getUser: async () => current });
    for (let i = 0; i < 2; i++) await guardAiRoute(req(), d); // A holds 2 slots
    expect((await rejection(guardAiRoute(req(), d))).code).toBe("too_many_concurrent"); // A's 3rd in flight
    expect((await rejection(guardAiRoute(req(), d))).code).toBe("rate_limited"); // A's 4th this minute
    current = BOB;
    const b = await guardAiRoute(req(), d);
    expect(b.user.id).toBe(BOB.id);
    expect(d.concurrency.inFlight("user:user-b")).toBe(1);
  });
});

describe("guardPublicRoute", () => {
  it("anonymous: IP limit, then concurrency per IP", async () => {
    const d = deps();
    const a = await guardPublicRoute(req(), d);
    await guardPublicRoute(req(), d);
    expect((await rejection(guardPublicRoute(req(), d))).code).toBe("too_many_concurrent");
    // A different IP is unaffected.
    (await guardPublicRoute(req({ "x-forwarded-for": "8.8.8.8" }), d)).release();
    a.release();
    expect(a.user).toBeNull();
  });

  it("signed in: the per-user limit applies; concurrency is keyed by user, not IP", async () => {
    const d = deps({ getUser: async () => ADA });
    for (let i = 0; i < 3; i++) (await guardPublicRoute(req({ "x-forwarded-for": `1.1.1.${i}` }), d)).release();
    expect((await rejection(guardPublicRoute(req({ "x-forwarded-for": "2.2.2.2" }), d))).code).toBe("rate_limited");
  });

  it("IP limit comes first and doesn't need auth", async () => {
    const getUser = vi.fn(async () => null);
    const d = deps({ getUser, ipLimiter: createRateLimiter({ limit: 1, windowMs: 60_000, now: () => 0 }) });
    (await guardPublicRoute(req(), d)).release();
    expect((await rejection(guardPublicRoute(req(), d))).code).toBe("rate_limited");
    expect(getUser).toHaveBeenCalledTimes(1);
  });
});

describe("contracts", () => {
  it("ApiErrorCode includes auth_required and too_many_concurrent", () => {
    expect(schemas.ApiError.safeParse({ code: "auth_required", message: "x" }).success).toBe(true);
    expect(schemas.ApiError.safeParse({ code: "too_many_concurrent", message: "x" }).success).toBe(true);
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
