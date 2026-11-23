import type {
  ApiError,
  Answer,
  ClarifyRequest,
  ClarifyResponse,
  Engine,
  GenerateRequest,
  Length,
  ProviderId,
  ProvidersResponse,
  StreamEvent,
  Tone,
  TransformRequest,
} from "@/lib/contracts";
import { renderPrompt, type PromptBrief } from "@/lib/prompting";
import { ClientError, type PromptHubClient } from "@/lib/client/types";
import { pickBrief } from "./briefs";

/**
 * Phase 1 stand-in for the real API client. It is honest about what it is: `kind: "mock"` makes the
 * UI show "Preview data" and never attribute output to an AI provider. Text comes from the local
 * target profiles (`renderPrompt`) applied to sample briefs, streamed in realistic chunks.
 */

export interface MockOptions {
  mode?: "ai" | "basic";
  /** Providers whose keys are "present" but unusable (ProvidersResponse.detected). */
  detected?: ProviderId[];
  /** Return this error from the next clarify/generate/transform call, once. */
  failNext?: ApiError;
  /** Multiplies every delay. 0 makes the mock instant (tests). */
  speed?: number;
  today?: string;
}

const MOCK_ENGINE: Engine = { kind: "ai", provider: "anthropic", model: "claude-sonnet-5-5" };

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    if (ms <= 0) return resolve();
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Splits text into chunks of a few words, as a model stream would deliver them. */
export function chunkText(text: string, seed = 7): string[] {
  const out: string[] = [];
  let i = 0;
  let s = seed;
  while (i < text.length) {
    s = (s * 9301 + 49297) % 233280;
    const size = 8 + Math.floor((s / 233280) * 22);
    let end = Math.min(text.length, i + size);
    const space = text.indexOf(" ", end);
    if (space !== -1 && space - end < 8) end = space + 1;
    out.push(text.slice(i, end));
    i = end;
  }
  return out;
}

function withAnswers(brief: PromptBrief, answers: Answer[]): PromptBrief {
  if (answers.length === 0) return brief;
  return {
    ...brief,
    context: [
      ...brief.context,
      ...answers.map((a) => `${a.question.replace(/[?.]\s*$/, "")}: ${a.answer.replace(/[.]\s*$/, "")}.`),
    ],
  };
}

export function renderMock(
  idea: string,
  opts: { target: GenerateRequest["target"]; length: Length; tone?: Tone; answers?: Answer[]; today?: string },
): { text: string; title: string } {
  const mb = pickBrief(idea);
  const brief: PromptBrief = {
    ...withAnswers(mb.brief, opts.answers ?? []),
    length: opts.length,
    tone: opts.tone ?? mb.brief.tone,
  };
  return { text: renderPrompt(opts.target, brief, { today: opts.today ?? "2026-11-23" }), title: mb.title };
}

export function createMockClient(options: MockOptions = {}): PromptHubClient {
  let failNext = options.failNext;
  const speed = options.speed ?? 1;
  const mode = options.mode ?? "ai";
  const engine: Engine = mode === "basic" ? { kind: "basic" } : MOCK_ENGINE;

  function takeFailure(): ApiError | undefined {
    const f = failNext;
    failNext = undefined;
    return f;
  }

  async function* stream(text: string, title: string | undefined, signal?: AbortSignal): AsyncGenerator<StreamEvent> {
    try {
      await sleep(250 * speed, signal);
      yield { type: "meta", engine, requestId: `mock-${Date.now().toString(36)}` };
      const failure = takeFailure();
      await sleep(550 * speed, signal);
      const chunks = chunkText(text);
      const stopAt = failure ? Math.floor(chunks.length / 3) : chunks.length;
      for (let i = 0; i < stopAt; i++) {
        yield { type: "delta", text: chunks[i] };
        await sleep((22 + ((i * 17) % 30)) * speed, signal);
      }
      if (failure) {
        yield { type: "error", error: failure };
        return;
      }
      yield { type: "done", text, title };
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      throw e;
    }
  }

  return {
    kind: "mock",

    async getProviders(): Promise<ProvidersResponse> {
      await sleep(120 * speed);
      if (mode === "basic") return { mode: "basic", providers: [], default: null, detected: options.detected ?? [] };
      return {
        mode: "ai",
        providers: [
          { id: "anthropic", label: "Anthropic", model: "claude-sonnet-5-5" },
          { id: "openai", label: "OpenAI", model: "gpt-5.5" },
        ],
        default: "anthropic",
        detected: [],
      };
    },

    async clarify(req: ClarifyRequest, signal?: AbortSignal): Promise<ClarifyResponse> {
      await sleep(1100 * speed, signal);
      const failure = takeFailure();
      if (failure) throw new ClientError(failure);
      const mb = pickBrief(req.idea);
      const questions = mode === "basic" ? mb.questions.slice(0, 3) : mb.questions;
      return { questions, engine };
    },

    generate(req: GenerateRequest, signal?: AbortSignal) {
      const { text, title } = renderMock(req.idea, { ...req, today: options.today });
      return stream(text, title, signal);
    },

    transform(req: TransformRequest, signal?: AbortSignal) {
      if (mode === "basic") {
        // Mirrors the server: 409 ai_required in Basic Mode, never a fake result.
        return (async function* (): AsyncGenerator<StreamEvent> {
          yield { type: "error", error: AI_REQUIRED_ERROR };
        })();
      }
      const idea = req.idea ?? req.text.slice(0, 200);
      const length: Length =
        req.action === "shorten" ? "concise" : req.action === "expand" ? "detailed" : req.length;
      let { text } = renderMock(idea, { target: req.target, length, tone: req.tone, today: options.today });
      if (req.action === "improve") {
        text = text.replace(
          /(\n\n)(?=[^\n]*$)/,
          "\n\nIf any detail above is missing or unclear, ask me about it before you start.\n\n",
        );
      }
      return stream(text, undefined, signal);
    },
  };
}

export const PROVIDER_UNAVAILABLE_ERROR: ApiError = {
  code: "provider_unavailable",
  message: "No provider could complete this request. Try again in a minute.",
  attempted: ["anthropic", "openai"],
};

export const AI_REQUIRED_ERROR: ApiError = {
  code: "ai_required",
  message: "Improve, Shorten, Expand and Tone need an AI provider. Add an API key to the server to turn them on.",
};
