/**
 * Engine entry points used by the API routes (ARCHITECTURE §5). Server-only.
 *
 * Engine selection: AI providers first (Phase 3), Basic Mode only when ZERO providers are configured.
 * When providers exist but fail, the result is a mapped error, never Basic Mode output. Phase 2 has
 * no adapters, so every call resolves to Basic Mode; the AI branch is where Phase 3 plugs in.
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
import { buildRegistry, type Registry } from "./registry";

export interface EngineDeps {
  registry: Registry;
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

/** The AI path isn't in this build. Unreachable in Phase 2 (registry has no adapters). */
function noAiEngine(): never {
  throw new AppError(
    "provider_unavailable",
    "AI providers are configured, but this build can't use them yet. Remove the API keys to use Basic Mode.",
  );
}

export function createEngine(deps: Partial<EngineDeps> = {}): PromptEngine {
  const registry = deps.registry ?? buildRegistry();
  const today = deps.today ?? (() => new Date().toISOString().slice(0, 10));
  const requestId = deps.requestId ?? (() => crypto.randomUUID());
  const useAi = registry.providers.length > 0;

  return {
    async clarify(req, opts) {
      abortIfNeeded(opts?.signal);
      if (useAi) noAiEngine();
      return { questions: basicQuestions(req.idea, req.target), engine: BASIC };
    },

    async *generate(req, opts) {
      abortIfNeeded(opts?.signal);
      if (useAi) noAiEngine();
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
      if (useAi) noAiEngine();
      // Phase 2: adding a key would not enable these, so don't suggest it.
      const detectedNote = registry.detected.length
        ? " API keys were found, but AI providers aren't connected in this build yet."
        : "";
      throw new AppError("ai_required", `${AI_REQUIRED_MESSAGE}${detectedNote}`);
    },
  };
}
