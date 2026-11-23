import type { PromptBrief, TargetProfile } from "../brief";
import {
  blocks,
  detailExtras,
  hasLongMaterial,
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
 * Claude profile (Anthropic). Sources: PROMPTING_RESEARCH §2–§7.
 * - XML tags for each kind of content, consistent descriptive names.
 * - Reasons attached to non-obvious requirements ("Claude can generalize from the explanation").
 * - Everything wanted is spelled out; Detailed adds an explicit scope extension.
 * - Positive format instructions; prose requested as prose, not via "don't use bullets".
 * - Long material at the top, task at the end ("queries at the end … up to 30%").
 * - User examples inside <example> tags.
 */
function tag(name: string, body: string, attrs = ""): string {
  const b = body.trim();
  // Short single-line values stay inline: <source>Sales data</source>
  if (!b.includes("\n") && b.length <= 60 && !b.startsWith("<")) return `<${name}${attrs}>${b}</${name}>`;
  return `<${name}${attrs}>\n${b}\n</${name}>`;
}

function lines(items: string[]): string {
  return items.map((t) => `- ${t}`).join("\n");
}

function render(brief: PromptBrief): string {
  const long = hasLongMaterial(brief);

  const intro = [
    brief.role ? `You are ${withArticle(rolePhrase(brief.role))}.` : null,
    long
      ? null // the task is stated last, after the material and details
      : `I need your help to ${lowerFirst(stripEnd(brief.task))}${brief.goal ? `, so that ${lowerFirst(stripEnd(brief.goal))}` : ""}.`,
  ]
    .filter(Boolean)
    .join(" ");

  const contextBody = [
    brief.audience ? `The audience is ${lowerFirst(stripEnd(brief.audience))}.` : null,
    ...brief.context.map(sentence),
    ...(brief.definitions ?? []).map((d) => `By "${d.term}" I mean ${lowerFirst(stripEnd(d.meaning))}.`),
  ]
    .filter(Boolean)
    .join("\n");

  const req = brief.requirements.map((r) =>
    r.reason ? `${sentence(r.text)} This matters because ${lowerFirst(stripEnd(r.reason))}.` : sentence(r.text),
  );
  const cons = brief.constraints.map((c) =>
    c.reason ? `${sentence(c.text)} This matters because ${lowerFirst(stripEnd(c.reason))}.` : sentence(c.text),
  );

  const extras = detailExtras(brief);
  const formatBody = [
    `${sentence(brief.outputFormat)} ${lengthTarget(brief)}`,
    brief.prose ? "Write it as flowing prose in complete paragraphs." : null,
    toneLine(brief),
    extras.length
      ? `Go beyond the basics: include ${extras.join(" and ")}.`
      : null,
    brief.wantsVisibleReasoning ? "Show your working before the final answer." : null,
    !long ? sourceLine(brief) : null,
  ]
    .filter(Boolean)
    .join("\n");

  const examples = (brief.examples ?? []).length
    ? tag(
        "examples",
        (brief.examples ?? []).map((e) => tag("example", e)).join("\n"),
      )
    : null;

  const material = (brief.material ?? []).length
    ? brief.material!.length === 1
      ? tag("material", `${tag("source", brief.material![0].label)}\n${tag("content", brief.material![0].content)}`)
      : tag(
          "documents",
          brief.material!
            .map((m, i) => tag("document", `${tag("source", m.label)}\n${tag("document_content", m.content)}`, ` index="${i + 1}"`))
            .join("\n"),
        )
    : null;

  // Source rule depends on the task; with long material it sits next to the task at the end.
  const source = sourceLine(brief);
  const finalTask = long
    ? tag(
        "task",
        [
          `Using the ${brief.material!.length > 1 ? "documents" : "material"} above, ${lowerFirst(stripEnd(brief.task))}${
            brief.goal ? `, so that ${lowerFirst(stripEnd(brief.goal))}` : ""
          }.`,
          source,
        ]
          .filter(Boolean)
          .join(" "),
      )
    : null;

  return blocks(
    long ? material : null,
    intro,
    contextBody ? tag("context", contextBody) : null,
    req.length ? tag("requirements", brief.ordered ? req.map((r, i) => `${i + 1}. ${r}`).join("\n") : lines(req)) : null,
    cons.length ? tag("constraints", lines(cons)) : null,
    examples,
    !long ? material : null,
    tag("output_format", formatBody),
    finalTask,
  );
}

export const claudeProfile: TargetProfile = {
  id: "claude",
  label: "Claude",
  delimiter: "xml",
  longMaterialOrder: "material-first",
  guidance: [
    "Write a plain opening sentence with the task and its purpose; add a role sentence only when specific expertise changes the answer.",
    "Wrap each kind of content in its own descriptive XML tag: <context>, <requirements>, <constraints>, <examples>/<example>, <material> or <documents>, <output_format>.",
    "Attach a short 'This matters because…' to requirements whose reason the user gave.",
    "State everything wanted explicitly; at Detailed length, ask it to go beyond the basics and name what to include.",
    "Phrase format instructions positively (say what to do). Ask for prose explicitly when prose is wanted.",
    "When long material is present, put it first and the task last in <task>.",
    "Match the source rule to the task: restrict to supplied material only if the user asked; allow outside knowledge for research; treat material as a starting point for brainstorming or creative work; with no material, add no source rule.",
    "No aggressive emphasis (CRITICAL, MUST), no chain-of-thought request, no invented examples.",
  ],
  render,
};
