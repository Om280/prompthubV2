import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { schemas } from "@/lib/contracts";
import { AI_LIMIT_MESSAGES, AppError } from "@/lib/ai/errors";
import { mapGeminiError } from "@/lib/ai/gemini-errors";
import { checkGeminiModel, FREE_TIER_TEXT_MODELS, GEMINI_PRICING_SOURCE, PAID_ONLY_MODELS } from "@/lib/ai/gemini-models";
import { aiCallSignal, isTimeout } from "@/lib/ai/cancellation";
import {
  aiReadiness,
  aiReadinessChecked,
  aiStatusResponse,
  AI_DISABLED_MESSAGE,
  AI_MIGRATION_MISSING_MESSAGE,
  AI_QUOTA_UNREACHABLE_MESSAGE,
  AI_UNAVAILABLE_MESSAGE,
} from "@/lib/ai/status";
import { AI_GLOBAL_DEFAULTS, describeCeilings, globalCeilings, readServerEnv } from "@/lib/server/env";
import {
  createMemoryQuotaStore,
  createSupabaseQuotaStore,
  invalidateQuotaHealth,
  probeQuotaStore,
  QuotaStoreError,
  quotaFailureOf,
  quotaHealth,
  type RpcClient,
} from "@/lib/server/quota";
import { nextPacificMidnight, windowReset, windowStart } from "@/lib/server/quota-windows";
import { redact } from "@/lib/server/redact";

const at = (iso: string) => new Date(iso);

describe("quota windows: Pacific-midnight days, DST", () => {
  it("winter (PST, UTC-8): the day starts at 08:00 UTC", () => {
    expect(windowStart("day", at("2026-11-24T12:00:00Z")).toISOString()).toBe("2026-11-24T08:00:00.000Z");
    expect(windowReset("day", at("2026-11-24T12:00:00Z")).toISOString()).toBe("2026-11-25T08:00:00.000Z");
  });

  it("just before Pacific midnight still belongs to the previous Pacific day", () => {
    // 07:59 UTC on the 24th is 23:59 PST on the 23rd.
    expect(windowStart("day", at("2026-11-24T07:59:59Z")).toISOString()).toBe("2026-11-23T08:00:00.000Z");
    expect(nextPacificMidnight(at("2026-11-24T07:59:59Z"))).toBe("2026-11-24T08:00:00.000Z");
    expect(nextPacificMidnight(at("2026-11-24T08:00:00Z"))).toBe("2026-11-25T08:00:00.000Z");
  });

  it("summer (PDT, UTC-7): the day starts at 07:00 UTC", () => {
    expect(windowStart("day", at("2026-07-04T12:00:00Z")).toISOString()).toBe("2026-07-04T07:00:00.000Z");
  });

  it("spring forward (8 Mar 2026): a 23-hour day", () => {
    const start = windowStart("day", at("2026-03-08T12:00:00Z"));
    const reset = windowReset("day", at("2026-03-08T12:00:00Z"));
    expect(start.toISOString()).toBe("2026-03-08T08:00:00.000Z");
    expect(reset.toISOString()).toBe("2026-03-09T07:00:00.000Z");
    expect((reset.getTime() - start.getTime()) / 3_600_000).toBe(23);
  });

  it("fall back (1 Nov 2026): a 25-hour day", () => {
    const start = windowStart("day", at("2026-11-01T12:00:00Z"));
    const reset = windowReset("day", at("2026-11-01T12:00:00Z"));
    expect(start.toISOString()).toBe("2026-11-01T07:00:00.000Z");
    expect(reset.toISOString()).toBe("2026-11-02T08:00:00.000Z");
    expect((reset.getTime() - start.getTime()) / 3_600_000).toBe(25);
  });

  it("year end rolls over", () => {
    expect(nextPacificMidnight(at("2026-12-31T20:00:00Z"))).toBe("2027-01-01T08:00:00.000Z");
  });

  it("minute and hour windows", () => {
    expect(windowStart("minute", at("2026-11-24T12:34:56.789Z")).toISOString()).toBe("2026-11-24T12:34:00.000Z");
    expect(windowReset("hour", at("2026-11-24T12:34:56Z")).toISOString()).toBe("2026-11-24T13:00:00.000Z");
  });
});

