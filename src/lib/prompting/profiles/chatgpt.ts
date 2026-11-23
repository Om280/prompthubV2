import type { PromptBrief, TargetProfile } from "../brief";
import {
  blocks,
  bullets,
  detailExtras,
  hasLongMaterial,
  isDeliverableTask,
  lengthTarget,
  lowerFirst,
  rolePhrase,
  sentence,
  sourceLine,
  stripEnd,
  toneLine,
  withArticle,
} from "../shared";

/**
 * ChatGPT profile (OpenAI). Sources: PROMPTING_RESEARCH §3, §5, §7.
 * - Markdown `##` sections; user material fenced and placed last ("context near the end").
 * - Goal-first opening; explicit success criterion (reasoning best practices: be specific about the end goal).
 * - Numbered steps when order matters; zero-shot unless the user supplied an example.
 * - States assumptions instead of stalling (latest-model guidance).
 * - No "be concise" (latest GPT is concise by default) and no chain-of-thought request.
 */
function render(brief: PromptBrief): string {
  const opening = blocks(
    [
      brief.role ? `Act as ${withArticle(rolePhrase(brief.role))}.` : null,
      sentence(brief.task),
      brief.goal ? `This is so that ${lowerFirst(stripEnd(brief.goal))}.` : null,
    ]
      .filter(Boolean)
      .join(" "),
  );

  const contextLines = [
    brief.audience ? `Audience: ${stripEnd(brief.audience)}.` : null,
    ...brief.context.map(sentence),
    ...(brief.definitions ?? []).map((d) => `By "${d.term}" I mean ${lowerFirst(stripEnd(d.meaning))}.`),
  ].filter((l): l is string => Boolean(l));

  const requirementLines = brief.requirements.map((r) => sentence(r.text));
  const constraintLines = brief.constraints.map((c) => sentence(c.text));

  const extras = detailExtras(brief);
  const outputLines = [
    `Format: ${stripEnd(brief.outputFormat)}.`,
    `Length: ${lengthTarget(brief)}`,
    toneLine(brief),
    extras.length ? `Also include ${extras.join(" and ")}.` : null,
    brief.wantsVisibleReasoning ? "Show your working before the final answer." : null,
    // Success criterion (reasoning best practices): only for deliverables, and not at Concise.
    brief.length !== "concise" && isDeliverableTask(brief)
      ? "Done when: every requirement above is met and the result can be used as-is."
      : null,
  ].filter((l): l is string => Boolean(l));

  const source = sourceLine(brief);

  const examples = (brief.examples ?? []).length
    ? `## Example of what I want\n\n${(brief.examples ?? []).map((e) => `"""\n${e.trim()}\n"""`).join("\n\n")}`
    : null;

  const material = (brief.material ?? []).length
    ? `## ${brief.material!.length > 1 ? "Material" : brief.material![0].label}\n\n${brief
        .material!.map((m) => (brief.material!.length > 1 ? `### ${m.label}\n\n` : "") + `"""\n${m.content.trim()}\n"""`)
        .join("\n\n")}`
    : null;

  const closing = hasLongMaterial(brief)
    ? `Using the material above, ${lowerFirst(stripEnd(brief.task))}.`
    : null;

  return blocks(
    opening,
    contextLines.length ? `## Context\n\n${bullets(contextLines)}` : null,
    requirementLines.length ? `## Requirements\n\n${bullets(requirementLines, brief.ordered)}` : null,
    constraintLines.length ? `## Constraints\n\n${bullets(constraintLines)}` : null,
    examples,
    `## Output\n\n${bullets(outputLines)}`,
    // Assumption policy (latest-model guidance) suits deliverables; exploratory tasks don't need it.
    isDeliverableTask(brief) ? "If anything is unclear, state your assumption and continue." : null,
    material,
    [closing, source].filter(Boolean).join(" ") || null,
  );
}

export const chatgptProfile: TargetProfile = {
  id: "chatgpt",
  label: "ChatGPT",
  delimiter: "markdown",
  longMaterialOrder: "instructions-first",
  guidance: [
    "Open with the task and its goal in one or two sentences; add a role only when specific expertise changes the answer.",
    "Use Markdown `##` sections: Context, Requirements, Constraints, Output. Put pasted material last in triple-quoted blocks.",
    "Use numbered steps only when order matters.",
    "State the output format, a concrete length target and a 'Done when' success criterion.",
    "For deliverable tasks (not creative writing or brainstorming), add: 'If anything is unclear, state your assumption and continue.' and a Done-when line.",
    "Match the source rule to the task: restrict to supplied material only if the user asked; allow outside knowledge for research; treat material as a starting point for brainstorming or creative work; with no material, add no source rule.",
    "Do not ask for step-by-step reasoning; do not add 'be concise'; do not invent examples.",
  ],
  render,
};
