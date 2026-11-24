import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { generateKeyPair, SignJWT } from "jose";
import { FAKE_SUPABASE_URL, USERS } from "./fake-supabase/users.mjs";
import { openApp } from "./helpers";

/**
 * Google sign-in through Supabase Auth, end to end, against the local fake Auth server
 * (tests/e2e/fake-supabase). The real PKCE flow runs: the browser client stores the code verifier,
 * the fake "Google" auto-approves, /auth/callback exchanges the code, cookies carry the session.
 */

type UserKey = keyof typeof USERS;
const COOKIE_PREFIX = "sb-127-auth-token"; // storage key for a project URL on 127.0.0.1
const IMPROVE = { action: "improve", text: "Some prompt", target: "claude", length: "balanced" };

async function control(request: APIRequestContext, path: string, data: unknown = {}) {
  const res = await request.post(`${FAKE_SUPABASE_URL}/__test/${path}`, { data });
  expect(res.ok()).toBe(true);
}

test.beforeEach(async ({ request }) => {
  await control(request, "reset");
});

async function signIn(page: Page, request: APIRequestContext, user: UserKey, opts: { path?: string; ttl?: number } = {}) {
  await control(request, "next-sign-in", { user, accessTtlSec: opts.ttl });
  await page.goto(opts.path ?? "/");
  const button = page.getByTestId("sign-in");
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.getByTestId("account-button")).toBeVisible({ timeout: 15_000 });
}

async function sessionUser(page: Page) {
  const res = await page.request.get("/api/session");
  expect(res.ok()).toBe(true);
  return (await res.json()).user as { id: string; email: string; name: string } | null;
}

async function authCookies(context: BrowserContext) {
  return (await context.cookies()).filter((c) => c.name.startsWith(COOKIE_PREFIX) && !c.name.includes("code-verifier"));
}

test("signed out: Sign in is offered, AI-only API answers 401, Basic Mode still works", async ({ page }) => {
  await openApp(page);
  await expect(page.getByTestId("sign-in")).toBeVisible();
  await expect(page.getByTestId("account-button")).toHaveCount(0);
  expect(await sessionUser(page)).toBeNull();

  const status = await (await page.request.get("/api/providers")).json();
  expect(status).toMatchObject({ mode: "basic", auth: { configured: true, signedIn: false } });

  const t = await page.request.post("/api/transform", { data: IMPROVE });
  expect(t.status()).toBe(401);
  expect((await t.json()).error).toEqual({ code: "auth_required", message: "Sign in with Google to use AI features." });

  const gen = await page.request.post("/api/generate", {
    data: { idea: "Write a limerick about a cat", target: "gemini", length: "concise", answers: [] },
  });
  expect(gen.ok()).toBe(true);
});

