/**
 * Faithfulness checks for AI output. Server-only, deterministic, no AI.
 *
 * "Preserve every requirement, invent none" made checkable:
 * - grounded: an item's content words mostly come from what the user wrote (idea + answers), and
 *   every number in it appears there too (an invented "under €400" fails);
 * - covered: each answer the user gave shows up in the brief;
 * - verbatim: user examples and pasted material are carried exactly (whitespace-normalised).
 * Word matching is loose on purpose (lower case, 5-letter stems) so rephrasing passes but invented
 * content doesn't. These are heuristics; they never call a model.
 */
import "server-only";

const STOP = new Set(
  (
    "the and for with that this from into your you our are was were has have had not but all any can could " +
    "should would will shall may might must its it's their them they then than there here what which who whom " +
    "when where why how each per via about also just only very more most some such own same other out over " +
    "under use using used make made give get like want need please able been being does did done one ones " +
    "include including includes keep sure way ways"
  ).split(" "),
);

const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
const NUMBER_RE = /\d+(?:[.,]\d+)*/g;

export function contentWords(text: string): string[] {
  return (text.normalize("NFKC").toLowerCase().match(WORD_RE) ?? [])
    .map((w) => w.replace(/['’]s$/, "").replace(/^-+|-+$/g, ""))
    .flatMap((w) => w.split("-"))
    .filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w));
}

export function numbersIn(text: string): string[] {
  return (text.normalize("NFKC").match(NUMBER_RE) ?? []).map((n) => n.replace(/,/g, ""));
}

export interface SourceIndex {
  words: Set<string>;
  stems: Set<string>;
  numbers: Set<string>;
  normalized: string;
}

const stem = (w: string) => (w.length >= 5 ? w.slice(0, 5) : w);
export const normalizeSpace = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim();

export function indexSource(...texts: string[]): SourceIndex {
  const all = texts.join("\n");
  const words = new Set(contentWords(all));
  return {
    words,
    stems: new Set([...words].map(stem)),
    numbers: new Set(numbersIn(all)),
    normalized: normalizeSpace(all).toLowerCase(),
  };
}

function hasWord(index: SourceIndex, w: string): boolean {
  return index.words.has(w) || (w.length >= 5 && index.stems.has(stem(w)));
}

/** Share of the text's content words found in the index (1 when it has none). */
export function coverage(text: string, index: SourceIndex): number {
  const words = contentWords(text);
  if (words.length === 0) return 1;
  return words.filter((w) => hasWord(index, w)).length / words.length;
}

export const GROUNDED_MIN = 0.5;

/** An item is grounded when most of its words, and all of its numbers, come from the source. */
export function isGrounded(text: string, source: SourceIndex): boolean {
  if (!numbersIn(text).every((n) => source.numbers.has(n))) return false;
  return coverage(text, source) >= GROUNDED_MIN;
}

/** The user's text appears (whitespace-normalised, case-insensitive) in the source. */
export function isVerbatim(text: string, source: SourceIndex): boolean {
  const t = normalizeSpace(text).toLowerCase();
  return t.length > 0 && source.normalized.includes(t);
}

/** Delimited blocks a prompt carries verbatim: fenced/quoted/ruled blocks and material XML tags. */
export function verbatimBlocks(prompt: string): string[] {
  const out: string[] = [];
  const patterns = [
    /```[^\n]*\n([\s\S]*?)\n```/g,
    /"""\n([\s\S]*?)\n"""/g,
    /^---\n([\s\S]*?)\n---$/gm,
    /<(content|document_content|example)>\n?([\s\S]*?)\n?<\/\1>/g,
  ];
  for (const re of patterns) {
    for (const m of prompt.matchAll(re)) {
      const body = (m[2] ?? m[1] ?? "").trim();
      if (body.length >= 20) out.push(body);
    }
  }
  return out;
}

/** List items (bullets, numbers) of a prompt: where requirements and constraints live. */
export function listItems(prompt: string): string[] {
  const inBlocks = new Set(verbatimBlocks(prompt).flatMap((b) => b.split("\n").map((l) => l.trim())));
  return prompt
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^([-*•]|\d+[.)])\s+\S/.test(l) && !inBlocks.has(l))
    .map((l) => l.replace(/^([-*•]|\d+[.)])\s+/, ""));
}
