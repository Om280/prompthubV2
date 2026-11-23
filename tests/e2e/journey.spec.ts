import { expect, test } from "@playwright/test";
import {
  clickGenerate,
  composer,
  editor,
  enterIdea,
  openApp,
  questions,
  readClipboard,
  waitForPrompt,
} from "./helpers";

// Runs on desktop and mobile projects.

test("1. idea entry through final prompt generation, labelled as Basic Mode", async ({ page }) => {
  await openApp(page);
  await expect(page.getByTestId("engine-indicator")).toHaveAttribute("data-engine", "basic");

  const generate = page.getByRole("button", { name: /^Generate prompt/ });
  await expect(generate).toBeDisabled();
  await enterIdea(page, "   ");
  await expect(generate).toBeDisabled();

  await enterIdea(page, "Write a cover letter for a junior data analyst job at a hospital");
  await expect(generate).toBeEnabled();
  await clickGenerate(page);

  const skipAll = page.getByRole("button", { name: "Skip all" });
  await expect(skipAll.or(page.getByTestId("version-label"))).toBeVisible();
  if (await skipAll.isVisible()) await skipAll.click();

  const prompt = await waitForPrompt(page, "Version 1 of 1");
  expect(prompt).toMatch(/cover letter/i);
  expect(prompt).toMatch(/data analyst/i);
  await expect(page.getByText("Built with Basic Mode, no AI")).toBeVisible();
  // Never presented as AI.
  await expect(page.getByText(/Written by/)).toHaveCount(0);
});

test("2–3. answering a question and skipping another both shape the prompt", async ({ page }) => {
  await openApp(page);
  await enterIdea(page, "Plan a weekend trip");
  await clickGenerate(page);

  const qs = questions(page);
  await expect(qs.first()).toBeVisible();
  const count = await qs.count();
  expect(count).toBeGreaterThanOrEqual(2);
  expect(count).toBeLessThanOrEqual(4);

  // Answer the first by typing.
  const first = qs.nth(0);
  await first.getByRole("textbox").fill("Two days in early May");
  // Skip the second, then undo and skip again (skip is reversible).
  const second = qs.nth(1);
  const secondQuestion = (await second.getAttribute("data-question-text")) ?? "";
  await second.getByRole("button", { name: "Skip", exact: true }).click();
  await expect(second.getByText("Skipped")).toBeVisible();
  await second.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(second.getByRole("textbox")).toBeVisible();
  await second.getByRole("button", { name: "Skip", exact: true }).click();

  // A chip answer, if a third question offers one.
  if (count >= 3) {
    const chip = qs.nth(2).locator("button[data-chip]").first();
    if (await chip.count()) await chip.click();
  }

  await expect(page.getByText(/1 answered|2 answered/)).toBeVisible();
  await clickGenerate(page);
  const prompt = await waitForPrompt(page, "Version 1 of 1");
  expect(prompt).toContain("Two days in early May");
  if (secondQuestion) expect(prompt).not.toContain(secondQuestion);
});

test("5–6. edit the prompt, copy it, and the clipboard holds exactly the editor text", async ({ page, isMobile }) => {
  await openApp(page);
  await enterIdea(page, "Summarise this week's team meeting into an email");
  await clickGenerate(page);
  const skipAll = page.getByRole("button", { name: "Skip all" });
  await expect(skipAll.or(page.getByTestId("version-label"))).toBeVisible();
  if (await skipAll.isVisible()) await skipAll.click();
  await waitForPrompt(page, "Version 1 of 1");

  // Manual edit becomes a version after idle.
  const marker = "\n\nAlso mention that the office is closed on Friday.";
  await editor(page).click();
  await page.keyboard.press("End");
  await editor(page).press("Control+End");
  await page.keyboard.type(marker);
  await editor(page).blur();
  await expect(page.getByTestId("version-label")).toHaveAccessibleName("Version 2 of 2");
  await expect(page.getByText("Edited", { exact: true }).first()).toBeVisible();

  const expected = await editor(page).inputValue();
  expect(expected).toContain("office is closed on Friday");

  const copy = page.getByRole("button", { name: /^Copy/ });
  await copy.click();
  await expect(page.getByRole("button", { name: /^Copied/ })).toBeVisible();
  expect(await readClipboard(page)).toBe(expected);
  await expect(page.getByRole("button", { name: /^Copy/ })).toBeVisible({ timeout: 4000 });
  void isMobile;
});

test("11. empty and oversize input are handled before any request", async ({ page }) => {
  await openApp(page);
  const generate = page.getByRole("button", { name: /^Generate prompt/ });
  await expect(generate).toBeDisabled();
  await composer(page).fill("x".repeat(4100));
  // Capped at 4,000 with a visible counter.
  expect((await composer(page).inputValue()).length).toBeLessThanOrEqual(4000);
  await expect(page.getByText("Ideas can be up to 4,000 characters.").first()).toBeVisible();
});
