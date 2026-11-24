"use client";

import { CornerDownRight, RotateCcw } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { useAutosize } from "@/hooks/use-autosize";
import { useReducedMotion } from "@/hooks/use-media";
import { formatCount } from "@/lib/utils";
import { EngineIndicator } from "./engine-indicator";
import { Settings } from "./settings-row";
import { useWorkspace } from "./workspace-context";

const CAP = 4000;
const EASE = [0.23, 1, 0.32, 1] as const;
export const IDEA_LABEL = "Describe what you want the AI to do";

/** The page-load entrance plays once per page view, not on every New prompt. */
let hasEntered = false;
export function useFirstEntrance(): boolean {
  const [first] = useState(() => !hasEntered);
  useEffect(() => {
    hasEntered = true;
  }, []);
  return first;
}

export const EXAMPLES = [
  "Write a cold email to my landlord about a broken heater",
  "Explain a SQL query to a new analyst",
  "Plan a 3-day trip to Lisbon on a budget",
];

function ideaSize(n: number): "lg" | "md" | "sm" {
  return n > 220 ? "sm" : n > 110 ? "md" : "lg";
}

/**
 * Empty state (DIRECTION-C §13): the intake card with the cobalt "Your idea" piece, the two switches
 * and "Try one". The first thing you touch is the first piece of the build.
 */
export function Composer() {
  const { state, actions, composerRef, keys, generateRef, enginePlacement } = useWorkspace();
  const first = useFirstEntrance();
  const reduced = useReducedMotion();
  useAutosize(composerRef, state.idea);
  const n = state.idea.length;
  const canGenerate = state.idea.trim().length > 0;
  const atCap = n >= CAP;

  return (
    <section className="ih-brief" aria-label="New prompt">
      <motion.form
        className="ih-intake"
        initial={first ? (reduced ? { opacity: 0 } : { opacity: 0, y: 8 }) : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.42, ease: EASE }}
        onSubmit={(e) => {
          e.preventDefault();
          actions.primary();
        }}
      >
        <label htmlFor="composer" className="ih-idea-piece">
          Your idea<span className="ih-sr">: {IDEA_LABEL}</span>
        </label>
        <textarea
          id="composer"
          ref={composerRef}
          className="ih-idea-input"
          data-size={ideaSize(n)}
          rows={1}
          value={state.idea}
          maxLength={CAP}
          spellCheck
          autoComplete="off"
          placeholder={IDEA_LABEL}
          onChange={(e) => actions.dispatch({ type: "setIdea", idea: e.target.value })}
        />
        <div className="ih-intake-foot">
          <span className={atCap ? "ih-helper ih-danger-text" : "ih-helper"} aria-live="polite">
            {atCap ? "Ideas can be up to 4,000 characters." : "Rough is fine. You can refine it after."}
          </span>
          {n > 3500 && (
            <span className={atCap ? "ih-helper ih-counter ih-danger-text" : "ih-helper ih-counter"}>
              {formatCount(n)} / 4,000
            </span>
          )}
          <Button ref={generateRef} type="submit" variant="primary" disabled={!canGenerate}>
            Generate prompt
            <Kbd keys={[keys.mod, keys.enter]} tone={canGenerate ? "on-accent" : "default"} />
          </Button>
        </div>
      </motion.form>

      {enginePlacement === "composer" && (
        <div className="ih-under-intake">
          <EngineIndicator placement="inline" />
        </div>
      )}

      <Settings />

      {!state.idea && (
        <div className="ih-field">
          <h2 className="ih-label-sm">Try one</h2>
          <ul className="ih-examples">
            {EXAMPLES.map((ex) => (
              <li key={ex}>
                <button
                  type="button"
                  className="ih-example w-full"
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
                  <CornerDownRight size={15} aria-hidden />
                  {ex}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * The idea after the first prompt: it stays the anchor (32px, compact 24px, phones 21px) and stays
 * editable in place. Changing it offers "Regenerate from this idea".
 */
export function IdeaTitle() {
  const { state, actions, composerRef } = useWorkspace();
  useAutosize(composerRef, state.idea);
  const g = state.generated;
  const busy = state.phase === "generating" || state.phase === "transforming" || state.phase === "clarifying";
  const changed = !!g && state.versions.length > 0 && state.idea.trim() !== g.idea && state.idea.trim().length > 0;
  const n = state.idea.length;
  const atCap = n >= CAP;

  return (
    <>
      <label htmlFor="composer" className="ih-sr">
        {IDEA_LABEL}
      </label>
      <textarea
        id="composer"
        ref={composerRef}
        className="ih-idea-title"
        rows={1}
        value={state.idea}
        maxLength={CAP}
        spellCheck
        onChange={(e) => actions.dispatch({ type: "setIdea", idea: e.target.value })}
      />
      {(n > 3500 || (changed && !busy)) && (
        <div className="ih-idea-meta">
          {changed && !busy && (
            <Button variant="secondary" size="sm" onClick={actions.regenerate}>
              <RotateCcw size={14} aria-hidden />
              Regenerate from this idea
            </Button>
          )}
          {n > 3500 && (
            <span className={atCap ? "ih-helper ih-danger-text" : "ih-helper"} aria-live="polite">
              {atCap ? "Ideas can be up to 4,000 characters." : `${formatCount(n)} / 4,000`}
            </span>
          )}
        </div>
      )}
    </>
  );
}
