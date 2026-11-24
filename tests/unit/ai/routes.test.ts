import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { schemas, type StreamEvent } from "@/lib/contracts";
import { GET as getProviders } from "@/app/api/providers/route";
import { POST as clarify } from "@/app/api/clarify/route";
import { POST as generate } from "@/app/api/generate/route";
import { POST as transform } from "@/app/api/transform/route";
import { GET as getSession } from "@/app/api/session/route";
import { resetGuards } from "@/lib/server/guard";
import type { VerifiedUser } from "@/lib/server/auth";

// Identity is mocked at the one place it comes from: the verified-claims helper.
const auth = vi.hoisted(() => ({ user: null as VerifiedUser | null }));
vi.mock("@/lib/server/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/auth")>()),
  getVerifiedUser: async () => auth.user,
}));

const ADA: VerifiedUser = { id: "user-ada", email: "ada@example.com", name: "Ada Lovelace", avatarUrl: null };

const SUPABASE_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
};
const savedEnv: Record<string, string | undefined> = {};
function configureAuth(on: boolean) {
  for (const [k, v] of Object.entries(SUPABASE_ENV)) {
    if (!(k in savedEnv)) savedEnv[k] = process.env[k];
    if (on) process.env[k] = v;
    else delete process.env[k];
  }
}
afterEach(() => {
  auth.user = null;
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

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

beforeEach(() => resetGuards());

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

const improve = { action: "improve", text: "Some prompt", target: "claude", length: "balanced" };

describe("POST /api/transform", () => {
  it("signed out → 401 auth_required before anything else", async () => {
    configureAuth(true);
    const res = await transform(post("/api/transform", improve));
    expect(res.status).toBe(401);
    const { error } = await res.json();
    expect(schemas.ApiError.safeParse(error).success).toBe(true);
    expect(error).toEqual({ code: "auth_required", message: "Sign in with Google to use AI features." });
  });

  it("signed out with an invalid body is still 401 (auth first)", async () => {
    configureAuth(true);
    const res = await transform(post("/api/transform", { nope: true }));
    expect(res.status).toBe(401);
  });

  it("auth not configured → 401 that says sign-in isn't set up", async () => {
    configureAuth(false);
    const res = await transform(post("/api/transform", improve));
    expect(res.status).toBe(401);
    expect((await res.json()).error.message).toContain("sign-in isn't set up on this server yet");
  });

  it("ignores a spoofed x-user-id header and user id in the body", async () => {
    configureAuth(true);
    const res = await transform(
      post("/api/transform", { ...improve, userId: ADA.id }, { headers: { "x-user-id": ADA.id } }),
    );
    expect(res.status).toBe(401);
  });

  it("signed in → 409 ai_required in Basic Mode", async () => {
    configureAuth(true);
    auth.user = ADA;
    const res = await transform(post("/api/transform", improve));
    expect(res.status).toBe(409);
    const { error } = await res.json();
    expect(error.code).toBe("ai_required");
    expect(error.message).toContain("Improve, Shorten, Expand and Tone need AI");
    expect(error.message).toContain("Basic Mode still works");
    expect(error.message).not.toMatch(/API key to the server|_API_KEY/);
  });

  it("signed in: validates the body: tone without action 'tone' → 400", async () => {
    configureAuth(true);
    auth.user = ADA;
    const res = await transform(
      post("/api/transform", { action: "improve", tone: "friendly", text: "x", target: "claude", length: "balanced" }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.issues[0].path).toBe("tone");
  });

  it("signed in, AI not configured: nothing is consumed, so repeated requests keep answering 409", async () => {
    configureAuth(true);
    auth.user = ADA;
    for (let i = 0; i < 25; i++) expect((await transform(post("/api/transform", improve))).status).toBe(409);
  });

  it("AI_ENABLED=false still answers 409 ai_required (no Gemini call), and Basic Mode keeps working", async () => {
    configureAuth(true);
    auth.user = ADA;
    const prev = process.env.AI_ENABLED;
    process.env.AI_ENABLED = "false";
    try {
      expect((await transform(post("/api/transform", improve))).status).toBe(409);
      expect((await generate(post("/api/generate", validGenerate))).status).toBe(200);
    } finally {
      if (prev === undefined) delete process.env.AI_ENABLED;
      else process.env.AI_ENABLED = prev;
    }
  });
});

describe("GET /api/providers (AiStatusResponse)", () => {
  const LEGACY = {
    OPENAI_API_KEY: "sk-proj-FAKEq7Wx2VALUE1234567890",
    ANTHROPIC_API_KEY: "sk-ant-FAKEz9Kp4VALUE0987654321",
    GEMINI_API_KEY: "AIzaFAKEm3Ry8VALUE1122334455",
  };
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of [...Object.keys(LEGACY), "PROVIDER_ORDER"]) saved[k] = process.env[k];
  });
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("reports Basic Mode, Gemini not configured, auth not configured", async () => {
    configureAuth(false);
    const res = await getProviders(new Request("http://localhost/api/providers"));
    const body = await res.json();
    expect(schemas.AiStatusResponse.safeParse(body).success).toBe(true);
    expect(body).toMatchObject({
      mode: "basic",
      ai: { provider: "gemini", tier: "free", status: "not-configured" },
      auth: { configured: false, signedIn: false },
    });
    expect(body.ai.message).toMatch(/GEMINI_API_KEY isn't set/);
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("reports signedIn only from the verified user", async () => {
    configureAuth(true);
    const out = await (await getProviders(new Request("http://localhost/api/providers", { headers: { "x-user-id": "x" } }))).json();
    expect(out.auth).toEqual({ configured: true, signedIn: false });
    auth.user = ADA;
    const inn = await (await getProviders(new Request("http://localhost/api/providers"))).json();
    expect(inn.auth).toEqual({ configured: true, signedIn: true });
    expect(JSON.stringify(inn)).not.toContain(ADA.email);
  });

  it("ignores legacy provider env vars entirely and never echoes them", async () => {
    configureAuth(false);
    Object.assign(process.env, LEGACY, { PROVIDER_ORDER: "google,openai" });
    const raw = await (await getProviders(new Request("http://localhost/api/providers"))).text();
    expect(JSON.parse(raw).mode).toBe("basic");
    expect(raw).not.toMatch(/FAKE|sk-|AIza|anthropic|openai|google/);
  });
});

describe("GET /api/session", () => {
  it("configured: null user when signed out, the verified user when signed in", async () => {
    configureAuth(true);
    expect(await (await getSession(new Request("http://localhost/api/session"))).json()).toEqual({ configured: true, user: null });
    auth.user = ADA;
    const res = await getSession(new Request("http://localhost/api/session"));
    const body = await res.json();
    expect(schemas.SessionResponse.safeParse(body).success).toBe(true);
    expect(body).toEqual({ configured: true, user: ADA });
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("not configured: never reports a user", async () => {
    configureAuth(false);
    auth.user = ADA;
    expect(await (await getSession(new Request("http://localhost/api/session"))).json()).toEqual({ configured: false, user: null });
  });
});
