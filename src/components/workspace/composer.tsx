"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { useAutosize } from "@/hooks/use-autosize";
import { cn, formatCount } from "@/lib/utils";
import { useWorkspace } from "./workspace-context";

const CAP = 4000;
const EASE = [0.23, 1, 0.32, 1] as const;

/** The page-load entrance (§7 #1) plays once per page view, not on every New prompt. */
let hasEntered = false;

/** Fades the settings row in with the composer on first load. */
export function EntranceFade({ children }: { children: ReactNode }) {
  const [firstLoad] = useState(() => !hasEntered);
  return (
    <motion.div
      initial={firstLoad ? { opacity: 0, y: 6 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

export const EXAMPLES = [
  "Write a cold email to my landlord about a broken heater",
  "Explain a SQL query to a new analyst",
  "Plan a 3-day trip to Lisbon on a budget",
];

/**
 * The idea is the headline (DESIGN §1, §6.1): display type while empty, then a compact
 * editable title once a prompt exists.
 */
export function Composer() {
  const { state } = useWorkspace();
  const display = state.phase === "idle";
  return (
    <AnimatePresence mode="wait" initial={false}>
      {display ? (
        <motion.div
          key="display"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.18, ease: EASE } }}
          exit={{ opacity: 0, filter: "blur(2px)", transition: { duration: 0.12, ease: EASE } }}
        >
          <DisplayComposer />
        </motion.div>
      ) : (
        <motion.div
          key="title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.18, ease: EASE } }}
          exit={{ opacity: 0, transition: { duration: 0.12, ease: EASE } }}
        >
          <TitleComposer />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DisplayComposer() {
  const { state, actions, composerRef, keys, generateRef } = useWorkspace();
  const [firstLoad] = useState(() => !hasEntered);
  useEffect(() => {
    hasEntered = true;
  }, []);
  useAutosize(composerRef, state.idea);
  const n = state.idea.length;
  const size = n > 180 ? "type-display-sm" : n > 90 ? "type-display-md" : "type-display";
  const canGenerate = state.idea.trim().length > 0;
  const atCap = n >= CAP;

  return (
    <div>
      <motion.div
        initial={firstLoad ? { opacity: 0, y: 6 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.42, ease: EASE }}
      >
        <label htmlFor="composer" className="sr-only">
          Describe what you want the AI to do
        </label>
        <div className="border-b border-border pb-4 transition-colors focus-within:border-border-control">
          <textarea
            id="composer"
            ref={composerRef}
            rows={1}
            value={state.idea}
            maxLength={CAP}
            spellCheck
            autoComplete="off"
            placeholder="Describe what you want the AI to do"
            onChange={(e) => actions.dispatch({ type: "setIdea", idea: e.target.value })}
            className={cn("block w-full resize-none overflow-hidden bg-transparent text-fg-strong", size)}
          />
        </div>
        <div className="mt-3 flex min-h-9 items-center gap-4">
          <p className={cn("min-w-0 flex-1 type-meta", atCap ? "text-danger" : "text-fg-subtle")} aria-live="polite">
            {atCap ? "Ideas can be up to 4,000 characters." : "Rough is fine. You can refine it after."}
          </p>
          {n > 3500 && (
            <span className={cn("shrink-0 type-meta tabular-nums", atCap ? "text-danger" : "text-fg-subtle")}>
              {formatCount(n)} / 4,000
            </span>
          )}
          <Button
            ref={generateRef}
            variant="primary"
            className="hidden sm:inline-flex"
            disabled={!canGenerate}
            onClick={() => actions.primary()}
          >
            Generate prompt
            <Kbd keys={[keys.mod, keys.enter]} tone="on-accent" className="ml-1" />
          </Button>
        </div>
      </motion.div>

      {!state.idea && (
        <motion.div
          className="mt-12"
          initial={firstLoad ? { opacity: 0, y: 6 } : { opacity: 0 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: firstLoad ? 0.42 : 0.18, ease: EASE, delay: firstLoad ? 0.08 : 0 }}
        >
          <h2 className="type-meta text-fg-subtle">Try one</h2>
          <ul className="mt-2 flex flex-col items-start">
            {EXAMPLES.map((ex) => (
              <li key={ex}>
                <button
                  type="button"
                  className="press -mx-1 rounded-xs px-1 py-1.5 text-left text-[15px] leading-[22px] text-fg-muted hover:text-fg coarse:py-2.5"
                  onClick={() => {
                    actions.dispatch({ type: "setIdea", idea: ex });
                    requestAnimationFrame(() => {
                      const el = composerRef.current;
                      if (!el) return;
                      el.focus();
                      el.setSelectionRange(ex.length, ex.length);
                    });
                  }}
                >
                  {ex}
                </button>
              </li>
            ))}
          </ul>
        </motion.div>
      )}
    </div>
  );
}

function TitleComposer() {
  const { state, actions, composerRef } = useWorkspace();
  useAutosize(composerRef, state.idea);
  const g = state.generated;
  const changed = !!g && state.versions.length > 0 && state.idea.trim() !== g.idea && state.idea.trim().length > 0;
  const busy = state.phase === "generating" || state.phase === "transforming" || state.phase === "clarifying";
  const wrap = useRef<HTMLDivElement>(null);
  const n = state.idea.length;
  const atCap = n >= CAP;

  return (
    <div ref={wrap}>
      <label htmlFor="composer" className="sr-only">
        Describe what you want the AI to do
      </label>
      <textarea
        id="composer"
        ref={composerRef}
        rows={1}
        value={state.idea}
        maxLength={CAP}
        spellCheck
        onChange={(e) => actions.dispatch({ type: "setIdea", idea: e.target.value })}
        className="field-title block w-full resize-none overflow-hidden bg-transparent pb-1 type-title text-fg-strong"
      />
      {(n > 3500 || (changed && !busy)) && (
        <div className="mt-1 flex min-h-7 items-center gap-4">
          {changed && !busy && (
            <Button variant="accent" className="-ml-1" onClick={actions.regenerate}>
              Regenerate from this idea
            </Button>
          )}
          {n > 3500 && (
            <span
              className={cn("ml-auto shrink-0 type-meta tabular-nums", atCap ? "text-danger" : "text-fg-subtle")}
              aria-live="polite"
            >
              {atCap ? "Ideas can be up to 4,000 characters." : `${formatCount(n)} / 4,000`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
