import { expect, test, type Page } from "@playwright/test";
import {
  clickGenerate,
  composer,
  editor,
  enterIdea,
  failGemini,
  generateFromIdea,
  openApp,
  preAcceptAiNotice,
  resetFakes,
  setDailyUsage,
  showPlainText,
  signInAs,
  waitForPrompt,
} from "./helpers";
import { E2E_DAILY_REFINEMENTS, E2E_DAILY_WORKFLOWS } from "../../playwright.config";

/** AI failure paths, limits, sign-in and usage, against the fake Gemini server (never Google). */

test.beforeEach(async ({ request }) => {
  await resetFakes(request);
});

const IDEA = "Write a project update for my team about the new release date";
const refineRow = (page: Page) => page.getByRole("group", { name: "Refine" });

test("Gemini quota (429): clear message with the reset time, prompt kept, Basic Mode still works", async ({ page, request }) => {
  await preAcceptAiNotice(page);
  await signInAs(page, request);
  const first = await generateFromIdea(page, IDEA);
  await expect(page.getByText(/^Written by Gemini/)).toBeVisible();

  await failGemini(request, "429");
  await refineRow(page).getByRole("button", { name: "Improve", exact: true }).click();
  const strip = page.locator(".ih-error-strip");
  await expect(strip).toBeVisible();
  await expect(strip).toHaveAttribute("data-code", "quota_exhausted");
  await expect(strip).toContainText("Google's free Gemini quota for PromptHub is used up for now");
  await expect(strip).toContainText(/AI is available again (at|\w{3} at) /);
  // Nothing was lost: same version count, same text.
  await expect(page.getByTestId("version-label")).toHaveAccessibleName("Version 1 of 1");
  await showPlainText(page);
  expect(await editor(page).inputValue()).toBe(first);

  // Basic Mode carries on without AI.
  await strip.getByRole("button", { name: "Use Basic Mode" }).click();
  await expect(page.getByTestId("engine-indicator")).toHaveAttribute("data-engine", "basic");
  // (Same idea and settings can give the same text in Basic Mode, so ask for a different length.)
  await page.getByRole("radio", { name: "Detailed", exact: true }).click();
  await page.getByRole("button", { name: "Regenerate as Detailed" }).click();
  await waitForPrompt(page, "Version 2 of 2");
  await expect(page.getByText("Built with Basic Mode, no AI")).toBeVisible();
  await expect(refineRow(page).getByRole("button", { name: "Use Gemini" })).toBeVisible();
});

test("daily limit reached: the limit message, the reset time, and Basic Mode offered", async ({ page, request }) => {
  await preAcceptAiNotice(page);
  await signInAs(page, request);
  await setDailyUsage(request, "ada", "workflows", E2E_DAILY_WORKFLOWS);
  await enterIdea(page, IDEA);
  await clickGenerate(page);
  const strip = page.locator(".ih-error-strip");
  await expect(strip).toHaveAttribute("data-code", "user_daily_limit");
  await expect(strip).toContainText("You've used today's AI prompt workflows");
  await expect(strip).toContainText(/AI is available again/);
  // The idea is kept, and Basic Mode finishes the job.
  await expect(composer(page)).toHaveValue(IDEA);
  await strip.getByRole("button", { name: "Use Basic Mode" }).click();
  const skipAll = page.getByRole("button", { name: "Skip all" });
  await expect(skipAll.or(page.getByTestId("version-label"))).toBeVisible();
  if (await skipAll.isVisible()) await skipAll.click();
  await waitForPrompt(page, "Version 1 of 1");
  await expect(page.getByText("Built with Basic Mode, no AI")).toBeVisible();
});

test("signed out: AI routes answer 401, Basic Mode works, and AI actions ask for sign-in", async ({ page, request }) => {
  const clarify = await request.post("/api/clarify", {
    data: { idea: IDEA, target: "chatgpt", length: "balanced", engine: "ai", requestId: crypto.randomUUID(), workflowId: crypto.randomUUID() },
  });
  expect(clarify.status()).toBe(401);
  expect((await clarify.json()).error.code).toBe("auth_required");

  await openApp(page);
  await expect(page.getByTestId("engine-indicator")).toHaveAttribute("data-ai-status", "sign-in-required");
  await generateFromIdea(page, IDEA);
  await expect(page.getByText("Built with Basic Mode, no AI")).toBeVisible();
  await expect(refineRow(page).getByRole("button", { name: "Improve", exact: true })).toHaveAttribute("aria-disabled", "true");
  await expect(refineRow(page)).toContainText("Sign in with Google to use Gemini");

  // "Sign in to use AI" really signs in, and AI is then on.
  await refineRow(page).getByRole("button", { name: "Sign in to use AI" }).click();
  await expect(page.getByTestId("account-button")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("engine-indicator")).toHaveAttribute("data-engine", "ai");
});

test("/account shows today's usage from the user's own rows", async ({ page, request }) => {
  await preAcceptAiNotice(page);
  await signInAs(page, request);
  await generateFromIdea(page, IDEA);
  await refineRow(page).getByRole("button", { name: "Expand", exact: true }).click();
  await waitForPrompt(page, "Version 2 of 2");

  await page.goto("/account");
  const usage = page.getByTestId("account-usage");
  await expect(usage.getByTestId("usage-prompt-workflows")).toHaveText(`1 of ${E2E_DAILY_WORKFLOWS} used`);
  await expect(usage.getByTestId("usage-refinements")).toHaveText(`1 of ${E2E_DAILY_REFINEMENTS} used`);
  await expect(usage.getByRole("meter", { name: "Refinements" })).toHaveAttribute("aria-valuenow", "1");
  await expect(usage).toContainText(/reset (at|\w{3} at) /);
});

test("a stream that breaks mid-way keeps what arrived as a partial version; a cut-off one offers Try again", async ({
  page,
  request,
}) => {
  await preAcceptAiNotice(page);
  await signInAs(page, request);
  const first = await generateFromIdea(page, IDEA);

  await failGemini(request, "midstream");
  await refineRow(page).getByRole("button", { name: "Expand", exact: true }).click();
  const strip = page.locator(".ih-error-strip");
  await expect(strip).toBeVisible();
  await expect(strip).toContainText("What arrived is kept as version 2, marked partial.");
  await expect(page.locator(".ih-vname").first()).toHaveText("Expanded (partial)");
  await showPlainText(page);
  const partial = await editor(page).inputValue();
  expect(partial.length).toBeGreaterThan(0);
  expect(first.startsWith(partial.slice(0, 20))).toBe(true);

  await failGemini(request, "truncate");
  await strip.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator(".ih-error-strip")).toContainText("Gemini reached its output limit before finishing");
  await page.locator(".ih-error-strip").getByRole("button", { name: "Try again" }).click();
  await expect(page.locator(".ih-error-strip")).toHaveCount(0);
  await expect(page.locator(".ih-vname").first()).toHaveText("Expanded");
});

test("Stop (Esc) ends an AI refinement and keeps what was written", async ({ page, request }) => {
  await preAcceptAiNotice(page);
  await signInAs(page, request);
  await generateFromIdea(page, IDEA);
  await refineRow(page).getByRole("button", { name: "Expand", exact: true }).click();
  const status = page.locator(".ih-sheet .ih-status");
  await expect(status).toContainText("Expanding");
  await page.keyboard.press("Escape");
  await expect(status).toHaveCount(0);
  await expect(page.getByTestId("version-label")).toHaveAccessibleName(/Version [12] of [12]/);
});
