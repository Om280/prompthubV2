import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { safeNextPath, authErrorMessage, AUTH_ERROR_MESSAGES } from "@/lib/auth/safe-next";
import { callbackUrl } from "@/lib/client/auth";

/* Mocks: the request-scoped Supabase server client and the Next cookie store. */
const sb = vi.hoisted(() => ({
  configured: true,
  exchange: vi.fn(),
  signOut: vi.fn(),
  cookies: [] as { name: string; value: string }[],
  deleted: [] as string[],
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () =>
    sb.configured ? { auth: { exchangeCodeForSession: sb.exchange, signOut: sb.signOut } } : null,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => sb.cookies,
    delete: (name: string) => sb.deleted.push(name),
  }),
}));

const { GET: callback } = await import("@/app/auth/callback/route");
const { POST: signout, isSameOrigin } = await import("@/app/auth/signout/route");

const ORIGIN = "http://localhost:3000";
const cb = (query: string) => callback(new Request(`${ORIGIN}/auth/callback${query}`));
const location = (res: Response) => res.headers.get("location");

beforeEach(() => {
  sb.configured = true;
  sb.exchange.mockReset().mockResolvedValue({ data: { session: {}, user: {} }, error: null });
  sb.signOut.mockReset().mockResolvedValue({ error: null });
  sb.cookies = [];
  sb.deleted = [];
});
afterEach(() => vi.restoreAllMocks());

describe("safeNextPath", () => {
  it.each([
    ["/", "/"],
    ["/account", "/account"],
    ["/account?tab=ai#key", "/account?tab=ai#key"],
    ["/a/../b", "/b"],
  ])("keeps same-origin path %s", (raw, out) => expect(safeNextPath(raw)).toBe(out));

  it.each([
    "//evil.com",
    "https://evil.com",
    "http://evil.com/account",
    "/\\evil.com",
    "\\\\evil.com",
    "/\\/evil.com",
    "javascript:alert(1)",
    "evil.com",
    "/\tevil",
    "/\n/evil.com",
    "",
    null,
    undefined,
    `/${"a".repeat(3000)}`,
  ])("rejects %j → /", (raw) => expect(safeNextPath(raw as string | null | undefined)).toBe("/"));

  it("builds the callback URL with an encoded, sanitised next", () => {
    expect(callbackUrl(ORIGIN, "/account?x=1")).toBe(`${ORIGIN}/auth/callback?next=%2Faccount%3Fx%3D1`);
    expect(callbackUrl(ORIGIN, "//evil.com")).toBe(`${ORIGIN}/auth/callback?next=%2F`);
  });

  it("maps auth error codes to fixed messages, never echoing unknown input", () => {
    expect(authErrorMessage("access_denied")).toBe(AUTH_ERROR_MESSAGES.access_denied);
    expect(authErrorMessage("<script>")).toBe(AUTH_ERROR_MESSAGES.provider_error);
    expect(authErrorMessage(null)).toBeNull();
  });
});

