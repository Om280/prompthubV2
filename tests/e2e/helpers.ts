import { expect, type Locator, type Page } from "@playwright/test";

export const IDEA_LABEL = "Describe what you want the AI to do";
const MOD = process.platform === "darwin" ? "Meta" : "Control";
export const mod = (key: string) => `${MOD}+${key}`;

/** Fresh app with empty IndexedDB (each test gets a new browser context, so storage starts empty). */
export async function openApp(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("engine-indicator")).toBeVisible();
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

/** Waits until a prompt has been committed as a version and returns its text. */
export async function waitForPrompt(
  page: Page,
  versionText: string | RegExp = /Version \d+ of \d+/,
): Promise<string> {
  await expect(page.getByTestId("version-label")).toHaveAccessibleName(versionText, { timeout: 15_000 });
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
