import { expect, test } from "@playwright/test";
import { editor, enterIdea, generateFromIdea, openApp, readClipboard } from "./helpers";

test("10. layout adapts: desktop toolbar and docked rail vs mobile bottom bar and sheet", async ({ page, isMobile }) => {
  await openApp(page);
  // No horizontal scrolling at any width.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await enterIdea(page, "Write a short bio for a conference speaker page");
  const prompt = await generateFromIdea(page, "Write a short bio for a conference speaker page");

  const copy = page.getByRole("button", { name: /^Copy/ });
  await expect(copy).toBeVisible();
  const box = (await copy.boundingBox())!;
  const vh = page.viewportSize()!.height;

  if (isMobile) {
    // Copy lives in the bottom action bar within thumb reach.
    expect(box.y).toBeGreaterThan(vh - 120);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await expect(page.locator("kbd:visible")).toHaveCount(0);

    await page.getByTestId("history-toggle").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByLabel("Search prompts")).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  } else {
    // Copy sits in the toolbar above the editor, aligned to the column's right edge.
    const ed = (await editor(page).boundingBox())!;
    expect(box.y).toBeLessThan(ed.y);
    await page.getByTestId("history-toggle").click();
    await expect(page.getByLabel("Search prompts")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0); // docked, not modal
  }

  await copy.click();
  expect(await readClipboard(page)).toBe(prompt);
  const after = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(after).toBeLessThanOrEqual(0);
});
