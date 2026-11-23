import type { Length } from "@/lib/contracts";
import type { PromptBrief, TargetProfile } from "./brief";
import { BANNED_PATTERNS, hasLongMaterial, lengthTarget, SOURCE_LINES, sourcePolicy } from "./shared";

/**
 * Deterministic rubric for rendered prompts (PROMPTING_RESEARCH §10).
 * It checks that a prompt follows its profile and preserves the brief. It does NOT measure
 * answer quality from a model; that needs the comparative evaluation planned for Phase 3.
 */
export type Criterion =
  | "intent"
  | "clarity"
  | "completeness"
  | "actionability"
  | "context"
  | "formatting"
  | "unnecessary"
  | "length";

export interface CriterionResult {
  pass: boolean;
  notes: string[];
}

export interface Evaluation {
  target: TargetProfile["id"];
  results: Record<Criterion, CriterionResult>;
  /** Characters the profile added on top of the user's own content. */
  overhead: number;
  chars: number;
  passed: boolean;
}

/** Max scaffolding characters a profile may add, per length (prompt length budget). */
export const OVERHEAD_BUDGET: Record<Length, number> = {
  concise: 700,
  balanced: 800,
  detailed: 950,
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/[.!?]+$/, "").trim();

function userContent(brief: PromptBrief): string[] {
  return [
    brief.task,
    brief.goal ?? "",
    brief.role ?? "",
    brief.audience ?? "",
    brief.outputFormat,
    ...brief.context,
    ...brief.requirements.flatMap((r) => [r.text, r.reason ?? ""]),
    ...brief.constraints.flatMap((c) => [c.text, c.reason ?? ""]),
    ...(brief.definitions ?? []).flatMap((d) => [d.term, d.meaning]),
    ...(brief.examples ?? []),
    ...(brief.material ?? []).flatMap((m) => [m.label, m.content]),
  ].filter(Boolean);
}

/** Remove user-supplied blocks so checks on the profile's own scaffolding don't see them. */
function scaffoldingOnly(brief: PromptBrief, prompt: string): string {
  let out = prompt;
  for (const chunk of [...(brief.examples ?? []), ...(brief.material ?? []).map((m) => m.content)]) {
    out = out.split(chunk.trim()).join("");
  }
  return out;
}

function includesLoose(haystack: string, needle: string): boolean {
  return norm(haystack).includes(norm(needle));
}

