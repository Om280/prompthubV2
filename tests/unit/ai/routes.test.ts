import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { schemas, type StreamEvent } from "@/lib/contracts";
import { GET as getProviders } from "@/app/api/providers/route";
import { POST as clarify } from "@/app/api/clarify/route";
import { POST as generate } from "@/app/api/generate/route";
import { POST as transform } from "@/app/api/transform/route";
import { aiRateLimiter } from "@/lib/server/rate-limit";

let ipCounter = 0;
/** Unique client IP per request so the shared limiter doesn't interfere between tests. */
const freshIp = () => `10.0.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;

function post(path: string, body: unknown, init: { ip?: string; headers?: Record<string, string>; signal?: AbortSignal } = {}) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": init.ip ?? freshIp(), ...(init.headers ?? {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
    signal: init.signal,
  });
}

async function readLines(res: Response): Promise<StreamEvent[]> {
  const text = await res.text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as StreamEvent);
}

const validGenerate = { idea: "plan a 3-day trip to Lisbon", target: "claude", length: "balanced", answers: [] };

beforeEach(() => aiRateLimiter.reset());

describe("POST /api/generate", () => {
  it("streams NDJSON: first line meta, last line done, exactly one terminal event", async () => {
    const res = await generate(post("/api/generate", validGenerate));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/x-ndjson; charset=utf-8");
    const lines = await readLines(res);
    for (const l of lines) expect(schemas.StreamEvent.safeParse(l).success).toBe(true);
    expect(lines[0]).toMatchObject({ type: "meta", engine: { kind: "basic" } });
    expect(lines.at(-1)?.type).toBe("done");
    expect(lines.filter((l) => l.type === "done" || l.type === "error")).toHaveLength(1);
    expect(lines.filter((l) => l.type === "delta")).toHaveLength(1);
    const done = lines.at(-1) as Extract<StreamEvent, { type: "done" }>;
    expect(done.text).toContain("Lisbon");
    expect(done.title).toBe("3-day trip to Lisbon");
  });

  it("invalid body → 400 invalid_request with issues", async () => {
    const res = await generate(post("/api/generate", { idea: "", target: "bard", length: "balanced", answers: [] }));
    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(schemas.ApiError.safeParse(error).success).toBe(true);
    expect(error.code).toBe("invalid_request");
    expect(error.issues.map((i: { path: string }) => i.path)).toEqual(expect.arrayContaining(["idea", "target"]));
    expect(error.message).toMatch(/idea/);
  });

  it("malformed JSON → 400 invalid_request", async () => {
    const res = await generate(post("/api/generate", "{not json"));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_request");
  });

  it("oversize body → 413 mapped to invalid_request (streamed body, no content-length)", async () => {
    const big = JSON.stringify({ ...validGenerate, idea: "x".repeat(70 * 1024) });
    const res = await generate(post("/api/generate", big));
    expect(res.status).toBe(413);
    const { error } = await res.json();
    expect(error.code).toBe("invalid_request");
    expect(error.message).toContain("64 KB");
  });

  it("oversize declared content-length → 413 before reading", async () => {
    const res = await generate(post("/api/generate", validGenerate, { headers: { "content-length": String(65 * 1024) } }));
    expect(res.status).toBe(413);
  });

  it("honours client abort: no further events are produced after the client goes away", async () => {
    const ac = new AbortController();
    const res = await generate(post("/api/generate", validGenerate, { signal: ac.signal }));
    ac.abort();
    const lines = await readLines(res);
    expect(lines.map((l) => l.type)).toEqual(["meta"]);
  });
});

describe("POST /api/clarify", () => {
  it("returns contract-valid questions from the local engine", async () => {
    const res = await clarify(post("/api/clarify", { idea: "write an email", target: "gemini", length: "concise" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(schemas.ClarifyResponse.safeParse(body).success).toBe(true);
    expect(body.engine).toEqual({ kind: "basic" });
  });

  it("invalid body → 400 with issues", async () => {
    const res = await clarify(post("/api/clarify", { target: "claude" }));
    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(error.issues.length).toBeGreaterThan(0);
  });

  it("rate limits at 30 requests per minute per IP → 429 rate_limited with retryAfterSec", async () => {
    const ip = freshIp();
    const body = { idea: "write an email", target: "claude", length: "balanced" };
    for (let i = 0; i < 30; i++) {
      expect((await clarify(post("/api/clarify", body, { ip }))).status).toBe(200);
    }
    const res = await clarify(post("/api/clarify", body, { ip }));
    expect(res.status).toBe(429);
    const { error } = await res.json();
    expect(error.code).toBe("rate_limited");
    expect(error.retryAfterSec).toBeGreaterThan(0);
    expect(res.headers.get("retry-after")).toBe(String(error.retryAfterSec));
    // Another client is unaffected.
    expect((await clarify(post("/api/clarify", body))).status).toBe(200);
  });
});

describe("POST /api/transform", () => {
  it("returns 409 ai_required in Basic Mode", async () => {
    const res = await transform(
      post("/api/transform", { action: "improve", text: "Some prompt", target: "claude", length: "balanced" }),
    );
    expect(res.status).toBe(409);
    const { error } = await res.json();
    expect(error.code).toBe("ai_required");
    expect(error.message).toContain("Improve, Shorten, Expand and Tone need an AI provider. This build runs in Basic Mode.");
  });

  it("validates first: tone without action 'tone' → 400", async () => {
    const res = await transform(
      post("/api/transform", { action: "improve", tone: "friendly", text: "x", target: "claude", length: "balanced" }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.issues[0].path).toBe("tone");
  });
});

describe("GET /api/providers", () => {
  const KEYS = {
    OPENAI_API_KEY: "sk-proj-FAKEq7Wx2VALUE1234567890",
    ANTHROPIC_API_KEY: "sk-ant-FAKEz9Kp4VALUE0987654321",
    GEMINI_API_KEY: "AIzaFAKEm3Ry8VALUE1122334455",
  };
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of [...Object.keys(KEYS), "PROVIDER_ORDER"]) saved[k] = process.env[k];
  });
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("reports Basic Mode with no keys", async () => {
    for (const k of Object.keys(KEYS)) delete process.env[k];
    const res = await getProviders(new Request("http://localhost/api/providers"));
    expect(await res.json()).toEqual({ mode: "basic", providers: [], default: null, detected: [] });
  });

  it("lists detected providers in PROVIDER_ORDER and never contains key values or fragments", async () => {
    Object.assign(process.env, KEYS, { PROVIDER_ORDER: "google, openai,bogus" });
    const res = await getProviders(new Request("http://localhost/api/providers"));
    const raw = await res.text();
    const body = JSON.parse(raw);
    expect(schemas.ProvidersResponse.safeParse(body).success).toBe(true);
    expect(body).toEqual({ mode: "basic", providers: [], default: null, detected: ["google", "openai", "anthropic"] });
    for (const v of Object.values(KEYS)) {
      expect(raw).not.toContain(v);
      for (let i = 0; i + 8 <= v.length; i += 4) expect(raw).not.toContain(v.slice(i, i + 8));
    }
    expect(raw).not.toMatch(/FAKE|sk-|AIza/);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("treats whitespace-only keys as absent", async () => {
    for (const k of Object.keys(KEYS)) delete process.env[k];
    process.env.OPENAI_API_KEY = "   ";
    const body = await (await getProviders(new Request("http://localhost/api/providers"))).json();
    expect(body.detected).toEqual([]);
  });
});
