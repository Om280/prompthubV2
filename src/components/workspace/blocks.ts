/**
 * Block view of a prompt (DIRECTION-C §6). Splits prompt text into its labelled top-level sections
 * without losing a single character:
 *
 *   joinBlocks(parseBlocks(text)) === text      for every string, complete or partial.
 *
 * Each block is `head + body + tail`. Only `body` is editable in the block view; `head` holds the
 * section marker ("## Context\n\n", "<context>\n") and `tail` the closing tag and the whitespace up to
 * the next section, so editing a body rewrites only that section.
 *
 * Markdown prompts (ChatGPT, Gemini) are split at `#`, `##` or `###` headings outside fenced material.
 * XML prompts (Claude) are split at top-level tags: an opening tag at the start of a line and its
 * matching closing tag. Nested tags (`<source>` inside `<material>`) stay in the body.
 *
 * With `{ partial: true }` (a stream in progress) an unfinished last line that could become a heading
 * or tag is held back in the previous block's tail, and an XML section that has not closed yet runs
 * to the end of the text, so pieces appear as their headings arrive and never flicker.
 */

export type BlockKind = "intro" | "section" | "note";

export interface Block {
  /** Stable identity across versions and platforms ("context", "requirements", "output", …). */
  key: string;
  kind: BlockKind;
  /** Human label shown on the piece. */
  label: string;
  /** How the section is written for its platform, shown under the label. */
  syntax: string;
  head: string;
  body: string;
  tail: string;
  /** XML section whose closing tag hasn't arrived yet (partial parses only). */
  open?: boolean;
}

export interface ParseOptions {
  /** The text is still streaming in. */
  partial?: boolean;
}

interface Span {
  start: number;
  end: number;
  head: string;
  body: string;
  tail: string;
  label: string;
  syntax: string;
  canon: string;
  open?: boolean;
}

