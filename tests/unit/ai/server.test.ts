import { describe, expect, it } from "vitest";
import type { StreamEvent } from "@/lib/contracts";
import { readServerEnv } from "@/lib/server/env";
import { clientKey, createRateLimiter } from "@/lib/server/rate-limit";
import { ndjsonResponse } from "@/lib/server/ndjson";
import { AppError } from "@/lib/ai/errors";

describe("readServerEnv", () => {
  it("reads only the abuse limits; provider keys, orders and models are not part of the env", () => {
    const env = readServerEnv({ ANTHROPIC_API_KEY: "sk-ant-secret", PROVIDER_ORDER: "openai", OPENAI_MODEL: "x" });
    expect(env).toEqual({ rateLimitPerMinute: 30, rateLimitPerUserPerMinute: 20 });
    expect(JSON.stringify(env)).not.toContain("secret");
  });

  it("reads RATE_LIMIT_PER_USER_PER_MINUTE with the same rules (default 20, clamp to 1)", () => {
    expect(readServerEnv({ RATE_LIMIT_PER_USER_PER_MINUTE: "5" }).rateLimitPerUserPerMinute).toBe(5);
    expect(readServerEnv({ RATE_LIMIT_PER_USER_PER_MINUTE: "abc" }).rateLimitPerUserPerMinute).toBe(20);
    expect(readServerEnv({ RATE_LIMIT_PER_USER_PER_MINUTE: "0" }).rateLimitPerUserPerMinute).toBe(1);
  });
});

describe("createRateLimiter (sliding window)", () => {
  it("allows the limit, blocks the next, and frees up as the window slides", () => {
    let t = 0;
    const rl = createRateLimiter({ limit: 3, windowMs: 60_000, now: () => t });
    expect(rl.check("a").ok).toBe(true);
    t = 10_000;
    expect(rl.check("a").ok).toBe(true);
    expect(rl.check("a").ok).toBe(true);
    const blocked = rl.check("a");
    expect(blocked).toEqual({ ok: false, retryAfterSec: 50 });
    expect(rl.check("b").ok).toBe(true);
    t = 60_001; // first hit left the window
    expect(rl.check("a").ok).toBe(true);
    expect(rl.check("a").ok).toBe(false);
  });

  it("bounds memory by dropping the least recently used keys", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 2, now: () => 0 });
    rl.check("a");
    rl.check("b");
    rl.check("c"); // evicts "a"
    expect(rl.check("a").ok).toBe(true);
  });

  it("keys on the first x-forwarded-for hop", () => {
    const r = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" } });
    expect(clientKey(r)).toBe("1.2.3.4");
    expect(clientKey(new Request("http://x"))).toBe("unknown");
  });
});

describe("ndjsonResponse", () => {
  async function lines(res: Response): Promise<StreamEvent[]> {
    return (await res.text())
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  }

  it("turns a mid-stream failure into exactly one terminal error event", async () => {
    async function* src(): AsyncGenerator<StreamEvent> {
      yield { type: "meta", engine: { kind: "basic" }, requestId: "r" };
      yield { type: "delta", text: "par" };
      throw new AppError("provider_unavailable", "No provider could finish this prompt. Try again in a minute.");
    }
    const out = await lines(await ndjsonResponse(src()));
    expect(out.map((e) => e.type)).toEqual(["meta", "delta", "error"]);
    expect(out[2]).toEqual({
      type: "error",
      error: { code: "provider_unavailable", message: "No provider could finish this prompt. Try again in a minute." },
    });
  });

  it("drops anything a source emits after its terminal event", async () => {
    async function* src(): AsyncGenerator<StreamEvent> {
      yield { type: "meta", engine: { kind: "basic" }, requestId: "r" };
      yield { type: "done", text: "ok" };
      yield { type: "delta", text: "late" };
    }
    expect((await lines(await ndjsonResponse(src()))).map((e) => e.type)).toEqual(["meta", "done"]);
  });

  it("ends with an error if the source finishes without a terminal event", async () => {
    async function* src(): AsyncGenerator<StreamEvent> {
      yield { type: "meta", engine: { kind: "basic" }, requestId: "r" };
    }
    const out = await lines(await ndjsonResponse(src()));
    expect(out.map((e) => e.type)).toEqual(["meta", "error"]);
    expect(out[1]).toMatchObject({ type: "error", error: { code: "internal" } });
  });

  it("closes the source when the client cancels", async () => {
    let closed = false;
    async function* src(): AsyncGenerator<StreamEvent> {
      try {
        yield { type: "meta", engine: { kind: "basic" }, requestId: "r" };
        yield { type: "delta", text: "a" };
        yield { type: "done", text: "a" };
      } finally {
        closed = true;
      }
    }
    const res = await ndjsonResponse(src());
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel();
    expect(closed).toBe(true);
  });

  it("errors before the first event propagate so routes can answer with a JSON error", async () => {
    async function* src(): AsyncGenerator<StreamEvent> {
      throw new AppError("ai_required", "needs AI");
    }
    await expect(ndjsonResponse(src())).rejects.toMatchObject({ code: "ai_required" });
  });
});

describe("RATE_LIMIT_PER_MINUTE", () => {
  it("defaults to 30 when absent, blank or not a whole number", () => {
    for (const v of [undefined, "", "  ", "abc", "12.5", "1e3", "99999999999999999999"]) {
      expect(readServerEnv({ RATE_LIMIT_PER_MINUTE: v }).rateLimitPerMinute, String(v)).toBe(30);
    }
  });

  it("accepts a positive override", () => {
    expect(readServerEnv({ RATE_LIMIT_PER_MINUTE: "600" }).rateLimitPerMinute).toBe(600);
    expect(readServerEnv({ RATE_LIMIT_PER_MINUTE: " 45 " }).rateLimitPerMinute).toBe(45);
  });

  it("can loosen but never disable the limiter (0 and negatives clamp to 1)", () => {
    expect(readServerEnv({ RATE_LIMIT_PER_MINUTE: "0" }).rateLimitPerMinute).toBe(1);
    expect(readServerEnv({ RATE_LIMIT_PER_MINUTE: "-5" }).rateLimitPerMinute).toBe(1);
  });

  it("the limiter reads a function limit on every check", () => {
    let limit = 1;
    const rl = createRateLimiter({ limit: () => limit, windowMs: 60_000, now: () => 0 });
    expect(rl.check("ip").ok).toBe(true);
    expect(rl.check("ip").ok).toBe(false);
    limit = 3;
    expect(rl.check("ip").ok).toBe(true);
  });
});
