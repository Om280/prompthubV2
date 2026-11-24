/**
 * AI availability (API_CONTRACTS §2). Server-only.
 *
 * AI uses only Google Gemini's free tier with the app owner's server-side key. No other provider,
 * no paid tier, no fallback. Readiness requires `GEMINI_API_KEY`, a `GEMINI_MODEL` on the free-tier
 * allowlist and the persistent quota store (Supabase + `SUPABASE_SECRET_KEY`); missing any →
 * `not-configured`, with a message naming the problem. `AI_ENABLED=false` (the emergency switch) →
 * `unavailable`. A quota store whose migration hasn't been run, or that can't be reached, also reads
 * `unavailable` (AI fails closed; Basic Mode keeps working).
 *
 * The project's RPM/TPM/RPD are optional: without them, conservative app-wide defaults apply
 * (`globalCeilings`). The status says which.
 */
// import "server-only" is added once the Vitest alias for it exists (see the Gemini report).
import type { AiStatusResponse } from "@/lib/contracts";
import { describeCeilings, globalCeilings, readServerEnv, type ServerEnv } from "@/lib/server/env";
import { isQuotaStoreConfigured, quotaHealth, type QuotaHealth } from "@/lib/server/quota";
import { checkGeminiModel } from "./gemini-models";

/** The Gemini adapter exists in this build. */
export const AI_GENERATION_BUILT = true;

export const AI_UNAVAILABLE_MESSAGE = "AI generation with Gemini isn't available in this build.";
export const AI_DISABLED_MESSAGE = "AI is turned off on this server right now. Basic Mode still works.";
export const AI_SIGN_IN_MESSAGE = "Sign in with Google to use AI features.";
export const AI_READY_MESSAGE = "AI uses Google Gemini on its free tier.";
export const AI_MIGRATION_MISSING_MESSAGE =
  "AI usage limits aren't set up yet (database migration missing). Basic Mode still works.";
export const AI_QUOTA_UNREACHABLE_MESSAGE =
  "AI is paused because PromptHub can't check its usage limits right now. Basic Mode still works.";

export type AiReadiness =
  | { status: "not-configured"; model: string | null; message: string }
  | { status: "unavailable"; model: string | null; message: string }
  | { status: "ready"; model: string; message: string };

export interface ReadinessDeps {
  env?: ServerEnv;
  quotaConfigured?: boolean;
  built?: boolean;
  /** Result of the (cached) quota-store health check; omitted = not checked (sync callers). */
  quotaHealth?: QuotaHealth;
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
  if (!(deps.built ?? AI_GENERATION_BUILT)) {
    return { status: "unavailable", model: model.model, message: AI_UNAVAILABLE_MESSAGE };
  }
  if (deps.quotaHealth === "migration-missing") {
    return { status: "unavailable", model: model.model, message: AI_MIGRATION_MISSING_MESSAGE };
  }
  if (deps.quotaHealth === "unreachable" || deps.quotaHealth === "not-configured") {
    return { status: "unavailable", model: model.model, message: AI_QUOTA_UNREACHABLE_MESSAGE };
  }
  return { status: "ready", model: model.model, message: AI_READY_MESSAGE };
}

/**
 * Readiness including the cached quota-store health check. The probe only runs when everything
 * else is configured, so an unconfigured server makes no network call.
 */
export async function aiReadinessChecked(
  deps: Omit<ReadinessDeps, "quotaHealth"> & { health?: () => Promise<QuotaHealth> } = {},
): Promise<AiReadiness> {
  const first = aiReadiness(deps);
  if (first.status !== "ready") return first;
  const health = await (deps.health ?? (() => quotaHealth()))();
  return aiReadiness({ ...deps, quotaHealth: health });
}

export interface AiStatusInput {
  authConfigured: boolean;
  signedIn: boolean;
  readiness?: AiReadiness;
  env?: ServerEnv;
  /** Set when the app-wide daily budget is used up. */
  budgetExhaustedUntil?: string;
  usage?: AiStatusResponse["usage"];
}

export function aiStatusResponse({ authConfigured, signedIn, readiness, env, budgetExhaustedUntil, usage }: AiStatusInput): AiStatusResponse {
  const e = env ?? readServerEnv();
  const r = readiness ?? aiReadiness({ env: e });
  const auth = { configured: authConfigured, signedIn: authConfigured && signedIn };
  const ceilings = globalCeilings(e);
  const limits = { basis: ceilings.basis, description: describeCeilings(ceilings, e.project.safetyRatio) };
  const base = { provider: "gemini" as const, tier: "free" as const, model: r.model };
  if (r.status === "not-configured") {
    return { mode: "basic", ai: { ...base, status: r.status, message: r.message }, auth };
  }
  if (r.status !== "ready") {
    return { mode: "basic", ai: { ...base, status: r.status, message: r.message, limits }, auth };
  }
  if (!auth.signedIn) {
    return { mode: "basic", ai: { ...base, status: "sign-in-required", message: AI_SIGN_IN_MESSAGE, limits }, auth };
  }
  const withUsage = usage ? { usage } : {};
  if (budgetExhaustedUntil) {
    return {
      mode: "basic",
      ai: {
        ...base,
        status: "quota-exhausted",
        message: "Today's free AI capacity is used up. Basic Mode still works.",
        resetsAt: budgetExhaustedUntil,
        limits,
      },
      auth,
      ...withUsage,
    };
  }
  return { mode: "ai", ai: { ...base, status: "ready", message: r.message, limits }, auth, ...withUsage };
}
