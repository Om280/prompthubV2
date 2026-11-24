/**
 * Gemini models PromptHub may use: free-tier text models only. Server-only.
 *
 * Verified against Google's pricing page (source below) on 2026-11-23: each id below shows
 * "Free of charge" in the Free Tier column. `GEMINI_MODEL` must be one of them. Anything else (unknown,
 * paid-only, Pro, image, Omni, Genie, audio/live/TTS) makes AI `not-configured`. There is no default
 * model in code (docs/AUTH_SETUP.md recommends one), and an invalid setting is never silently replaced.
 *
 * Phase 3 notes for the adapter:
 * - No tools and no grounding: "Grounding with Google Search" is "Not available" on the free tier for
 *   the 3.x text models.
 * - Gemini 3.6 and later ignore temperature / top_p / top_k; don't send them.
 * - Free-tier content may be used by Google to improve its products (see src/lib/ai/disclosure.ts).
 * Re-verify this list against the pricing page whenever it changes; a model can move to paid-only.
 */

export const GEMINI_PRICING_SOURCE = "https://aistudio.google.com/docs/pricing";
export const GEMINI_RATE_LIMIT_SOURCE = "https://aistudio.google.com/rate-limit";

export interface FreeTierModel {
  id: string;
  verifiedOn: string;
  source: string;
}

const verified = (id: string): FreeTierModel => ({ id, verifiedOn: "2026-11-23", source: GEMINI_PRICING_SOURCE });

export const FREE_TIER_TEXT_MODELS: readonly FreeTierModel[] = [
  verified("gemini-3.8-flash"),
  verified("gemini-3.6-flash"),
  verified("gemini-3.5-flash-lite"),
  verified("gemini-3.1-flash-lite"),
  verified("gemini-3-flash-preview"),
  verified("gemini-2.5-flash-lite"),
];

/** Known paid-only ids on the pricing page (2026-11-23). Listed explicitly so they fail loudly. */
export const PAID_ONLY_MODELS: readonly string[] = [
  "gemini-4-carbon",
  "gemini-4-argon",
  "gemini-4-neon",
  "gemini-3.1-pro-preview",
  "gemini-3.1-pro-preview-customtools",
  "genie-4",
  "gemini-omni-1.2-flash",
  "gemini-omni-1.1-flash",
  "gemini-nano-banana-2.1",
  "gemini-3.1-flash-image",
  "gemini-3.1-flash-lite-image",
  "gemini-3-pro-image",
  "gemini-2.5-flash-image",
];

/** Families that are paid-only or not text models; denied even if a new id appears. */
const DENIED_PATTERNS: readonly RegExp[] = [/-pro(?:-|$)/, /image/, /omni/, /genie/, /banana/, /tts/, /live/, /transcribe/, /audio/];

export type ModelCheck =
  | { ok: true; model: string }
  | { ok: false; reason: "missing" | "paid-only" | "not-allowed"; message: string };

/** Validates `GEMINI_MODEL`. Never substitutes another model. */
export function checkGeminiModel(raw: string | null | undefined): ModelCheck {
  const model = raw?.trim() ?? "";
  if (!model) {
    return { ok: false, reason: "missing", message: "AI isn't set up on this server: GEMINI_MODEL isn't set." };
  }
  const id = model.toLowerCase();
  if (PAID_ONLY_MODELS.includes(id) || DENIED_PATTERNS.some((p) => p.test(id))) {
    return {
      ok: false,
      reason: "paid-only",
      message: `AI is off: GEMINI_MODEL "${model}" isn't a free-tier text model. PromptHub only uses free-tier models.`,
    };
  }
  if (!FREE_TIER_TEXT_MODELS.some((m) => m.id === id)) {
    return {
      ok: false,
      reason: "not-allowed",
      message: `AI is off: GEMINI_MODEL "${model}" isn't on PromptHub's free-tier allowlist.`,
    };
  }
  return { ok: true, model: id };
}
