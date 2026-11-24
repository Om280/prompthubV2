"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Answer,
  ApiErrorCode,
  ClarifyingQuestion,
  Engine,
  Length,
  PromptRecord,
  StreamEvent,
  TargetPlatform,
  Tone,
  TransformAction,
  VersionRecord,
  VersionSource,
} from "@/lib/contracts";
import { DROPPED_MESSAGE } from "@/lib/client/ndjson";
import { ClientError, isAbortError, type PromptHubClient } from "@/lib/client/types";
import type { HistoryStore } from "@/lib/history/types";
import { newId } from "@/lib/utils";

/* ============================================================================================
 * State machine (ARCHITECTURE §4)
 *   idle ─generate─▶ clarifying ─questions─▶ answering ─submit/skip─▶ generating ─done─▶ ready
 *                       └──(0 questions)───────────────────────────▶ generating
 *   ready ─action─▶ transforming ─done─▶ ready;  any request ─fail─▶ error;  new prompt ─▶ idle
 * ========================================================================================== */

export type Phase = "idle" | "clarifying" | "answering" | "generating" | "ready" | "transforming" | "error";

/** What started the current or last stream. */
export type Activity = "generate" | "regenerate" | TransformAction;

export interface QuestionItem extends ClarifyingQuestion {
  answer: string;
  skipped: boolean;
}

export interface StreamState {
  activity: Activity;
  tone?: Tone;
  engine: Engine | null;
  text: string;
}

export type Notice =
  | { kind: "stopped" }
  /** Basic Mode regenerate produced the text already in the editor; no version was added. */
  | { kind: "same" }
  | { kind: "saved"; version: number }
  | { kind: "restored"; version: number };

export interface SessionError {
  message: string;
  code?: ApiErrorCode;
  retry: "clarify" | Activity;
  tone?: Tone;
  /** When a daily or quota limit resets (ISO), for quota_exhausted, user_daily_limit, daily_budget_exhausted. */
  resetsAt?: string;
}

/** Shown when Gemini hit its output limit: the text is kept as a partial version. */
export const TRUNCATED_MESSAGE =
  "Gemini reached its output limit before finishing, so this version is incomplete. Try again, or choose a shorter length.";

export interface SessionState {
  phase: Phase;
  promptId: string | null;
  title: string | null;
  createdAt: number | null;
  /** Composer value. Editable in every phase. */
  idea: string;
  target: TargetPlatform;
  length: Length;
  /** Inputs that produced the latest version; used for "Regenerate for …" and transforms. */
  generated: { idea: string; target: TargetPlatform; length: Length } | null;
  questions: QuestionItem[];
  /** Answers sent with the latest generation (shown as "{n} answers"). */
  answers: Answer[];
  versions: VersionRecord[];
  /** Index into `versions` when an older version is open; null means the latest. */
  viewing: number | null;
  /** Editor value for the latest version (may hold uncommitted edits). */
  draft: string;
  stream: StreamState | null;
  error: SessionError | null;
  notice: Notice | null;
  /** Clarify has taken longer than 8 s. */
  slow: boolean;
}

export type SessionAction =
  | { type: "setIdea"; idea: string }
  | { type: "setTarget"; target: TargetPlatform }
  | { type: "setLength"; length: Length }
  | { type: "clarifyStart" }
  | { type: "clarifySlow" }
  | { type: "questionsReceived"; questions: ClarifyingQuestion[] }
  | { type: "answer"; id: string; text: string }
  | { type: "skip"; id: string }
  | { type: "unskip"; id: string }
  | { type: "streamStart"; activity: Activity; tone?: Tone; answers?: Answer[] }
  | { type: "streamMeta"; engine: Engine }
  | { type: "streamDelta"; text: string }
  | { type: "streamDone"; text: string; title?: string; id: string; promptId: string; now: number; truncated?: boolean }
  | {
      type: "streamError";
      message: string;
      code?: ApiErrorCode;
      resetsAt?: string;
      /** The connection dropped: keep the text written so far as a partial version. */
      keepPartial?: { id: string; promptId: string; now: number };
    }
  | { type: "stopped"; id: string; promptId: string; now: number }
  | { type: "failed"; message: string; code?: ApiErrorCode; retry: SessionError["retry"]; tone?: Tone; resetsAt?: string }
  | { type: "edit"; text: string }
  | { type: "commitEdit"; id: string; now: number }
  | { type: "viewVersion"; index: number | null }
  | { type: "stepVersion"; delta: -1 | 1 }
  | { type: "restore"; id: string; now: number }
  | { type: "clearNotice"; kind?: Notice["kind"] }
  | { type: "setTitle"; title: string }
  | { type: "reset" }
  | { type: "load"; prompt: PromptRecord; versions: VersionRecord[] }
  | { type: "hydrate"; state: SessionState };

