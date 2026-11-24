"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAutosize } from "@/hooks/use-autosize";
import { useReducedMotion } from "@/hooks/use-media";
import { parseBlocks, withBody, type Block } from "./blocks";
import { useEditCommit } from "./editor";
import { ARRIVALS, GHOST_BLOCKS, PIECE_SPRING } from "./plate";
import { useWorkspace } from "./workspace-context";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
/** A piece has landed this long after its drop starts; the build settles this long after the last. */
const LAND_MS = 220;
const SETTLE_MS = 550;

export interface BuildProgress {
  placed: number;
  total: number;
  /** Every piece of this build has landed (and the stream is over). */
  done: boolean;
}

/**
 * One build: which pieces were already on screen when it started (they update in place), which are
 * new (they drop in, in arrival order), how many have landed, and whether it has settled.
 */
interface Build {
  id: number;
  baseline: string[];
  order: string[];
  /** First piece of the latest batch to mount; delays inside a batch count from it. */
  base: number;
  landed: number;
  settled: boolean;
}

/** Seconds after its batch mounts that piece `k` starts its drop. */
export function dropDelay(k: number, base: number, reduced: boolean): number {
  if (reduced || k < base) return 0;
  return (ARRIVALS[k] ?? ARRIVALS[ARRIVALS.length - 1]) - (ARRIVALS[base] ?? ARRIVALS[ARRIVALS.length - 1]);
}

/**
 * Block view (DIRECTION-C §6, §9). Each top-level section is a piece (label and exact syntax) with
 * its body beside it. The parser runs on the streamed text too, so during a build each piece drops
 * in as its heading arrives: gaps shrink (0, 140, 250, 340, 410 ms…), a spring settles each piece
 * and its text wipes in behind it. Reduced motion: the pieces fade in together.
 */
