import type { AiStatusResponse, ApiErrorCode } from "@/lib/contracts";

/**
 * How the workspace uses AI. Shared by the engine indicator, the refine row, the palette and the
 * error strips, so every surface says the same thing.
 *
 * - "auto": use Gemini whenever the server says AI is ready for this visitor (signed in, AI set up).
 * - "basic": the visitor chose Basic Mode; nothing is sent to Google.
 */
export type EnginePreference = "auto" | "basic";

const PREF_KEY = "prompthub-engine";
const CONSENT_KEY = "prompthub-ai-disclosure";

/** Storage can be unavailable (private mode); every read and write is guarded. */
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // The choice still holds for this tab.
  }
}

export function readEnginePreference(): EnginePreference {
  return read(PREF_KEY) === "basic" ? "basic" : "auto";
}
export function writeEnginePreference(p: EnginePreference) {
  write(PREF_KEY, p === "basic" ? "basic" : null);
}

/** The visitor has read the first-use AI notice and chose to use AI (per browser). */
export function readAiConsent(): boolean {
  return read(CONSENT_KEY) === "accepted";
}
export function writeAiConsent() {
  write(CONSENT_KEY, "accepted");
}

export type AiState =
  /** Signed in, AI ready, and the visitor uses it. */
  | "on"
  /** AI is ready but the visitor chose Basic Mode. */
  | "chosen-basic"
  | "sign-in-required"
  | "quota-exhausted"
  | "not-configured"
  | "unavailable"
  /** Status not loaded (or failed). */
  | "unknown";

export function aiState(status: AiStatusResponse | null, pref: EnginePreference): AiState {
  if (!status) return "unknown";
  if (status.mode === "ai") return pref === "basic" ? "chosen-basic" : "on";
  const s = status.ai.status;
  if (s === "ready") return "unavailable";
  return s;
}

/** "at 4:00 PM" today, or "Tue at 4:00 PM", in the visitor's own time zone. */
export function resetLabel(iso: string | undefined, now = new Date()): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const time = at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const sameDay = at.toDateString() === now.toDateString();
  return sameDay ? `at ${time}` : `${at.toLocaleDateString(undefined, { weekday: "short" })} at ${time}`;
}

/** Why Improve, Shorten, Expand and Tone are off right now. */
export function aiBlockReason(state: AiState, status: AiStatusResponse | null): string {
  switch (state) {
    case "chosen-basic":
      return "Improve, Shorten, Expand and Tone need AI. You're using Basic Mode, so nothing is sent to Google. Switch to Gemini to use them.";
    case "sign-in-required":
      return "Improve, Shorten, Expand and Tone need AI. Sign in with Google to use Gemini. Basic Mode works without an account.";
    case "quota-exhausted": {
      const at = resetLabel(status?.ai.resetsAt);
      return `Improve, Shorten, Expand and Tone need AI. Google's free Gemini quota is used up${at ? ` until ${at.replace(/^at /, "")}` : " for now"}. Basic Mode still works, and your prompt is kept.`;
    }
    case "not-configured":
      return "Improve, Shorten, Expand and Tone need AI, which isn't set up on this server. Basic Mode still works, and your prompt is kept.";
    case "unavailable":
      return "Improve, Shorten, Expand and Tone need AI, which isn't available right now. Basic Mode still works, and your prompt is kept.";
    case "unknown":
      return "Improve, Shorten, Expand and Tone need AI. PromptHub couldn't check whether AI is available. Basic Mode still works.";
    case "on":
      return "";
  }
}

/** Errors that mean AI can't run for a while: offer Basic Mode instead of a retry loop. */
export const LIMIT_CODES: ReadonlySet<ApiErrorCode> = new Set([
  "quota_exhausted",
  "daily_budget_exhausted",
  "user_daily_limit",
]);

/** Errors after which the AI status shown in the UI is probably stale. */
export const STATUS_STALE_CODES: ReadonlySet<ApiErrorCode> = new Set([
  "quota_exhausted",
  "daily_budget_exhausted",
  "user_daily_limit",
  "auth_required",
  "ai_required",
]);