export function initialSession(target: TargetPlatform = "chatgpt", length: Length = "balanced"): SessionState {
  return {
    phase: "idle",
    promptId: null,
    title: null,
    createdAt: null,
    idea: "",
    target,
    length,
    generated: null,
    questions: [],
    answers: [],
    versions: [],
    viewing: null,
    draft: "",
    stream: null,
    error: null,
    notice: null,
    slow: false,
  };
}

const SOURCE_FOR: Record<Activity, VersionSource> = {
  generate: "generated",
  regenerate: "regenerated",
  improve: "improved",
  shorten: "shortened",
  expand: "expanded",
  tone: "tone",
};

export function collectAnswers(questions: QuestionItem[]): Answer[] {
  return questions
    .filter((q) => !q.skipped && q.answer.trim())
    .map((q) => ({ questionId: q.id, question: q.question, answer: q.answer.trim() }));
}

export function latest(state: SessionState): VersionRecord | undefined {
  return state.versions[state.versions.length - 1];
}

function settled(state: SessionState): Phase {
  if (state.versions.length > 0) return "ready";
  if (state.questions.length > 0) return "answering";
  return "idle";
}

function appendVersion(state: SessionState, v: VersionRecord, promptId: string, title?: string): SessionState {
  return {
    ...state,
    promptId,
    title: state.title ?? title ?? null,
    createdAt: state.createdAt ?? v.createdAt,
    versions: [...state.versions, v],
    viewing: null,
    draft: v.content,
  };
}