describe("memory quota store (test double of the SQL)", () => {
  it("windows reset: a new hour starts a new count", async () => {
    let now = at("2026-11-24T12:59:00Z");
    const store = createMemoryQuotaStore(() => now);
    const w = (key: string) => [{ bucket: "user:a:hour", window: "hour" as const, limit: 1, key }];
    expect(await store.consume(w("r1"))).toMatchObject({ ok: true, replay: false });
    expect(await store.consume(w("r2"))).toEqual({ ok: false, bucket: "user:a:hour", resetsAt: at("2026-11-24T13:00:00Z") });
    now = at("2026-11-24T13:00:01Z");
    expect(await store.consume(w("r2"))).toMatchObject({ ok: true });
  });

  it("the global day budget resets at Pacific midnight, not UTC midnight", async () => {
    let now = at("2026-11-25T00:30:00Z"); // 16:30 PST on the 24th
    const store = createMemoryQuotaStore(() => now);
    const w = (key: string) => [{ bucket: "global:rpd", window: "day" as const, limit: 1, key }];
    await store.consume(w("r1"));
    now = at("2026-11-25T07:59:00Z"); // 23:59 PST: same Pacific day
    expect((await store.consume(w("r2"))).ok).toBe(false);
    now = at("2026-11-25T08:00:00Z"); // Pacific midnight
    expect((await store.consume(w("r2"))).ok).toBe(true);
  });

  it("amounts and idempotency keys: same key in the same period is a replay, never re-counted", async () => {
    const store = createMemoryQuotaStore(() => at("2026-11-24T12:00:00Z"));
    const w = (key: string, amount: number) => [{ bucket: "global:tpm", window: "minute" as const, limit: 100, amount, key }];
    expect(await store.consume(w("r1", 60))).toMatchObject({ ok: true, replay: false });
    expect(await store.consume(w("r1", 60))).toMatchObject({ ok: true, replay: true });
    expect((await store.consume(w("r2", 60))).ok).toBe(false); // 60 + 60 > 100
    await store.adjust("global:tpm", "minute", at("2026-11-24T12:00:00Z"), -40); // reconcile 60 → 20
    expect((await store.consume(w("r2", 60))).ok).toBe(true);
    await store.adjust("global:tpm", "minute", at("2026-11-24T12:00:00Z"), -1000);
    expect([...store.counts().values()]).toEqual([0]); // never below zero
  });

  it("in-flight rows expire after their TTL", async () => {
    let now = at("2026-11-24T12:00:00Z");
    const store = createMemoryQuotaStore(() => now);
    expect(await store.acquireInflight("b", "r1", "h1", 1, 60)).toBe("ok");
    expect(await store.acquireInflight("b", "r2", "h2", 1, 60)).toBe("busy");
    now = at("2026-11-24T12:01:01Z");
    expect(await store.acquireInflight("b", "r2", "h2", 1, 60)).toBe("ok");
  });
});

