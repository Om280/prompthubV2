"use client";

import { Check } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { useAutosize } from "@/hooks/use-autosize";
import { useReducedMotion } from "@/hooks/use-media";
import type { QuestionItem } from "@/hooks/use-session";
import { activeQuestion, nextOpenQuestion, stepStatus, stepSummary, type StepStatus } from "./stepper";
import { useWorkspace } from "./workspace-context";

export function answerFieldId(id: string) {
  return `answer-${id}`;
}

/** Focus the answer field of a step once it has rendered open. */
export function focusAnswer(id: string) {
  requestAnimationFrame(() => document.getElementById(answerFieldId(id))?.focus());
}

/**
 * Follow-up questions as a short guided stepper (DIRECTION-C §8): one sheet, a segmented progress
 * bar, numbered steps (they are a real sequence). The open step takes typing or a chip; answered
 * steps collapse to the answer with "Change", skipped ones say "Skipped" with "Undo".
 */
export function Questions() {
  const { state, actions, keys, generateRef, activeQuestion: chosen, setActiveQuestion } = useWorkspace();
  const qs = state.questions;
  const active = activeQuestion(qs, chosen);

  // Focus starts in the first field (not on touch, where the keyboard would cover the questions).
  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const first = activeQuestion(qs, null);
    if (first) focusAnswer(first);
    // Only when the questions first arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Move on from a step: to the next one without an answer, or to Generate when none is left. */
  const advanceFrom = (id: string) => {
    const next = nextOpenQuestion(actions.getState().questions, id);
    setActiveQuestion(next);
    if (next) focusAnswer(next);
    else requestAnimationFrame(() => generateRef.current?.focus());
  };

  const open = (id: string) => {
    setActiveQuestion(id);
    focusAnswer(id);
  };

  return (
    <section className="ih-sheet" aria-labelledby="questions-title">
      <div className="ih-qhead">
        <div className="ih-qhead-top">
          <h2 id="questions-title" className="ih-sheet-title">
            {qs.length === 1 ? "1 question to sharpen the prompt" : `${qs.length} questions to sharpen the prompt`}
          </h2>
          <Button size="sm" onClick={actions.skipAll}>
            Skip all
          </Button>
        </div>
        <div className="ih-progress" aria-hidden>
          {qs.map((q) => (
            <span key={q.id} className="ih-progress-seg" data-s={stepStatus(q, active)} />
          ))}
        </div>
      </div>

      <ol className="ih-steps">
        {qs.map((q, i) => (
          <Step
            key={q.id}
            q={q}
            index={i}
            total={qs.length}
            status={stepStatus(q, active)}
            onOpen={() => open(q.id)}
            onAnswer={(text) => actions.dispatch({ type: "answer", id: q.id, text })}
            onAdvance={() => advanceFrom(q.id)}
            onSkip={() => {
              actions.dispatch({ type: "skip", id: q.id });
              advanceFrom(q.id);
            }}
            onUnskip={() => {
              actions.dispatch({ type: "unskip", id: q.id });
              open(q.id);
            }}
          />
        ))}
      </ol>

      <div className="ih-qfoot">
        <Button ref={generateRef} variant="primary" onClick={actions.primary}>
          Generate prompt
          <Kbd keys={[keys.mod, keys.enter]} tone="on-accent" />
        </Button>
        <p className="ih-count" aria-live="polite">
          {stepSummary(qs)}
        </p>
      </div>
    </section>
  );
}

interface StepProps {
  q: QuestionItem;
  index: number;
  total: number;
  status: StepStatus;
  onOpen: () => void;
  onAnswer: (text: string) => void;
  onAdvance: () => void;
  onSkip: () => void;
  onUnskip: () => void;
}