const clearSame = (n: Notice | null): Notice | null => (n?.kind === "same" ? null : n);

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    // Changing an input answers the "same prompt" note, so it goes away.
    case "setIdea":
      return { ...state, idea: action.idea.slice(0, 4000), notice: clearSame(state.notice) };
    case "setTarget":
      return { ...state, target: action.target, notice: clearSame(state.notice) };
    case "setLength":
      return { ...state, length: action.length, notice: clearSame(state.notice) };

    case "clarifyStart":
      if (!state.idea.trim()) return state;
      return { ...state, phase: "clarifying", questions: [], error: null, notice: null, slow: false };
    case "clarifySlow":
      return state.phase === "clarifying" ? { ...state, slow: true } : state;
    case "questionsReceived":
      if (state.phase !== "clarifying") return state;
      return {
        ...state,
        phase: "answering",
        slow: false,
        questions: action.questions.map((q) => ({ ...q, answer: "", skipped: false })),
      };
    case "answer":
      return {
        ...state,
        questions: state.questions.map((q) => (q.id === action.id ? { ...q, answer: action.text, skipped: false } : q)),
      };
    case "skip":
      return {
        ...state,
        questions: state.questions.map((q) => (q.id === action.id ? { ...q, skipped: true } : q)),
      };
    case "unskip":
      return {
        ...state,
        questions: state.questions.map((q) => (q.id === action.id ? { ...q, skipped: false } : q)),
      };

    case "streamStart": {
      const isGeneration = action.activity === "generate" || action.activity === "regenerate";
      if (!isGeneration && state.versions.length === 0) return state;
      return {
        ...state,
        phase: isGeneration ? "generating" : "transforming",
        stream: { activity: action.activity, tone: action.tone, engine: null, text: "" },
        answers: action.answers ?? state.answers,
        generated: isGeneration
          ? { idea: state.idea.trim(), target: state.target, length: state.length }
          : state.generated,
        viewing: null,
        error: null,
        notice: null,
        slow: false,
      };
    }
    case "streamMeta":
      return state.stream ? { ...state, stream: { ...state.stream, engine: action.engine } } : state;
    case "streamDelta":
      return state.stream ? { ...state, stream: { ...state.stream, text: state.stream.text + action.text } } : state;
    case "streamDone": {
      if (!state.stream) return state;
      // Basic Mode is deterministic: the same inputs give the same text. Don't stack duplicates.
      const engine = state.stream.engine;
      if (
        !action.truncated &&
        state.stream.activity === "regenerate" &&
        engine?.kind === "basic" &&
        state.versions.length > 0 &&
        action.text === state.draft
      ) {
        return { ...state, phase: "ready", stream: null, notice: { kind: "same" } };
      }
      const v: VersionRecord = {
        id: action.id,
        promptId: action.promptId,
        content: action.text,
        source: SOURCE_FOR[state.stream.activity],
        ...(action.truncated ? { partial: true } : {}),
        tone: state.stream.activity === "tone" ? state.stream.tone : undefined,
        engine: state.stream.engine ?? { kind: "basic" },
        createdAt: action.now,
      };
      const next = appendVersion(state, v, action.promptId, action.title);
      if (action.truncated) {
        const s = state.stream;
        return {
          ...next,
          phase: "error",
          stream: null,
          error: { message: TRUNCATED_MESSAGE, code: "invalid_output", retry: s.activity, tone: s.tone },
        };
      }
      return { ...next, phase: "ready", stream: null };
    }
    case "stopped": {
      if (state.phase === "clarifying") return { ...state, phase: "idle", slow: false };
      if (!state.stream) return state;
      const text = state.stream.text;
      const base = { ...state, stream: null };
      if (!text.trim()) return { ...base, phase: settled(base) };
      const v: VersionRecord = {
        id: action.id,
        promptId: action.promptId,
        content: text,
        source: SOURCE_FOR[state.stream.activity],
        partial: true,
        tone: state.stream.activity === "tone" ? state.stream.tone : undefined,
        engine: state.stream.engine ?? { kind: "basic" },
        createdAt: action.now,
      };
      return { ...appendVersion(base, v, action.promptId), phase: "ready", notice: { kind: "stopped" } };
    }
    case "streamError": {
      if (!state.stream) return state;
      const s = state.stream;
      const error: SessionError = {
        message: action.message,
        code: action.code,
        retry: s.activity,
        tone: s.tone,
        ...(action.resetsAt ? { resetsAt: action.resetsAt } : {}),
      };
      const keep = action.keepPartial;
      if (keep && s.text.trim()) {
        const v: VersionRecord = {
          id: keep.id,
          promptId: keep.promptId,
          content: s.text,
          source: SOURCE_FOR[s.activity],
          partial: true,
          tone: s.activity === "tone" ? s.tone : undefined,
          engine: s.engine ?? { kind: "basic" },
          createdAt: keep.now,
        };
        return { ...appendVersion({ ...state, stream: null }, v, keep.promptId), phase: "error", error };
      }
      return {
        ...state,
        phase: "error",
        error: keep ? { ...error, message: DROPPED_EMPTY_MESSAGE } : error,
        stream: null,
      };
    }
    case "failed":
      return {
        ...state,
        phase: "error",
        slow: false,
        stream: null,
        error: {
          message: action.message,
          code: action.code,
          retry: action.retry,
          tone: action.tone,
          ...(action.resetsAt ? { resetsAt: action.resetsAt } : {}),
        },
      };

    case "edit":
      if (state.viewing !== null || state.stream) return state;
      return { ...state, draft: action.text, notice: clearSame(state.notice) };
    case "commitEdit": {
      const last = latest(state);
      if (!last || state.viewing !== null || state.stream || state.draft === last.content) return state;
      if (!state.draft.trim()) return state;
      const v: VersionRecord = {
        id: action.id,
        promptId: last.promptId,
        content: state.draft,
        source: "edited",
        engine: { kind: "manual" },
        createdAt: action.now,
      };
      const next = appendVersion(state, v, last.promptId);
      return { ...next, notice: { kind: "saved", version: next.versions.length } };
    }

    case "viewVersion": {
      if (state.stream) return state;
      const last = state.versions.length - 1;
      const index = action.index === null || action.index >= last ? null : Math.max(0, action.index);
      return { ...state, viewing: index };
    }
    case "stepVersion": {
      if (state.stream || state.versions.length < 2) return state;
      const last = state.versions.length - 1;
      const current = state.viewing ?? last;
      const target = Math.min(last, Math.max(0, current + action.delta));
      return { ...state, viewing: target >= last ? null : target };
    }
    case "restore": {
      if (state.viewing === null) return state;
      const from = state.versions[state.viewing];
      const v: VersionRecord = {
        id: action.id,
        promptId: from.promptId,
        content: from.content,
        source: "restored",
        restoredFrom: from.id,
        engine: from.engine,
        createdAt: action.now,
      };
      const next = appendVersion(state, v, from.promptId);
      return { ...next, phase: "ready", notice: { kind: "restored", version: next.versions.length } };
    }
    case "clearNotice":
      if (!state.notice || (action.kind && state.notice.kind !== action.kind)) return state;
      return { ...state, notice: null };

    case "setTitle":
      return { ...state, title: action.title };
    case "reset":
      return initialSession(state.target, state.length);
    case "load": {
      const versions = [...action.versions].sort((a, b) => a.createdAt - b.createdAt);
      const current = versions.find((v) => v.id === action.prompt.currentVersionId) ?? versions[versions.length - 1];
      const p = action.prompt;
      return {
        ...initialSession(p.target, p.length),
        phase: versions.length ? "ready" : "idle",
        promptId: p.id,
        title: p.title,
        createdAt: p.createdAt,
        idea: p.idea,
        generated: { idea: p.idea, target: p.target, length: p.length },
        answers: p.answers,
        versions,
        draft: current?.content ?? "",
      };
    }
    case "hydrate":
      return action.state;
  }
}