describe("Supabase quota store (mocked RPC)", () => {
  function rpcClient(impl: (fn: string, args: Record<string, unknown>) => { data: unknown; error: unknown }) {
    const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => impl(fn, args));
    return { client: { rpc } as unknown as RpcClient, rpc };
  }

  it("ai_consume: sends buckets, windows and limits as parallel arrays", async () => {
    const { client, rpc } = rpcClient(() => ({
      data: [{ ok: true, replay: false, failed_bucket: null, resets_at: null, reserved_at: "2026-11-24T12:00:00+00:00" }],
      error: null,
    }));
    const store = createSupabaseQuotaStore(client);
    expect(
      await store.consume([
        { bucket: "user:a:min", window: "minute", limit: 3, key: "r" },
        { bucket: "global:tpm", window: "minute", limit: 700, amount: 50, key: "r" },
      ]),
    ).toEqual({ ok: true, replay: false, reservedAt: at("2026-11-24T12:00:00Z") });
    expect(rpc).toHaveBeenCalledWith("ai_consume", {
      p_buckets: ["user:a:min", "global:tpm"],
      p_windows: ["minute", "minute"],
      p_limits: [3, 700],
      p_amounts: [1, 50],
      p_keys: ["r", "r"],
    });
  });

  it("ai_adjust reconciles the token bucket", async () => {
    const { client, rpc } = rpcClient(() => ({ data: null, error: null }));
    await createSupabaseQuotaStore(client).adjust("global:tpm", "minute", at("2026-11-24T12:00:00Z"), -30);
    expect(rpc).toHaveBeenCalledWith("ai_adjust", { p_bucket: "global:tpm", p_window: "minute", p_at: "2026-11-24T12:00:00.000Z", p_delta: -30 });
  });

  it("ai_consume: reports the failed bucket and its reset time", async () => {
    const { client } = rpcClient(() => ({
      data: [{ ok: false, failed_bucket: "global:day", resets_at: "2026-11-25T08:00:00+00:00" }],
      error: null,
    }));
    expect(await createSupabaseQuotaStore(client).consume([{ bucket: "global:day", window: "day", limit: 1, key: "r" }])).toEqual({
      ok: false,
      bucket: "global:day",
      resetsAt: at("2026-11-25T08:00:00Z"),
    });
  });

  it("ai_acquire_inflight / ai_release_inflight / ai_record_usage", async () => {
    const { client, rpc } = rpcClient((fn) => ({ data: fn === "ai_acquire_inflight" ? "duplicate" : null, error: null }));
    const store = createSupabaseQuotaStore(client);
    expect(await store.acquireInflight("inflight:user:a", "rid", "hash", 1, 120)).toBe("duplicate");
    await store.releaseInflight("rid");
    await store.recordUsage({ userId: "u", requestId: "rid", operation: "improve", model: "m", inputTokens: 1, outputTokens: 2, status: "ok", durationMs: 5, requestHash: "h" });
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["ai_acquire_inflight", "ai_release_inflight", "ai_record_usage"]);
    expect(rpc.mock.calls[0][1]).toEqual({ p_bucket: "inflight:user:a", p_request_id: "rid", p_hash: "hash", p_max: 1, p_ttl_seconds: 120 });
    expect(Object.keys(rpc.mock.calls[2][1] as object).sort()).toEqual(
      ["p_duration_ms", "p_input_tokens", "p_model", "p_operation", "p_output_tokens", "p_request_hash", "p_request_id", "p_status", "p_user_id"].sort(),
    );
  });

  it("database errors become QuotaStoreError without the database's message", async () => {
    const { client } = rpcClient(() => ({ data: null, error: { message: "relation ai_rate_counters secret detail" } }));
    const err = await createSupabaseQuotaStore(client)
      .consume([{ bucket: "x", window: "hour", limit: 1, key: "r" }])
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(QuotaStoreError);
    expect((err as Error).message).not.toContain("secret detail");
    expect((err as QuotaStoreError).reason).toBe("unreachable");
  });

  it("a missing migration (404 / PGRST202 / PGRST205) is reported as migration-missing", async () => {
    for (const [error, status] of [
      [{ code: "PGRST202", message: "Could not find the function public.ai_consume" }, 404],
      [{ code: "PGRST205", message: "Could not find the table" }, 404],
      [{ message: "not found" }, 404],
    ] as const) {
      const rpc = vi.fn(async () => ({ data: null, error, status }));
      const err = await createSupabaseQuotaStore({ rpc } as unknown as RpcClient)
        .consume([{ bucket: "x", window: "day", limit: 1, key: "r" }])
        .catch((e: unknown) => e);
      expect((err as QuotaStoreError).reason).toBe("migration-missing");
      expect(quotaFailureOf(error, status)).toBe("migration-missing");
    }
  });

  it("health probe: a harmless no-op call, classified; cached for a minute when healthy", async () => {
    const missing = vi.fn(async () => ({ data: null, error: { code: "PGRST202" }, status: 404 }));
    expect(await probeQuotaStore({ rpc: missing } as unknown as RpcClient)).toBe("migration-missing");
    expect(missing).toHaveBeenCalledWith("ai_release_inflight", { p_request_id: "00000000-0000-0000-0000-000000000000" });
    const ok = vi.fn(async () => ({ data: null, error: null, status: 204 }));
    expect(await probeQuotaStore({ rpc: ok } as unknown as RpcClient)).toBe("ok");
    const thrown = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await probeQuotaStore({ rpc: thrown } as unknown as RpcClient)).toBe("unreachable");

    invalidateQuotaHealth();
    const probe = vi.fn(async () => "ok" as const);
    const t0 = 1_000_000;
    expect(await quotaHealth(probe, t0)).toBe("ok");
    expect(await quotaHealth(probe, t0 + 59_000)).toBe("ok");
    expect(probe).toHaveBeenCalledTimes(1);
    await quotaHealth(probe, t0 + 61_000);
    expect(probe).toHaveBeenCalledTimes(2);
    // Failures are re-checked sooner (15 s).
    invalidateQuotaHealth();
    const bad = vi.fn(async () => "migration-missing" as const);
    await quotaHealth(bad, t0);
    await quotaHealth(bad, t0 + 10_000);
    expect(bad).toHaveBeenCalledTimes(1);
    await quotaHealth(bad, t0 + 16_000);
    expect(bad).toHaveBeenCalledTimes(2);
    invalidateQuotaHealth();
  });
});

