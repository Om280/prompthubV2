/**
 * AI generate: idea + answers → Gemini writes a structured `PromptBrief` → the brief is checked for
 * faithfulness → `PROFILES[target].render()` writes the final prompt deterministically →
 * `evaluatePrompt()` scores it. Server-only.
 *
 * Why render deterministically instead of letting Gemini write the final text:
 * - structure follows each target profile exactly (ChatGPT Markdown, Claude XML, Gemini task-first),
 *   because it is the same code the profiles are tested with;
 * - pasted material and user examples are attached by code, verbatim, so the model can't alter them
 *   and doesn't spend output tokens copying them;
 * - one Gemini call per prompt (plus at most one repair), which matters on the free tier;
 * - the brief is checkable: each item can be traced to the user's words before anything is rendered.
 *
 * Repair policy: at most ONE extra call, within the same quota lease, when the brief is
 * schema-invalid, contains ungrounded items (words or numbers the user never wrote), a non-verbatim
 * example, or markup/emphasis the profiles forbid. After that, remaining ungrounded items are
 * dropped (they were invented) and answers missing from the brief are added to its context in the
 * user's own words. Never a loop.
 */
import "server-only";
import { z } from "zod";
import type { GenerateRequest } from "@/lib/contracts";
import { schemas } from "@/lib/contracts";
import { PROFILES, type PromptBrief } from "@/lib/prompting";
import { evaluatePrompt, type Evaluation } from "@/lib/prompting/evaluate";
import { BANNED_PATTERNS } from "@/lib/prompting/shared";
import { splitMaterial } from "../basic/classify";
import { DECLINE_RE } from "../basic/signals";
import { basicTitle } from "../basic/title";
import { AppError } from "../errors";
import { GEMINI_INVALID_OUTPUT_MESSAGE } from "../gemini-errors";
import { isRepairable, runStructured, type GeminiCall, type UsageMeter } from "./call";
import { coverage, GROUNDED_MIN, indexSource, isGrounded, isVerbatim, type SourceIndex } from "./grounding";
import { briefInstructions, briefPrompt, briefRepairPrompt } from "./prompts";

const Item = z.object({ text: z.string(), reason: z.string().optional() });

/** What Gemini returns: the brief minus what code supplies (material, length). */
export const ModelBrief = z.object({
  category: schemas.TaskType,
  title: z.string(),
  task: z.string(),
  goal: z.string().optional(),
  role: z.string().optional(),
  audience: z.string().optional(),
  context: z.array(z.string()),
  requirements: z.array(Item),
  ordered: z.boolean().optional(),
  constraints: z.array(Item),
  definitions: z.array(z.object({ term: z.string(), meaning: z.string() })).optional(),
  outputFormat: z.string(),
  prose: z.boolean().optional(),
  examples: z.array(z.string()).optional(),
  sourcePolicy: z.enum(["material-only", "material-first", "material-plus", "open"]).optional(),
  recencySensitive: z.boolean().optional(),
  wantsVisibleReasoning: z.boolean().optional(),
  tone: schemas.Tone,
});
export type ModelBrief = z.infer<typeof ModelBrief>;