/* ============================================================================================
 * Hook: runs requests against the client, persists versions to history.
 * ========================================================================================== */

export interface SessionCallbacks {
  /** The server answered `ai_required`: the AI status in the UI is out of date. */
  onAiRequired?: () => void;
  /** A version could not be written to history. */
  onPersistError?: () => void;
  /** A generate/regenerate/transform stream started. */
  onStreamStart?: (activity: Activity, tone?: Tone) => void;
  onAnnounce?: (message: string) => void;
}

const GENERIC_ERROR = "No provider could complete this request. Try again in a minute.";
/** The connection dropped before any text arrived, so there is nothing to keep. */
export const DROPPED_EMPTY_MESSAGE = "The connection dropped before anything was written. Try again.";

function errorMessage(e: unknown): string {
  if (e instanceof ClientError) return e.error.message || GENERIC_ERROR;
  return GENERIC_ERROR;
}

function toRecord(state: SessionState): PromptRecord | null {
  const last = latest(state);
  if (!last || !state.promptId) return null;
  const gen = state.generated ?? { idea: state.idea, target: state.target, length: state.length };
  return {
    id: state.promptId,
    title: state.title ?? gen.idea.slice(0, 60),
    idea: gen.idea,
    target: gen.target,
    length: gen.length,
    answers: state.answers,
    currentVersionId: last.id,
    createdAt: state.createdAt ?? last.createdAt,
    updatedAt: last.createdAt,
    deletedAt: null,
  };
}