describe("free-tier model allowlist", () => {
  it("accepts every allowlisted model, verified on 2026-11-23 from the pricing page", () => {
    for (const m of FREE_TIER_TEXT_MODELS) {
      expect(checkGeminiModel(m.id)).toEqual({ ok: true, model: m.id });
      expect(m.verifiedOn).toBe("2026-11-23");
      expect(m.source).toBe(GEMINI_PRICING_SOURCE);
    }
  });

  it("rejects paid-only, Pro, image, Omni, Genie, unknown and missing, naming the problem", () => {
    for (const id of [...PAID_ONLY_MODELS, "gemini-2.5-pro", "gemini-9-pro", "gemini-3.8-flash-tts", "gemini-3.8-live"]) {
      const r = checkGeminiModel(id);
      expect(r.ok, id).toBe(false);
    }
    const paid = checkGeminiModel("gemini-4-carbon");
    expect(paid).toMatchObject({ ok: false, reason: "paid-only" });
    expect(!paid.ok && paid.message).toContain("gemini-4-carbon");
    expect(checkGeminiModel("gemini-made-up")).toMatchObject({ ok: false, reason: "not-allowed" });
    expect(checkGeminiModel("")).toMatchObject({ ok: false, reason: "missing" });
    expect(checkGeminiModel(undefined)).toMatchObject({ ok: false, reason: "missing" });
  });

  it("never substitutes another model", () => {
    const r = checkGeminiModel("gemini-3.1-pro-preview");
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toMatch(/flash/);
  });
});