export function BlockEditor({
  text,
  readOnly,
  streaming,
  buildId,
  onProgress,
}: {
  text: string;
  readOnly: boolean;
  streaming: boolean;
  /** Changes when a generate or regenerate stream starts. */
  buildId: number;
  onProgress: (p: BuildProgress) => void;
}) {
  const reduced = useReducedMotion();
  const { change, blur } = useEditCommit();

  // While a body is being edited the structure is frozen, so typing "## " in a body can't re-key the
  // piece under the caret. It re-parses on blur, or when the text changes from outside.
  const [frozen, setFrozen] = useState<{ text: string; blocks: Block[] } | null>(null);
  const parsed = useMemo(() => parseBlocks(text, { partial: streaming }), [text, streaming]);
  const blocks = frozen && frozen.text === text ? frozen.blocks : parsed;
  const keys = blocks.map((b) => b.key);

  // Build bookkeeping, as state adjusted during render (React's "derived state" pattern): the drop
  // delay must be known on the render that mounts a piece.
  const [build, setBuild] = useState<Build>(() => ({
    id: buildId,
    baseline: keys,
    order: [],
    base: 0,
    landed: 0,
    settled: !streaming,
  }));
  let b = build;
  if (b.id !== buildId) {
    b = { id: buildId, baseline: keys, order: [], base: 0, landed: 0, settled: false };
    setBuild(b);
  } else if (!b.settled) {
    const fresh = keys.filter((k) => !b.baseline.includes(k) && !b.order.includes(k));
    if (fresh.length) {
      // Pieces from an earlier batch have had their moment; count them as placed.
      b = { ...b, order: [...b.order, ...fresh], base: b.order.length, landed: Math.max(b.landed, b.order.length) };
      setBuild(b);
    }
  }

  // Each new piece lands LAND_MS after its drop starts.
  useEffect(() => {
    if (build.settled) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let k = build.base; k < build.order.length; k++) {
      const ms = dropDelay(k, build.base, reduced) * 1000 + (reduced ? 200 : LAND_MS);
      timers.push(
        setTimeout(
          () => setBuild((prev) => (prev.id === build.id ? { ...prev, landed: Math.max(prev.landed, k + 1) } : prev)),
          ms,
        ),
      );
    }
    return () => timers.forEach(clearTimeout);
  }, [build.id, build.base, build.order.length, build.settled, reduced]);

  // Once the stream is over and every piece has landed, the build settles and the toolbar arrives.
  const allLanded = build.landed >= build.order.length;
  useEffect(() => {
    if (build.settled || streaming || !allLanded) return;
    const t = setTimeout(
      () => setBuild((prev) => (prev.id === build.id ? { ...prev, settled: true } : prev)),
      build.order.length && !reduced ? SETTLE_MS : 0,
    );
    return () => clearTimeout(t);
  }, [build.id, build.settled, build.order.length, streaming, allLanded, reduced]);

  const total = blocks.length;
  const placed = Math.max(0, total - (b.order.length - b.landed));
  const done = b.settled;
  useEffect(() => {
    onProgress({ placed, total, done });
  }, [onProgress, placed, total, done]);

  const building = !done;
  if (blocks.length === 0) return <Slots />;

  return (
    <div className="ih-blocks" aria-busy={streaming || undefined}>
      <AnimatePresence initial={false} mode="popLayout">
        {blocks.map((blk, i) => {
          const k = b.order.indexOf(blk.key);
          const delay = k === -1 || done ? null : dropDelay(k, b.base, reduced);
          return (
            <motion.div
              key={blk.key}
              className="ih-block"
              data-kind={blk.kind}
              style={{ zIndex: 40 - i }}
              layout={reduced || building ? false : "position"}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              transition={{ layout: { type: "spring", duration: 0.4, bounce: 0.15 } }}
            >
              <motion.div
                className="ih-piece"
                data-piece
                initial={delay === null ? false : reduced ? { opacity: 0 } : { opacity: 0, y: -18, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={
                  reduced
                    ? { duration: 0.2 }
                    : {
                        y: { ...PIECE_SPRING, delay: delay ?? 0 },
                        scale: { ...PIECE_SPRING, delay: delay ?? 0 },
                        opacity: { duration: 0.12, delay: delay ?? 0 },
                      }
                }
              >
                <span className="ih-piece-label">{blk.label}</span>
                <span className="ih-piece-syntax">{blk.syntax}</span>
              </motion.div>
              <motion.div
                className="ih-block-body"
                initial={
                  delay === null ? false : reduced ? { opacity: 0 } : { clipPath: "inset(0 100% 0 0)", opacity: 0.4 }
                }
                animate={reduced ? { opacity: 1 } : { clipPath: "inset(0 0% 0 0)", opacity: 1 }}
                transition={{ duration: reduced ? 0.2 : 0.42, ease: EASE_OUT, delay: reduced ? 0 : (delay ?? 0) + 0.1 }}
              >
                {streaming || readOnly ? (
                  <div className="ih-block-text">
                    {blk.body}
                    {streaming && i === blocks.length - 1 && <span className="ih-caret" aria-hidden />}
                  </div>
                ) : (
                  <BlockText
                    value={blk.body}
                    label={`${blk.label} block`}
                    onFocus={() => setFrozen({ text, blocks })}
                    onBlur={() => {
                      setFrozen(null);
                      blur();
                    }}
                    onChange={(body) => {
                      const next = withBody(blocks, i, body);
                      setFrozen({ text: next.text, blocks: next.blocks });
                      change(next.text);
                    }}
                  />
                )}
              </motion.div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function BlockText({
  value,
  label,
  onChange,
  onFocus,
  onBlur,
}: {
  value: string;
  label: string;
  onChange: (v: string) => void;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useAutosize(ref, value);
  return (
    <textarea
      ref={ref}
      className="ih-block-text"
      aria-label={label}
      value={value}
      rows={1}
      spellCheck
      onChange={(e) => onChange(e.target.value)}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  );
}

/** Before the first piece arrives: the plate's outline, so the sheet is full height from the start. */
function Slots() {
  const { writtenFor } = useWorkspace();
  return (
    <div className="ih-blocks ih-slots" aria-hidden>
      {GHOST_BLOCKS.map((g) => (
        <div key={g.label} className="ih-block">
          <div className="ih-piece">
            <span className="ih-piece-label">{g.label}</span>
            <span className="ih-piece-syntax">{g.syntax[writtenFor]}</span>
          </div>
          <div className="ih-block-body" />
        </div>
      ))}
    </div>
  );
}

