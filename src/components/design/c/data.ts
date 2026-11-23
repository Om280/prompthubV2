import { LENGTH_LABELS, TARGET_LABELS, type Length, type TargetPlatform } from "@/lib/contracts";
import { renderPrompt } from "@/lib/prompting";
import { MOCK_BRIEFS, briefByKey, pickBrief } from "@/lib/mock/briefs";
import { BASIC_REASON, LENGTH_DESCRIPTIONS, SAME_PROMPT_NOTE, TARGET_TIPS } from "@/components/workspace/labels";

export { BASIC_REASON, LENGTH_DESCRIPTIONS, SAME_PROMPT_NOTE, TARGET_TIPS, LENGTH_LABELS, TARGET_LABELS };
export { briefByKey, pickBrief, MOCK_BRIEFS };

export const TODAY = "2026-11-23";

export const PLATFORMS: TargetPlatform[] = ["chatgpt", "claude", "gemini"];
export const LENGTHS: Length[] = ["concise", "balanced", "detailed"];

export const EXAMPLES = [
  "Write a cold email to my landlord about a broken heater",
  "Explain a SQL query to a new analyst",
  "Plan a 3-day trip to Lisbon on a budget",
];

export const ENGINE_LABEL = "Basic Mode, no AI";
export const ENGINE_POPOVER =
  "No AI provider is set up, so prompts come from local templates. Add ANTHROPIC_API_KEY, OPENAI_API_KEY or GEMINI_API_KEY to the server environment to turn on AI.";

export function render(briefKey: string, platform: TargetPlatform, length: Length): string {
  const mb = briefByKey(briefKey);
  return renderPrompt(platform, { ...mb.brief, length }, { today: TODAY });
}

/* ---------- Blocks: the prompt split into its labelled sections ---------- */

export interface Block {
  /** Stable per label, so a block keeps its identity across platform switches. */
  key: string;
  label: string;
  /** How the section is written for this platform, shown under the label. */
  syntax: string;
  prefix: string;
  suffix: string;
  body: string;
}

function titleCase(tag: string): string {
  const s = tag.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function introLabel(body: string): string {
  return /^(act as|you are)|answer as/im.test(body) ? "Role and task" : "Task";
}

export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  // Top-level sections only: the tag opens at a line start and closes at a line end. Nested tags
  // (<source>, <content> inside <material>) stay in the body; single-line sections keep their shape.
  const xml = /^<([a-z_]+)>(\n?)([\s\S]*?)(\n?)<\/\1>$/gm;
  if (xml.test(text)) {
    xml.lastIndex = 0;
    let cursor = 0;
    let m: RegExpExecArray | null;
    const pushLoose = (chunk: string, fallback: string) => {
      const body = chunk.trim();
      if (!body) return;
      const label = blocks.length === 0 ? introLabel(body) : fallback;
      blocks.push({ key: label, label, syntax: "Plain paragraph", prefix: "", suffix: "", body });
    };
    while ((m = xml.exec(text))) {
      pushLoose(text.slice(cursor, m.index), "Note");
      const label = titleCase(m[1]);
      blocks.push({ key: label, label, syntax: `<${m[1]}>`, prefix: `<${m[1]}>${m[2]}`, suffix: `${m[4]}</${m[1]}>`, body: m[3] });
      cursor = m.index + m[0].length;
    }
    pushLoose(text.slice(cursor), "Closing note");
    return blocks;
  }
  const parts = text.split(/^## (.+)$/m);
  const intro = parts[0].trim();
  if (intro) {
    const label = introLabel(intro);
    blocks.push({ key: label, label, syntax: "Plain paragraph", prefix: "", suffix: "", body: intro });
  }
  for (let i = 1; i < parts.length; i += 2) {
    const heading = parts[i].trim();
    blocks.push({ key: heading, label: heading, syntax: `## ${heading}`, prefix: `## ${heading}\n\n`, suffix: "", body: (parts[i + 1] ?? "").trim() });
  }
  return blocks;
}

export function joinBlocks(blocks: Block[]): string {
  return blocks.map((b) => b.prefix + b.body + b.suffix).join("\n\n");
}

export function wordCount(text: string): number {
  return text.replace(/<\/?[a-z_]+>|^## /gm, " ").split(/\s+/).filter(Boolean).length;
}

/** What each block is for, shown on the empty build plate before anything is written. */
export const GHOST_BLOCKS: { label: string; hint: string; syntax: Record<TargetPlatform, string> }[] = [
  { label: "Role and task", hint: "Who the AI should be and what it should do", syntax: { chatgpt: "Plain paragraph", claude: "Plain paragraph", gemini: "Plain paragraph" } },
  { label: "Context", hint: "The facts it needs to know", syntax: { chatgpt: "## Context", claude: "<context>", gemini: "## Context" } },
  { label: "Requirements", hint: "What the answer has to include", syntax: { chatgpt: "## Requirements", claude: "<requirements>", gemini: "## Must include" } },
  { label: "Constraints", hint: "Limits to stay within", syntax: { chatgpt: "## Constraints", claude: "<constraints>", gemini: "## Constraints" } },
  { label: "Output", hint: "Shape and length of the answer", syntax: { chatgpt: "## Output", claude: "<output_format>", gemini: "## Output" } },
];

/* ---------- History ---------- */

export interface HistoryItem {
  id: string;
  briefKey: string;
  title: string;
  platform: TargetPlatform;
  versions: number;
  when: string;
  group: "Today" | "Yesterday" | "Previous 7 days" | "Earlier";
}

export const HISTORY: HistoryItem[] = [
  { id: "h1", briefKey: "landlord", title: "Cold email to landlord", platform: "chatgpt", versions: 2, when: "2 min ago", group: "Today" },
  { id: "h2", briefKey: "sql", title: "SQL query for a new analyst", platform: "claude", versions: 1, when: "1 hr ago", group: "Today" },
  { id: "h3", briefKey: "planning", title: "Lisbon trip on a budget", platform: "gemini", versions: 2, when: "Yesterday", group: "Yesterday" },
  { id: "h4", briefKey: "coding", title: "Dedupe users by email", platform: "claude", versions: 2, when: "Fri", group: "Previous 7 days" },
  { id: "h5", briefKey: "research", title: "Cold-climate heat pumps", platform: "chatgpt", versions: 1, when: "Wed", group: "Previous 7 days" },
  { id: "h6", briefKey: "productivity", title: "Meeting notes to follow-up", platform: "chatgpt", versions: 3, when: "Tue", group: "Previous 7 days" },
  { id: "h7", briefKey: "creative", title: "Lighthouse keeper story", platform: "claude", versions: 2, when: "Nov 11", group: "Earlier" },
  { id: "h8", briefKey: "analysis", title: "Regions slipping in sales data", platform: "gemini", versions: 1, when: "Nov 3", group: "Earlier" },
];

export const ACCOUNT = { name: "Maya Shah", email: "maya.shah@example.com", initials: "MS" };
