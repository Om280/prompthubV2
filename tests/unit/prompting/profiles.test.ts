import { describe, expect, it } from "vitest";
import type { Length, TargetPlatform } from "@/lib/contracts";
import { PROFILES, renderPrompt } from "@/lib/prompting";
import { evaluatePrompt, structureSignature } from "@/lib/prompting/evaluate";
import { FIXTURES } from "./fixtures";

const TARGETS: TargetPlatform[] = ["chatgpt", "claude", "gemini"];
const LENGTHS: Length[] = ["concise", "balanced", "detailed"];
const opts = { today: "2026-11-23" };

describe.each(FIXTURES)("$name: identical task across ChatGPT, Claude and Gemini", (fx) => {
  for (const length of LENGTHS) {
    const brief = { ...fx.brief, length };

    it.each(TARGETS)(`%s (${length}) passes every rubric criterion`, (target) => {
      const prompt = renderPrompt(target, brief, opts);
      const ev = evaluatePrompt(PROFILES[target], brief, prompt, fx.mustContain);
      const failed = Object.entries(ev.results)
        .filter(([, r]) => !r.pass)
        .map(([k, r]) => `${k}: ${r.notes.join("; ")}`);
      expect(failed, `\n--- ${target}/${length} prompt ---\n${prompt}\n`).toEqual([]);
    });
  }

  it("produces structurally different prompts per target, not just renamed headings", () => {
    const sigs = TARGETS.map((t) => structureSignature(renderPrompt(t, fx.brief, opts)));
    expect(new Set(sigs).size).toBe(3);

    // Swapping heading words alone must not turn one target's prompt into another's.
    const [gpt, , gem] = TARGETS.map((t) => renderPrompt(t, fx.brief, opts));
    const stripHeadings = (s: string) => s.replace(/^#{1,3} .*$/gm, "#");
    expect(stripHeadings(gpt)).not.toEqual(stripHeadings(gem));
  });

  it("grows Concise < Balanced < Detailed for every target", () => {
    for (const t of TARGETS) {
      const [c, b, d] = LENGTHS.map((length) => renderPrompt(t, { ...fx.brief, length }, opts).length);
      expect(c, t).toBeLessThanOrEqual(b);
      expect(b, t).toBeLessThan(d);
    }
  });

  it("never emits API wrappers (system/developer roles, JSON messages)", () => {
    for (const t of TARGETS) {
      const p = renderPrompt(t, fx.brief, opts);
      expect(p).not.toMatch(/^(system|developer|assistant)\s*:/im);
      expect(p).not.toMatch(/"role"\s*:/);
    }
  });
});

describe("documented target-specific behaviour", () => {
  const byName = Object.fromEntries(FIXTURES.map((f) => [f.name, f]));

  it("Claude puts long material first and the task last (Anthropic long-context guidance)", () => {
    const p = renderPrompt("claude", byName.analysis.brief, opts);
    expect(p.indexOf("<material>")).toBe(0);
    expect(p.trimEnd().endsWith("</task>")).toBe(true);
  });

  it("Gemini ends long-material prompts with 'Based on the material above' and the requested restriction", () => {
    const p = renderPrompt("gemini", byName.analysis.brief, opts);
    expect(p).toMatch(/Based on the material above, analyse the sales data/);
    expect(p.trimEnd()).toMatch(/If something isn't covered there, say so\.$/);
  });

  it("ChatGPT keeps instructions before the material and states an assumption policy", () => {
    const p = renderPrompt("chatgpt", byName.analysis.brief, opts);
    expect(p.indexOf("## Requirements")).toBeLessThan(p.indexOf("month,region"));
    expect(p).toContain("If anything is unclear, state your assumption and continue.");
  });

  it("Gemini states today's date only for recency-sensitive tasks", () => {
    expect(renderPrompt("gemini", byName.research.brief, opts)).toMatch(/^Today is 2026-11-23\./);
    expect(renderPrompt("gemini", byName.creative.brief, opts)).not.toMatch(/Today is/);
    expect(renderPrompt("chatgpt", byName.research.brief, opts)).not.toMatch(/Today is/);
  });

  it("Claude carries the user's reasons; other targets don't add motivation text", () => {
    const c = renderPrompt("claude", byName.coding.brief, opts);
    expect(c).toContain("This matters because the job runs in a locked-down environment.");
    expect(renderPrompt("chatgpt", byName.coding.brief, opts)).not.toContain("This matters because");
  });

  it("user examples are kept in each target's example syntax and never invented", () => {
    const ex = byName.productivity.brief.examples![0];
    expect(renderPrompt("claude", byName.productivity.brief, opts)).toContain(`<example>\n${ex}\n</example>`);
    expect(renderPrompt("chatgpt", byName.productivity.brief, opts)).toContain(`"""\n${ex}\n"""`);
    for (const t of TARGETS) {
      expect(renderPrompt(t, byName.coding.brief, opts)).not.toMatch(/example/i);
    }
  });

  it("prose requests are phrased positively for Claude", () => {
    const p = renderPrompt("claude", byName.creative.brief, opts);
    expect(p).toContain("Write it as flowing prose in complete paragraphs.");
    expect(p).not.toMatch(/don't use (bullets|lists|markdown)/i);
  });

  it("Detailed names the extra content explicitly for every target", () => {
    for (const t of TARGETS) {
      const p = renderPrompt(t, { ...byName.coding.brief, length: "detailed" }, opts);
      expect(p, t).toMatch(/edge cases and errors/);
    }
  });
});
