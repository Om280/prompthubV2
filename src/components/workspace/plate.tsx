"use client";

import { RotateCcw } from "lucide-react";
import { motion } from "motion/react";
import { TARGET_LABELS, type ApiErrorCode, type TargetPlatform } from "@/lib/contracts";
import { Button } from "@/components/ui/button";
import { useReducedMotion } from "@/hooks/use-media";
import { useFirstEntrance } from "./composer";
import { useWorkspace } from "./workspace-context";

/** Arrival gaps shrink as the build goes on: the first piece lands alone, the rest follow as one wave. */
export const ARRIVALS = [0, 0.14, 0.25, 0.34, 0.41, 0.47, 0.52, 0.56, 0.59, 0.61];
export const PIECE_SPRING = { type: "spring", duration: 0.42, bounce: 0.32 } as const;

/** What each piece is for, shown on the empty build plate before anything is written. */
export const GHOST_BLOCKS: { label: string; hint: string; syntax: Record<TargetPlatform, string> }[] = [
  {
    label: "Role and task",
    hint: "Who the AI should be and what it should do",
    syntax: { chatgpt: "Plain paragraph", claude: "Plain paragraph", gemini: "Plain paragraph" },
  },
  {
    label: "Context",
    hint: "The facts it needs to know",
    syntax: { chatgpt: "## Context", claude: "<context>", gemini: "## Context" },
  },
  {
    label: "Requirements",
    hint: "What the answer has to include",
    syntax: { chatgpt: "## Requirements", claude: "<requirements>", gemini: "## Must include" },
  },
  {
    label: "Constraints",
    hint: "Limits to stay within",
    syntax: { chatgpt: "## Constraints", claude: "<constraints>", gemini: "## Constraints" },
  },
  {
    label: "Output",
    hint: "Shape and length of the answer",
    syntax: { chatgpt: "## Output", claude: "<output_format>", gemini: "## Output" },
  },
];

/**
 * The empty build plate (DIRECTION-C §13): the five pieces the prompt will fill, tinted for the
 * chosen platform. On the first load of a visit the pieces snap together once; after that, still.
 */
export function GhostPlate() {
  const { state } = useWorkspace();
  const first = useFirstEntrance();
  const reduced = useReducedMotion();
  return (
    <section className="ih-sheet ih-ghost" aria-labelledby="plate-title" data-platform={state.target}>
      <div className="ih-sheet-body">
        <div className="ih-ghost-intro">
          <h2 id="plate-title" className="ih-sheet-title">
            Your prompt is built from blocks
          </h2>
          <p>
            Each part of the prompt gets its own labelled block, written the way {TARGET_LABELS[state.target]} reads
            best. You can edit any block, then copy the whole thing.
          </p>
        </div>
        <ul className="ih-blocks">
          {GHOST_BLOCKS.map((g, i) => (
            <li key={g.label} className="ih-block" style={{ zIndex: 10 - i }}>
              <motion.div
                className="ih-piece"
                initial={first ? (reduced ? { opacity: 0 } : { opacity: 0, y: -18, scale: 0.97 }) : false}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={
                  reduced
                    ? { duration: 0.2 }
                    : {
                        y: { ...PIECE_SPRING, delay: 0.16 + ARRIVALS[i] },
                        scale: { ...PIECE_SPRING, delay: 0.16 + ARRIVALS[i] },
                        opacity: { duration: 0.12, delay: 0.16 + ARRIVALS[i] },
                      }
                }
              >
                <span className="ih-piece-label">{g.label}</span>
                <span className="ih-piece-syntax">{g.syntax[state.target]}</span>
              </motion.div>
              <div className="ih-block-body">{g.hint}</div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** `ai_required` can't succeed on retry; the action needs a provider first. */
export const canRetry = (code?: ApiErrorCode) => code !== "ai_required";

/** Nothing was written yet and the request failed: say what happened and offer the retry. */
export function ErrorSheet() {
  const { state, actions } = useWorkspace();
  if (state.phase !== "error" || !state.error || state.versions.length > 0) return null;
  const retry = canRetry(state.error.code);
  return (
    <section className="ih-sheet" aria-labelledby="error-title">
      <div className="ih-sheet-head">
        <h2 id="error-title" className="ih-sheet-title">
          {state.error.retry === "clarify" ? "Questions didn't load" : "The prompt wasn't written"}
        </h2>
      </div>
      <div className="ih-sheet-body">
        <div className="ih-strip" data-tone="danger" role="alert">
          <span>{state.error.message}</span>
        </div>
        {retry && (
          <Button variant="primary" onClick={actions.retry}>
            <RotateCcw size={15} aria-hidden />
            Try again
          </Button>
        )}
      </div>
    </section>
  );
}
