"use client";

import { Check } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { useAutosize } from "@/hooks/use-autosize";
import type { QuestionItem } from "@/hooks/use-session";
import { cn } from "@/lib/utils";
import { useWorkspace } from "./workspace-context";

const EASE = [0.23, 1, 0.32, 1] as const;
const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;
const STAGGER = [0, 0.045, 0.08, 0.11];

function fieldId(id: string) {
  return `answer-${id}`;
}

/** Follow-up questions (DESIGN §6.4). */
export function Questions() {
  const { state, actions, keys, generateRef } = useWorkspace();
  const qs = state.questions;
  const answered = qs.filter((q) => !q.skipped && q.answer.trim()).length;
  const skipped = qs.filter((q) => q.skipped).length;

  // Focus starts in the first field (not on touch, where the keyboard would cover the questions).
  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const first = qs.find((q) => !q.skipped);
    if (first) document.getElementById(fieldId(first.id))?.focus();
    // Only when the questions first arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const focusAfter = (id: string) => {
    const idx = qs.findIndex((q) => q.id === id);
    const next = qs.slice(idx + 1).find((q) => !q.skipped);
    if (next) document.getElementById(fieldId(next.id))?.focus();
    else generateRef.current?.focus();
  };

  return (
    <section aria-labelledby="questions-intro">
      <div className="flex items-center justify-between gap-4">
        <h2 id="questions-intro" className="type-ui text-fg-muted">
          {qs.length === 1 ? "1 question to sharpen the prompt" : `${qs.length} questions to sharpen the prompt`}
        </h2>
        <Button variant="text" className="-mr-1" onClick={actions.skipAll}>
          Skip all
        </Button>
      </div>

      <div className="mt-6 flex flex-col gap-8">
        {qs.map((q, i) => (
          <motion.div
            key={q.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.26, ease: EASE, delay: STAGGER[i] ?? 0.11 }}
          >
            <QuestionBlock q={q} onAdvance={() => focusAfter(q.id)} />
          </motion.div>
        ))}
      </div>

      <div className="mt-10 flex items-center gap-4">
        <Button ref={generateRef} variant="primary" className="hidden sm:inline-flex" onClick={actions.primary}>
          Generate prompt
          <Kbd keys={[keys.mod, keys.enter]} tone="on-accent" className="ml-1" />
        </Button>
        <p className="type-meta text-fg-subtle" aria-live="polite">
          {answered} answered, {skipped} skipped
        </p>
      </div>
    </section>
  );
}

