import { TARGET_LABELS, TONE_LABELS, type Engine, type TargetPlatform, type Tone, type VersionRecord } from "@/lib/contracts";
import type { Activity, SessionState } from "@/hooks/use-session";

/** Version names (DESIGN §8). */
export function versionLabel(v: VersionRecord): string {
  const base: Record<VersionRecord["source"], string> = {
    generated: "Generated",
    regenerated: "Regenerated",
    improved: "Improved",
    shortened: "Shortened",
    expanded: "Expanded",
    tone: v.tone ? `Tone: ${TONE_LABELS[v.tone]}` : "Tone",
    edited: "Edited",
    restored: "Restored",
  };
  return v.partial ? `${base[v.source]} (partial)` : base[v.source];
}

/** In-progress labels announced and shown while a stream runs. */
export function activityLabel(a: Activity, tone?: Tone): string {
  switch (a) {
    case "improve":
      return "Improving";
    case "shorten":
      return "Shortening";
    case "expand":
      return "Expanding";
    case "regenerate":
      return "Regenerating";
    case "tone":
      return `Changing tone to ${tone ? TONE_LABELS[tone] : "Neutral"}`;
    case "generate":
      return "Writing";
  }
}

/**
 * Who wrote the text: Basic Mode, or Gemini with its model id. Never the target platform: a prompt
 * written for Claude was still written by Gemini (or Basic Mode), and ChatGPT and Claude are never called.
 */
export function engineName(engine: Engine | { kind: "manual" } | null | undefined): string {
  if (!engine) return "";
  if (engine.kind === "basic") return "Basic Mode, no AI";
  if (engine.kind === "manual") return "you";
  return `Gemini (${engine.model})`;
}

export function writingLabel(state: SessionState): string {
  const s = state.stream;
  if (!s) return "";
  if (s.activity === "generate") return s.engine ? `Writing with ${engineName(s.engine)}` : "Writing";
  return activityLabel(s.activity, s.tone);
}

/** "Built with Basic Mode, no AI" or "Written by Gemini (gemini-3.8-flash) for Claude". */
export function provenance(engine: Engine | { kind: "manual" } | undefined, target: TargetPlatform): string {
  if (!engine || engine.kind === "manual") return "";
  if (engine.kind === "basic") return "Built with Basic Mode, no AI";
  return `Written by ${engineName(engine)} for ${TARGET_LABELS[target]}`;
}

export const TARGET_TIPS = {
  chatgpt: "Uses Markdown sections and a role line.",
  claude: "Uses XML tags and clear sections, the way Claude reads best.",
  gemini: "Puts the task first, with short direct sections.",
} as const;

export const LENGTH_DESCRIPTIONS = {
  concise: "Short, essentials only",
  balanced: "Enough context for good results",
  detailed: "Full context, examples and format rules",
} as const;

export const REFINE_DESCRIPTIONS = {
  improve: "Tighten the wording and fill obvious gaps",
  shorten: "Cut it down to the essentials",
  expand: "Add context, examples and format rules",
  regenerate: "Write it again from your idea and answers",
} as const;

export const SAME_PROMPT_NOTE =
  "Same idea and settings give the same prompt in Basic Mode. Change the platform, length or idea to get a different one.";

/** The generic reason AI-only actions are off (the specific one comes from `aiBlockReason`). */
export const BASIC_REASON =
  "Improve, Shorten, Expand and Tone need AI. Basic Mode still works, and your prompt is kept.";

export { TARGET_LABELS };
