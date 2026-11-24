/**
 * The only way PromptHub builds a Gemini model. Server-only.
 *
 * - The key comes from `process.env.GEMINI_API_KEY`, read here at the point of use and passed
 *   explicitly to `createGoogle({ apiKey })`, so the SDK's `GOOGLE_GENERATIVE_AI_API_KEY` fallback is
 *   never used. The key is never logged, returned or echoed.
 * - The model id must pass the free-tier allowlist (`checkGeminiModel`); nothing is substituted.
 * - A model object is returned (never a bare string id), so nothing routes through `@ai-sdk/gateway`.
 * - `GEMINI_BASE_URL` exists only so end-to-end tests can point at a local fake Gemini server. It is
 *   honoured only for a loopback host (127.0.0.1 or localhost) and ignored otherwise, so no setting
 *   can send the key anywhere but Google.
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

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost"]);

/**
 * The base URL override for tests, or undefined (Google's default endpoint). Accepted only when it
 * is an http(s) URL whose host is 127.0.0.1 or localhost; anything else is ignored.
 */
export function testGeminiBaseUrl(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
  if (!LOOPBACK_HOSTS.has(url.hostname) || url.username || url.password) return undefined;
  return url.toString().replace(/\/+$/, "");
}

export function createGeminiModel(modelId: string, options: GeminiModelOptions = {}): LanguageModel {
  const check = checkGeminiModel(modelId);
  if (!check.ok) throw new AppError("ai_required", AI_PROMPT_REQUIRED_MESSAGE);
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new AppError("ai_required", AI_PROMPT_REQUIRED_MESSAGE);
  const baseURL = testGeminiBaseUrl(process.env.GEMINI_BASE_URL);
  const google = createGoogle({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  return google(check.model);
}
