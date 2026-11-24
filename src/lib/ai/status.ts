/**
 * AI availability (API_CONTRACTS §2). Server-only.
 *
 * AI uses only Google Gemini's free tier with the app owner's server-side key. No other provider,
 * no paid tier, no fallback. Readiness requires every piece: `GEMINI_API_KEY`, a `GEMINI_MODEL` on
 * the free-tier allowlist, the persistent quota store (Supabase + `SUPABASE_SECRET_KEY`) and the
 * verified project limits (`GEMINI_PROJECT_RPM`/`TPM`/`RPD`). Missing any → `not-configured`, with
 * a message naming the problem. `AI_ENABLED=false` (the emergency switch) → `unavailable`. The key
 * itself is never part of any response; the model id may be shown.
 *
 * This build has no AI generation (Phase 3), so a complete configuration reads `unavailable`.
 */
import type { AiStatusResponse } from "@/lib/contracts";
import { readServerEnv, type ServerEnv } from "@/lib/server/env";
import { isQuotaStoreConfigured } from "@/lib/server/quota";
import { checkGeminiModel } from "./gemini-models";

/** Phase 3 sets this to true when the Gemini adapter exists. */
export const AI_GENERATION_BUILT = false;

export const AI_UNAVAILABLE_MESSAGE = "AI generation with Gemini is coming in a later update.";
export const AI_DISABLED_MESSAGE = "AI is turned off on this server right now. Basic Mode still works.";
export const AI_SIGN_IN_MESSAGE = "Sign in with Google to use AI features.";
export const AI_READY_MESSAGE = "AI uses Google Gemini on its free tier.";

export type AiReadiness =
  | { status: "not-configured"; model: string | null; message: string }
  | { status: "unavailable"; model: string | null; message: string }
  | { status: "ready"; model: string; message: string };

export interface ReadinessDeps {
  env?: ServerEnv;
  quotaConfigured?: boolean;
  built?: boolean;
}

/** Whether AI could run on this server right now (ignoring who is asking). */
export function aiReadiness(deps: ReadinessDeps = {}): AiReadiness {
  const env = deps.env ?? readServerEnv();
  const model = checkGeminiModel(env.geminiModel);
  const shownModel = model.ok ? model.model : null;
  if (!env.aiEnabled) return { status: "unavailable", model: shownModel, message: AI_DISABLED_MESSAGE };
  if (!env.geminiKeyPresent) {
    return { status: "not-configured", model: shownModel, message: "AI isn't set up on this server: GEMINI_API_KEY isn't set." };
  }
  if (!model.ok) return { status: "not-configured", model: null, message: model.message };
  if (!(deps.quotaConfigured ?? isQuotaStoreConfigured())) {
    return {
      status: "not-configured",
      model: shownModel,
      message: "AI isn't set up on this server: the quota store (Supabase and SUPABASE_SECRET_KEY) isn't configured.",
    };
  }
  const missing = (["rpm", "tpm", "rpd"] as const).filter((k) => env.project[k] === null);
  if (missing.length > 0) {
    return {
      status: "not-configured",
      model: shownModel,
      message: `AI isn't set up on this server: ${missing.map((k) => `GEMINI_PROJECT_${k.toUpperCase()}`).join(", ")} ${missing.length === 1 ? "isn't" : "aren't"} set.`,
    };
  }
  if (!(deps.built ?? AI_GENERATION_BUILT)) {
    return { status: "unavailable", model: model.model, message: AI_UNAVAILABLE_MESSAGE };
  }
  return { status: "ready", model: model.model, message: AI_READY_MESSAGE };
}

export interface AiStatusInput {
  authConfigured: boolean;
  signedIn: boolean;
  readiness?: AiReadiness;
  /** Set when the app-wide daily budget is used up (Phase 3). */
  budgetExhaustedUntil?: string;
}

export function aiStatusResponse({ authConfigured, signedIn, readiness, budgetExhaustedUntil }: AiStatusInput): AiStatusResponse {
  const r = readiness ?? aiReadiness();
  const auth = { configured: authConfigured, signedIn: authConfigured && signedIn };
  const base = { provider: "gemini" as const, tier: "free" as const, model: r.model };
  if (r.status !== "ready") {
    return { mode: "basic", ai: { ...base, status: r.status, message: r.message }, auth };
  }
  if (!auth.signedIn) {
    return { mode: "basic", ai: { ...base, status: "sign-in-required", message: AI_SIGN_IN_MESSAGE }, auth };
  }
  if (budgetExhaustedUntil) {
    return {
      mode: "basic",
      ai: {
        ...base,
        status: "quota-exhausted",
        message: "Today's free AI capacity is used up. Basic Mode still works.",
        resetsAt: budgetExhaustedUntil,
      },
      auth,
    };
  }
  return { mode: "ai", ai: { ...base, status: "ready", message: r.message }, auth };
}
