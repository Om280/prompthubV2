import type { PromptBrief, RenderOptions, TargetProfile } from "../brief";
import {
  blocks,
  bullets,
  detailExtras,
  hasLongMaterial,
  lengthTarget,
  lowerFirst,
  rolePhrase,
  sentence,
  sourceLine,
  stripEnd,
  TONE_DESCRIPTIONS,
  withArticle,
} from "../shared";

/**
 * Gemini profile (Google). Sources: PROMPTING_RESEARCH §2–§7.
 * - Direct, precise imperative first; persona folded into it.
 * - Critical instructions (constraints, output format) at the start, context after.
 * - Ambiguous terms defined in a dedicated section.
 * - Verbosity controlled explicitly: Detailed names the extra content (Gemini 3 defaults to concise).
 * - Long material after instructions, then the question at the very end with
 *   "Based on the material above," and a grounding clause.
 * - States today's date for recency-sensitive tasks (documented for Gemini 3 Flash).
 * - One delimiter family: Markdown headings, material between --- rules.
 */
function render(brief: PromptBrief, opts: RenderOptions): string {
  const long = hasLongMaterial(brief);
  const hasMaterial = (brief.material ?? []).length > 0;

  const roleClause = brief.role ? ` Answer as ${withArticle(rolePhrase(brief.role))}.` : "";
  const goalClause = brief.goal ? ` This is so that ${lowerFirst(stripEnd(brief.goal))}.` : "";
  const opening = `${brief.recencySensitive ? `Today is ${opts.today}. ` : ""}${sentence(brief.task)}${roleClause}${goalClause}`;

  const constraintLines = brief.constraints.map((c) => sentence(c.text));

  const extras = detailExtras(brief);
  const tone = TONE_DESCRIPTIONS[brief.tone];
  const outputLines = [
    sentence(brief.outputFormat),
    lengthTarget(brief),
    extras.length ? `Include ${extras.join(" and ")}.` : null,
    brief.prose ? "Write in paragraphs, not lists." : null,
    tone ? `Tone: ${tone}.` : null,
    brief.wantsVisibleReasoning ? "Show your working before the final answer." : null,
  ].filter((l): l is string => Boolean(l));

  const contextLines = [
    brief.audience ? `Audience: ${stripEnd(brief.audience)}.` : null,
    ...brief.context.map(sentence),
  ].filter((l): l is string => Boolean(l));

  const definitions = (brief.definitions ?? []).length
    ? `## Definitions\n\n${bullets((brief.definitions ?? []).map((d) => `"${d.term}": ${stripEnd(d.meaning)}.`))}`
    : null;

  const examples = (brief.examples ?? []).length
    ? `## Example\n\n${(brief.examples ?? []).map((e) => `---\n${e.trim()}\n---`).join("\n\n")}`
    : null;

  const material = hasMaterial
    ? `## ${brief.material!.length > 1 ? "Material" : brief.material![0].label}\n\n${brief
        .material!.map((m) => (brief.material!.length > 1 ? `### ${m.label}\n\n` : "") + `---\n${m.content.trim()}\n---`)
        .join("\n\n")}`
    : null;

  // Grounding depends on the task (analysis, research, brainstorming differ); see shared.sourcePolicy.
  const finalQuestion = hasMaterial
    ? [long ? `Based on the material above, ${lowerFirst(stripEnd(brief.task))}.` : null, sourceLine(brief)]
        .filter(Boolean)
        .join(" ")
    : null;

  return blocks(
    opening,
    constraintLines.length ? `## Constraints\n\n${bullets(constraintLines)}` : null,
    `## Output\n\n${bullets(outputLines)}`,
    brief.requirements.length
      ? `## Must include\n\n${bullets(brief.requirements.map((r) => sentence(r.text)), brief.ordered)}`
      : null,
    contextLines.length ? `## Context\n\n${bullets(contextLines)}` : null,
    definitions,
    examples,
    material,
    finalQuestion,
  );
}

export const geminiProfile: TargetProfile = {
  id: "gemini",
  label: "Gemini",
  delimiter: "markdown",
  longMaterialOrder: "material-first",
  guidance: [
    "Open with the task as one direct imperative; fold any role into it. No persuasive language.",
    "Put constraints and the output format right after the opening, before context.",
    "Control verbosity explicitly with a concrete length; at Detailed length, name the extra content to include.",
    "Define ambiguous terms in a Definitions section.",
    "Use Markdown headings only (one delimiter style). Put pasted material after the instructions, then end with 'Based on the material above, …'.",
    "Match the source rule to the task: restrict to the material only if the user asked; for research allow outside knowledge; for brainstorming or creative work treat material as a starting point; with no material, add no source rule.",
    "For tasks that depend on current information, start with today's date.",
    "Include user-supplied examples with identical formatting; never invent examples; no request for step-by-step reasoning.",
  ],
  render,
};
