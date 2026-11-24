import { expect, test, type Page } from "@playwright/test";
import {
  composer,
  editor,
  readClipboard,
  resetFakes,
  selectTarget,
  showPlainText,
  signInAs,
  waitForPrompt,
} from "./helpers";

/**
 * The AI path end to end, against the fake Gemini server (never Google). Runs on desktop and mobile.
 * Signed in → clarify questions from Gemini → answer one, skip one → a prompt for each platform
 * (Markdown for ChatGPT, XML for Claude, task-first Markdown for Gemini) → every refinement makes
 * a version → copy.
 */

test.beforeEach(async ({ request }) => {
  await resetFakes(request);
});

const IDEA = "Write a project update for my team about the new release date";

async function refine(page: Page, isMobile: boolean, name: "Improve" | "Shorten" | "Expand" | "Regenerate") {
  if (isMobile) {
    await page.getByRole("button", { name: "Refine", exact: true }).click();
    await page.getByRole("dialog", { name: "Refine" }).getByRole("button", { name, exact: true }).click();
  } else {
    await page.getByRole("group", { name: "Refine" }).getByRole("button", { name, exact: true }).click();
  }
}

async function tone(page: Page, isMobile: boolean, label: string) {
  if (isMobile) {
    await page.getByRole("button", { name: "Refine", exact: true }).click();
    await page.getByRole("dialog", { name: "Refine" }).getByRole("radio", { name: label }).click();
  } else {
    await page.getByRole("group", { name: "Refine" }).getByRole("button", { name: /^Tone/ }).click();
    await page.getByRole("menuitemradio", { name: label }).click();
  }
}

test("AI: Gemini writes for ChatGPT, Claude and Gemini; every refinement is a version; copy matches", async ({
  page,
  request,
  isMobile,
}) => {
  test.setTimeout(120_000);
  await signInAs(page, request);

  // First AI request: the notice says what is sent to Google; continuing uses AI.
  await composer(page).fill(IDEA);
  await page.getByRole("button", { name: /^Generate prompt/ }).click();
  const notice = page.getByTestId("ai-disclosure");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("Google may use the content you send to improve its products");
  await expect(notice.getByRole("link", { name: "Read the privacy notice" })).toHaveAttribute("href", "/privacy");
  await notice.getByRole("button", { name: "I understand, use AI" }).click();

  // Gemini's clarifying questions (from the fake).
  const qs = page.locator("[data-question-id]");
  await expect(qs).toHaveCount(2);
  await expect(qs.first()).toContainText("Who will read the result?");
  await qs.first().getByRole("textbox").fill("My manager");
  await qs.nth(1).getByRole("button", { name: "Skip", exact: true }).click();
  await expect(page.getByText("1 answered, 1 skipped")).toBeVisible();
  await page.getByRole("button", { name: /^Generate prompt/ }).click();

  const chatgpt = await waitForPrompt(page, "Version 1 of 1");
  expect(chatgpt).toMatch(/^## /m);
  expect(chatgpt).not.toMatch(/^<[a-z_]+>/m);
  expect(chatgpt).toContain("My manager");
  await expect(page.getByText("Written by Gemini (gemini-3.8-flash) for ChatGPT")).toBeVisible();
  await expect(page.getByText("Built with Basic Mode, no AI")).toHaveCount(0);

  await selectTarget(page, "Claude");
  await page.getByRole("button", { name: "Regenerate for Claude" }).click();
  const claude = await waitForPrompt(page, "Version 2 of 2");
  expect(claude).toMatch(/^<[a-z_]+>/m);
  expect(claude).not.toMatch(/^## /m);
  await expect(page.getByText("Written by Gemini (gemini-3.8-flash) for Claude")).toBeVisible();

  await selectTarget(page, "Gemini");
  await page.getByRole("button", { name: "Regenerate for Gemini" }).click();
  const gemini = await waitForPrompt(page, "Version 3 of 3");
  expect(gemini).toMatch(/^## /m);
  expect(gemini).not.toEqual(chatgpt);
  // Task first: the prompt opens with the task itself.
  expect(gemini.split("\n")[0]).toMatch(/project update/i);
  await expect(page.getByText("Written by Gemini (gemini-3.8-flash) for Gemini")).toBeVisible();

  // Each refinement streams in and becomes a version.
  const steps: [() => Promise<void>, string][] = [
    [() => refine(page, isMobile, "Improve"), "Improved"],
    [() => refine(page, isMobile, "Shorten"), "Shortened"],
    [() => refine(page, isMobile, "Expand"), "Expanded"],
    [() => tone(page, isMobile, "Friendly"), "Tone: Friendly"],
    [() => refine(page, isMobile, "Regenerate"), "Regenerated"],
  ];
  let n = 3;
  let before = gemini;
  for (const [run, name] of steps) {
    await run();
    n += 1;
    const text = await waitForPrompt(page, `Version ${n} of ${n}`);
    if (name !== "Regenerated") expect(text).not.toEqual(before);
    if (name === "Shortened") expect(text.length).toBeLessThan(before.length);
    if (name === "Expanded") expect(text.length).toBeGreaterThan(before.length);
    before = text;
    if (!isMobile) await expect(page.locator(".ih-vname").first()).toHaveText(name);
  }

  // Copy writes exactly what the editor holds.
  await showPlainText(page);
  const expected = await editor(page).inputValue();
  await page.getByRole("button", { name: /^Copy/ }).click();
  await expect(page.getByRole("button", { name: /^Copied/ })).toBeVisible();
  expect(await readClipboard(page)).toBe(expected);
});