function Step(props: StepProps) {
  const { q, index, status, onOpen, onSkip, onUnskip } = props;
  const qid = `question-${q.id}`;
  const common = { "data-question-id": q.id, "data-question-text": q.question, "data-s": status };

  if (status === "active") {
    return (
      <li className="ih-step" {...common}>
        <ActiveStep {...props} qid={qid} />
      </li>
    );
  }

  return (
    <li className="ih-step" {...common}>
      <span className="ih-step-num">
        {status === "answered" ? <Check size={15} strokeWidth={2.75} aria-label="Answered" /> : index + 1}
      </span>
      <div className="min-w-0">
        <p id={qid} className="ih-step-q">
          {q.question}
        </p>
        {status === "answered" && <p className="ih-step-a">{q.answer.trim()}</p>}
        {status === "skipped" && <p className="ih-step-skipped">Skipped</p>}
      </div>
      <div className="ih-step-actions">
        {status === "answered" && (
          <Button size="sm" onClick={onOpen} aria-describedby={qid}>
            Change
          </Button>
        )}
        {status === "skipped" && (
          <Button size="sm" onClick={onUnskip} aria-describedby={qid}>
            Undo
          </Button>
        )}
        {status === "open" && (
          <>
            <Button size="sm" onClick={onOpen} aria-describedby={qid}>
              Answer
            </Button>
            <Button size="sm" onClick={onSkip} aria-describedby={qid}>
              Skip
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

function ActiveStep({ q, index, total, qid, onAnswer, onAdvance, onSkip }: StepProps & { qid: string }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLTextAreaElement>(null);
  const chipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useAutosize(ref, q.answer, 4);
  useEffect(
    () => () => {
      if (chipTimer.current) clearTimeout(chipTimer.current);
    },
    [],
  );
  const hasAnswer = q.answer.trim().length > 0;

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      onAdvance();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (q.answer) onAnswer("");
      else onSkip();
    }
  };

  return (
    <>
      <span className="ih-step-num">{index + 1}</span>
      <h3 className="ih-step-active-q" id={qid}>
        {q.question}
        {q.why && <span className="ih-step-why block">{q.why}</span>}
      </h3>
      <span className="ih-step-count" aria-hidden>
        {index + 1} of {total}
      </span>
      <motion.div
        className="ih-step-body"
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
      >
        <textarea
          ref={ref}
          id={answerFieldId(q.id)}
          className="ih-answer-input"
          rows={1}
          value={q.answer}
          maxLength={1000}
          aria-labelledby={qid}
          placeholder="Type an answer or pick one"
          enterKeyHint="next"
          onChange={(e) => onAnswer(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {q.suggestions.length > 0 && (
          <div className="ih-chips" role="group" aria-label="Suggested answers">
            {q.suggestions.slice(0, 4).map((s) => (
              <button
                key={s}
                type="button"
                data-chip
                className="ih-chip"
                aria-pressed={q.answer.trim() === s}
                onClick={() => {
                  onAnswer(s);
                  // The chosen chip shows its selected state for a beat, then the next step opens.
                  if (chipTimer.current) clearTimeout(chipTimer.current);
                  chipTimer.current = setTimeout(onAdvance, reduced ? 0 : 180);
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="ih-step-actions">
          <Button variant="secondary" size="sm" disabled={!hasAnswer} onClick={onAdvance}>
            Save answer
          </Button>
          <Button size="sm" onClick={onSkip}>
            Skip
          </Button>
        </div>
      </motion.div>
    </>
  );
}

/** Loading state while questions are found. */
export function ClarifyingSheet() {
  const { state, actions } = useWorkspace();
  return (
    <section className="ih-sheet" aria-busy="true" aria-labelledby="clarify-status">
      <div className="ih-sheet-head">
        <div className="ih-status" id="clarify-status" role="status">
          <span className="ih-pulse" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span>{state.slow ? "Still working. Taking longer than usual." : "Finding what matters"}</span>
        </div>
        <div className="ih-sheet-head-right">
          <Button variant="secondary" size="sm" onClick={() => actions.stop()}>
            Stop
            <Kbd keys={["Esc"]} />
          </Button>
        </div>
      </div>
      <div aria-hidden>
        {[72, 54, 64].map((w, i) => (
          <div key={i} className="ih-step" data-s="open">
            <span className="ih-step-num">{i + 1}</span>
            <span className="ih-skel h-[14px]" style={{ width: `${w}%` }} />
            <span className="ih-skel h-[28px] w-[64px]" />
          </div>
        ))}
      </div>
      <div className="ih-qfoot" aria-hidden>
        <span className="ih-skel h-[38px] w-[170px]" />
      </div>
    </section>
  );
}
