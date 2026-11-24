import type { QuestionItem } from "@/hooks/use-session";

/**
 * The guided question stepper (DIRECTION-C §8). One question is open at a time; typing into it
 * answers it. These helpers decide which step is open and where to go next, so the component,
 * the Alt+S shortcut and the tests agree.
 */

export type StepStatus = "answered" | "skipped" | "active" | "open";

const hasAnswer = (q: QuestionItem) => !q.skipped && q.answer.trim().length > 0;
const isOpen = (q: QuestionItem) => !q.skipped && q.answer.trim().length === 0;

/**
 * The open step: the one the user picked, if it can still take an answer (not skipped), otherwise
 * the first step with no answer yet. Null when every step is answered or skipped.
 */
export function activeQuestion(questions: QuestionItem[], chosen: string | null): string | null {
  if (chosen !== null) {
    const q = questions.find((x) => x.id === chosen);
    if (q && !q.skipped) return q.id;
  }
  return questions.find(isOpen)?.id ?? null;
}

/** The next step without an answer after `fromId`, wrapping around; null when none is left. */
export function nextOpenQuestion(questions: QuestionItem[], fromId: string): string | null {
  const i = questions.findIndex((q) => q.id === fromId);
  const n = questions.length;
  for (let k = 1; k <= n; k++) {
    const q = questions[(Math.max(0, i) + k) % n];
    if (q.id !== fromId && isOpen(q)) return q.id;
  }
  return null;
}

export function stepStatus(q: QuestionItem, active: string | null): StepStatus {
  if (q.skipped) return "skipped";
  if (q.id === active) return "active";
  return hasAnswer(q) ? "answered" : "open";
}

/** "1 answered, 1 skipped". */
export function stepSummary(questions: QuestionItem[]): string {
  const answered = questions.filter(hasAnswer).length;
  const skipped = questions.filter((q) => q.skipped).length;
  return `${answered} answered, ${skipped} skipped`;
}
