import { TARGET_LABELS, TONE_LABELS, type Engine, type Tone, type VersionRecord } from "@/lib/contracts";
import type { Activity, SessionState } from "@/hooks/use-session";
import { engineLabel } from "@/lib/utils";

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
 * Who wrote the text. With the mock client nothing is attributed to an AI provider:
 * the engine reads "preview data" instead.
 */
export function engineName(engine: Engine | { kind: "manual" } | null | undefined, preview: boolean): string {
  if (engine?.kind === "basic") return "Basic Mode, no AI";
  if (preview) return "preview data";
  return engineLabel(engine);
}

export function writingLabel(state: SessionState, preview: boolean): string {
  const s = state.stream;
  if (!s) return "";
  if (s.activity === "generate") {
    const e = s.engine;
    if (!e && !preview) return "Writing";
    return `Writing with ${engineName(e, preview)}`;
  }
  return activityLabel(s.activity, s.tone);
}

export function provenance(engine: Engine | { kind: "manual" } | undefined, preview: boolean): string {
  if (!engine) return "";
  if (engine.kind === "basic") return "Built with Basic Mode, no AI";
  if (preview) return "Sample text from preview data, not AI";
  return `Written by ${engineLabel(engine)}`;
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

export const BASIC_REASON =
  "Improve, Shorten, Expand and Tone need an AI provider. Add an API key to the server to turn them on.";

export { TARGET_LABELS };
