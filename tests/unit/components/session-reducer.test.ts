import { describe, expect, it } from "vitest";
import {
  collectAnswers,
  initialSession,
  sessionReducer,
  type SessionAction,
  type SessionState,
} from "@/hooks/use-session";
import type { Engine } from "@/lib/contracts";
import { DROPPED_MESSAGE } from "@/lib/client/ndjson";
import { DROPPED_EMPTY_MESSAGE } from "@/hooks/use-session";

const AI: Engine = { kind: "ai", gateway: "openrouter", model: "anthropic/claude-sonnet-5.5" };
const run = (s: SessionState, actions: SessionAction[]) => actions.reduce(sessionReducer, s);

const questions = [
  { id: "q1", question: "What outcome do you want?", suggestions: ["Repair within 48 hours"] },
  { id: "q2", question: "How firm should it sound?", suggestions: [] },
  { id: "q3", question: "Anything they already know?", suggestions: [] },
];

function readyState(): SessionState {
  return run(initialSession(), [
    { type: "setIdea", idea: "Write a cold email to my landlord" },
    { type: "clarifyStart" },
    { type: "questionsReceived", questions },
    { type: "answer", id: "q1", text: "Repair within 48 hours" },
    { type: "skip", id: "q3" },
    { type: "streamStart", activity: "generate", answers: [{ questionId: "q1", question: "x", answer: "y" }] },
    { type: "streamMeta", engine: AI },
    { type: "streamDelta", text: "# Role\n" },
    { type: "streamDelta", text: "You are a tenant." },
    { type: "streamDone", text: "# Role\nYou are a tenant.", title: "Cold email", id: "v1", promptId: "p1", now: 1000 },
  ]);
}

