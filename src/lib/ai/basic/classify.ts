/**
 * Basic Mode task detection (ARCHITECTURE §6). Pure, deterministic heuristics; no AI.
 * - `splitMaterial` separates pasted material (code fences, CSV-like data, code, long text blocks)
 *   from the user's instruction.
 * - `classify` maps an idea to a `TaskCategory` by weighted keyword and phrase matches.
 */
import type { TaskCategory } from "@/lib/prompting";

export type MaterialKind = "code" | "data" | "text";

export interface PastedMaterial {
  kind: MaterialKind;
  label: string;
  content: string;
}

export interface SplitIdea {
  /** What the user asked for, with the pasted material removed. */
  instruction: string;
  material: PastedMaterial[];
}

/** A block longer than this counts as pasted text when there is also a separate instruction. */
const LONG_BLOCK_CHARS = 600;

const LABELS: Record<MaterialKind, string> = {
  code: "Pasted code",
  data: "Pasted data",
  text: "Pasted text",
};

const tidy = (s: string) => s.replace(/^\s*\n/, "").replace(/\s+$/, "");

function isTabular(lines: string[]): boolean {
  if (lines.length < 3) return false;
  for (const delim of [",", "\t", "|", ";"]) {
    const counts = lines.map((l) => l.split(delim).length - 1);
    const mode = counts[0];
    if (mode < 1) continue;
    const same = counts.filter((c) => c === mode).length;
    if (same / lines.length >= 0.8) return true;
  }
  return false;
}

const CODE_LINE =
  /[;{}]\s*$|^\s*(def|class|function|const|let|var|import|from|return|if|elif|else|for|while|public|private|package|#include|SELECT|FROM|WHERE|INSERT|UPDATE|async|await|export)\b|=>|^\s{2,}\S|^\s*(\/\/|#!)/;

function isCodeLike(lines: string[]): boolean {
  if (lines.length < 3) return false;
  const hits = lines.filter((l) => CODE_LINE.test(l)).length;
  return hits / lines.length >= 0.5;
}

function materialKind(block: string): MaterialKind | null {
  const lines = block.split("\n").filter((l) => l.trim());
  if (isTabular(lines)) return "data";
  if (isCodeLike(lines)) return "code";
  return null;
}

export function splitMaterial(idea: string): SplitIdea {
  const material: PastedMaterial[] = [];
  let rest = idea.replace(/\r\n?/g, "\n");

  // 1. Fenced code blocks (``` or ~~~), including an unclosed final fence.
  rest = rest.replace(/(```|~~~)([^\n`]*)\n([\s\S]*?)(?:\1|$)/g, (_m, _f, info: string, body: string) => {
    const content = tidy(body);
    if (content.trim()) {
      const lang = info.trim().split(/\s+/)[0];
      material.push({ kind: "code", label: lang ? `Pasted ${lang} code` : LABELS.code, content });
    }
    return "\n\n";
  });

  // 2. Blank-line separated blocks.
  const blocks = rest
    .split(/\n[ \t]*\n/)
    .map(tidy)
    .filter((b) => b.trim());

  const pieces: { text: string; long: boolean }[] = [];
  for (const block of blocks) {
    const kind = materialKind(block);
    if (kind) {
      material.push({ kind, label: LABELS[kind], content: block });
      continue;
    }
    // "Summarize this:\n<content>" in one block.
    const nl = block.indexOf("\n");
    if (nl > 0) {
      const head = block.slice(0, nl).trim();
      const body = tidy(block.slice(nl + 1));
      const bodyKind = materialKind(body) ?? (body.length > 200 ? "text" : null);
      if (/:$/.test(head) && bodyKind) {
        pieces.push({ text: head, long: false });
        material.push({ kind: bodyKind, label: LABELS[bodyKind], content: body });
        continue;
      }
    }
    pieces.push({ text: block, long: block.length > LONG_BLOCK_CHARS });
  }

  // Long prose is material only when there is a separate, shorter instruction; otherwise it *is* the idea.
  const hasShort = pieces.some((p) => !p.long);
  const instruction = pieces.filter((p) => !hasShort || !p.long).map((p) => p.text);
  if (hasShort) {
    for (const p of pieces) if (p.long) material.push({ kind: "text", label: LABELS.text, content: p.text });
  }
  // Distinct labels so several pastes stay distinguishable ("Pasted data", "Pasted data 2").
  const seen = new Map<string, number>();
  for (const m of material) {
    const n = (seen.get(m.label) ?? 0) + 1;
    seen.set(m.label, n);
    if (n > 1) m.label = `${m.label} ${n}`;
  }
  return { instruction: instruction.join("\n").trim(), material };
}

