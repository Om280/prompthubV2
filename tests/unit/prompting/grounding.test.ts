import { describe, expect, it } from "vitest";
import type { TargetPlatform } from "@/lib/contracts";
import { PROFILES, renderPrompt, type PromptBrief } from "@/lib/prompting";
import { evaluatePrompt } from "@/lib/prompting/evaluate";
import { SOURCE_LINES } from "@/lib/prompting/shared";
import { FIXTURES } from "./fixtures";

const TARGETS: TargetPlatform[] = ["chatgpt", "claude", "gemini"];
const opts = { today: "2026-11-23" };
const byName = Object.fromEntries(FIXTURES.map((f) => [f.name, f]));
const RESTRICT = SOURCE_LINES["material-only"];

const article = {
  label: "Article",
  content:
    "Community heat-pump schemes in Nordic towns have cut household heating costs, but installers report long wait times and uneven grant access between municipalities.",
};

const research: PromptBrief = { ...byName.research.brief, material: [article] };
const brainstorm: PromptBrief = {
  category: "brainstorm",
  task: "Brainstorm names for a neighbourhood tool-lending library",
  context: ["It runs from a church hall on Saturdays."],
  requirements: [{ text: "Names should be easy to say out loud" }],
  constraints: [],
  outputFormat: "a list of names",
  material: [{ label: "Our mission statement", content: "Share tools, build skills, waste less." }],
  tone: "playful",
  length: "balanced",
};
const general: PromptBrief = {
  category: "general",
  task: "Explain how compound interest works",
  audience: "a teenager opening their first savings account",
  context: [],
  requirements: [{ text: "Use one worked example with round numbers" }],
  constraints: [],
  outputFormat: "a short explanation",
  tone: "friendly",
  length: "balanced",
};

describe("source grounding is conditional on the task", () => {
  it.each(TARGETS)("%s: source-based analysis restricts to the material only because the user asked", (t) => {
    const p = renderPrompt(t, byName.analysis.brief, opts);
    expect(p).toContain(RESTRICT);
    // Without the explicit request, analysis bases the answer on the material but may flag outside points.
    const unrequested = renderPrompt(t, { ...byName.analysis.brief, sourcePolicy: undefined }, opts);
    expect(unrequested).not.toContain(RESTRICT);
    expect(unrequested).toContain(SOURCE_LINES["material-first"]);
  });

  it.each(TARGETS)("%s: research with material permits outside knowledge and research", (t) => {
    const p = renderPrompt(t, research, opts);
    expect(p).not.toContain(RESTRICT);
    expect(p).toContain(SOURCE_LINES["material-plus"]);
  });

  it.each(TARGETS)("%s: brainstorming treats material as a starting point", (t) => {
    const p = renderPrompt(t, brainstorm, opts);
    expect(p).not.toContain(RESTRICT);
    expect(p).toContain(SOURCE_LINES.open);
  });

  it.each(TARGETS)("%s: general questions get no source rule at all", (t) => {
    const p = renderPrompt(t, general, opts);
    for (const line of Object.values(SOURCE_LINES)) expect(p).not.toContain(line);
  });

  it.each(TARGETS)("%s: coding and productivity material carry no default source rule", (t) => {
    for (const fx of [byName.productivity.brief, { ...byName.coding.brief, material: [article] }]) {
      const p = renderPrompt(t, fx, opts);
      for (const line of Object.values(SOURCE_LINES)) expect(p).not.toContain(line);
    }
  });

  it.each(TARGETS)("%s: new briefs still pass the full rubric", (t) => {
    for (const b of [research, brainstorm, general]) {
      const ev = evaluatePrompt(PROFILES[t], b, renderPrompt(t, b, opts));
      const failed = Object.entries(ev.results).filter(([, r]) => !r.pass);
      expect(failed, JSON.stringify(failed)).toEqual([]);
    }
  });
});

describe("exploratory tasks don't get deliverable-only rules (ChatGPT)", () => {
  it("creative writing and brainstorming omit the assumption policy and Done-when line", () => {
    for (const b of [byName.creative.brief, brainstorm]) {
      const p = renderPrompt("chatgpt", b, opts);
      expect(p).not.toContain("state your assumption");
      expect(p).not.toContain("Done when");
    }
  });

  it("deliverable tasks keep them", () => {
    const p = renderPrompt("chatgpt", byName.coding.brief, opts);
    expect(p).toContain("If anything is unclear, state your assumption and continue.");
    expect(p).toContain("Done when:");
  });
});

describe("the evaluator catches mismatched source rules", () => {
  it("flags a restriction on a research prompt", () => {
    const bad = renderPrompt("gemini", research, opts).replace(SOURCE_LINES["material-plus"], RESTRICT);
    const ev = evaluatePrompt(PROFILES.gemini, research, bad);
    expect(ev.results.unnecessary.pass).toBe(false);
  });
});
