import { TARGET_LABELS, type Length, type TargetPlatform } from "@/lib/contracts";
import { renderPrompt, type PromptBrief } from "@/lib/prompting";
import { MOCK_BRIEFS, type MockBrief } from "@/lib/mock/briefs";

/** Preview states reachable from the switcher and `?state=`. */
export const STATES = ["empty", "questions", "generating", "result", "copied", "history", "signed-in"] as const;
export type PreviewState = (typeof STATES)[number];

export const STATE_LABELS: Record<PreviewState, string> = {
  empty: "Empty",
  questions: "Questions",
  generating: "Generating",
  result: "Result",
  copied: "Copied",
  history: "History",
  "signed-in": "Signed in",
};

export function parseState(v: string | string[] | undefined): PreviewState {
  const s = Array.isArray(v) ? v[0] : v;
  return (STATES as readonly string[]).includes(s ?? "") ? (s as PreviewState) : "empty";
}

export const TARGETS: TargetPlatform[] = ["chatgpt", "claude", "gemini"];
export const LENGTHS: Length[] = ["concise", "balanced", "detailed"];
export { TARGET_LABELS };

export const TARGET_TIPS: Record<TargetPlatform, string> = {
  chatgpt: "Uses Markdown sections and a role line.",
  claude: "Uses XML tags and clear sections, the way Claude reads best.",
  gemini: "Puts the task first, with short direct sections.",
};

export const LENGTH_DESCRIPTIONS: Record<Length, string> = {
  concise: "Short, essentials only",
  balanced: "Enough context for good results",
  detailed: "Full context, examples and format rules",
};

export const BASIC_REASON =
  "Improve, Shorten, Expand and Tone need an AI provider. Add an API key to the server to turn them on.";

export const BASIC_POPOVER =
  "No AI provider is set up, so prompts come from local templates. Add ANTHROPIC_API_KEY, OPENAI_API_KEY or GEMINI_API_KEY to the server environment to turn on AI.";

export const TODAY = "2026-11-23";

export function briefFor(key: string): MockBrief {
  return MOCK_BRIEFS.find((b) => b.key === key) ?? MOCK_BRIEFS[0];
}

export function render(mb: MockBrief, target: TargetPlatform, length: Length, extra?: Partial<PromptBrief>): string {
  return renderPrompt(target, { ...mb.brief, ...extra, length }, { today: TODAY });
}

/** One version in the preview's version stack. Text is derived so a platform switch re-renders it. */
export interface PreviewVersion {
  source: "generated" | "edited" | "regenerated";
  length: Length;
  /** Line appended by a manual edit. */
  edit?: string;
}

export const VERSION_NAMES: Record<PreviewVersion["source"], string> = {
  generated: "Generated",
  edited: "Edited",
  regenerated: "Regenerated",
};

export const EDIT_LINES: Record<string, string> = {
  landlord: "Sign off with my flat number, 4B, so they can find the right unit.",
  sql: "Keep the annotated query under 30 lines.",
  planning: "Avoid anything that needs a car.",
};

export function versionText(mb: MockBrief, target: TargetPlatform, v: PreviewVersion): string {
  const base = render(mb, target, v.length);
  return v.edit ? `${base.replace(/\n*$/, "")}\n\n${v.edit}` : base;
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export interface HistoryItem {
  id: string;
  key: string;
  title: string;
  target: TargetPlatform;
  /** Minutes ago. */
  ago: number;
  versions: number;
}

/** Eight realistic items, mirroring the app's history seed. */
export const HISTORY: HistoryItem[] = [
  { id: "h1", key: "landlord", title: "Cold email to landlord", target: "claude", ago: 2, versions: 3 },
  { id: "h2", key: "sql", title: "SQL query for a new analyst", target: "claude", ago: 64, versions: 1 },
  { id: "h3", key: "productivity", title: "Meeting notes to follow-up", target: "chatgpt", ago: 190, versions: 2 },
  { id: "h4", key: "planning", title: "Lisbon trip on a budget", target: "gemini", ago: 26 * 60, versions: 2 },
  { id: "h5", key: "coding", title: "Dedupe users by email", target: "claude", ago: 3 * 1440, versions: 2 },
  { id: "h6", key: "research", title: "Cold-climate heat pumps", target: "chatgpt", ago: 5 * 1440, versions: 1 },
  { id: "h7", key: "analysis", title: "Regions slipping in sales data", target: "gemini", ago: 9 * 1440, versions: 4 },
  { id: "h8", key: "creative", title: "Lighthouse keeper story", target: "chatgpt", ago: 12 * 1440, versions: 2 },
];

export function historyGroup(ago: number): string {
  if (ago < 24 * 60 && ago < 600) return "Today";
  if (ago < 48 * 60) return "Yesterday";
  if (ago < 7 * 1440) return "Previous 7 days";
  return "Earlier";
}

export function relTime(ago: number): string {
  if (ago < 60) return `${ago} min`;
  if (ago < 1440) return `${Math.round(ago / 60)} h`;
  return `${Math.round(ago / 1440)} d`;
}

export const ACCOUNT = { name: "Maya Okafor", email: "maya.okafor@gmail.com", initials: "MO" };

export const TRY_ONE = ["landlord", "sql", "planning"];