const HEADING = /^(#{1,3})[ \t]+(\S[^\n]*?)[ \t]*$/;
const XML_OPEN = /^<([a-z][a-z0-9_]*)>/;
const FENCE = /^(```|""")/;

const CANONICAL: Record<string, string> = {
  requirements: "requirements",
  "must include": "requirements",
  "must haves": "requirements",
  output: "output",
  output_format: "output",
  "output format": "output",
  format: "output",
  context: "context",
  background: "context",
  constraints: "constraints",
  rules: "constraints",
  examples: "examples",
  example: "examples",
  "example of what i want": "examples",
  task: "task",
  material: "material",
  definitions: "definitions",
};

function canonical(name: string): string {
  const n = name.trim().toLowerCase().replace(/_/g, " ");
  return CANONICAL[n] ?? CANONICAL[name.trim().toLowerCase()] ?? n.replace(/\s+/g, "-");
}

function tagLabel(tag: string): string {
  if (tag === "output_format") return "Output";
  const s = tag.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The opening paragraph: a role line makes it "Role and task". */
export function introLabel(body: string): string {
  return ROLE.test(body) ? "Role and task" : "Task";
}

const ROLE = /^(act as|you are)\b|\banswer as\b/im;

function lineStarts(text: string): number[] {
  const out = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") out.push(i + 1);
  return out;
}

function lineAt(text: string, start: number): string {
  const nl = text.indexOf("\n", start);
  return nl === -1 ? text.slice(start) : text.slice(start, nl);
}

/** Leading whitespace of `s` up to and including its last newline (keeps first-line indentation). */
function leadingBreaks(s: string): number {
  const m = /^\s*/.exec(s)![0];
  const nl = m.lastIndexOf("\n");
  return nl === -1 ? 0 : nl + 1;
}

function trailingSpace(s: string): number {
  return s.length - s.trimEnd().length;
}

function isXml(text: string): boolean {
  return /^<[a-z][a-z0-9_]*>/m.test(text);
}

/** Section start positions for Markdown text. */
function markdownSpans(text: string, partial: boolean): Span[] {
  const starts = lineStarts(text);
  const heads: { at: number; line: string; level: string; name: string }[] = [];
  let fenced = false;
  for (const at of starts) {
    const line = lineAt(text, at);
    if (FENCE.test(line.trim()) && !HEADING.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const m = HEADING.exec(line);
    if (!m) continue;
    // A heading still being typed by the stream isn't a heading yet.
    if (partial && at + line.length >= text.length) continue;
    heads.push({ at, line, level: m[1], name: m[2] });
  }
  return heads.map((h, i) => {
    const end = i + 1 < heads.length ? heads[i + 1].at : text.length;
    const after = text.slice(h.at + h.line.length, end);
    const lead = leadingBreaks(after);
    const content = after.slice(lead);
    const trail = trailingSpace(content);
    return {
      start: h.at,
      end,
      head: h.line + after.slice(0, lead),
      body: content.slice(0, content.length - trail),
      tail: content.slice(content.length - trail),
      label: h.name,
      syntax: `${h.level} ${h.name}`,
      canon: canonical(h.name),
    };
  });
}

/** Top-level tagged sections for XML text. */
function xmlSpans(text: string, partial: boolean): Span[] {
  const spans: Span[] = [];
  const starts = lineStarts(text);
  let skipUntil = 0;
  for (const at of starts) {
    if (at < skipUntil) continue;
    const line = lineAt(text, at);
    const m = XML_OPEN.exec(line);
    if (!m) continue;
    const tag = m[1];
    const close = `</${tag}>`;
    const openEnd = at + m[0].length;
    // The matching close must end its line, so a nested same-name tag inside a line doesn't count.
    let ci = text.indexOf(close, openEnd);
    while (ci !== -1) {
      const after = ci + close.length;
      if (after === text.length || text[after] === "\n" || /^[ \t]*(\n|$)/.test(text.slice(after, after + 8))) break;
      ci = text.indexOf(close, after);
    }
    const headEnd = text[openEnd] === "\n" ? openEnd + 1 : openEnd;
    if (ci === -1) {
      if (!partial) continue;
      // Still streaming: the section runs to the end (a half-written closing tag is held back by
      // parseBlocks before this runs).
      spans.push({
        start: at,
        end: text.length,
        head: text.slice(at, headEnd),
        body: text.slice(headEnd),
        tail: "",
        label: tagLabel(tag),
        syntax: `<${tag}>`,
        canon: canonical(tag),
        open: true,
      });
      break;
    }
    const bodyEnd = text[ci - 1] === "\n" && ci - 1 >= headEnd ? ci - 1 : ci;
    const closeEnd = ci + close.length;
    spans.push({
      start: at,
      end: closeEnd,
      head: text.slice(at, headEnd),
      body: text.slice(headEnd, bodyEnd),
      tail: text.slice(bodyEnd, closeEnd),
      label: tagLabel(tag),
      syntax: `<${tag}>`,
      canon: canonical(tag),
    });
    skipUntil = closeEnd;
  }
  return spans;
}

function looseBlock(chunk: string, kind: "intro" | "note", label: string): Omit<Block, "key"> {
  const lead = chunk.length - chunk.trimStart().length;
  const trail = trailingSpace(chunk.slice(lead));
  return {
    kind,
    label,
    syntax: "Plain paragraph",
    head: chunk.slice(0, lead),
    body: chunk.slice(lead, chunk.length - trail),
    tail: chunk.slice(chunk.length - trail),
  };
}

/** While streaming, an unfinished last line that may still become a heading or a tag. */
const PENDING_MARKER = /^(#{1,3}( [^\n]*)?|<\/?[a-z0-9_]*>?)$/;

export function parseBlocks(text: string, options: ParseOptions = {}): Block[] {
  if (!text) return [];
  const partial = !!options.partial;

  let held = "";
  let source = text;
  if (partial) {
    const last = text.slice(text.lastIndexOf("\n") + 1);
    if (last && PENDING_MARKER.test(last)) {
      held = last;
      source = text.slice(0, text.length - last.length);
    }
  }

  const spans = isXml(source) ? xmlSpans(source, partial) : markdownSpans(source, partial);
  const out: { block: Omit<Block, "key">; canon: string }[] = [];
  let lead = "";
  let cursor = 0;

  const gap = (chunk: string, last: boolean) => {
    if (!chunk) return;
    if (!chunk.trim()) {
      if (out.length) out[out.length - 1].block.tail += chunk;
      else lead += chunk;
      return;
    }
    const first = out.length === 0;
    // A role line between sections (Claude puts it after pasted material) is a role, not a note.
    const role = !first && ROLE.test(chunk.trim());
    const block = first
      ? looseBlock(chunk, "intro", introLabel(chunk))
      : role
        ? looseBlock(chunk, "intro", "Role")
        : looseBlock(chunk, "note", last ? "Closing note" : "Note");
    block.head = lead + block.head;
    lead = "";
    out.push({ block, canon: first ? "intro" : role ? "role" : "note" });
  };

  for (const s of spans) {
    gap(source.slice(cursor, s.start), false);
    out.push({
      block: {
        kind: "section",
        label: s.label,
        syntax: s.syntax,
        head: lead + s.head,
        body: s.body,
        tail: s.tail,
        ...(s.open ? { open: true } : {}),
      },
      canon: s.canon,
    });
    lead = "";
    cursor = s.end;
  }
  gap(source.slice(cursor), true);

  const rest = lead + held;
  if (rest) {
    if (out.length) out[out.length - 1].block.tail += rest;
    else
      out.push({
        block: { kind: "intro", label: "Task", syntax: "Plain paragraph", head: lead, body: "", tail: held },
        canon: "intro",
      });
  }

  const used = new Map<string, number>();
  return out.map(({ block, canon }) => {
    const n = (used.get(canon) ?? 0) + 1;
    used.set(canon, n);
    return { key: n === 1 ? canon : `${canon}-${n}`, ...block };
  });
}

export function joinBlocks(blocks: Block[]): string {
  let s = "";
  for (const b of blocks) s += b.head + b.body + b.tail;
  return s;
}

/** Replaces one block's body and returns the full prompt text. */
export function withBody(blocks: Block[], index: number, body: string): { blocks: Block[]; text: string } {
  const next = blocks.map((b, i) => (i === index ? { ...b, body } : b));
  return { blocks: next, text: joinBlocks(next) };
}
