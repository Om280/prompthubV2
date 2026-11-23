import { expect, test, type Page } from "@playwright/test";
import { editor, generateFromIdea, historyRow, historyRowAction, mod, openApp, selectTarget, waitForPrompt } from "./helpers";

async function openHistory(page: Page) {
  const toggle = page.getByTestId("history-toggle");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await expect(page.getByLabel("Search prompts")).toBeVisible();
}

const row = historyRow;

test("8. history persists across reloads; versions restore; delete, undo and recover", async ({ page }) => {
  test.setTimeout(90_000); // three full reloads plus IndexedDB round-trips
  await openApp(page);
  const v1 = await generateFromIdea(page, "Write a thank-you note to my neighbour for watering the plants");
  await selectTarget(page, "Claude");
  await page.getByRole("button", { name: "Regenerate for Claude" }).click();
  await waitForPrompt(page, "Version 2 of 2");

  // Persisted in IndexedDB: survives a full reload.
  await page.reload();
  await openHistory(page);
  const item = row(page, /thank-you note/i);
  await expect(item).toHaveCount(1);
  await item.click();
  await expect(page.getByTestId("version-label")).toHaveAccessibleName("Version 2 of 2");

  // Restore version 1 → creates version 3 with v1's content.
  await page.getByRole("button", { name: "Previous version" }).click();
  await expect(page.getByText(/Viewing version 1/)).toBeVisible();
  await page.getByRole("button", { name: "Restore this version" }).click();
  await expect(page.getByTestId("version-label")).toHaveAccessibleName("Version 3 of 3");
  expect(await editor(page).inputValue()).toBe(v1);

  // Search and filter.
  await page.getByLabel("Search prompts").fill("neighbour");
  await expect(row(page, /thank-you note/i)).toHaveCount(1);
  await page.getByLabel("Search prompts").fill("zzzz-no-match");
  await expect(page.getByText(/No prompts match/)).toBeVisible();
  await page.getByLabel("Search prompts").fill("");

  // Delete → Undo.
  await historyRowAction(page, /thank-you note/i, "Delete");
  await expect(page.getByText("Moved to Recently deleted")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(row(page, /thank-you note/i)).toHaveCount(1);

  // Delete → reload → recover from Recently deleted.
  await historyRowAction(page, /thank-you note/i, "Delete");
  await expect(row(page, /thank-you note/i)).toHaveCount(0);
  await page.reload();
  await openHistory(page);
  await page.getByRole("button", { name: /^Recently deleted/ }).click();
  // Deleted rows use their own markup: the title plus a Restore button.
  await expect(page.getByText(/thank-you note/i).first()).toBeVisible();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await page.getByRole("button", { name: "Back to history" }).click();
  await expect(row(page, /thank-you note/i)).toHaveCount(1);

  // Still there after another reload, with all 3 versions.
  await page.reload();
  await openHistory(page);
  await row(page, /thank-you note/i).click();
  await expect(page.getByTestId("version-label")).toHaveAccessibleName("Version 3 of 3");
});

test("8b. rename persists", async ({ page }) => {
  await openApp(page);
  await generateFromIdea(page, "Draft a packing list for a rainy camping trip");
  await openHistory(page);
  await historyRowAction(page, /packing list/i, "Rename");
  const input = page.getByLabel("Rename prompt");
  await input.fill("Camping list");
  await input.press("Enter");
  await page.reload();
  await openHistory(page);
  await expect(row(page, /^Camping list/)).toHaveCount(1);
  void mod;
});
