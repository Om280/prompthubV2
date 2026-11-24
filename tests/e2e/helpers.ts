import { expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";

export const IDEA_LABEL = "Describe what you want the AI to do";
const MOD = process.platform === "darwin" ? "Meta" : "Control";
export const mod = (key: string) => `${MOD}+${key}`;

/** Fresh app with empty IndexedDB (each test gets a new browser context, so storage starts empty). */
export async function openApp(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("engine-indicator")).toBeVisible();
  // The engine status is fetched by the client, so a settled status also means the page has
  // hydrated (text typed into a field before that is reset by React).
  await expect(page.getByTestId("engine-indicator")).toHaveAttribute("data-engine", /^(basic|ai)$/);
}

export function composer(page: Page): Locator {
  return page.getByLabel(IDEA_LABEL).first();
}

export function editor(page: Page): Locator {
  return page.getByTestId("prompt-editor");
}

export function questions(page: Page): Locator {
  return page.locator("[data-question-id]");
}

export async function enterIdea(page: Page, idea: string) {
  await composer(page).fill(idea);
}

export async function clickGenerate(page: Page) {
  await page.getByRole("button", { name: /^Generate prompt/ }).click();
}

/**
 * The prompt opens in the Blocks view (one field per section). The whole prompt as one textarea,
 * the `prompt-editor`, is the Plain text view; switch to it to read or type the full text.
 */
export async function showPlainText(page: Page) {
  const plain = page.getByRole("radio", { name: "Plain text" });
  if ((await plain.getAttribute("aria-checked")) !== "true") await plain.click();
  await expect(editor(page)).toBeVisible();
}

/** Waits until a prompt has been committed as a version and returns its text. */
export async function waitForPrompt(
  page: Page,
  versionText: string | RegExp = /Version \d+ of \d+/,
): Promise<string> {
  await expect(page.getByTestId("version-label")).toHaveAccessibleName(versionText, { timeout: 15_000 });
  await showPlainText(page);
  const value = await editor(page).inputValue();
  expect(value.length).toBeGreaterThan(40);
  return value;
}

/** Idea → (questions shown or not) → Skip all if needed → prompt. */
export async function generateFromIdea(page: Page, idea: string): Promise<string> {
  await enterIdea(page, idea);
  await clickGenerate(page);
  const skipAll = page.getByRole("button", { name: "Skip all" });
  const version = page.getByTestId("version-label");
  await expect(skipAll.or(version)).toBeVisible({ timeout: 15_000 });
  if (await skipAll.isVisible()) await skipAll.click();
  return waitForPrompt(page);
}

export async function readClipboard(page: Page): Promise<string> {
  const text = await page.evaluate(() => navigator.clipboard.readText());
  // Windows round-trips LF as CRLF through the system clipboard; the app writes LF.
  return text.replace(/\r\n/g, "\n");
}

export async function selectTarget(page: Page, name: "ChatGPT" | "Claude" | "Gemini") {
  await page.getByRole("radio", { name, exact: true }).click();
}

/** Moves focus out of any text field so single-key shortcuts reach the page. */
export async function blurAll(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

/** A history row: the open button plus its actions menu. */
export function historyRow(page: Page, title: RegExp): Locator {
  return page.locator("[data-row-button]").filter({ hasText: title }).locator("..");
}

export async function historyRowAction(page: Page, title: RegExp, action: "Rename" | "Delete") {
  const row = historyRow(page, title);
  await row.hover();
  await row.getByRole("button", { name: /^More actions for/ }).click();
  await page.getByRole("menuitem", { name: action }).click();
}

/* ---------------------------------------------------------------- AI (fake Gemini, fake Supabase) */

export const FAKE_GEMINI_URL = `http://127.0.0.1:${Number(process.env.FAKE_GEMINI_PORT ?? 54398)}`;
export const FAKE_SUPABASE = `http://127.0.0.1:${Number(process.env.FAKE_SUPABASE_PORT ?? 54399)}`;

/** Resets both fakes: sign-ins, quota counters and Gemini failure injections. */
export async function resetFakes(request: APIRequestContext) {
  for (const url of [`${FAKE_SUPABASE}/__test/reset`, `${FAKE_GEMINI_URL}/__test/reset`]) {
    expect((await request.post(url)).ok()).toBe(true);
  }
}

/** The next `count` Gemini calls fail: "429" (quota), "503", "midstream" (connection drops) or "truncate". */
export async function failGemini(request: APIRequestContext, mode: "429" | "503" | "midstream" | "truncate", count = 1) {
  expect((await request.post(`${FAKE_GEMINI_URL}/__test/fail`, { data: { mode, count } })).ok()).toBe(true);
}

/** Sets today's AI count for a test user (e.g. to reach the daily limit). */
export async function setDailyUsage(request: APIRequestContext, user: "ada" | "bob", kind: "workflows" | "refinements", used: number) {
  expect((await request.post(`${FAKE_SUPABASE}/__test/daily`, { data: { user, kind, used } })).ok()).toBe(true);
}

/** Skips the first-use AI notice (tests that aren't about it). */
export async function preAcceptAiNotice(page: Page) {
  await page.addInitScript(() => localStorage.setItem("prompthub-ai-disclosure", "accepted"));
}

/** Google sign-in through the fake Supabase Auth; ends on the workspace with AI ready. */
export async function signInAs(page: Page, request: APIRequestContext, user: "ada" | "bob" = "ada") {
  expect((await request.post(`${FAKE_SUPABASE}/__test/next-sign-in`, { data: { user } })).ok()).toBe(true);
  await page.goto("/");
  await page.getByTestId("sign-in").click();
  await expect(page.getByTestId("account-button")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("engine-indicator")).toHaveAttribute("data-engine", "ai", { timeout: 15_000 });
}
