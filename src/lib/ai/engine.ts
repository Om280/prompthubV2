/**
 * Engine entry points used by the API routes (ARCHITECTURE §5). Server-only.
 *
 * This build has no AI generation: every call runs Basic Mode (local templates, labelled as such).
 * AI (Phase 3) will run only on Google Gemini's free tier with the owner's server-side key; when it
 * lands, a request that asks for AI and fails gets a mapped error, never Basic Mode output.
 */
import type {
  ClarifyRequest,
  ClarifyResponse,
  Engine,
  GenerateRequest,
  StreamEvent,
  TransformRequest,
} from "@/lib/contracts";
import { renderPrompt } from "@/lib/prompting";
import { buildBasicBrief } from "./basic/brief";
import { basicQuestions } from "./basic/questions";
import { basicTitle } from "./basic/title";
import { AI_REQUIRED_MESSAGE, AppError } from "./errors";

export interface EngineDeps {
  /** ISO date for recency-sensitive prompts; injectable so tests are deterministic. */
  today: () => string;
  requestId: () => string;
}

export interface CallOptions {
  signal?: AbortSignal;
}

export interface PromptEngine {
  clarify(req: ClarifyRequest, opts?: CallOptions): Promise<ClarifyResponse>;
  generate(req: GenerateRequest, opts?: CallOptions): AsyncIterable<StreamEvent>;
  /** Throws `AppError('ai_required')` in Basic Mode, before any stream starts. */
  transform(req: TransformRequest, opts?: CallOptions): Promise<AsyncIterable<StreamEvent>>;
}

const BASIC: Engine = { kind: "basic" };

function abortIfNeeded(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("The request was aborted.", "AbortError");
}

export function createEngine(deps: Partial<EngineDeps> = {}): PromptEngine {
  const today = deps.today ?? (() => new Date().toISOString().slice(0, 10));
  const requestId = deps.requestId ?? (() => crypto.randomUUID());

  return {
    async clarify(req, opts) {
      abortIfNeeded(opts?.signal);
      return { questions: basicQuestions(req.idea, req.target), engine: BASIC };
    },

    async *generate(req, opts) {
      abortIfNeeded(opts?.signal);
      // Basic Mode is a local template: build everything first, then emit meta, ONE delta, done.
      const brief = buildBasicBrief({ idea: req.idea, answers: req.answers, target: req.target, length: req.length });
      const text = renderPrompt(req.target, brief, { today: today() });
      const title = basicTitle(req.idea);
      yield { type: "meta", engine: BASIC, requestId: requestId() };
      abortIfNeeded(opts?.signal);
      yield { type: "delta", text };
      abortIfNeeded(opts?.signal);
      yield { type: "done", text, title };
    },

    async transform(_req, opts) {
      abortIfNeeded(opts?.signal);
      throw new AppError("ai_required", AI_REQUIRED_MESSAGE);
    },
  };
}
