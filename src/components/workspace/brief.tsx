"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { PlatformSwitch } from "@/components/ui/segment";
import type { SessionState } from "@/hooks/use-session";
import { IdeaTitle } from "./composer";
import { EngineIndicator } from "./engine-indicator";
import { LengthSegment, RegenerateFor, Settings } from "./settings-row";
import { stepSummary } from "./stepper";
import { TARGET_TIPS } from "./labels";
import { useWorkspace } from "./workspace-context";

const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;

interface AnswerLine {
  id: string;
  question: string;
  answer: string | null;
}

/** What shaped the prompt: answers from this session's steps, or the saved answers of a loaded prompt. */
function answerLines(state: SessionState): { summary: string; lines: AnswerLine[] } | null {
  if (state.phase === "answering" || state.phase === "clarifying") return null;
  if (state.questions.length > 0 && state.versions.length > 0) {
    const lines = state.questions
      .filter((q) => q.skipped || q.answer.trim())
      .map((q) => ({ id: q.id, question: q.question, answer: q.skipped ? null : q.answer.trim() }));
    return lines.length ? { summary: stepSummary(state.questions), lines } : null;
  }
  if (state.answers.length === 0) return null;
  const n = state.answers.length;
  return {
    summary: n === 1 ? "1 answer" : `${n} answers`,
    lines: state.answers.map((a) => ({ id: a.questionId, question: a.question, answer: a.answer })),
  };
}

function AnswerList({ lines }: { lines: AnswerLine[] }) {
  return (
    <dl className="grid gap-[10px]">
      {lines.map((l) => (
        <div key={l.id} className="ih-answer-row">
          <dt>{l.question}</dt>
          <dd>{l.answer ?? "Skipped"}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The brief column at 1200px and up (DIRECTION-C §13): the idea stays a 32px anchor beside the
 * sheet, with both switches and the answers that shaped the prompt.
 */
export function BriefColumn() {
  const { state, keys } = useWorkspace();
  const answers = answerLines(state);
  return (
    <aside className="ih-brief ih-side" aria-label="Your idea and settings">
      <div className="ih-idea-block">
        <span className="ih-idea-piece" aria-hidden>
          Your idea
        </span>
        <IdeaTitle />
      </div>
      <Settings />
      <RegenerateFor />
      {answers && (
        <div className="ih-answers">
          <span className="ih-label-sm">{answers.summary}</span>
          <AnswerList lines={answers.lines} />
        </div>
      )}
      <p className="ih-helper hidden fine:block">
        <Kbd keys={[keys.mod, "K"]} /> runs any command from the keyboard.
      </p>
    </aside>
  );
}

/** Below 1200px, or with history docked: the idea and both switches collapse above the sheet. */
export function BriefCompact() {
  const { state, actions, mobile, enginePlacement } = useWorkspace();
  const [open, setOpen] = useState(false);
  const answers = answerLines(state);
  return (
    <div className="ih-compact">
      <IdeaTitle />
      <div className="ih-compact-controls">
        <PlatformSwitch
          size="sm"
          value={state.target}
          onChange={(target) => actions.dispatch({ type: "setTarget", target })}
          tips={mobile ? undefined : TARGET_TIPS}
        />
        {!mobile && <LengthSegment />}
        {enginePlacement === "brief" && <EngineIndicator placement="inline" />}
      </div>
      <RegenerateFor />
      {answers && (
        <div className="ih-compact-answers">
          <span className="ih-label-sm">{answers.summary}</span>
          <Button variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? "Hide" : "Show"}
          </Button>
          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                className="basis-full overflow-hidden"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: EASE_IN_OUT }}
              >
                <div className="pt-1.5 pb-0.5">
                  <AnswerList lines={answers.lines} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
