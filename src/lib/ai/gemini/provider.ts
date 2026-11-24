/**
 * The only way PromptHub builds a Gemini model. Server-only.
 *
 * - The key comes from `process.env.GEMINI_API_KEY`, read here at the point of use and passed
 *   explicitly to `createGoogle({ apiKey })`, so the SDK's `GOOGLE_GENERATIVE_AI_API_KEY` fallback is
 *   never used. The key is never logged, returned or echoed.
 * - The model id must pass the free-tier allowlist (`checkGeminiModel`); nothing is substituted.
 * - A model object is returned (never a bare string id), so nothing routes through `@ai-sdk/gateway`.
 */
import "server-only";
import { createGoogle } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import { AI_PROMPT_REQUIRED_MESSAGE, AppError } from "../errors";
import { checkGeminiModel } from "../gemini-models";

export interface GeminiModelOptions {
  /** Injected in tests to capture the outgoing request; production uses the global fetch. */
  fetch?: typeof fetch;
}

export function createGeminiModel(modelId: string, options: GeminiModelOptions = {}): LanguageModel {
  const check = checkGeminiModel(modelId);
  if (!check.ok) throw new AppError("ai_required", AI_PROMPT_REQUIRED_MESSAGE);
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new AppError("ai_required", AI_PROMPT_REQUIRED_MESSAGE);
  const google = createGoogle({ apiKey, ...(options.fetch ? { fetch: options.fetch } : {}) });
  return google(check.model);
}
