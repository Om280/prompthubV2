import { describe, expect, it } from "vitest";
import type { Length, TargetPlatform } from "@/lib/contracts";
import { renderPrompt } from "@/lib/prompting";
import { MOCK_BRIEFS } from "@/lib/mock/briefs";
import { chunkText } from "@/lib/mock/adapter";
import { joinBlocks, parseBlocks, withBody, type Block } from "@/components/workspace/blocks";
import { FIXTURES } from "../prompting/fixtures";

const TARGETS: TargetPlatform[] = ["chatgpt", "claude", "gemini"];
const LENGTHS: Length[] = ["concise", "balanced", "detailed"];
const TODAY = { today: "2026-11-23" };

const CASES = [
  ...FIXTURES.map((f) => ({ name: `fixture ${f.name}`, brief: f.brief })),
  ...MOCK_BRIEFS.map((b) => ({ name: `mock ${b.key}`, brief: b.brief })),
].flatMap((c) =>
  TARGETS.flatMap((target) =>
    LENGTHS.map((length) => ({
      ...c,
      target,
      length,
      text: renderPrompt(target, { ...c.brief, length }, TODAY),
    })),
  ),
);

const labels = (blocks: Block[]) => blocks.map((b) => b.label);

describe("block parser: lossless round-trip", () => {
  it.each(CASES.map((c) => [`${c.name} × ${c.target} × ${c.length}`, c] as const))("%s", (_, c) => {
    const blocks = parseBlocks(c.text);
    expect(joinBlocks(blocks)).toBe(c.text);
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    // Keys are unique, so React and the layout animation can track every piece.
    expect(new Set(blocks.map((b) => b.key)).size).toBe(blocks.length);
    // No top-level section is mistaken for loose text.
    expect(blocks.filter((b) => b.kind === "note")).toEqual([]);
  });

  it("covers every brief, platform and length", () => {
    expect(CASES.length).toBe((FIXTURES.length + MOCK_BRIEFS.length) * 9);
  });

  it.each(CASES.map((c) => [`${c.name} × ${c.target} × ${c.length}`, c] as const))(
    "streamed %s: every prefix round-trips and pieces only ever grow",
    (_, c) => {
      // Real streams arrive in arbitrary chunks; cut at every chunk boundary the mock adapter uses,
      // plus a few character-level cuts around section markers.
      const cuts = new Set<number>();
      let at = 0;
      for (const chunk of chunkText(c.text)) {
        at += chunk.length;
        cuts.add(at);
      }
      for (const m of c.text.matchAll(/\n(## |<\/?[a-z])/g)) {
        const i = m.index ?? 0;
        for (const d of [0, 1, 2, 3, 5, 8]) cuts.add(Math.min(c.text.length, i + d));
      }
      let prevCount = 0;
      for (const cut of [...cuts].sort((a, b) => a - b)) {
        const prefix = c.text.slice(0, cut);
        const blocks = parseBlocks(prefix, { partial: true });
        expect(joinBlocks(blocks)).toBe(prefix);
        expect(blocks.length).toBeGreaterThanOrEqual(prevCount);
        prevCount = blocks.length;
      }
      // The finished text parses to the same pieces whether or not it was flagged as partial.
      expect(labels(parseBlocks(c.text, { partial: true }))).toEqual(labels(parseBlocks(c.text)));
    },
  );
});

describe("block parser: structure", () => {
  const landlord = MOCK_BRIEFS.find((b) => b.key === "landlord")!.brief;

  it("labels Markdown sections and keeps the exact syntax", () => {
    const text = renderPrompt("chatgpt", landlord, TODAY);
    const blocks = parseBlocks(text);
    expect(blocks[0]).toMatchObject({ kind: "intro", label: "Role and task", syntax: "Plain paragraph", head: "" });
    const context = blocks.find((b) => b.key === "context")!;
    expect(context).toMatchObject({ label: "Context", syntax: "## Context", head: "## Context\n\n" });
    expect(context.body.startsWith("- ")).toBe(true);
    expect(context.tail).toBe("\n\n");
  });

  it("splits Claude prompts at top-level tags only", () => {
    const productivity = MOCK_BRIEFS.find((b) => b.key === "productivity")!.brief;
    const text = renderPrompt("claude", productivity, TODAY);
    const blocks = parseBlocks(text);
    expect(blocks.map((b) => b.syntax)).toContain("<material>");
    const material = blocks.find((b) => b.key === "material")!;
    // <source> and <content> are nested: they stay inside the material body.
    expect(material.body).toMatch(/^<source>/);
    expect(material.body).toContain("<content>");
    expect(blocks.some((b) => b.syntax === "<source>")).toBe(false);
    const output = blocks.find((b) => b.key === "output")!;
    expect(output).toMatchObject({ label: "Output", syntax: "<output_format>", head: "<output_format>\n" });
    expect(output.tail.startsWith("\n</output_format>")).toBe(true);
  });

  it("handles single-line tagged sections", () => {
    const text = "Help me.\n\n<context>It's set on an island.</context>\n\n<constraints>- Keep it short.</constraints>";
    const blocks = parseBlocks(text);
    expect(labels(blocks)).toEqual(["Task", "Context", "Constraints"]);
    expect(blocks[1]).toMatchObject({ head: "<context>", body: "It's set on an island.", tail: "</context>\n\n" });
    expect(joinBlocks(blocks)).toBe(text);
  });

  it("gives Gemini's sections the same keys as ChatGPT's, so pieces can move instead of remount", () => {
    const a = parseBlocks(renderPrompt("chatgpt", landlord, TODAY)).map((b) => b.key);
    const b = parseBlocks(renderPrompt("gemini", landlord, TODAY)).map((b) => b.key);
    for (const key of ["intro", "context", "requirements", "constraints", "output"]) {
      expect(a).toContain(key);
      expect(b).toContain(key);
    }
    expect(b.indexOf("constraints")).toBeLessThan(b.indexOf("context"));
  });

  it("ignores headings inside fenced material", () => {
    const text = 'Summarise this.\n\n## Notes\n\n"""\n## Not a section\nbody\n"""\n\n## Output\n\nA list.';
    expect(labels(parseBlocks(text))).toEqual(["Task", "Notes", "Output"]);
  });

  it("keeps loose text between tagged sections as a note, losslessly", () => {
    const text = "<context>\nA\n</context>\n\nStray line.\n\n<task>\nB\n</task>\nAfterword.";
    const blocks = parseBlocks(text);
    expect(labels(blocks)).toEqual(["Context", "Note", "Task", "Closing note"]);
    expect(joinBlocks(blocks)).toBe(text);
  });

  it("round-trips odd whitespace and user edits that break the template", () => {
    const samples = [
      "",
      "   ",
      "\n\n## Context\n\n\n- a\n\n\n\n## Output   \n\nx\n",
      "Just one paragraph with no sections at all.",
      "## Only\nheading",
      "# Title\n## Sub\n### Deep\ntext",
      "<context>\n</context>",
      "<context>\nunclosed tag",
      "  indented intro\n\n## Next\n\n  indented body  \n",
      "Intro\r\n\r\n## Windows\r\n\r\nlines\r\n",
    ];
    for (const s of samples) {
      expect(joinBlocks(parseBlocks(s))).toBe(s);
      expect(joinBlocks(parseBlocks(s, { partial: true }))).toBe(s);
    }
  });

  it("an unclosed tag is plain text once the stream is done, and an open section while it runs", () => {
    const text = "Intro.\n\n<context>\nstill writing";
    expect(labels(parseBlocks(text))).toEqual(["Task"]);
    const live = parseBlocks(text, { partial: true });
    expect(labels(live)).toEqual(["Task", "Context"]);
    expect(live[1]).toMatchObject({ open: true, body: "still writing" });
  });

  it("holds back a half-written heading or tag while streaming", () => {
    expect(labels(parseBlocks("Do this.\n\n## Cont", { partial: true }))).toEqual(["Task"]);
    expect(parseBlocks("Do this.\n\n## Cont", { partial: true })[0].body).toBe("Do this.");
    expect(labels(parseBlocks("Do this.\n\n## Context\n", { partial: true }))).toEqual(["Task", "Context"]);
    const closing = parseBlocks("<context>\nA\n</cont", { partial: true });
    expect(closing).toHaveLength(1);
    expect(closing[0].body).toBe("A\n");
  });

  it("editing one body rewrites only that section", () => {
    const text = renderPrompt("claude", landlord, TODAY);
    const blocks = parseBlocks(text);
    const i = blocks.findIndex((b) => b.key === "constraints");
    const { text: next, blocks: edited } = withBody(blocks, i, blocks[i].body + "\n- Sign off with flat 3B.");
    expect(next).toBe(text.replace(blocks[i].body, blocks[i].body + "\n- Sign off with flat 3B."));
    expect(joinBlocks(edited)).toBe(next);
    expect(parseBlocks(next).map((b) => b.key)).toEqual(blocks.map((b) => b.key));
  });
});
