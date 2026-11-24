import { describe, expect, it } from "vitest";
import { tokenizeAnatomy, type TintKind } from "@/components/workspace/anatomy";
import { renderPrompt } from "@/lib/prompting";
import { MOCK_BRIEFS } from "../fixtures/briefs";

const kinds = (text: string, kind: TintKind) =>
  tokenizeAnatomy(text)
    .filter((t) => t.kind === kind)
    .map((t) => t.text);

describe("anatomy tint tokenizer", () => {
  it("never changes a character (the tint layer must match the textarea)", () => {
    const samples = [
      "",
      "\n",
      "plain",
      "# Title\n\n- a\n- b\n",
      "<context>\nx\n</context>",
      "Ends with newline\n",
      "Weird [unclosed and {also\n**bold** `code`",
    ];
    for (const target of ["chatgpt", "claude", "gemini"] as const) {
      for (const mb of MOCK_BRIEFS) samples.push(renderPrompt(target, mb.brief, { today: "2026-11-23" }));
    }
    for (const s of samples) {
      expect(
        tokenizeAnatomy(s)
          .map((t) => t.text)
          .join(""),
      ).toBe(s);
    }
  });

  it("tints XML-like tags", () => {
    expect(kinds('<context>\nhi\n</context>\n<example lang="en">', "tag")).toEqual([
      "<context>",
      "</context>",
      '<example lang="en">',
    ]);
  });

  it("splits heading markers from heading text", () => {
    const toks = tokenizeAnatomy("## Task\nbody");
    expect(toks[0]).toEqual({ kind: "heading-marker", text: "##" });
    expect(toks[1]).toEqual({ kind: "heading", text: " Task" });
    expect(toks[2]).toEqual({ kind: "text", text: "\nbody" });
  });

  it("does not treat #hashtags or #### as headings", () => {
    expect(kinds("#tag\n#### four", "heading-marker")).toEqual([]);
  });

  it("marks list markers only at line start", () => {
    expect(kinds("- one\n  * two\n3. three\nnot - a list", "marker")).toEqual(["-", "*", "3."]);
  });

  it("marks bold and code delimiters but not their content", () => {
    expect(kinds("**bold** and `code`", "marker")).toEqual(["**", "**", "`", "`"]);
    expect(kinds("**bold**", "text")).toEqual(["bold"]);
  });

  it("highlights placeholders in square and curly brackets", () => {
    expect(kinds("Sign as [your name] for {audience}.", "placeholder")).toEqual(["[your name]", "{audience}"]);
  });

  it("leaves Markdown links alone", () => {
    expect(kinds("[docs](https://example.com)", "placeholder")).toEqual([]);
  });
});
