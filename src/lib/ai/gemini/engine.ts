/**
 * The Gemini engine behind the AI routes. Server-only.
 *
 * Each entry point runs inside a guard lease (`guardAiRoute`) and always settles it, exactly once:
 * `reconcileTokens(actual)` when usage is known, `recordUsage({ status })` with ok / error /
 * aborted / timeout, then `release()`. The lease's signal (client disconnect + AI_TIMEOUT_MS) goes to
 * every SDK call, so a client that leaves cancels Gemini.
 *
 * Streams follow API_CONTRACTS §4: `meta` (engine `{ kind: "ai", provider: "gemini", tier: "free",
 * model }`) first, `delta`s, then exactly one `done` or `error`. Failures are mapped errors, never
 * Basic Mode output. Nothing here logs prompt text.
 */
import "server-only";
import type { LanguageModel } from "ai";
import type { ClarifyRequest, ClarifyResponse, Engine, GenerateRequest, StreamEvent, TransformRequest } from "@/lib/contracts";
import type { ThinkingLevel } from "@/lib/server/env";
import type { AiUsage } from "@/lib/server/guard";
import { AppError } from "../errors";
import { classifyFailure, type CallStatus, type GeminiCall, throwIfAborted, UsageMeter, usageOf } from "./call";
import { geminiClarify } from "./clarify";
import { geminiGenerate } from "./generate";
import { createGeminiModel } from "./provider";
import { geminiTransform } from "./transform";

/** The part of `AiRouteLease` the engine needs (tests pass a fake). */
export interface EngineLease {
  requestId: string;
  model: string;
  signal: AbortSignal;
  maxOutputTokens: number;
  timeoutMs: number;
  thinkingLevel: ThinkingLevel;
  reconcileTokens(actualTotalTokens: number): Promise<void>;
  recordUsage(usage: AiUsage): Promise<void>;
  release(): void;
}

export interface AiEngineDeps {
  /** Builds the model; tests inject an AI SDK mock model. Default: `createGeminiModel`. */
  languageModel?: (modelId: string) => LanguageModel;
  today?: () => string;
}

export const aiEngine = (model: string): Engine => ({ kind: "ai", provider: "gemini", tier: "free", model });

export const CANCELLED_MESSAGE = "The request was cancelled.";

function callFor(lease: EngineLease, deps: AiEngineDeps): GeminiCall {
  return {
    model: (deps.languageModel ?? createGeminiModel)(lease.model),
    signal: lease.signal,
    timeoutMs: lease.timeoutMs,
    maxOutputTokens: lease.maxOutputTokens,
    thinkingLevel: lease.thinkingLevel,
  };
}

/** Settles a lease once: reconcile, record, release. Never throws. */
function settler(lease: EngineLease, meter: UsageMeter) {
  let done = false;
  return async (status: CallStatus) => {
    if (done) return;
    done = true;
    try {
      if (meter.known) await lease.reconcileTokens(meter.total);
      await lease.recordUsage({ ...meter.summary(), status });
    } finally {
      lease.release();
    }
  };
}

/** Splits rendered text into paragraph-sized deltas whose concatenation is the exact text. */
export function deltaChunks(text: string): string[] {
  const parts = text.split(/(?<=\n\n)/);
  return parts.filter((p) => p.length > 0);
}

/* ---------------------------------------------------------------- clarify (JSON) */

export async function aiClarify(req: ClarifyRequest, lease: EngineLease, deps: AiEngineDeps = {}): Promise<ClarifyResponse> {
  const meter = new UsageMeter();
  const settle = settler(lease, meter);
  try {
    const call = callFor(lease, deps);
    const r = await geminiClarify(req, call, meter);
    await settle("ok");
    return { questions: r.questions, engine: aiEngine(lease.model), taskType: r.taskType };
  } catch (err) {
    meter.add(usageOf(err));
    const c = classifyFailure(err, lease.signal);
    await settle(c.status);
    throw c.error ?? new AppError("internal", CANCELLED_MESSAGE, {}, 499);
  }
}

/* ---------------------------------------------------------------- streams */

async function* settledStream(
  lease: EngineLease,
  meter: UsageMeter,
  body: () => AsyncGenerator<StreamEvent, void>,
): AsyncGenerator<StreamEvent> {
  const settle = settler(lease, meter);
  let status: CallStatus = "aborted"; // until the stream reaches a terminal event
  try {
    yield { type: "meta", engine: aiEngine(lease.model), requestId: lease.requestId };
    try {
      for await (const ev of body()) {
        if (ev.type === "done") status = "ok";
        yield ev;
      }
    } catch (err) {
      meter.add(usageOf(err));
      const c = classifyFailure(err, lease.signal);
      status = c.status;
      if (c.error) yield { type: "error", error: c.error.toApiError() };
    }
  } finally {
    await settle(status);
  }
}

export function aiGenerate(req: GenerateRequest, lease: EngineLease, deps: AiEngineDeps = {}): AsyncGenerator<StreamEvent> {
  const meter = new UsageMeter();
  const today = deps.today ?? (() => new Date().toISOString().slice(0, 10));
  return settledStream(lease, meter, async function* () {
    const call = callFor(lease, deps);
    const g = await geminiGenerate({ req, today: today() }, call, meter);
    for (const chunk of deltaChunks(g.text)) {
      throwIfAborted(lease.signal);
      yield { type: "delta", text: chunk };
    }
    throwIfAborted(lease.signal);
    const u = meter.summary();
    yield {
      type: "done",
      text: g.text,
      title: g.title,
      ...(u.inputTokens !== null ? { usage: { inputTokens: u.inputTokens, outputTokens: u.outputTokens ?? undefined } } : {}),
    };
  });
}

export function aiTransform(req: TransformRequest, lease: EngineLease, deps: AiEngineDeps = {}): AsyncGenerator<StreamEvent> {
  const meter = new UsageMeter();
  return settledStream(lease, meter, async function* () {
    const call = callFor(lease, deps);
    const it = geminiTransform(req, call, meter);
    let r = await it.next();
    while (!r.done) {
      throwIfAborted(lease.signal);
      yield { type: "delta", text: r.value };
      r = await it.next();
    }
    throwIfAborted(lease.signal);
    const u = meter.summary();
    yield {
      type: "done",
      text: r.value.text,
      ...(r.value.truncated ? { truncated: true } : {}),
      ...(u.inputTokens !== null ? { usage: { inputTokens: u.inputTokens, outputTokens: u.outputTokens ?? undefined } } : {}),
    };
  });
}
