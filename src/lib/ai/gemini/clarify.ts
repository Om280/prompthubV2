/**
 * AI clarify: Gemini decides which questions matter, as structured output. Server-only.
 * One call, plus at most one repair call when the output doesn't match the schema. The result is
 * sanitised into the contract shape (lengths, chip counts, ids), never padded with invented text.
 */
import "server-only";
import { z } from "zod";
import type { ClarifyingQuestion, ClarifyRequest, TaskType } from "@/lib/contracts";
import { schemas } from "@/lib/contracts";
import { isRepairable, runStructured, type GeminiCall, type UsageMeter } from "./call";
import { clarifyInstructions, clarifyPrompt } from "./prompts";

/** What Gemini returns. Lenient (no length caps), sanitised afterwards. */
export const ModelClarify = z.object({
  taskType: schemas.TaskType,
  questions: z
    .array(
      z.object({
        question: z.string(),
        why: z.string().optional(),
        suggestions: z.array(z.string()),
        asksForExample: z.boolean(),
      }),
    )
    .describe("0 to 4 questions, most important first"),
});
export type ModelClarify = z.infer<typeof ModelClarify>;

export const MAX_AI_QUESTIONS = 4;

export interface ClarifyResult {
  questions: ClarifyingQuestion[];
  taskType: TaskType;
  repaired: boolean;
}

const clean = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** Fits Gemini's questions to the contract; drops anything that can't fit rather than cutting words. */
export function sanitizeQuestions(raw: ModelClarify, target: ClarifyRequest["target"]): ClarifyingQuestion[] {
  let qs = raw.questions
    .map((q) => ({
      question: clean(q.question),
      why: clean(q.why),
      asksForExample: q.asksForExample,
      suggestions: q.asksForExample
        ? []
        : [...new Set(q.suggestions.map(clean))].filter((s) => s.length > 0 && s.length <= 40).slice(0, 4),
    }))
    .filter((q) => q.question.length > 0 && q.question.length <= 140);

  // Gemini target: an example request goes no later than second (PROMPTING_RESEARCH §4).
  const ex = qs.findIndex((q) => q.asksForExample);
  if (target === "gemini" && ex > 1) {
    const [e] = qs.splice(ex, 1);
    qs = [...qs.slice(0, 1), e, ...qs.slice(1)];
  }

  return qs.slice(0, MAX_AI_QUESTIONS).map((q, i) => ({
    id: `q${i + 1}`,
    question: q.question,
    ...(q.why && q.why.length <= 100 ? { why: q.why } : {}),
    suggestions: q.suggestions,
  }));
}

export async function geminiClarify(req: ClarifyRequest, call: GeminiCall, meter: UsageMeter): Promise<ClarifyResult> {
  const instructions = clarifyInstructions(req.target);
  const prompt = clarifyPrompt(req.idea, req.target, req.length);
  const run = (p: string) => runStructured(call, meter, { instructions, prompt: p, schema: ModelClarify, name: "clarifying_questions" });

  let repaired = false;
  let out: ModelClarify;
  try {
    out = await run(prompt);
  } catch (err) {
    if (!isRepairable(err)) throw err;
    repaired = true;
    out = await run(`${prompt}\n\nYour previous reply wasn't valid JSON for the required schema. Reply again with JSON that matches it exactly.`);
  }
  return { questions: sanitizeQuestions(out, req.target), taskType: out.taskType, repaired };
}
