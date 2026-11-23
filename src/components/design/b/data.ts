import { LENGTH_LABELS, TARGET_LABELS, type Length, type TargetPlatform } from "@/lib/contracts";
import { briefByKey, MOCK_BRIEFS, type MockBrief } from "@/lib/mock/briefs";
import { renderPrompt } from "@/lib/prompting";

export { LENGTH_LABELS, TARGET_LABELS };

export const TODAY = "2026-11-23";

export type PreviewState = "empty" | "questions" | "generating" | "result" | "copied" | "history" | "signed-in";

export const PREVIEW_STATES: { key: PreviewState; label: string }[] = [
  { key: "empty", label: "Empty" },
  { key: "questions", label: "Questions" },
  { key: "generating", label: "Generating" },
  { key: "result", label: "Result" },
  { key: "copied", label: "Copied" },
  { key: "history", label: "History" },
  { key: "signed-in", label: "Signed in" },
];

export function isPreviewState(v: string | undefined | null): v is PreviewState {
  return PREVIEW_STATES.some((s) => s.key === v);
}

export const TARGETS: TargetPlatform[] = ["chatgpt", "claude", "gemini"];
export const LENGTHS: Length[] = ["concise", "balanced", "detailed"];

/** Each platform owns one light. Names are ours; none of them are vendor brand colours. */
export const HUES: Record<TargetPlatform, { name: string; hex: string }> = {
  chatgpt: { name: "Saffron", hex: "#F4BC55" },
  claude: { name: "Glacier", hex: "#7CC8F7" },
  gemini: { name: "Peony", hex: "#F48DB6" },
};

/** Kept from the app (labels.ts) so the copy matches. */
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

export const BASIC_EXPLANATION =
  "No AI provider is set up, so prompts come from local templates. Add ANTHROPIC_API_KEY, OPENAI_API_KEY or GEMINI_API_KEY to the server environment to turn on AI.";

export const BASIC_DETAIL =
  "Templates follow the platform and length you pick, so the same idea and settings always give the same prompt. Improve, Shorten, Expand and Tone stay off until AI is on.";

export const EXAMPLES = [
  "Write a cold email to my landlord about a broken heater",
  "Explain a SQL query to a new analyst",
  "Plan a 3-day trip to Lisbon on a budget",
];

export const USER = { name: "Maya Okafor", email: "maya.okafor@gmail.com", initials: "MO" };

export type Answers = Record<string, { answer: string; skipped: boolean }>;

/** Real template output for a brief, platform and length, with answered questions folded in as context. */
export function promptFor(mb: MockBrief, target: TargetPlatform, length: Length, answers: Answers = {}): string {
  const extra = mb.questions
    .map((q) => ({ q, a: answers[q.id] }))
    .filter(({ a }) => a && !a.skipped && a.answer.trim())
    .map(({ q, a }) => `${q.question} ${a!.answer.trim()}.`);
  const brief = { ...mb.brief, length, context: [...(mb.brief.context ?? []), ...extra] };
  return renderPrompt(target, brief, { today: TODAY });
}

export interface VersionSpec {
  label: string;
  when: string;
  /** Lines the user appended by hand; they survive a platform or length change. */
  edits: string[];
}

/** Basic Mode can only generate, regenerate and accept edits, so the version trail uses only those. */
export const VERSIONS: VersionSpec[] = [
  { label: "Generated", when: "14 min ago", edits: [] },
  { label: "Edited", when: "9 min ago", edits: ["Keep the whole reply under 200 words."] },
  {
    label: "Edited",
    when: "2 min ago",
    edits: ["Keep the whole reply under 200 words.", "If anything above is unclear, ask me one question first."],
  },
];

export function versionText(
  mb: MockBrief,
  target: TargetPlatform,
  length: Length,
  v: VersionSpec,
  answers: Answers,
): string {
  const base = promptFor(mb, target, length, answers);
  return v.edits.length ? `${base.replace(/\n*$/, "")}\n\n${v.edits.join("\n")}` : base;
}

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export interface HistoryItem {
  key: string;
  title: string;
  target: TargetPlatform;
  group: "Today" | "Yesterday" | "Previous 7 days" | "Earlier";
  time: string;
}

/** Eight realistic rows across every group and platform. 2026-11-23 is a Monday. */
export const HISTORY: HistoryItem[] = [
  { key: "landlord", title: briefByKey("landlord").title, target: "chatgpt", group: "Today", time: "2 min" },
  { key: "sql", title: briefByKey("sql").title, target: "claude", group: "Today", time: "1 hr" },
  { key: "planning", title: briefByKey("planning").title, target: "gemini", group: "Yesterday", time: "9:40 pm" },
  { key: "coding", title: briefByKey("coding").title, target: "claude", group: "Previous 7 days", time: "Fri" },
  { key: "research", title: briefByKey("research").title, target: "chatgpt", group: "Previous 7 days", time: "Wed" },
  { key: "productivity", title: briefByKey("productivity").title, target: "chatgpt", group: "Previous 7 days", time: "Tue" },
  { key: "creative", title: briefByKey("creative").title, target: "claude", group: "Earlier", time: "11 Nov" },
  { key: "analysis", title: briefByKey("analysis").title, target: "gemini", group: "Earlier", time: "3 Nov" },
];

export const GROUPS: HistoryItem["group"][] = ["Today", "Yesterday", "Previous 7 days", "Earlier"];

export { briefByKey, MOCK_BRIEFS, type MockBrief };