describe("AI readiness and status", () => {
  const full = {
    GEMINI_API_KEY: "AIzaSyFAKE-not-a-real-key-000000000000000",
    GEMINI_MODEL: "gemini-3.5-flash-lite",
    GEMINI_PROJECT_RPM: "15",
    GEMINI_PROJECT_TPM: "250000",
    GEMINI_PROJECT_RPD: "1000",
  };

  it("complete configuration → ready (AI is built), model shown", () => {
    const r = aiReadiness({ env: readServerEnv(full), quotaConfigured: true });
    expect(r).toMatchObject({ status: "ready", model: "gemini-3.5-flash-lite" });
    expect(aiReadiness({ env: readServerEnv(full), quotaConfigured: true, built: false })).toEqual({
      status: "unavailable",
      model: "gemini-3.5-flash-lite",
      message: AI_UNAVAILABLE_MESSAGE,
    });
  });

  it("missing GEMINI_PROJECT_* no longer blocks AI: conservative defaults apply, and status says so", () => {
    const env = readServerEnv({ GEMINI_API_KEY: full.GEMINI_API_KEY, GEMINI_MODEL: "gemini-3.8-flash" });
    expect(aiReadiness({ env, quotaConfigured: true }).status).toBe("ready");
    const c = globalCeilings(env);
    expect(c).toEqual({ ...AI_GLOBAL_DEFAULTS, basis: "conservative-defaults", explicit: false });
    expect(AI_GLOBAL_DEFAULTS).toEqual({ rpm: 5, tpm: 100_000, rpd: 100 });
    const status = aiStatusResponse({ authConfigured: true, signedIn: true, env, readiness: aiReadiness({ env, quotaConfigured: true }) });
    expect(status.ai.limits).toEqual({
      basis: "conservative-defaults",
      description: "Conservative defaults (project limits not supplied): 5 requests/min, 100,000 tokens/min, 100 requests/day app-wide.",
    });
    expect(schemas.AiStatusResponse.safeParse(status).success).toBe(true);
  });

  it("AI_GLOBAL_* are configurable; with project limits, 70% of them applies, capped by AI_GLOBAL_*", () => {
    expect(globalCeilings(readServerEnv({ AI_GLOBAL_RPM: "2", AI_GLOBAL_TPM: "5000", AI_GLOBAL_RPD: "20" }))).toEqual({
      rpm: 2,
      tpm: 5000,
      rpd: 20,
      basis: "conservative-defaults",
      explicit: true,
    });
    expect(describeCeilings(globalCeilings(readServerEnv({ AI_GLOBAL_RPM: "2" })), 0.7)).toMatch(/^App-wide limits set on this server/);
    expect(describeCeilings(globalCeilings(readServerEnv({})), 0.7)).toMatch(/^Conservative defaults/);
    const project = readServerEnv(full); // 15 / 250,000 / 1,000
    expect(globalCeilings(project)).toEqual({ rpm: 10, tpm: 175_000, rpd: 700, basis: "project-ratio", explicit: false });
    expect(describeCeilings(globalCeilings(project), 0.7)).toMatch(/^70% of supplied project limits: 10 requests\/min/);
    expect(globalCeilings(readServerEnv({ ...full, AI_GLOBAL_RPD: "50", AI_GLOBAL_RPM: "999" }))).toMatchObject({ rpm: 10, rpd: 50 });
    expect(globalCeilings(readServerEnv({ GEMINI_PROJECT_RPM: "100" }))).toMatchObject({ rpm: 70, tpm: 100_000, basis: "mixed" });
    // Invalid values fall back to the defaults, never to "unlimited".
    expect(globalCeilings(readServerEnv({ AI_GLOBAL_RPM: "0", AI_GLOBAL_TPM: "lots" }))).toMatchObject({ rpm: 5, tpm: 100_000 });
  });

  it("AI_MAX_OUTPUT_TOKENS defaults to 4096 (thinking tokens count as output); GEMINI_THINKING_LEVEL is validated", () => {
    expect(readServerEnv({}).ai.maxOutputTokens).toBe(4096);
    expect(readServerEnv({}).thinkingLevel).toBe("low");
    expect(readServerEnv({ GEMINI_THINKING_LEVEL: "HIGH" }).thinkingLevel).toBe("high");
    expect(readServerEnv({ GEMINI_THINKING_LEVEL: "minimal" }).thinkingLevel).toBe("low");
    expect(readServerEnv({ GEMINI_THINKING_LEVEL: "max" }).thinkingLevel).toBe("low");
  });

  it("quota store migration missing or unreachable → unavailable with a clear reason (fails closed)", async () => {
    const env = readServerEnv(full);
    expect(await aiReadinessChecked({ env, quotaConfigured: true, health: async () => "migration-missing" })).toMatchObject({
      status: "unavailable",
      message: AI_MIGRATION_MISSING_MESSAGE,
    });
    expect(AI_MIGRATION_MISSING_MESSAGE).toContain("AI usage limits aren't set up yet (database migration missing)");
    expect(await aiReadinessChecked({ env, quotaConfigured: true, health: async () => "unreachable" })).toMatchObject({
      status: "unavailable",
      message: AI_QUOTA_UNREACHABLE_MESSAGE,
    });
    expect((await aiReadinessChecked({ env, quotaConfigured: true, health: async () => "ok" })).status).toBe("ready");
  });

  it("the health probe only runs when everything else is configured (no network call otherwise)", async () => {
    const health = vi.fn(async () => "ok" as const);
    await aiReadinessChecked({ env: readServerEnv({}), quotaConfigured: true, health });
    await aiReadinessChecked({ env: readServerEnv(full), quotaConfigured: false, health });
    expect(health).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...full, GEMINI_API_KEY: "" }, /GEMINI_API_KEY isn't set/],
    [{ ...full, GEMINI_MODEL: "" }, /GEMINI_MODEL isn't set/],
    [{ ...full, GEMINI_MODEL: "gemini-4-argon" }, /isn't a free-tier text model/],
  ])("missing piece → not-configured with a message naming it", (env, message) => {
    const r = aiReadiness({ env: readServerEnv(env), quotaConfigured: true });
    expect(r.status).toBe("not-configured");
    expect(r.message).toMatch(message);
  });

  it("AI_ENABLED=false (the emergency switch) → unavailable with a clear message, whatever else is set", () => {
    for (const v of ["false", "0", "off", "FALSE"]) {
      expect(aiReadiness({ env: readServerEnv({ ...full, AI_ENABLED: v }), quotaConfigured: true, built: true })).toMatchObject({
        status: "unavailable",
        message: AI_DISABLED_MESSAGE,
      });
    }
    expect(aiReadiness({ env: readServerEnv({ ...full, AI_ENABLED: "true" }), quotaConfigured: true, built: true }).status).toBe("ready");
  });

  it("no quota store → not-configured (never falls back to memory)", () => {
    expect(aiReadiness({ env: readServerEnv(full), quotaConfigured: false })).toMatchObject({
      status: "not-configured",
      message: expect.stringContaining("quota store"),
    });
  });

  it("status never contains the key", () => {
    const res = aiStatusResponse({
      authConfigured: true,
      signedIn: true,
      readiness: aiReadiness({ env: readServerEnv(full), quotaConfigured: true, built: false }),
    });
    expect(schemas.AiStatusResponse.safeParse(res).success).toBe(true);
    expect(JSON.stringify(res)).not.toContain("AIza");
    expect(res).toMatchObject({ mode: "basic", ai: { provider: "gemini", tier: "free", model: "gemini-3.5-flash-lite", status: "unavailable" } });
  });

  it("when built: sign-in-required, ready, quota-exhausted with resetsAt", () => {
    const readiness = aiReadiness({ env: readServerEnv(full), quotaConfigured: true, built: true });
    expect(aiStatusResponse({ authConfigured: true, signedIn: false, readiness }).ai.status).toBe("sign-in-required");
    expect(aiStatusResponse({ authConfigured: true, signedIn: true, readiness })).toMatchObject({ mode: "ai", ai: { status: "ready" } });
    const ex = aiStatusResponse({ authConfigured: true, signedIn: true, readiness, budgetExhaustedUntil: "2026-11-25T08:00:00.000Z" });
    expect(ex).toMatchObject({ mode: "basic", ai: { status: "quota-exhausted", resetsAt: "2026-11-25T08:00:00.000Z" } });
    expect(schemas.AiStatusResponse.safeParse(ex).success).toBe(true);
  });
});

describe("mapGeminiError (no retries, no fallback)", () => {
  const now = at("2026-11-24T12:00:00Z");
  const quiet = () => vi.spyOn(console, "error").mockImplementation(() => {});

  it("429 RESOURCE_EXHAUSTED per-day → quota_exhausted, resetsAt = next Pacific midnight", () => {
    const spy = quiet();
    const e = mapGeminiError(
      {
        error: {
          code: 429,
          status: "RESOURCE_EXHAUSTED",
          message: "Quota exceeded for metric generate_content_free_tier_requests, key AIzaSyLEAKED00000000000000000000000000000",
          details: [{ "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] }],
        },
      },
      now,
    );
    expect(e).toBeInstanceOf(AppError);
    expect(e.code).toBe("quota_exhausted");
    expect(e.status).toBe(503);
    expect(e.extras.resetsAt).toBe("2026-11-25T08:00:00.000Z");
    expect(e.message).toBe(AI_LIMIT_MESSAGES.quota_exhausted);
    expect(e.message).not.toContain("AIza");
    expect(spy.mock.calls.join(" ")).not.toContain("LEAKED");
    spy.mockRestore();
  });

  it("429 per-minute with RetryInfo → resetsAt = now + retryDelay", () => {
    const spy = quiet();
    const e = mapGeminiError(
      {
        code: 429,
        status: "RESOURCE_EXHAUSTED",
        details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "31s" }],
      },
      now,
    );
    expect(e.extras).toEqual({ resetsAt: "2026-11-24T12:00:31.000Z", retryAfterSec: 31 });
    spy.mockRestore();
  });

  it("a bare 429 status (SDK error) still maps to quota_exhausted", () => {
    const spy = quiet();
    expect(mapGeminiError({ status: 429 }, now).code).toBe("quota_exhausted");
    spy.mockRestore();
  });

  it.each([
    [{ error: { code: 403, status: "PERMISSION_DENIED" } }],
    [{ error: { code: 400, status: "FAILED_PRECONDITION", message: "User location is not supported" } }],
    [{ error: { code: 503, status: "UNAVAILABLE" } }],
    [new TypeError("fetch failed")],
  ])("other failures → provider_unavailable with our own message", (err) => {
    const spy = quiet();
    const e = mapGeminiError(err, now);
    expect(e.code).toBe("provider_unavailable");
    expect(e.message).toContain("Basic Mode still works");
    spy.mockRestore();
  });
});

describe("redact", () => {
  it("masks Google API keys, the configured secret values, bearer tokens and JWTs", () => {
    const key = "AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q";
    expect(key).toHaveLength(39);
    const out = redact(
      `key=${key} secret=sb_secret_abcdefghijkl Bearer abc.def.ghijkl token eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl`,
      { SUPABASE_SECRET_KEY: "sb_secret_abcdefghijkl" },
    );
    expect(out).not.toContain(key);
    expect(out).not.toContain("sb_secret_abcdefghijkl");
    expect(out).not.toContain("abc.def.ghijkl");
    expect(out).not.toContain("eyJhbGciOi");
  });

  it("masks an unusually formatted GEMINI_API_KEY by value", () => {
    expect(redact("oops custom-key-value-123 here", { GEMINI_API_KEY: "custom-key-value-123" })).not.toContain("custom-key-value-123");
  });
});

describe("cancellation hooks", () => {
  it("aborts when the client aborts", () => {
    const ac = new AbortController();
    const signal = aiCallSignal(ac.signal, 60_000);
    ac.abort();
    expect(signal.aborted).toBe(true);
    expect(isTimeout(signal)).toBe(false);
  });

  it("aborts after AI_TIMEOUT_MS", async () => {
    const signal = aiCallSignal(undefined, 5);
    await new Promise((r) => setTimeout(r, 30));
    expect(signal.aborted).toBe(true);
    expect(isTimeout(signal)).toBe(true);
  });

  it("AI_TIMEOUT_MS defaults to 30 s and is configurable", () => {
    expect(readServerEnv({}).ai.timeoutMs).toBe(30_000);
    expect(readServerEnv({ AI_TIMEOUT_MS: "5000" }).ai.timeoutMs).toBe(5000);
  });

  it("AI_GLOBAL_SAFETY_RATIO defaults to 0.7 and rejects values outside (0, 1]", () => {
    expect(readServerEnv({ AI_GLOBAL_SAFETY_RATIO: "0.5" }).project.safetyRatio).toBe(0.5);
    for (const v of ["0", "1.5", "-1", "abc"]) expect(readServerEnv({ AI_GLOBAL_SAFETY_RATIO: v }).project.safetyRatio).toBe(0.7);
  });
});