const PLACEHOLDER_RE = /\{\{[^}]+\}\}|\[(TODO|TBD|insert[^\]]*)\]/i;
const MARKUP_RE = /^\s*(#{1,6} |<\/?[a-z_]+( [^>]*)?>)/im;

const clean = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim().replace(/[.!?;:]+$/, "");

export interface BriefIssue {
  /** Where, e.g. "requirements[1]" (no user text in logs). */
  path: string;
  /** For the repair prompt (may quote the model's own output back to it). */
  message: string;
  kind: "ungrounded" | "example" | "markup" | "task";
}

interface Source {
  index: SourceIndex;
  /** Raw source text, to tell the user's own emphasis from the model's. */
  raw: string;
}

function textIssues(path: string, text: string, src: Source): BriefIssue[] {
  const out: BriefIssue[] = [];
  if (PLACEHOLDER_RE.test(text)) out.push({ path, kind: "markup", message: `${path} contains a placeholder; write the actual content or leave it out` });
  if (MARKUP_RE.test(text)) out.push({ path, kind: "markup", message: `${path} contains Markdown headings or XML tags; use plain text` });
  for (const b of BANNED_PATTERNS) {
    const m = text.match(b.pattern);
    if (m && !src.raw.includes(m[0])) out.push({ path, kind: "markup", message: `${path} uses "${m[0]}" (${b.reason}); remove it` });
  }
  return out;
}

/** Everything that would make the brief unfaithful or break the profiles. */
export function briefIssues(b: ModelBrief, src: Source): BriefIssue[] {
  const issues: BriefIssue[] = [];
  if (!clean(b.task)) issues.push({ path: "task", kind: "task", message: "task is empty; state the user's task" });
  const grounded = (path: string, text: string | undefined) => {
    if (!text || !clean(text)) return;
    if (!isGrounded(text, src.index)) {
      issues.push({ path, kind: "ungrounded", message: `${path} ("${clean(text)}") isn't something the user said; remove it or use the user's words` });
    }
  };
  grounded("goal", b.goal);
  grounded("audience", b.audience);
  b.context.forEach((c, i) => grounded(`context[${i}]`, c));
  b.requirements.forEach((r, i) => grounded(`requirements[${i}]`, r.text));
  b.constraints.forEach((c, i) => grounded(`constraints[${i}]`, c.text));
  (b.definitions ?? []).forEach((d, i) => grounded(`definitions[${i}]`, `${d.term} ${d.meaning}`));
  (b.examples ?? []).forEach((e, i) => {
    if (!isVerbatim(e, src.index)) {
      issues.push({ path: `examples[${i}]`, kind: "example", message: `examples[${i}] isn't a sample the user supplied; only copy the user's own examples exactly` });
    }
  });
  const fields: [string, string | undefined][] = [
    ["task", b.task],
    ["goal", b.goal],
    ["role", b.role],
    ["audience", b.audience],
    ["outputFormat", b.outputFormat],
    ...b.context.map((c, i): [string, string] => [`context[${i}]`, c]),
    ...b.requirements.map((r, i): [string, string] => [`requirements[${i}]`, `${r.text} ${r.reason ?? ""}`]),
    ...b.constraints.map((c, i): [string, string] => [`constraints[${i}]`, `${c.text} ${c.reason ?? ""}`]),
  ];
  for (const [path, text] of fields) if (text) issues.push(...textIssues(path, text, src));
  return issues;
}

/** Drops what is still unfaithful after the one repair. The task itself is never dropped. */
function sanitize(b: ModelBrief, issues: BriefIssue[]): ModelBrief {
  const bad = new Set(issues.filter((i) => i.kind !== "task").map((i) => i.path));
  const keep = <T,>(arr: T[] | undefined, key: string) => (arr ?? []).filter((_, i) => !bad.has(`${key}[${i}]`));
  return {
    ...b,
    goal: bad.has("goal") ? undefined : b.goal,
    role: bad.has("role") ? undefined : b.role,
    audience: bad.has("audience") ? undefined : b.audience,
    outputFormat: bad.has("outputFormat") ? "" : b.outputFormat,
    context: keep(b.context, "context"),
    requirements: keep(b.requirements, "requirements"),
    constraints: keep(b.constraints, "constraints"),
    definitions: keep(b.definitions, "definitions"),
    examples: keep(b.examples, "examples"),
  };
}

export interface BuildInput {
  req: GenerateRequest;
  today: string;
}

export interface GeneratedPrompt {
  text: string;
  title: string;
  brief: PromptBrief;
  evaluation: Evaluation;
  repaired: boolean;
  /** Items removed after the repair, and answers added back verbatim (counts only). */
  dropped: number;
  restoredAnswers: number;
}

/** The final brief: model fields cleaned, material attached verbatim, answers guaranteed present. */
export function assembleBrief(m: ModelBrief, req: GenerateRequest): { brief: PromptBrief; restoredAnswers: number } {
  const split = splitMaterial(req.idea);
  const item = (x: { text: string; reason?: string }) => ({ text: clean(x.text), ...(clean(x.reason) ? { reason: clean(x.reason) } : {}) });
  const brief: PromptBrief = {
    category: m.category,
    task: clean(m.task),
    ...(clean(m.goal) ? { goal: clean(m.goal) } : {}),
    ...(clean(m.role) ? { role: clean(m.role) } : {}),
    ...(clean(m.audience) ? { audience: clean(m.audience) } : {}),
    context: m.context.map(clean).filter(Boolean),
    requirements: m.requirements.map(item).filter((r) => r.text),
    constraints: m.constraints.map(item).filter((c) => c.text),
    outputFormat: clean(m.outputFormat) || "a clear answer",
    tone: m.tone,
    length: req.length,
  };
  if (m.ordered) brief.ordered = true;
  const defs = (m.definitions ?? []).map((d) => ({ term: clean(d.term), meaning: clean(d.meaning) })).filter((d) => d.term && d.meaning);
  if (defs.length) brief.definitions = defs;
  if (m.prose) brief.prose = true;
  const examples = (m.examples ?? []).map((e) => e.trim()).filter(Boolean);
  if (examples.length) brief.examples = examples;
  if (m.recencySensitive) brief.recencySensitive = true;
  if (m.wantsVisibleReasoning) brief.wantsVisibleReasoning = true;
  if (split.material.length) {
    brief.material = split.material.map((x) => ({ label: x.label, content: x.content }));
    if (m.sourcePolicy) brief.sourcePolicy = m.sourcePolicy;
  }

  // Every answer the user gave must survive. Anything the brief lost goes into context verbatim.
  const briefText = [
    brief.task,
    brief.goal,
    brief.role,
    brief.audience,
    brief.outputFormat,
    ...brief.context,
    ...brief.requirements.flatMap((r) => [r.text, r.reason]),
    ...brief.constraints.flatMap((c) => [c.text, c.reason]),
    ...(brief.definitions ?? []).flatMap((d) => [d.term, d.meaning]),
    ...(brief.examples ?? []),
  ]
    .filter(Boolean)
    .join("\n");
  const index = indexSource(briefText);
  let restored = 0;
  for (const a of req.answers) {
    const answer = a.answer.trim();
    if (!answer || DECLINE_RE.test(answer)) continue;
    if (coverage(answer, index) >= GROUNDED_MIN && isGroundedNumbers(answer, index)) continue;
    brief.context.push(`${a.question.replace(/\?\s*$/, "").trim()}: ${answer.replace(/[.!?]+$/, "")}`);
    restored++;
  }
  return { brief, restoredAnswers: restored };
}

function isGroundedNumbers(text: string, index: SourceIndex): boolean {
  return (text.match(/\d+(?:[.,]\d+)*/g) ?? []).every((n) => index.numbers.has(n.replace(/,/g, "")));
}

export async function geminiGenerate(input: BuildInput, call: GeminiCall, meter: UsageMeter): Promise<GeneratedPrompt> {
  const { req, today } = input;
  const answersText = req.answers.map((a) => a.answer).join("\n");
  const src: Source = { index: indexSource(req.idea, answersText), raw: `${req.idea}\n${answersText}` };
  const instructions = briefInstructions();
  const prompt = briefPrompt({ idea: req.idea, answers: req.answers, length: req.length, target: req.target });

  const run = (p: string) => runStructured(call, meter, { instructions, prompt: p, schema: ModelBrief, name: "prompt_brief" });

  let repaired = false;
  let model: ModelBrief;
  try {
    model = await run(prompt);
  } catch (err) {
    if (!isRepairable(err)) throw err;
    repaired = true;
    model = await run(briefRepairPrompt(prompt, null, ["Your previous reply wasn't valid JSON for the required schema. Reply with JSON that matches it exactly."]));
  }

  let issues = briefIssues(model, src);
  if (issues.length > 0 && !repaired) {
    repaired = true;
    try {
      const second = await run(briefRepairPrompt(prompt, model, issues.map((i) => i.message)));
      const secondIssues = briefIssues(second, src);
      // Keep whichever is more faithful; ties go to the repair.
      if (secondIssues.length <= issues.length) {
        model = second;
        issues = secondIssues;
      }
    } catch (err) {
      // A broken repair doesn't discard a usable first brief, but a provider failure still fails.
      if (!isRepairable(err)) throw err;
    }
  }
  if (issues.some((i) => i.kind === "task")) throw new AppError("invalid_output", GEMINI_INVALID_OUTPUT_MESSAGE);

  const dropped = issues.length;
  const { brief, restoredAnswers } = assembleBrief(sanitize(model, issues), req);
  if (!brief.task) throw new AppError("invalid_output", GEMINI_INVALID_OUTPUT_MESSAGE);

  const profile = PROFILES[req.target];
  const text = profile.render(brief, { today });
  const evaluation = evaluatePrompt(profile, brief, text);
  const title = clean(model.title).split(/\s+/).slice(0, 8).join(" ").slice(0, 80) || basicTitle(req.idea);
  return { text, title, brief, evaluation, repaired, dropped, restoredAnswers };
}