describe("session reducer", () => {
  it("does not start clarifying with a blank idea", () => {
    const s = run(initialSession(), [{ type: "setIdea", idea: "   " }, { type: "clarifyStart" }]);
    expect(s.phase).toBe("idle");
  });

  it("caps the idea at 4,000 characters", () => {
    const s = sessionReducer(initialSession(), { type: "setIdea", idea: "a".repeat(4200) });
    expect(s.idea).toHaveLength(4000);
  });

  it("walks idle → clarifying → answering → generating → ready", () => {
    let s = run(initialSession(), [{ type: "setIdea", idea: "Plan a trip" }, { type: "clarifyStart" }]);
    expect(s.phase).toBe("clarifying");
    s = sessionReducer(s, { type: "questionsReceived", questions });
    expect(s.phase).toBe("answering");
    s = sessionReducer(s, { type: "streamStart", activity: "generate", answers: [] });
    expect(s.phase).toBe("generating");
    expect(s.generated).toEqual({ idea: "Plan a trip", target: "chatgpt", length: "balanced" });
    s = run(s, [
      { type: "streamMeta", engine: AI },
      { type: "streamDone", text: "Prompt", id: "v1", promptId: "p1", now: 1 },
    ]);
    expect(s.phase).toBe("ready");
    expect(s.versions).toHaveLength(1);
    expect(s.versions[0]).toMatchObject({ source: "generated", engine: AI, content: "Prompt", promptId: "p1" });
    expect(s.draft).toBe("Prompt");
  });

  it("uses done.text as authoritative, not the concatenated deltas", () => {
    const s = run(initialSession(), [
      { type: "setIdea", idea: "x" },
      { type: "streamStart", activity: "generate" },
      { type: "streamDelta", text: "partial garbage" },
      { type: "streamDone", text: "Final", id: "v1", promptId: "p1", now: 1 },
    ]);
    expect(s.versions[0].content).toBe("Final");
  });

  it("collects only answered, unskipped questions", () => {
    const s = run(initialSession(), [
      { type: "setIdea", idea: "x" },
      { type: "clarifyStart" },
      { type: "questionsReceived", questions },
      { type: "answer", id: "q1", text: "  Repair  " },
      { type: "answer", id: "q2", text: "Firm" },
      { type: "skip", id: "q2" },
    ]);
    expect(collectAnswers(s.questions)).toEqual([
      { questionId: "q1", question: questions[0].question, answer: "Repair" },
    ]);
    const undone = sessionReducer(s, { type: "unskip", id: "q2" });
    expect(collectAnswers(undone.questions)).toHaveLength(2);
  });

  it("keeps partial text as a version when stopped mid-stream", () => {
    const s = run(initialSession(), [
      { type: "setIdea", idea: "x" },
      { type: "streamStart", activity: "generate" },
      { type: "streamMeta", engine: AI },
      { type: "streamDelta", text: "Half a prompt" },
      { type: "stopped", id: "v1", promptId: "p1", now: 5 },
    ]);
    expect(s.phase).toBe("ready");
    expect(s.versions[0]).toMatchObject({ content: "Half a prompt", partial: true, source: "generated" });
    expect(s.notice).toEqual({ kind: "stopped" });
  });

  it("returns to the questions when stopped before any text", () => {
    const s = run(initialSession(), [
      { type: "setIdea", idea: "x" },
      { type: "clarifyStart" },
      { type: "questionsReceived", questions },
      { type: "streamStart", activity: "generate" },
      { type: "stopped", id: "v1", promptId: "p1", now: 5 },
    ]);
    expect(s.phase).toBe("answering");
    expect(s.versions).toHaveLength(0);
  });

  it("keeps the previous text on a stream error and can retry the same action", () => {
    const s = run(readyState(), [
      { type: "streamStart", activity: "tone", tone: "friendly" },
      { type: "streamDelta", text: "Hey" },
      { type: "streamError", message: "No provider could complete this request. Try again in a minute." },
    ]);
    expect(s.phase).toBe("error");
    expect(s.versions).toHaveLength(1);
    expect(s.draft).toBe("# Role\nYou are a tenant.");
    expect(s.error).toMatchObject({ retry: "tone", tone: "friendly" });
  });

  it("refuses transforms before any version exists", () => {
    const s = sessionReducer(initialSession(), { type: "streamStart", activity: "improve" });
    expect(s.phase).toBe("idle");
  });

  it("records the tone on tone versions", () => {
    const s = run(readyState(), [
      { type: "streamStart", activity: "tone", tone: "playful" },
      { type: "streamDone", text: "Playful", id: "v2", promptId: "p1", now: 2000 },
    ]);
    expect(s.versions[1]).toMatchObject({ source: "tone", tone: "playful" });
  });

  it("commits a manual edit as a new version with a saved notice", () => {
    const s = run(readyState(), [
      { type: "edit", text: "Edited text" },
      { type: "commitEdit", id: "v2", now: 3000 },
    ]);
    expect(s.versions).toHaveLength(2);
    expect(s.versions[1]).toMatchObject({ source: "edited", engine: { kind: "manual" }, content: "Edited text" });
    expect(s.notice).toEqual({ kind: "saved", version: 2 });
    // Committing again without changes is a no-op.
    expect(sessionReducer(s, { type: "commitEdit", id: "v3", now: 4000 })).toBe(s);
  });

  it("views an older version read-only and restores it as a new version", () => {
    let s = run(readyState(), [
      { type: "streamStart", activity: "shorten" },
      { type: "streamDone", text: "Short", id: "v2", promptId: "p1", now: 2000 },
      { type: "stepVersion", delta: -1 },
    ]);
    expect(s.viewing).toBe(0);
    expect(sessionReducer(s, { type: "edit", text: "nope" })).toBe(s);
    s = sessionReducer(s, { type: "restore", id: "v3", now: 3000 });
    expect(s.viewing).toBeNull();
    expect(s.versions).toHaveLength(3);
    expect(s.versions[2]).toMatchObject({ source: "restored", restoredFrom: "v1", content: "# Role\nYou are a tenant." });
    expect(s.notice).toEqual({ kind: "restored", version: 3 });
  });

  it("steps versions within bounds and clears viewing at the latest", () => {
    const s = run(readyState(), [
      { type: "streamStart", activity: "expand" },
      { type: "streamDone", text: "Long", id: "v2", promptId: "p1", now: 2000 },
    ]);
    const back = run(s, [
      { type: "stepVersion", delta: -1 },
      { type: "stepVersion", delta: -1 },
    ]);
    expect(back.viewing).toBe(0);
    expect(sessionReducer(back, { type: "stepVersion", delta: 1 }).viewing).toBeNull();
  });

  it("loads a saved prompt and resets to a new prompt keeping settings", () => {
    const loaded = sessionReducer(initialSession(), {
      type: "load",
      prompt: {
        id: "p9",
        title: "Trip",
        idea: "Plan a trip",
        target: "gemini",
        length: "detailed",
        answers: [],
        currentVersionId: "b",
        createdAt: 1,
        updatedAt: 2,
        deletedAt: null,
      },
      versions: [
        { id: "b", promptId: "p9", content: "B", source: "shortened", engine: AI, createdAt: 2 },
        { id: "a", promptId: "p9", content: "A", source: "generated", engine: AI, createdAt: 1 },
      ],
    });
    expect(loaded.phase).toBe("ready");
    expect(loaded.versions.map((v) => v.id)).toEqual(["a", "b"]);
    expect(loaded.draft).toBe("B");
    const fresh = sessionReducer(loaded, { type: "reset" });
    expect(fresh.phase).toBe("idle");
    expect(fresh.target).toBe("gemini");
    expect(fresh.length).toBe("detailed");
    expect(fresh.versions).toHaveLength(0);
  });

  describe("Basic Mode", () => {
    const BASIC: Engine = { kind: "basic" };
    const basicReady = () =>
      run(initialSession(), [
        { type: "setIdea", idea: "Plan a trip" },
        { type: "streamStart", activity: "generate", answers: [] },
        { type: "streamMeta", engine: BASIC },
        { type: "streamDelta", text: "Template text" },
        { type: "streamDone", text: "Template text", title: "Trip", id: "v1", promptId: "p1", now: 1 },
      ]);

    it("does not add a version when regenerate returns the same text, and says why", () => {
      const s = run(basicReady(), [
        { type: "streamStart", activity: "regenerate" },
        { type: "streamMeta", engine: BASIC },
        { type: "streamDelta", text: "Template text" },
        { type: "streamDone", text: "Template text", id: "v2", promptId: "p1", now: 2 },
      ]);
      expect(s.phase).toBe("ready");
      expect(s.stream).toBeNull();
      expect(s.versions).toHaveLength(1);
      expect(s.notice).toEqual({ kind: "same" });
      // Changing an input clears the note.
      expect(sessionReducer(s, { type: "setTarget", target: "claude" }).notice).toBeNull();
    });

    it("adds a regenerated version when the platform change gives different text", () => {
      const s = run(basicReady(), [
        { type: "setTarget", target: "claude" },
        { type: "streamStart", activity: "regenerate" },
        { type: "streamMeta", engine: BASIC },
        { type: "streamDone", text: "<task>Template text</task>", id: "v2", promptId: "p1", now: 2 },
      ]);
      expect(s.versions.map((v) => v.source)).toEqual(["generated", "regenerated"]);
      expect(s.generated?.target).toBe("claude");
      expect(s.notice).toBeNull();
    });

    it("keeps an identical AI regenerate as a version (the note is Basic Mode only)", () => {
      const s = run(basicReady(), [
        { type: "streamStart", activity: "regenerate" },
        { type: "streamMeta", engine: AI },
        { type: "streamDone", text: "Template text", id: "v2", promptId: "p1", now: 2 },
      ]);
      expect(s.versions).toHaveLength(2);
    });

    it("shows ai_required inline without touching the text", () => {
      const s = run(basicReady(), [
        { type: "streamStart", activity: "improve" },
        { type: "streamError", message: "Improve needs an AI provider.", code: "ai_required" },
      ]);
      expect(s.phase).toBe("error");
      expect(s.error).toMatchObject({ code: "ai_required", retry: "improve" });
      expect(s.versions).toHaveLength(1);
      expect(s.draft).toBe("Template text");
    });
  });

  it("keeps the text written so far as a partial version when the connection drops", () => {
    const s = run(readyState(), [
      { type: "streamStart", activity: "regenerate" },
      { type: "streamMeta", engine: AI },
      { type: "streamDelta", text: "New half" },
      { type: "streamError", message: DROPPED_MESSAGE, code: "internal", keepPartial: { id: "v2", promptId: "p1", now: 9 } },
    ]);
    expect(s.phase).toBe("error");
    expect(s.versions[1]).toMatchObject({ id: "v2", content: "New half", partial: true, source: "regenerated" });
    expect(s.draft).toBe("New half");
    expect(s.error?.message).toBe(DROPPED_MESSAGE);
  });

  it("keeps the previous text when the connection drops before any text", () => {
    const s = run(readyState(), [
      { type: "streamStart", activity: "regenerate" },
      { type: "streamError", message: DROPPED_MESSAGE, code: "internal", keepPartial: { id: "v2", promptId: "p1", now: 9 } },
    ]);
    expect(s.versions).toHaveLength(1);
    expect(s.draft).toBe("# Role\nYou are a tenant.");
    expect(s.error?.message).toBe(DROPPED_EMPTY_MESSAGE);
  });
});
