"use client";

import { Check } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";
import type { Length, TargetPlatform } from "@/lib/contracts";
import { LENGTH_DESCRIPTIONS, LENGTHS, TARGET_LABELS, TARGET_TIPS, TARGETS } from "./data";
import s from "./cls";

/** Roving-tabindex arrow handling shared by every radiogroup in the preview. */
function useRoving<T extends string>(values: readonly T[], value: T, onChange: (v: T) => void) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: KeyboardEvent) => {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (values.indexOf(value) + dir + values.length) % values.length;
    onChange(values[next]);
    refs.current[next]?.focus();
  };
  return { refs, onKeyDown };
}

export function PlatformPicker({
  value,
  onChange,
  compact,
}: {
  value: TargetPlatform;
  onChange: (t: TargetPlatform) => void;
  compact?: boolean;
}) {
  const { refs, onKeyDown } = useRoving(TARGETS, value, onChange);
  return (
    <div
      role="radiogroup"
      aria-label="Write it for"
      className={compact ? s.strip : s.swatches}
      onKeyDown={onKeyDown}
    >
      {TARGETS.map((t, i) => {
        const on = t === value;
        return (
          <button
            key={t}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            data-target={t}
            className={s.swatch}
            onClick={() => onChange(t)}
            title={compact ? TARGET_TIPS[t] : undefined}
          >
            <span className={s.swatchChip} aria-hidden>
              {on && !compact && <Check size={18} strokeWidth={3} />}
            </span>
            <span>
              <span className={s.swatchName}>{TARGET_LABELS[t]}</span>
              {!compact && <span className={s.swatchTip}>{TARGET_TIPS[t]}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const LENGTH_LABEL: Record<Length, string> = { concise: "Concise", balanced: "Balanced", detailed: "Detailed" };

export function LengthPicker({
  value,
  onChange,
  onDesk,
  describe,
}: {
  value: Length;
  onChange: (l: Length) => void;
  onDesk?: boolean;
  describe?: boolean;
}) {
  const { refs, onKeyDown } = useRoving(LENGTHS, value, onChange);
  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Length"
        className={`${s.segmented} ${onDesk ? s.onDesk : ""}`}
        onKeyDown={onKeyDown}
      >
        {LENGTHS.map((l, i) => (
          <button
            key={l}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={l === value}
            tabIndex={l === value ? 0 : -1}
            className={s.segment}
            onClick={() => onChange(l)}
            title={LENGTH_DESCRIPTIONS[l]}
          >
            {LENGTH_LABEL[l]}
          </button>
        ))}
      </div>
      {describe && <p className={s.slipNote}>{LENGTH_DESCRIPTIONS[value]}</p>}
    </div>
  );
}