test("login flow: Google sign-in → avatar, account menu shows name and email, cookie set", async ({ page, request, context }) => {
  await signIn(page, request, "ada");
  expect((await authCookies(context)).length).toBeGreaterThan(0);
  const avatar = page.getByTestId("account-button");
  await expect(avatar).toHaveAccessibleName(`Account menu for ${USERS.ada.name}`);
  await expect(avatar).toHaveText("AT"); // initials fallback, no avatar URL
  await avatar.click();
  const identity = page.getByTestId("account-identity");
  await expect(identity).toContainText(USERS.ada.name);
  await expect(identity).toContainText(USERS.ada.email);
  await expect(page.getByRole("menuitem", { name: "Account settings" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
  expect(await sessionUser(page)).toMatchObject({ id: USERS.ada.id, email: USERS.ada.email, name: USERS.ada.name });
});

test("callback: the code is exchanged and the user returns to where they started", async ({ page, request }) => {
  await signIn(page, request, "ada", { path: "/?from=e2e" });
  await expect(page).toHaveURL(/\/\?from=e2e$/);
});

test("callback: a bad code or an open-redirect next lands on / with a clear error", async ({ page, request }) => {
  for (const next of ["//evil.com", "https://evil.com", "/\\evil.com"]) {
    const res = await request.get(`/auth/callback?code=bogus&next=${encodeURIComponent(next)}`, { maxRedirects: 0 });
    expect(res.status()).toBe(303);
    const location = res.headers()["location"];
    expect(new URL(location, "http://localhost").pathname).toBe("/");
    expect(location).not.toContain("evil.com");
  }
  await page.goto("/auth/callback?code=bogus&next=%2Faccount");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(/Sign-in didn't finish/)).toBeVisible();
  await expect(page.getByTestId("sign-in")).toBeVisible();

  await page.goto("/auth/callback?error=access_denied");
  await expect(page.getByText(/Sign-in was cancelled/)).toBeVisible();
});

test("the session persists across reloads and new pages", async ({ page, request }) => {
  await signIn(page, request, "ada");
  await page.reload();
  await expect(page.getByTestId("account-button")).toBeVisible();
  const second = await page.context().newPage();
  await second.goto("/");
  await expect(second.getByTestId("account-button")).toBeVisible();
  await second.close();
});

test("protected API: signed in, /api/transform passes the auth check (streams, not 401)", async ({ page, request }) => {
  await signIn(page, request, "ada");
  // AI runs against the fake Gemini server in e2e, so a signed-in transform streams a result.
  const t = await page.request.post("/api/transform", { data: { ...IMPROVE, requestId: crypto.randomUUID() } });
  expect(t.status()).toBe(200);
  expect(t.headers()["content-type"]).toContain("application/x-ndjson");
  const events = (await t.text()).trim().split("\n").map((l) => JSON.parse(l));
  expect(events[0]).toMatchObject({ type: "meta", engine: { kind: "ai", provider: "gemini", model: "gemini-3.8-flash" } });
  const status = await (await page.request.get("/api/providers")).json();
  expect(status.auth).toEqual({ configured: true, signedIn: true });
});

test("account page: signed-out visitors are sent home; signed-in users see profile and notes", async ({ page, request }) => {
  await page.goto("/account");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Sign in with Google to open account settings.")).toBeVisible();

  await signIn(page, request, "ada");
  await page.getByTestId("account-button").click();
  await page.getByRole("menuitem", { name: "Account settings" }).click();
  await expect(page).toHaveURL(/\/account$/);
  const details = page.getByTestId("account-details");
  await expect(details).toContainText(USERS.ada.email);
  await expect(details).toContainText(/history stays on this device/i);
  await expect(details.getByRole("heading", { name: "AI features" })).toBeVisible();
  await expect(details).toContainText(/Gemini on its free tier/);
  // No placeholder controls for a key.
  await expect(details.getByRole("textbox")).toHaveCount(0);

  await details.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("sign-in")).toBeVisible();
  expect(await sessionUser(page)).toBeNull();
});

test("sign-out from the menu clears the session and survives a reload", async ({ page, request, context }) => {
  await signIn(page, request, "ada");
  await page.getByTestId("account-button").click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByTestId("sign-in")).toBeVisible();
  await expect(page.getByText("Signed out. History stays on this device.")).toBeVisible();
  expect(await authCookies(context)).toHaveLength(0);
  await page.reload();
  await expect(page.getByTestId("sign-in")).toBeVisible();
  expect((await page.request.post("/api/transform", { data: IMPROVE })).status()).toBe(401);
});

test("sign-out endpoint: POST only, and cross-origin posts are refused", async ({ page, request }) => {
  await signIn(page, request, "ada");
  expect((await page.request.get("/auth/signout", { maxRedirects: 0 })).status()).toBe(405);
  const cross = await page.request.post("/auth/signout", { headers: { origin: "https://evil.com" }, maxRedirects: 0 });
  expect(cross.status()).toBe(403);
  expect(await sessionUser(page)).toMatchObject({ id: USERS.ada.id });
});

test("expired session: refreshed while the refresh token is valid, signed out (401) once it isn't", async ({ page, request }) => {
  // A 5 s access token is always inside the client's refresh margin, so every request refreshes.
  await signIn(page, request, "ada", { ttl: 5 });
  await page.reload();
  await expect(page.getByTestId("account-button")).toBeVisible();

  // Revoke the refresh token. The current access token stays valid until it expires (Supabase keeps
  // using an unexpired token when a refresh fails); after that the session reads as signed out.
  await control(request, "revoke", { user: "ada" });
  await expect.poll(() => sessionUser(page), { timeout: 20_000, intervals: [1000] }).toBeNull();
  await page.reload();
  await expect(page.getByTestId("sign-in")).toBeVisible();
  expect((await page.request.post("/api/transform", { data: IMPROVE })).status()).toBe(401);

  // The UI recovers: signing in again works.
  await signIn(page, request, "ada");
  expect(await sessionUser(page)).toMatchObject({ id: USERS.ada.id });
});

test("cross-user: two browsers, two users, each sees only their own identity", async ({ browser, request }) => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  try {
    const pa = await a.newPage();
    const pb = await b.newPage();
    await signIn(pa, request, "ada");
    await signIn(pb, request, "bob");
    expect(await sessionUser(pa)).toMatchObject({ id: USERS.ada.id, email: USERS.ada.email });
    expect(await sessionUser(pb)).toMatchObject({ id: USERS.bob.id, email: USERS.bob.email });
    await pa.reload();
    await expect(pa.getByTestId("account-button")).toHaveAccessibleName(`Account menu for ${USERS.ada.name}`);
    await expect(pb.getByTestId("account-button")).toHaveAccessibleName(`Account menu for ${USERS.bob.name}`);

    // A spoofed user header doesn't change who the server thinks you are.
    const spoofed = await pa.request.get("/api/session", { headers: { "x-user-id": USERS.bob.id } });
    expect((await spoofed.json()).user.id).toBe(USERS.ada.id);

    // Signing out A leaves B signed in.
    await pa.getByTestId("account-button").click();
    await pa.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(pa.getByTestId("sign-in")).toBeVisible();
    expect(await sessionUser(pb)).toMatchObject({ id: USERS.bob.id });
  } finally {
    await a.close();
    await b.close();
  }
});

test("forged tokens are rejected: a session cookie claiming another user reads as signed out", async ({ page, request, context }) => {
  await signIn(page, request, "ada");
  const { privateKey } = await generateKeyPair("ES256");
  const now = Math.floor(Date.now() / 1000);
  const forge = (kid: string) =>
    new SignJWT({ role: "authenticated", aud: "authenticated", email: USERS.bob.email, session_id: "forged" })
      .setProtectedHeader({ alg: "ES256", kid, typ: "JWT" })
      .setSubject(USERS.bob.id)
      .setIssuer(`${FAKE_SUPABASE_URL}/auth/v1`)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(privateKey);

  // Same kid as the real key (signature check fails) and an unknown kid (server-side check fails).
  for (const kid of ["fake-es256-key-1", "attacker-key"]) {
    const session = {
      access_token: await forge(kid),
      token_type: "bearer",
      expires_in: 3600,
      expires_at: now + 3600,
      refresh_token: "forged-refresh",
      user: { id: USERS.bob.id, aud: "authenticated", role: "authenticated", email: USERS.bob.email },
    };
    await context.clearCookies();
    await context.addCookies([
      {
        name: COOKIE_PREFIX,
        value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`,
        url: page.url(),
      },
    ]);
    expect(await sessionUser(page)).toBeNull();
    expect((await page.request.post("/api/transform", { data: IMPROVE })).status()).toBe(401);
    await page.reload();
    await expect(page.getByTestId("sign-in")).toBeVisible();
  }
});

test("privacy notice is public and linked from the account menu and /account", async ({ page, request }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Privacy", level: 1 })).toBeVisible();
  await expect(page.getByText(/free tier/).first()).toBeVisible();
  await expect(page.getByText("Basic Mode sends nothing to Google")).toBeVisible();

  await signIn(page, request, "ada");
  await page.getByTestId("account-button").click();
  await page.getByRole("menuitem", { name: "Privacy" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await page.goto("/account");
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Privacy" })).toBeVisible();
});
