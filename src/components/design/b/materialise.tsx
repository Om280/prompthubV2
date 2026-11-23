"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import s from "./styles";

const EASE = [0.23, 1, 0.32, 1] as const;

/**
 * The generation moment. The whole prompt's shape appears first as bars of platform light (you see
 * its structure before its words), then each line resolves top to bottom: blur 6px to 0, a 3px rise
 * and a flare that sweeps out along the line. Transform, opacity and filter only.
 *
 * Basic Mode returns instantly, so the reveal is presentation, capped at ~1.3s. `loop` replays it for
 * the preview's "generating" state. Reduced motion: no reveal, the text is simply there.
 */
export function Materialise({ text, loop = false, onDone }: { text: string; loop?: boolean; onDone?: () => void }) {
  const reduce = useReducedMotion();
  const lines = useMemo(() => text.split("\n"), [text]);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (reduce) {
      timer = setTimeout(() => {
        setShown(lines.length);
        if (!loop) onDone?.();
      }, 0);
      return () => clearTimeout(timer);
    }
    let i = 0;
    const total = loop ? 3600 : 1150;
    const step = Math.max(12, total / lines.length);
    const tick = () => {
      i += 1;
      setShown(i);
      if (i < lines.length) timer = setTimeout(tick, step);
      else if (loop)
        timer = setTimeout(() => {
          i = 0;
          setShown(0);
          timer = setTimeout(tick, 700);
        }, 1200);
      else timer = setTimeout(() => onDone?.(), 420);
    };
    timer = setTimeout(tick, 280);
    return () => clearTimeout(timer);
  }, [lines, loop, reduce, onDone]);

  return (
    <div className={s.materialise} aria-hidden>
      {lines.map((line, i) => {
        const on = i < shown;
        return (
          <span key={i} className={s.mLine}>
            {!on && line.trim() && (
              <motion.span
                className={s.mGhost}
                style={{ width: `min(${Math.max(3, line.length * 0.5)}em, 100%)` }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.24, ease: EASE, delay: Math.min(i * 0.006, 0.18) }}
              />
            )}
            {on && (
              <motion.span
                className={s.mText}
                initial={reduce ? false : { opacity: 0, filter: "blur(6px)", y: 3 }}
                animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
                transition={{ duration: 0.42, ease: EASE }}
              >
                {!reduce && line.trim() && (
                  <motion.span
                    className={s.mFlare}
                    initial={{ opacity: 1, scaleX: 0.3 }}
                    animate={{ opacity: 0, scaleX: 1 }}
                    transition={{ duration: 0.7, ease: EASE }}
                  />
                )}
                {line || " "}
              </motion.span>
            )}
          </span>
        );
      })}
    </div>
  );
}

/** Copy: a band of platform light crosses the sheet once, left to right. Skipped with reduced motion. */
export function CopySweep({ run }: { run: number }) {
  const reduce = useReducedMotion();
  if (!run || reduce) return null;
  return (
    <div className={s.sweep} aria-hidden>
      <motion.div
        key={run}
        className={s.sweepBand}
        initial={{ x: "-100%", opacity: 1 }}
        animate={{ x: "240%", opacity: [1, 1, 0] }}
        transition={{ duration: 0.75, ease: [0.77, 0, 0.175, 1], opacity: { times: [0, 0.7, 1], duration: 0.75 } }}
      />
    </div>
  );
}