describe("GET /auth/callback", () => {
  it("valid code → exchanges it and redirects to next", async () => {
    const res = await cb("?code=abc123&next=%2Faccount");
    expect(sb.exchange).toHaveBeenCalledWith("abc123");
    expect(res.status).toBe(303);
    expect(location(res)).toBe(`${ORIGIN}/account`);
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("no next → /", async () => {
    expect(location(await cb("?code=abc"))).toBe(`${ORIGIN}/`);
  });

  it.each(["//evil.com", "https://evil.com", "/\\evil.com", "%2F%2Fevil.com", "/%5Cevil.com"])(
    "open redirect attempt next=%s stays on this origin",
    async (next) => {
      const res = await cb(`?code=abc&next=${encodeURIComponent(next)}`);
      const url = new URL(location(res)!);
      expect(url.origin).toBe(ORIGIN);
      expect(url.pathname.startsWith("//")).toBe(false);
    },
  );

  it("open redirect: //evil.com, https://evil.com and /\\evil.com all become /", async () => {
    for (const next of ["//evil.com", "https://evil.com", "/\\evil.com"]) {
      expect(location(await cb(`?code=abc&next=${encodeURIComponent(next)}`))).toBe(`${ORIGIN}/`);
    }
  });

  it("missing code → /?auth_error=missing_code, no exchange", async () => {
    const res = await cb("?next=%2Faccount");
    expect(location(res)).toBe(`${ORIGIN}/?auth_error=missing_code`);
    expect(sb.exchange).not.toHaveBeenCalled();
  });

  it("invalid or used code → /?auth_error=exchange_failed", async () => {
    sb.exchange.mockResolvedValue({ data: { session: null, user: null }, error: new Error("invalid grant") });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(location(await cb("?code=bad"))).toBe(`${ORIGIN}/?auth_error=exchange_failed`);
  });

  it("a throwing exchange is mapped too", async () => {
    sb.exchange.mockRejectedValue(new TypeError("fetch failed"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(location(await cb("?code=x"))).toBe(`${ORIGIN}/?auth_error=exchange_failed`);
  });

  it("provider error (user cancelled) → access_denied, without reflecting its description", async () => {
    const res = await cb("?error=access_denied&error_description=%3Cscript%3E");
    expect(location(res)).toBe(`${ORIGIN}/?auth_error=access_denied`);
    expect(location(await cb("?error=server_error"))).toBe(`${ORIGIN}/?auth_error=provider_error`);
  });

  it("auth not configured → not_configured", async () => {
    sb.configured = false;
    expect(location(await cb("?code=abc"))).toBe(`${ORIGIN}/?auth_error=not_configured`);
  });
});

describe("POST /auth/signout", () => {
  const req = (headers: Record<string, string>) =>
    new Request(`${ORIGIN}/auth/signout`, { method: "POST", headers });

  it("same-origin POST → signs out locally and redirects to /", async () => {
    const res = await signout(req({ origin: ORIGIN }));
    expect(sb.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(res.status).toBe(303);
    expect(location(res)).toBe(`${ORIGIN}/`);
  });

  it("answers JSON when asked", async () => {
    const res = await signout(req({ origin: ORIGIN, accept: "application/json" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ signedOut: true });
  });

  it("cross-origin POST → 403, nothing signed out", async () => {
    const res = await signout(req({ origin: "https://evil.com" }));
    expect(res.status).toBe(403);
    expect(sb.signOut).not.toHaveBeenCalled();
  });

  it("no Origin: only Sec-Fetch-Site same-origin is accepted", async () => {
    expect((await signout(req({}))).status).toBe(403);
    expect((await signout(req({ "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect((await signout(req({ "sec-fetch-site": "same-origin" }))).status).toBe(303);
    expect(isSameOrigin(req({ origin: "null" }))).toBe(false);
  });

  it("clears leftover Supabase auth cookies, chunked ones included, and nothing else", async () => {
    sb.cookies = [
      { name: "sb-abc-auth-token", value: "x" },
      { name: "sb-abc-auth-token.0", value: "x" },
      { name: "sb-abc-auth-token.1", value: "x" },
      { name: "prompthub-theme", value: "dark" },
    ];
    await signout(req({ origin: ORIGIN }));
    expect(sb.deleted).toEqual(["sb-abc-auth-token", "sb-abc-auth-token.0", "sb-abc-auth-token.1"]);
  });

  it("still clears cookies and redirects when the Auth server is unreachable", async () => {
    sb.signOut.mockRejectedValue(new TypeError("fetch failed"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    sb.cookies = [{ name: "sb-abc-auth-token", value: "x" }];
    const res = await signout(req({ origin: ORIGIN }));
    expect(res.status).toBe(303);
    expect(sb.deleted).toEqual(["sb-abc-auth-token"]);
  });

  it("only POST is exported (Next answers 405 for other methods)", async () => {
    const mod = await import("@/app/auth/signout/route");
    expect(Object.keys(mod).filter((k) => /^[A-Z]+$/.test(k))).toEqual(["POST"]);
  });
});
