import { expect, test } from "@playwright/test";
import { clickGenerate, editor, enterIdea, generateFromIdea, openApp } from "./helpers";

test("11a. no AI in this build → Basic Mode is explained, never presented as AI", async ({ page, request }) => {
  const res = await request.get("/api/providers");
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body).toMatchObject({ mode: "basic", ai: { status: "unavailable" } });
  expect(JSON.stringify(body)).not.toMatch(/_API_KEY/);

  await openApp(page);
  await page.getByTestId("engine-indicator").click();
  await expect(page.getByText(/local templates/i).first()).toBeVisible();
});

test("11b. API contract: invalid input → 400 with issues; transform signed out → 401 auth_required", async ({ request }) => {
  const bad = await request.post("/api/generate", { data: { idea: "", target: "chatgpt", length: "balanced", answers: [] } });
  expect(bad.status()).toBe(400);
  expect((await bad.json()).error).toMatchObject({ code: "invalid_request" });

  const wrongTarget = await request.post("/api/clarify", { data: { idea: "hi", target: "llama", length: "balanced" } });
  expect(wrongTarget.status()).toBe(400);

  const t = await request.post("/api/transform", {
    data: { action: "improve", text: "Some prompt", target: "claude", length: "balanced" },
  });
  expect(t.status()).toBe(401);
  expect((await t.json()).error.code).toBe("auth_required");

  const gen = await request.post("/api/generate", {
    data: { idea: "Write a limerick about a cat", target: "gemini", length: "concise", answers: [] },
  });
  expect(gen.headers()["content-type"]).toContain("application/x-ndjson");
  const lines = (await gen.text()).trim().split("\n").map((l) => JSON.parse(l));
  expect(lines[0]).toMatchObject({ type: "meta", engine: { kind: "basic" } });
  expect(lines.at(-1).type).toBe("done");
  expect(lines.filter((l) => l.type === "done" || l.type === "error")).toHaveLength(1);
});

test("11c. server error keeps the previous prompt and offers Try again", async ({ page }) => {
  await openApp(page);
  const first = await generateFromIdea(page, "Write a limerick about a cat");

  await page.route("**/api/generate", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "provider_unavailable", message: "No provider could complete this request. Try again in a minute." } }),
    }),
  );
  await page.getByRole("radio", { name: "Claude", exact: true }).click();
  await page.getByRole("button", { name: "Regenerate for Claude" }).click();
  await expect(page.getByText("No provider could complete this request. Try again in a minute.")).toBeVisible();
  expect(await editor(page).inputValue()).toBe(first);
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();

  await page.unroute("**/api/generate");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByTestId("version-label")).toHaveAccessibleName("Version 2 of 2");
});

test("11d. network failure and rate limit while clarifying are reported inline", async ({ page }) => {
  await openApp(page);
  await page.route("**/api/clarify", (route) => route.abort("internetdisconnected"));
  await enterIdea(page, "Write a toast for my sister's wedding");
  await clickGenerate(page);
  await expect(page.getByText(/Couldn't reach PromptHub/)).toBeVisible();

  await page.unroute("**/api/clarify");
  await page.route("**/api/clarify", (route) =>
    route.fulfill({
      status: 429,
      headers: { "Retry-After": "30" },
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "rate_limited", message: "Too many requests. Wait a minute and try again.", retryAfterSec: 30 } }),
    }),
  );
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Too many requests. Wait a minute and try again.")).toBeVisible();
});

test("11e. a stream that drops mid-way keeps what was written", async ({ page }) => {
  await openApp(page);
  await page.route("**/api/generate", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/x-ndjson; charset=utf-8",
      body:
        JSON.stringify({ type: "meta", engine: { kind: "basic" }, requestId: "t" }) +
        "\n" +
        JSON.stringify({ type: "delta", text: "Write a toast for my sister's wedding." }) +
        "\n",
    }),
  );
  await enterIdea(page, "Write a toast for my sister's wedding");
  await clickGenerate(page);
  const skipAll = page.getByRole("button", { name: "Skip all" });
  await expect(skipAll.or(page.getByText(/connection dropped/))).toBeVisible();
  if (await skipAll.isVisible()) await skipAll.click();
  await expect(page.getByText(/connection dropped/)).toBeVisible();
  expect(await editor(page).inputValue()).toContain("Write a toast");
});
