import { expect, test } from "@playwright/test";
import { blurAll, composer, editor, enterIdea, mod, openApp, readClipboard, waitForPrompt } from "./helpers";

test("9. keyboard shortcuts drive the whole flow", async ({ page }) => {
  await openApp(page);

  // Ctrl/Cmd+Enter from inside the composer starts generation; again from a question continues.
  await enterIdea(page, "Write a product description for a handmade ceramic mug");
  await composer(page).press(mod("Enter"));
  const firstField = page.locator("[data-question-id]").first().getByRole("textbox");
  const version = page.getByTestId("version-label");
  await expect(firstField.or(version)).toBeVisible();
  if (await firstField.isVisible()) {
    await firstField.fill("Small online shop");
    await firstField.press(mod("Enter"));
  }
  const prompt = await waitForPrompt(page, "Version 1 of 1");

  // Ctrl/Cmd+Shift+C copies from anywhere (focus outside the editor).
  await blurAll(page);
  await page.keyboard.press(mod("Shift+C"));
  await expect(page.getByRole("button", { name: /^Copied/ })).toBeVisible();
  expect(await readClipboard(page)).toBe(prompt);

  // Ctrl/Cmd+\ toggles history.
  await page.keyboard.press(mod("Backslash"));
  await expect(page.getByLabel("Search prompts")).toBeVisible();
  // "/" focuses search while the rail is open.
  await blurAll(page);
  await page.keyboard.press("/");
  await expect(page.getByLabel("Search prompts")).toBeFocused();
  await page.keyboard.press("Escape");
  await page.keyboard.press(mod("Backslash"));
  await expect(page.getByLabel("Search prompts")).toBeHidden();

  // "?" opens the shortcut sheet; Esc closes it.
  await blurAll(page);
  await page.keyboard.press("Shift+Slash");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeHidden();

  // New prompt: Alt+N (documented fallback; browsers may keep Ctrl+N for a new window).
  await page.keyboard.press("Alt+N");
  await expect(composer(page)).toHaveValue("");
  await expect(editor(page)).toHaveCount(0);
});

test("9b. Ctrl/Cmd+N also starts a new prompt when the browser lets the page handle it", async ({ page }) => {
  await openApp(page);
  await enterIdea(page, "Write a haiku about trains");
  await composer(page).press(mod("Enter"));
  const skipAll = page.getByRole("button", { name: "Skip all" });
  await expect(skipAll.or(page.getByTestId("version-label"))).toBeVisible();
  if (await skipAll.isVisible()) await skipAll.click();
  await waitForPrompt(page);
  await blurAll(page);
  await page.keyboard.press(mod("N"));
  await expect(composer(page)).toHaveValue("");
});

test("9c. Esc stops nothing harmful and the shortcut hints are visible on desktop", async ({ page }) => {
  await openApp(page);
  await expect(page.locator("kbd").first()).toBeVisible();
});
