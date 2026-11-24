import { describe, expect, it } from "vitest";
import type { QuestionItem } from "@/hooks/use-session";
import { activeQuestion, nextOpenQuestion, stepStatus, stepSummary } from "@/components/workspace/stepper";

const q = (id: string, answer = "", skipped = false): QuestionItem => ({
  id,
  question: `Question ${id}?`,
  suggestions: [],
  answer,
  skipped,
});

describe("question stepper", () => {
  it("opens the first unanswered step by default", () => {
    expect(activeQuestion([q("q1"), q("q2")], null)).toBe("q1");
    expect(activeQuestion([q("q1", "yes"), q("q2")], null)).toBe("q2");
    expect(activeQuestion([q("q1", "", true), q("q2")], null)).toBe("q2");
  });

  it("keeps the chosen step open while you type into it", () => {
    const qs = [q("q1", "Two days"), q("q2")];
    expect(activeQuestion(qs, "q1")).toBe("q1");
    expect(stepStatus(qs[0], "q1")).toBe("active");
    // Moving on collapses it as answered.
    expect(stepStatus(qs[0], "q2")).toBe("answered");
  });

  it("never opens a skipped step until it is undone", () => {
    const qs = [q("q1"), q("q2", "", true), q("q3")];
    expect(activeQuestion(qs, "q2")).toBe("q1");
    expect(stepStatus(qs[1], "q1")).toBe("skipped");
  });

  it("is null when every step is answered or skipped", () => {
    expect(activeQuestion([q("q1", "a"), q("q2", "", true)], null)).toBeNull();
  });

  it("advances to the next open step, wrapping around, skipping answered and skipped ones", () => {
    const qs = [q("q1"), q("q2", "", true), q("q3", "done"), q("q4")];
    expect(nextOpenQuestion(qs, "q1")).toBe("q4");
    expect(nextOpenQuestion(qs, "q4")).toBe("q1");
    expect(nextOpenQuestion([q("q1", "a"), q("q2")], "q2")).toBeNull();
    expect(nextOpenQuestion([q("q1")], "q1")).toBeNull();
  });

  it("matches the e2e journey: type in 1, skip 2, undo, skip again, then 3 opens", () => {
    let qs = [q("q1", "Two days in early May"), q("q2"), q("q3")];
    // Skip 2 while 1 is open.
    qs = qs.map((x) => (x.id === "q2" ? { ...x, skipped: true } : x));
    let active = nextOpenQuestion(qs, "q2");
    expect(active).toBe("q3");
    expect(stepStatus(qs[0], active)).toBe("answered");
    // Undo opens 2 again.
    qs = qs.map((x) => (x.id === "q2" ? { ...x, skipped: false } : x));
    active = activeQuestion(qs, "q2");
    expect(active).toBe("q2");
    qs = qs.map((x) => (x.id === "q2" ? { ...x, skipped: true } : x));
    expect(nextOpenQuestion(qs, "q2")).toBe("q3");
  });

  it("summarises answered and skipped steps", () => {
    expect(stepSummary([q("q1", "a"), q("q2", "", true), q("q3"), q("q4", "  ")])).toBe("1 answered, 1 skipped");
  });
});