function QuestionBlock({ q, onAdvance }: { q: QuestionItem; onAdvance: () => void }) {
  const { actions } = useWorkspace();
  const ref = useRef<HTMLTextAreaElement>(null);
  useAutosize(ref, q.answer, 3);
  const answered = !q.skipped && q.answer.trim().length > 0;
  const qid = `question-${q.id}`;

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      onAdvance();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (q.answer) actions.dispatch({ type: "answer", id: q.id, text: "" });
      else skip();
    }
  };

  const skip = () => {
    actions.dispatch({ type: "skip", id: q.id });
    onAdvance();
  };

  const undo = () => {
    actions.dispatch({ type: "unskip", id: q.id });
    requestAnimationFrame(() => document.getElementById(fieldId(q.id))?.focus());
  };

  return (
    <div data-question-id={q.id}>
      <div className="flex items-start justify-between gap-4">
        <p
          id={qid}
          className={cn("type-question transition-colors duration-150", q.skipped ? "text-fg-subtle" : "text-fg")}
        >
          {q.question}
        </p>
        <div className="flex h-[26px] shrink-0 items-center gap-2">
          {q.skipped ? (
            <motion.span
              className="flex items-center gap-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.12, ease: EASE }}
            >
              <span className="type-meta text-fg-subtle">Skipped</span>
              <Button variant="text" onClick={undo} aria-describedby={qid}>
                Undo
              </Button>
            </motion.span>
          ) : answered ? (
            <>
              <Check className="size-3 text-fg-subtle" aria-hidden />
              <Button
                variant="subtle"
                onClick={() => actions.dispatch({ type: "answer", id: q.id, text: "" })}
                aria-describedby={qid}
              >
                Clear
              </Button>
            </>
          ) : (
            <Button variant="subtle" onClick={skip} aria-describedby={qid}>
              Skip
            </Button>
          )}
        </div>
      </div>
      {q.why && !q.skipped && <p className="mt-0.5 type-meta text-fg-subtle">{q.why}</p>}

      <AnimatePresence initial={false}>
        {!q.skipped && (
          <motion.div
            key="body"
            // -mx-2/px-2: keeps chip borders and glyph overhangs inside the collapse clip.
            className="-mx-2 overflow-hidden px-2"
            initial={{ height: 0, opacity: 0 }}
            animate={{
              height: "auto",
              opacity: 1,
              transition: { height: { duration: 0.2, ease: EASE_IN_OUT }, opacity: { duration: 0.2, ease: EASE } },
            }}
            exit={{
              height: 0,
              opacity: 0,
              transition: { height: { duration: 0.2, ease: EASE_IN_OUT }, opacity: { duration: 0.12, ease: EASE } },
            }}
          >
            <div className="field-line mt-2">
              <textarea
                ref={ref}
                id={fieldId(q.id)}
                rows={1}
                value={q.answer}
                maxLength={1000}
                aria-labelledby={qid}
                placeholder="Type an answer or pick one"
                onChange={(e) => actions.dispatch({ type: "answer", id: q.id, text: e.target.value })}
                onKeyDown={onKeyDown}
                className="block w-full resize-none overflow-hidden bg-transparent pb-2 pt-1 type-input text-fg"
              />
            </div>
            {q.suggestions.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 pb-0.5 pl-px">
                {q.suggestions.slice(0, 3).map((s) => {
                  const selected = q.answer.trim() === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        actions.dispatch({ type: "answer", id: q.id, text: s });
                        onAdvance();
                      }}
                      className={cn(
                        "press h-8 rounded-sm px-3 type-ui hover:bg-surface-2 coarse:h-10",
                        selected
                          ? "text-fg-strong shadow-[inset_0_0_0_1px_var(--color-accent)]"
                          : "text-fg shadow-[inset_0_0_0_1px_var(--color-border-control)]",
                      )}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Loading state while questions are being found (DESIGN §6.11). */
export function ClarifyingSkeleton() {
  const { state } = useWorkspace();
  return (
    <section aria-busy="true" aria-live="polite">
      <p className="type-meta text-fg-subtle">
        {state.slow ? "Still working. Taking longer than usual." : "Finding what matters"}
      </p>
      <div className="mt-6 flex flex-col gap-8" aria-hidden>
        {[72, 54, 64].map((w, i) => (
          <div key={i}>
            <div className="h-[18px] rounded-xs bg-surface-2" style={{ width: `${w}%` }} />
            <div className="mt-5 h-px bg-surface-2" />
            <div className="mt-4 flex gap-2">
              <div className="h-8 w-28 rounded-xs bg-surface-2" />
              <div className="h-8 w-24 rounded-xs bg-surface-2" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** "{n} answers  Show" summary after generation (DESIGN §6.4, §8). */
export function AnswersSummary({
  open,
  onToggle,
  right,
}: {
  open: boolean;
  onToggle: () => void;
  /** Right-aligned on the same line (the version switcher on desktop). */
  right?: ReactNode;
}) {
  const { state } = useWorkspace();
  const n = state.answers.length;
  return (
    <div>
      <div className="flex min-h-7 items-center gap-3">
        {n > 0 && (
          <>
            <span className="type-meta text-fg-subtle">{n === 1 ? "1 answer" : `${n} answers`}</span>
            <Button variant="text" className="type-meta" aria-expanded={open} onClick={onToggle}>
              {open ? "Hide" : "Show"}
            </Button>
          </>
        )}
        <div className="ml-auto">{right}</div>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.dl
            className="-mx-2 overflow-hidden px-2"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE_IN_OUT }}
          >
            <div className="flex flex-col gap-3 pb-1 pt-2">
              {state.answers.map((a) => (
                <div key={a.questionId}>
                  <dt className="type-meta text-fg-subtle">{a.question}</dt>
                  <dd className="type-input text-fg">{a.answer}</dd>
                </div>
              ))}
            </div>
          </motion.dl>
        )}
      </AnimatePresence>
    </div>
  );
}
