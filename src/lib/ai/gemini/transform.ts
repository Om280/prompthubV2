/**
 * AI transforms (improve, shorten, expand, tone): Gemini rewrites the prompt text following the
 * target profile's guidance, streamed. Server-only.
 *
 * The stream is forwarded delta by delta. When it ends, the result is checked (`checkTransform`):
 * same delimiter family as the target, no new banned emphasis, every pasted block kept verbatim,
 * every list-item requirement still covered, and the length moved the right way. A failed check
 * gets ONE non-streamed repair call within the same lease; `done.text` (authoritative per the
 * contract) carries the repaired text. If the repair fails too, the request ends `invalid_output`
 * and the client keeps the previous version. A `length` finish is reported as a partial result
 * (`done.truncated`), never passed off as complete.
 */
import "server-only";
import { generateText, streamText } from "ai";
import type { Length, TargetPlatform, Tone, TransformAction, TransformRequest } from "@/lib/contracts";
import { PROFILES } from "@/lib/prompting";
import { BANNED_PATTERNS } from "@/lib/prompting/shared";
import { AppError } from "../errors";
import { GEMINI_INVALID_OUTPUT_MESSAGE, GEMINI_SAFETY_MESSAGE } from "../gemini-errors";
import { callSettings, ClientAbort, type GeminiCall, type UsageMeter } from "./call";
import { coverage, indexSource, listItems, normalizeSpace, verbatimBlocks } from "./grounding";
import { transformInstructions, transformPrompt, transformRepairPrompt } from "./prompts";

export interface TransformCheck {
  ok: boolean;
  issues: string[];
}

const MD_HEADING = /^#{1,3} /m;
const XML_LINE = /^<\/?[a-z_]+( [^>]*)?>/m;

/** Removes one fence wrapping the whole reply (models sometimes add it despite instructions). */
export function unwrapFence(text: string): string {
  const m = text.trim().match(/^```[a-z]*\n([\s\S]*)\n```$/i);
  return m ? m[1] : text.trim();
}

export function checkTransform(original: string, result: string, target: TargetPlatform, action: TransformAction): TransformCheck {
  const issues: string[] = [];
  const out = result.trim();
  if (!out) return { ok: false, issues: ["the edit is empty"] };

  // Delimiter family of the target (ignore markup the original already had, e.g. inside material).
  const delimiter = PROFILES[target].delimiter;
  if (delimiter === "xml" && MD_HEADING.test(out) && !MD_HEADING.test(original)) {
    issues.push("it uses Markdown headings; this target uses XML tags only");
  }
  if (delimiter === "markdown" && XML_LINE.test(out) && !XML_LINE.test(original)) {
    issues.push("it uses XML tags; this target uses Markdown headings only");
  }

  for (const b of BANNED_PATTERNS) {
    if (b.pattern.test(out) && !b.pattern.test(original)) issues.push(`it adds ${b.reason}; remove it`);
  }

  // Pasted material, code and examples stay verbatim.
  const outNorm = normalizeSpace(out);
  const lost = verbatimBlocks(original).filter((blk) => !outNorm.includes(normalizeSpace(blk)));
  if (lost.length) issues.push(`${lost.length} pasted block(s) (material, code or examples) were changed or dropped; keep them exactly`);

  // Requirements (list items) are still there, in some wording.
  let instructionsOnly = out;
  for (const blk of verbatimBlocks(out)) instructionsOnly = instructionsOnly.split(blk).join(" ");
  const index = indexSource(instructionsOnly);
  const min = action === "shorten" ? 0.4 : 0.5;
  const missing = listItems(original)
    .filter((item) => !(action === "tone" && /^tone\b/i.test(item)))
    .filter((item) => coverage(item, index) < min);
  if (missing.length) issues.push(`these points were lost: ${missing.map((m) => `"${m}"`).join("; ")}`);

  if (action === "shorten" && out.length >= original.trim().length) issues.push("it isn't shorter than the original");
  if (action === "expand" && out.length <= original.trim().length) issues.push("it isn't longer than the original");

  return { ok: issues.length === 0, issues };
}

export interface TransformStreamResult {
  text: string;
  truncated: boolean;
  repaired: boolean;
}

/** Yields each text delta as Gemini streams it; returns the final (checked or repaired) result. */
export async function* geminiTransform(
  req: TransformRequest,
  call: GeminiCall,
  meter: UsageMeter,
): AsyncGenerator<string, TransformStreamResult> {
  const instructions = transformInstructions(req.action, req.target, req.length as Length, req.tone as Tone | undefined);
  const prompt = transformPrompt(req.text, req.idea);

  const result = streamText({
    ...callSettings(call),
    instructions,
    prompt,
    // Errors arrive as `error` parts below and are mapped there. This handler only stops the SDK's
    // default console logging of provider errors (which could include provider text).
    onError: () => {},
  });

  let text = "";
  let finishReason: string | undefined;
  let usageAdded = false;
  for await (const part of result.fullStream) {
    if (part.type === "text-delta") {
      if (!part.text) continue;
      text += part.text;
      yield part.text;
    } else if (part.type === "error") {
      throw part.error;
    } else if (part.type === "abort") {
      throw call.signal.aborted ? call.signal.reason ?? new ClientAbort() : new ClientAbort();
    } else if (part.type === "finish") {
      finishReason = part.finishReason;
      meter.add(part.totalUsage);
      usageAdded = true;
    }
  }
  if (!usageAdded) meter.add(undefined);

  if (finishReason === "length") return { text, truncated: true, repaired: false };
  if (!text.trim()) {
    throw new AppError("invalid_output", finishReason === "content-filter" ? GEMINI_SAFETY_MESSAGE : GEMINI_INVALID_OUTPUT_MESSAGE);
  }

  const first = unwrapFence(text);
  const check = checkTransform(req.text, first, req.target, req.action);
  if (check.ok) return { text: first, truncated: false, repaired: false };

  // One repair, not streamed: `done.text` replaces what was shown.
  const r = await generateText({ ...callSettings(call), instructions, prompt: transformRepairPrompt(prompt, first, check.issues) });
  meter.add(r.usage);
  if (r.finishReason === "length") return { text: r.text, truncated: true, repaired: true };
  const second = unwrapFence(r.text);
  if (!checkTransform(req.text, second, req.target, req.action).ok) {
    throw new AppError("invalid_output", GEMINI_INVALID_OUTPUT_MESSAGE);
  }
  return { text: second, truncated: false, repaired: true };
}
