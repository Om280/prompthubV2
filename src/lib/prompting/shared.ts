import type { Length, Tone } from "@/lib/contracts";
import type { PromptBrief, SourcePolicy, TaskCategory } from "./brief";

/** Pasted material longer than this counts as long context (PROMPTING_RESEARCH §6). */
export const LONG_MATERIAL_CHARS = 1500;

/**
 * Phrases no profile may emit by default (PROMPTING_RESEARCH §8).
 * Matched case-insensitively; the evaluator fails any prompt containing one.
 */
export const BANNED_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /think step[- ]by[- ]step/i, reason: "visible chain-of-thought requested by default" },
  { pattern: /explain your reasoning/i, reason: "visible chain-of-thought requested by default" },
  { pattern: /\bCRITICAL\b|\bIMPORTANT:|\bYOU MUST\b|\bNEVER\b|\bALWAYS\b/, reason: "aggressive emphasis" },
  { pattern: /world[- ]class|best in the world|10x/i, reason: "persuasive persona boilerplate" },
  { pattern: /you are a helpful assistant/i, reason: "generic role" },
  { pattern: /\bbe concise\b|\bbe brief\b/i, reason: "blanket verbosity instruction; use a concrete target" },
  { pattern: /keep going until/i, reason: "agentic persistence boilerplate" },
  { pattern: /knowledge cutoff/i, reason: "cannot know the user's model version" },
  { pattern: /^(system|developer|assistant)\s*:/im, reason: "API role wrapper" },
  { pattern: /"role"\s*:\s*"(system|developer)"/i, reason: "API message JSON" },
];

export function hasLongMaterial(brief: PromptBrief): boolean {
  return (brief.material ?? []).some((m) => m.content.length > LONG_MATERIAL_CHARS);
}

/** Concrete size targets for the model's answer, per task kind and length. */
const LENGTH_TARGETS: Record<TaskCategory, Record<Length, string>> = {
  coding: {
    concise: "Give the code and at most three sentences of explanation.",
    balanced: "Give the code, then a short explanation of the key decisions (under 150 words).",
    detailed:
      "Give the code, then explain the key decisions, edge cases and how to test it (about 300 to 500 words of explanation).",
  },
  research: {
    concise: "Under 150 words.",
    balanced: "Aim for about 400 words.",
    detailed: "Aim for 800 to 1,200 words.",
  },
  creative: {
    concise: "Keep it under 200 words.",
    balanced: "Aim for 400 to 600 words.",
    detailed: "Aim for 1,000 to 1,500 words.",
  },
  brainstorm: {
    concise: "Give 5 ideas, one line each.",
    balanced: "Give 10 ideas, each with a sentence on why it could work.",
    detailed: "Give 15 to 20 ideas grouped by theme, each with a sentence on why it could work.",
  },
  analysis: {
    concise: "Top three findings, one sentence each.",
    balanced: "Cover the main findings in about 300 words.",
    detailed: "Cover all findings with supporting evidence, about 600 to 900 words.",
  },
  planning: {
    concise: "One short list of steps.",
    balanced: "Keep it to about one page.",
    detailed: "Make it a complete plan of about two pages, with timings and contingencies.",
  },
  productivity: {
    concise: "Under 100 words.",
    balanced: "Keep it to about 200 words.",
    detailed: "Keep it to about 400 words.",
  },
  general: {
    concise: "Keep it to about 100 words.",
    balanced: "Aim for about 250 words.",
    detailed: "Aim for about 600 words.",
  },
};

/**
 * Source rule for supplied material. Restricting to the material is emitted only when the user
 * asked for it; otherwise the default follows the kind of task. No material → no rule.
 */
const DEFAULT_SOURCE_POLICY: Partial<Record<TaskCategory, SourcePolicy>> = {
  analysis: "material-first",
  research: "material-plus",
  creative: "open",
  brainstorm: "open",
};

