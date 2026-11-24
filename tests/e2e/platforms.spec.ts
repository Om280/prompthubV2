import { expect, test } from "@playwright/test";
import { editor, generateFromIdea, openApp, selectTarget, waitForPrompt } from "./helpers";

const IDEA = "Write a Python function that removes duplicate users by email";

test("4. the same idea produces a distinct prompt for ChatGPT, Claude and Gemini", async ({ page }) => {
  await openApp(page);
  const chatgpt = await generateFromIdea(page, IDEA);
  expect(chatgpt).toMatch(/^## /m); // Markdown sections
  expect(chatgpt).not.toMatch(/^<[a-z_]+>/m);

  await selectTarget(page, "Claude");
  await page.getByRole("button", { name: "Regenerate for Claude" }).click();
  const claude = await waitForPrompt(page, "Version 2 of 2");
  expect(claude).toMatch(/^<[a-z_]+>/m); // XML-tagged sections
  expect(claude).not.toMatch(/^## /m);
  expect(claude).toMatch(/python/i);

  await selectTarget(page, "Gemini");
  await page.getByRole("button", { name: "Regenerate for Gemini" }).click();
  const gemini = await waitForPrompt(page, "Version 3 of 3");
  expect(gemini).toMatch(/^## /m);
  expect(gemini).not.toEqual(chatgpt);
  expect(gemini).toMatch(/python/i);

  // Version list records each one; the editor shows the latest.
  expect(await editor(page).inputValue()).toBe(gemini);
});

test("7. refinement in Basic Mode: AI-only actions explain themselves, Regenerate is honest", async ({ page }) => {
  await openApp(page);
  const first = await generateFromIdea(page, IDEA);

  for (const name of ["Improve", "Shorten", "Expand", "Tone"]) {
    const btn = page.getByRole("button", { name: new RegExp(`^${name}`) }).first();
    await expect(btn).toHaveAttribute("aria-disabled", "true");
  }
  await expect(page.getByText(/Tone need AI./).first()).toBeVisible();

  // Clicking a disabled AI action must not change the prompt or add a version.
  await page.getByRole("button", { name: /^Improve/ }).first().click({ force: true });
  await expect(page.getByTestId("version-label")).toHaveAccessibleName("Version 1 of 1");
  expect(await editor(page).inputValue()).toBe(first);

  // Deterministic regenerate: same inputs → same text, no new version, and it says why.
  await page.getByRole("button", { name: "Regenerate", exact: true }).click();
  await expect(page.getByText(/same prompt in Basic Mode/)).toBeVisible();
  await expect(page.getByTestId("version-label")).toHaveAccessibleName("Version 1 of 1");

  // Length is a Basic Mode capability: Detailed gives a longer prompt.
  await page.getByRole("radio", { name: "Detailed", exact: true }).click();
  await page.getByRole("button", { name: "Regenerate as Detailed" }).click();
  const detailed = await waitForPrompt(page, "Version 2 of 2");
  expect(detailed.length).toBeGreaterThan(first.length);
});