export function evaluatePrompt(
  profile: TargetProfile,
  brief: PromptBrief,
  prompt: string,
  mustContain: string[] = [],
): Evaluation {
  const r = (pass: boolean, notes: string[] = []): CriterionResult => ({ pass, notes });
  const scaffold = scaffoldingOnly(brief, prompt);

  // 1. Intent: every requirement, constraint and key term from the user survives.
  const missing = [
    ...brief.requirements.map((x) => x.text),
    ...brief.constraints.map((x) => x.text),
    ...mustContain,
  ].filter((t) => !includesLoose(prompt, t));
  const intent = r(missing.length === 0, missing.map((m) => `missing: ${m}`));

  // 2. Clarity: the task is stated; no unresolved template placeholders introduced by the profile.
  const placeholders = scaffold.match(/\{\{[^}]+\}\}|\[(TODO|TBD|insert[^\]]*)\]/gi) ?? [];
  const clarity = r(includesLoose(prompt, brief.task) && placeholders.length === 0, [
    ...(includesLoose(prompt, brief.task) ? [] : ["task sentence not found"]),
    ...placeholders.map((p) => `placeholder: ${p}`),
  ]);

  // 3. Completeness: output format and a length target are present.
  const completeness = r(includesLoose(prompt, brief.outputFormat) && prompt.includes(lengthTarget(brief)), [
    ...(includesLoose(prompt, brief.outputFormat) ? [] : ["output format missing"]),
    ...(prompt.includes(lengthTarget(brief)) ? [] : ["length target missing"]),
  ]);

  // 4. Actionability: the length target is concrete (a number or count word), task appears as an instruction.
  const concrete = /\d|one|two|three|minute|page/i.test(lengthTarget(brief));
  const actionability = r(concrete, concrete ? [] : ["length target is not concrete"]);

  // 5. Context: every context item, audience and material present; long material in profile order.
  const ctxMissing = [...brief.context, ...(brief.audience ? [brief.audience] : [])].filter(
    (c) => !includesLoose(prompt, c),
  );
  const materialMissing = (brief.material ?? []).filter((m) => !prompt.includes(m.content.trim()));
  const orderNotes: string[] = [];
  if (hasLongMaterial(brief)) {
    const first = brief.material![0].content.trim();
    const mIdx = prompt.indexOf(first);
    const lastTaskIdx = norm(prompt).lastIndexOf(norm(brief.task));
    const firstTaskIdx = norm(prompt).indexOf(norm(brief.task));
    const mNorm = norm(prompt).indexOf(norm(first));
    if (profile.longMaterialOrder === "material-first") {
      if (!(mNorm < lastTaskIdx)) orderNotes.push("task should come after the long material");
    } else if (!(firstTaskIdx < mNorm)) {
      orderNotes.push("instructions should come before the long material");
    }
    if (mIdx < 0) orderNotes.push("material not found verbatim");
  }
  const context = r(ctxMissing.length + materialMissing.length + orderNotes.length === 0, [
    ...ctxMissing.map((c) => `context missing: ${c}`),
    ...materialMissing.map((m) => `material missing: ${m.label}`),
    ...orderNotes,
  ]);

  // 6. Formatting: one delimiter family in the profile's own scaffolding.
  const mdHeadings = /^#{1,3} /m.test(scaffold);
  const xmlTags = /^<\/?[a-z_]+( [^>]*)?>/m.test(scaffold);
  const formatting = r(profile.delimiter === "xml" ? !mdHeadings && xmlTags : mdHeadings && !xmlTags, [
    ...(profile.delimiter === "xml" && mdHeadings ? ["markdown headings mixed into an XML prompt"] : []),
    ...(profile.delimiter === "markdown" && xmlTags ? ["XML tags mixed into a Markdown prompt"] : []),
  ]);

  // 7. Unnecessary instructions: banned phrases absent from scaffolding.
  const hits = BANNED_PATTERNS.filter((b) => b.pattern.test(scaffold));
  // Source rules must match the task: no restriction unless requested, no rule at all without material.
  const policy = sourcePolicy(brief);
  const sourceNotes = (Object.keys(SOURCE_LINES) as (keyof typeof SOURCE_LINES)[])
    .filter((p) => p !== policy && scaffold.includes(SOURCE_LINES[p]))
    .map((p) => `source rule "${p}" does not fit this task (expected ${policy ?? "none"})`);
  if (policy && !scaffold.includes(SOURCE_LINES[policy])) sourceNotes.push(`missing source rule "${policy}"`);
  const unnecessary = r(hits.length + sourceNotes.length === 0, [
    ...hits.map((h) => `${h.reason}: ${h.pattern}`),
    ...sourceNotes,
  ]);

  // 8. Length: scaffolding overhead within budget.
  const contentChars = userContent(brief).reduce((n, s) => n + s.length, 0);
  const overhead = prompt.length - contentChars;
  const length = r(overhead <= OVERHEAD_BUDGET[brief.length], [
    `overhead ${overhead} chars (budget ${OVERHEAD_BUDGET[brief.length]})`,
  ]);

  const results = { intent, clarity, completeness, actionability, context, formatting, unnecessary, length };
  return {
    target: profile.id,
    results,
    overhead,
    chars: prompt.length,
    passed: Object.values(results).every((x) => x.pass),
  };
}

/** Structural fingerprint: the sequence of section markers, ignoring their words. */
export function structureSignature(prompt: string): string {
  return prompt
    .split("\n")
    .map((line) => {
      if (/^#{1,3} /.test(line)) return "H";
      if (/^<\/[a-z_]+>/.test(line)) return "";
      if (/^<[a-z_]+/.test(line)) return `X:${line.match(/^<([a-z_]+)/)![1]}`;
      if (/^\d+\. /.test(line)) return "N";
      if (/^- /.test(line)) return "B";
      if (/^(---|""")$/.test(line)) return "F";
      return line.trim() ? "P" : "";
    })
    .filter(Boolean)
    .join(" ")
    .replace(/(\b[BNP]\b)( \1)+/g, "$1+");
}