export function sourcePolicy(brief: PromptBrief): SourcePolicy | null {
  if (!(brief.material ?? []).length) return null;
  return brief.sourcePolicy ?? DEFAULT_SOURCE_POLICY[brief.category] ?? null;
}

export const SOURCE_LINES: Record<SourcePolicy, string> = {
  "material-only": "Use only the material provided. If something isn't covered there, say so.",
  "material-first":
    "Base your answer on the material provided. If you add anything from outside it, say which points those are.",
  "material-plus":
    "Use the material provided together with your own knowledge and any research you can do. Make clear which points come from the material.",
  open: "Treat the material as a starting point. You're free to go beyond it.",
};

export function sourceLine(brief: PromptBrief): string | null {
  const p = sourcePolicy(brief);
  return p ? SOURCE_LINES[p] : null;
}

/**
 * Tasks that produce a concrete deliverable, where a success criterion and an assumption policy help.
 * Creative writing and brainstorming are exploratory: those lines would narrow them for no gain.
 */
export function isDeliverableTask(brief: PromptBrief): boolean {
  return brief.category !== "creative" && brief.category !== "brainstorm";
}

export function lengthTarget(brief: PromptBrief): string {
  return LENGTH_TARGETS[brief.category][brief.length];
}

/** What extra depth Detailed asks for. Named explicitly, because Gemini and current GPT default to concise. */
const DETAIL_EXTRAS: Record<TaskCategory, string[]> = {
  coding: ["handling of edge cases and errors", "a short usage example"],
  research: ["key sources or where to verify each claim", "points where the evidence disagrees"],
  creative: ["vivid, specific details", "a clear arc from opening to ending"],
  brainstorm: ["a mix of safe and unexpected ideas", "the first step to test the strongest three"],
  analysis: ["the evidence behind each finding", "risks or limitations of the conclusions"],
  planning: ["timings for each step", "what to do if a step falls through"],
  productivity: ["a ready-to-use template or checklist"],
  general: ["concrete examples where they help"],
};

export function detailExtras(brief: PromptBrief): string[] {
  return brief.length === "detailed" ? DETAIL_EXTRAS[brief.category] : [];
}

export const TONE_DESCRIPTIONS: Record<Tone, string | null> = {
  neutral: null,
  friendly: "warm and approachable",
  professional: "polished and professional",
  direct: "plain and direct, with no filler",
  playful: "light and playful",
};

export function toneLine(brief: PromptBrief): string | null {
  const d = TONE_DESCRIPTIONS[brief.tone];
  return d ? `Tone: ${d}.` : null;
}

export function sentence(text: string): string {
  const t = text.trim();
  if (!t) return t;
  const cap = t[0].toUpperCase() + t.slice(1);
  return /[.!?:]$/.test(cap) ? cap : `${cap}.`;
}

export function lowerFirst(text: string): string {
  const t = text.trim();
  // Keep acronyms / proper nouns like "SQL", "I" intact.
  if (/^[A-Z]{2,}/.test(t) || /^I\b/.test(t)) return t;
  return t ? t[0].toLowerCase() + t.slice(1) : t;
}

export function stripEnd(text: string): string {
  return text.trim().replace(/[.!?]+$/, "");
}

/** Join non-empty blocks with one blank line. */
export function blocks(...parts: (string | null | undefined | false)[]): string {
  return parts
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .join("\n\n");
}

export function bullets(items: string[], numbered = false): string {
  return items.map((t, i) => `${numbered ? `${i + 1}.` : "-"} ${t}`).join("\n");
}

/** Returns an article-free role phrase, e.g. "experienced tenant-rights advisor". */
export function rolePhrase(role: string): string {
  return role.trim().replace(/^(an?|the)\s+/i, "");
}

export function withArticle(phrase: string): string {
  return /^[aeiou]/i.test(phrase) ? `an ${phrase}` : `a ${phrase}`;
}
