/**
 * Prompt anatomy tint for the Plain text view. Splits prompt text into colored runs without changing a
 * single character, so the tint layer lines up exactly with the textarea above it.
 * Invariant: tokens.map(t => t.text).join("") === input.
 */
export type TintKind = "text" | "tag" | "heading-marker" | "heading" | "marker" | "placeholder";

export interface TintToken {
  kind: TintKind;
  text: string;
}

const HEADING = /^(#{1,3})(\s+)(.*)$/;
const LIST = /^(\s*)([-*]|\d+\.)(\s+)/;
// Order matters: tags, then placeholders, then inline delimiters.
const INLINE = /<\/?[A-Za-z][\w.-]*(?:\s[^<>\n]*)?>|\[[^\[\]\n]{1,60}\](?!\()|\{[^{}\n]{1,60}\}|\*\*|`/g;

function push(out: TintToken[], kind: TintKind, text: string) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.kind === kind) last.text += text;
  else out.push({ kind, text });
}

function inline(out: TintToken[], text: string, base: "text" | "heading") {
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    const start = m.index ?? 0;
    push(out, base, text.slice(i, start));
    const tok = m[0];
    const kind: TintKind =
      tok[0] === "<" ? "tag" : tok[0] === "[" || tok[0] === "{" ? "placeholder" : "marker";
    push(out, kind, tok);
    i = start + tok.length;
  }
  push(out, base, text.slice(i));
}

export function tokenizeAnatomy(input: string): TintToken[] {
  const out: TintToken[] = [];
  const lines = input.split("\n");
  lines.forEach((line, idx) => {
    const h = HEADING.exec(line);
    if (h) {
      push(out, "heading-marker", h[1]);
      push(out, "heading", h[2]);
      inline(out, h[3], "heading");
    } else {
      const l = LIST.exec(line);
      if (l) {
        push(out, "text", l[1]);
        push(out, "marker", l[2]);
        push(out, "text", l[3]);
        inline(out, line.slice(l[0].length), "text");
      } else {
        inline(out, line, "text");
      }
    }
    if (idx < lines.length - 1) push(out, "text", "\n");
  });
  return out;
}

/** Plain text view colours (interlock.css): tags in the platform shade, placeholders in cobalt. */
export const TINT_CLASS: Record<TintKind, string> = {
  text: "",
  tag: "ih-tint-tag",
  "heading-marker": "ih-tint-marker",
  heading: "ih-tint-heading",
  marker: "ih-tint-marker",
  placeholder: "ih-tint-placeholder",
};
