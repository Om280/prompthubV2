/**
 * AI availability (API_CONTRACTS §2). Server-only.
 *
 * PromptHub never uses AI keys funded by the app owner. AI will run through each signed-in user's
 * own OpenRouter key, sent per request (`src/lib/server/user-key.ts`). This build has no AI
 * generation yet, so the status is always `unavailable` and the app runs in Basic Mode.
 */
import type { AiStatusResponse } from "@/lib/contracts";

export const AI_UNAVAILABLE_MESSAGE =
  "AI generation with your own OpenRouter key is coming in a later update. Prompts come from local templates for now.";

export interface AiStatusInput {
  authConfigured: boolean;
  signedIn: boolean;
}

export function aiStatusResponse({ authConfigured, signedIn }: AiStatusInput): AiStatusResponse {
  return {
    mode: "basic",
    ai: { gateway: "openrouter", status: "unavailable", message: AI_UNAVAILABLE_MESSAGE },
    auth: { configured: authConfigured, signedIn: authConfigured && signedIn },
  };
}