export function useSession(
  client: PromptHubClient,
  history: HistoryStore,
  callbacks: SessionCallbacks = {},
  init?: () => SessionState,
) {
  const [state, setState] = useState<SessionState>(() => (init ? init() : initialSession()));
  const ref = useRef(state);
  const controller = useRef<AbortController | null>(null);
  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cb = useRef(callbacks);
  useEffect(() => {
    cb.current = callbacks;
  });
  /** One workflowId per idea (clarify + generate count as one AI workflow). */
  const workflowId = useRef<string | null>(null);
  /** The last request's id, reused when the user retries that same request (never counted twice). */
  const lastRequest = useRef<{ retry: SessionError["retry"]; requestId: string } | null>(null);
  const requestIdFor = useCallback((kind: SessionError["retry"], reuse: boolean): string => {
    const id = reuse && lastRequest.current?.retry === kind ? lastRequest.current.requestId : newId();
    lastRequest.current = { retry: kind, requestId: id };
    return id;
  }, []);

  const persist = useCallback(
    (s: SessionState) => {
      const record = toRecord(s);
      const v = latest(s);
      if (!record || !v) return;
      history.commit(record, v).catch(() => cb.current.onPersistError?.());
    },
    [history],
  );

  const dispatch = useCallback(
    (action: SessionAction) => {
      const prev = ref.current;
      const next = sessionReducer(prev, action);
      if (next === prev) return prev;
      ref.current = next;
      setState(next);
      const restoresExisting = action.type === "hydrate" || action.type === "load";
      if (!restoresExisting && next.versions.length > prev.versions.length) persist(next);
      return next;
    },
    [persist],
  );

  const abort = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    if (slowTimer.current) clearTimeout(slowTimer.current);
  }, []);

  useEffect(() => abort, [abort]);

  const consume = useCallback(
    async (events: AsyncIterable<StreamEvent>, signal: AbortSignal) => {
      let terminal = false;
      try {
        for await (const ev of events) {
          if (signal.aborted) return;
          if (ev.type === "meta") {
            dispatch({ type: "streamMeta", engine: ev.engine });
          } else if (ev.type === "delta") {
            dispatch({ type: "streamDelta", text: ev.text });
          } else if (ev.type === "done") {
            terminal = true;
            const s = ref.current;
            dispatch({
              type: "streamDone",
              text: ev.text,
              title: ev.title,
              id: newId(),
              promptId: s.promptId ?? newId(),
              now: Date.now(),
              truncated: ev.truncated === true,
            });
          } else if (ev.type === "error") {
            terminal = true;
            const s = ref.current;
            const dropped = ev.error.code === "internal" && ev.error.message === DROPPED_MESSAGE;
            dispatch({
              type: "streamError",
              message: ev.error.message || GENERIC_ERROR,
              code: ev.error.code,
              resetsAt: ev.error.resetsAt,
              keepPartial: dropped ? { id: newId(), promptId: s.promptId ?? newId(), now: Date.now() } : undefined,
            });
            if (ev.error.code === "ai_required") cb.current.onAiRequired?.();
          }
        }
        if (!terminal && !signal.aborted) {
          const s = ref.current;
          dispatch({
            type: "streamError",
            message: DROPPED_MESSAGE,
            code: "internal",
            keepPartial: { id: newId(), promptId: s.promptId ?? newId(), now: Date.now() },
          });
        }
      } catch (e) {
        if (signal.aborted || isAbortError(e)) return;
        dispatch({
          type: "streamError",
          message: errorMessage(e),
          code: e instanceof ClientError ? e.error.code : undefined,
          resetsAt: e instanceof ClientError ? e.error.resetsAt : undefined,
        });
      } finally {
        if (controller.current?.signal === signal) controller.current = null;
      }
    },
    [dispatch],
  );

  const runStream = useCallback(
    (activity: Activity, opts: { tone?: Tone; answers?: Answer[]; retry?: boolean } = {}) => {
      abort();
      const ctrl = new AbortController();
      controller.current = ctrl;
      const before = ref.current;
      const after = dispatch({ type: "streamStart", activity, tone: opts.tone, answers: opts.answers });
      if (after === before) return;
      cb.current.onStreamStart?.(activity, opts.tone);
      const requestId = requestIdFor(activity, opts.retry === true);
      if (activity === "generate" || activity === "regenerate") {
        const g = after.generated!;
        workflowId.current ??= newId();
        void consume(
          client.generate(
            {
              idea: g.idea,
              target: g.target,
              length: g.length,
              answers: after.answers,
              requestId,
              workflowId: workflowId.current,
              ...(activity === "regenerate" ? { regenerate: true } : {}),
            },
            ctrl.signal,
          ),
          ctrl.signal,
        );
      } else {
        const text = latest(after)?.content ?? "";
        const g = after.generated ?? { idea: after.idea, target: after.target, length: after.length };
        void consume(
          client.transform(
            { action: activity, text, target: g.target, length: g.length, tone: opts.tone, idea: g.idea, requestId },
            ctrl.signal,
          ),
          ctrl.signal,
        );
      }
    },
    [abort, client, consume, dispatch, requestIdFor],
  );

  const clarify = useCallback(async (opts: { retry?: boolean } = {}) => {
    abort();
    const s = dispatch({ type: "clarifyStart" });
    if (s.phase !== "clarifying") return;
    // A new clarify starts a new workflow; a retry of the same clarify keeps its ids.
    const reuse = opts.retry === true && lastRequest.current?.retry === "clarify" && workflowId.current !== null;
    if (!reuse) workflowId.current = newId();
    const wf = workflowId.current!;
    const requestId = requestIdFor("clarify", reuse);
    const ctrl = new AbortController();
    controller.current = ctrl;
    slowTimer.current = setTimeout(() => dispatch({ type: "clarifySlow" }), 8000);
    try {
      const res = await client.clarify(
        { idea: s.idea.trim(), target: s.target, length: s.length, requestId, workflowId: wf },
        ctrl.signal,
      );
      if (ctrl.signal.aborted) return;
      if (slowTimer.current) clearTimeout(slowTimer.current);
      if (res.questions.length === 0) {
        runStream("generate", { answers: [] });
      } else {
        dispatch({ type: "questionsReceived", questions: res.questions });
        cb.current.onAnnounce?.(
          res.questions.length === 1
            ? "1 question to sharpen the prompt"
            : `${res.questions.length} questions to sharpen the prompt`,
        );
      }
    } catch (e) {
      if (ctrl.signal.aborted || isAbortError(e)) return;
      if (slowTimer.current) clearTimeout(slowTimer.current);
      dispatch({
        type: "failed",
        message: errorMessage(e),
        code: e instanceof ClientError ? e.error.code : undefined,
        resetsAt: e instanceof ClientError ? e.error.resetsAt : undefined,
        retry: "clarify",
      });
    }
  }, [abort, client, dispatch, requestIdFor, runStream]);

  /** Ctrl/Cmd+Enter and the Generate button: does the next sensible thing for the phase. */
  const primary = useCallback(() => {
    const s = ref.current;
    if (s.phase === "idle" || (s.phase === "error" && s.versions.length === 0 && s.error?.retry === "clarify")) {
      if (s.idea.trim()) void clarify();
    } else if (s.phase === "answering") {
      runStream("generate", { answers: collectAnswers(s.questions) });
    } else if ((s.phase === "ready" || s.phase === "error") && s.generated) {
      const g = s.generated;
      if (s.idea.trim() && (s.idea.trim() !== g.idea || s.target !== g.target || s.length !== g.length)) {
        runStream("regenerate");
      }
    }
  }, [clarify, runStream]);

  const stop = useCallback(() => {
    const s = ref.current;
    if (s.phase !== "generating" && s.phase !== "transforming" && s.phase !== "clarifying") return false;
    abort();
    dispatch({ type: "stopped", id: newId(), promptId: s.promptId ?? newId(), now: Date.now() });
    return true;
  }, [abort, dispatch]);

  const retry = useCallback(() => {
    const e = ref.current.error;
    if (!e) return;
    // A manual retry of the same request reuses its requestId, so it is never counted twice.
    if (e.retry === "clarify") void clarify({ retry: true });
    else if (e.retry === "generate" && ref.current.versions.length === 0)
      runStream("generate", { answers: ref.current.answers, retry: true });
    else if (e.retry === "generate") runStream("regenerate", { tone: e.tone });
    else runStream(e.retry, { tone: e.tone, retry: true });
  }, [clarify, runStream]);

  const commitEdit = useCallback(() => dispatch({ type: "commitEdit", id: newId(), now: Date.now() }), [dispatch]);

  const actions = useMemo(
    () => ({
      dispatch,
      primary,
      clarify,
      stop,
      retry,
      skipAll: () => runStream("generate", { answers: collectAnswers(ref.current.questions) }),
      regenerate: () => runStream("regenerate"),
      transform: (action: TransformAction, tone?: Tone) => runStream(action, { tone }),
      commitEdit,
      restore: () => dispatch({ type: "restore", id: newId(), now: Date.now() }),
      reset: () => {
        abort();
        workflowId.current = null;
        lastRequest.current = null;
        dispatch({ type: "reset" });
      },
      /** Use Basic Mode for clarify/generate from now on (e.g. after an AI limit), or "auto" to go back. */
      setEnginePreference: (p: "auto" | "basic") => client.setEnginePreference?.(p),
      load: async (id: string) => {
        const [prompt, versions] = await Promise.all([history.get(id), history.getVersions(id)]);
        if (!prompt) return;
        abort();
        dispatch({ type: "load", prompt, versions });
      },
      hydrate: (s: SessionState) => {
        abort();
        dispatch({ type: "hydrate", state: s });
      },
      getState: () => ref.current,
    }),
    [abort, clarify, client, commitEdit, dispatch, history, primary, retry, runStream, stop],
  );

  return { state, actions };
}

export type SessionActions = ReturnType<typeof useSession>["actions"];