/* ---------------- classification ---------------- */

type Rule = [RegExp, number];

const RULES: Record<Exclude<TaskCategory, "general">, Rule[]> = {
  coding: [
    [/\b(code|coding|function|script|debug|refactor|regex|regexp|sql|compile|compiler|algorithm|unit tests?|stack ?trace|bug|endpoint)\b/gi, 2],
    [/\b(python|javascript|typescript|java|c\+\+|c#|golang|rust|ruby|php|swift|kotlin|scala|bash|powershell|react|vue|angular|svelte|next\.?js|node\.?js|django|flask|fastapi|rails|spring|html|css|tailwind)\b/gi, 3],
    [/\b(api|class|method|component|library|package|npm|pip|docker|kubernetes|git|repo|database|query|cli|program|implement|exception|error message|deploy)\b/gi, 1],
  ],
  research: [
    [/\b(research|find out|look into|pros and cons|evidence|studies|literature|overview of|history of|learn about|explain|how does|how do|why do|why does|what are|what is|what's the difference|differences? between|compare|comparison|options for|state of)\b/gi, 2],
    [/\b(latest|current|recent|trends?|market|sources?|facts?|statistics)\b/gi, 1],
  ],
  creative: [
    [/\b(story|stories|poem|poetry|haiku|limerick|sonnet|lyrics|song|novel|fiction|screenplay|fairy tale|fable|bedtime|short story|verse|rhyme|monologue|flash fiction|fanfic(tion)?)\b/gi, 3],
    [/\b(character|plot|dialogue|narrative|fantasy|sci-?fi|creative|imaginative|scene)\b/gi, 1],
  ],
  brainstorm: [
    [/\b(brainstorm|brainstorming|ideas?|come up with|think of|names? for|suggestions? for|inspiration|alternatives)\b/gi, 2],
    [/\b(ways to|options|suggest)\b/gi, 1],
  ],
  analysis: [
    [/\b(analy[sz]e|analysis|dataset|csv|spreadsheet|survey|metrics|kpis?|insights?|findings|interpret|correlation|statistics|summari[sz]e (this|these|the|my)|breakdown of|identify (patterns|trends)|evaluate|assess)\b/gi, 2],
    [/\b(data|results|numbers|figures|trends? in|report|feedback|reviews|transcript|document)\b/gi, 1],
  ],
  planning: [
    [/\b(plan|planning|schedule|itinerary|roadmap|timeline|milestones|trip|vacation|holiday|study plan|meal plan|workout plan|training plan|routine)\b/gi, 2],
    [/\b(travel|organi[sz]e|prepare for|budget|weekly|daily|calendar|event|party|wedding|launch|move|moving|week|month)\b/gi, 1],
  ],
  productivity: [
    [/\b(email|e-mail|cover letter|resume|résumé|cv|linkedin|memo|meeting notes|minutes|follow[- ]up|status update|slack message|reply to|respond to|out of office|invitation|announcement|job description|performance review|to-?do list|checklist|template|letter|message to|proposal)\b/gi, 3],
    [/\b(message|reply|draft|notes|meeting|colleague|manager|boss|client|landlord|customer|recruiter|team)\b/gi, 1],
  ],
};

/** Ties resolve in this order: the more specific task kinds win. */
const PRIORITY: Exclude<TaskCategory, "general">[] = [
  "coding",
  "productivity",
  "creative",
  "analysis",
  "planning",
  "brainstorm",
  "research",
];

export function scoreCategories(split: SplitIdea): Record<Exclude<TaskCategory, "general">, number> {
  const text = split.instruction;
  const scores = {} as Record<Exclude<TaskCategory, "general">, number>;
  for (const cat of PRIORITY) {
    scores[cat] = RULES[cat].reduce((n, [re, w]) => n + (text.match(re)?.length ?? 0) * w, 0);
  }
  for (const m of split.material) {
    if (m.kind === "code") scores.coding += 3;
    if (m.kind === "data") scores.analysis += 3;
    if (m.kind === "text") scores.analysis += 1;
  }
  return scores;
}

export function classifySplit(split: SplitIdea): TaskCategory {
  const scores = scoreCategories(split);
  let best: TaskCategory = "general";
  let bestScore = 0;
  for (const cat of PRIORITY) {
    if (scores[cat] > bestScore) {
      best = cat;
      bestScore = scores[cat];
    }
  }
  // A single weak signal is not enough to commit to a task kind.
  return bestScore >= 2 ? best : "general";
}

export function classify(idea: string): TaskCategory {
  return classifySplit(splitMaterial(idea));
}
