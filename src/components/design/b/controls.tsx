"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import type { Length, TargetPlatform } from "@/lib/contracts";
import { HUES, LENGTH_LABELS, LENGTHS, TARGET_LABELS, TARGETS } from "./data";
import s from "./styles";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/** The mark: a lit page. A sheet with the platform seam down its left edge and three lines of text. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 26 26" className={className} aria-hidden>
      <rect x="1" y="1" width="24" height="24" rx="7" fill="#30274B" stroke="rgba(178,160,236,0.35)" />
      <rect x="5.5" y="6" width="2.2" height="14" rx="1.1" fill="var(--hue)" />
      <rect x="10.5" y="8" width="10" height="2" rx="1" fill="#F3EEFA" />
      <rect x="10.5" y="12" width="8" height="2" rx="1" fill="#D6CFE6" opacity="0.8" />
      <rect x="10.5" y="16" width="5.5" height="2" rx="1" fill="#D6CFE6" opacity="0.55" />
    </svg>
  );
}

export function Kbd({ keys }: { keys: string[] }) {
  return (
    <span className={cx(s.kbd, s.hideNarrow)} aria-hidden>
      {keys.map((k) => (
        <kbd key={k}>{k}</kbd>
      ))}
    </span>
  );
}

/** "Ctrl" on Windows and Linux, "⌘" on macOS. Resolved after mount so server and client agree. */
export function useModKey() {
  const [mod, setMod] = useState("Ctrl");
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) {
      const id = requestAnimationFrame(() => setMod("⌘"));
      return () => cancelAnimationFrame(id);
    }
  }, []);
  return mod;
}

function useRoving<T extends string>(values: T[], value: T, onChange: (v: T) => void) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: KeyboardEvent) => {
    const i = values.indexOf(value);
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % values.length;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + values.length) % values.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = values.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(values[next]);
    refs.current[next]?.focus();
  };
  return { refs, onKeyDown };
}

/** Platform picker: three lamps. The selected one is lit in its own hue; the pill slides between them. */
export function PlatformPicker({
  value,
  onChange,
  idPrefix,
}: {
  value: TargetPlatform;
  onChange: (t: TargetPlatform) => void;
  idPrefix: string;
}) {
  const reduce = useReducedMotion();
  const { refs, onKeyDown } = useRoving(TARGETS, value, onChange);
  return (
    <div role="radiogroup" aria-label="Target platform" className={s.picker} onKeyDown={onKeyDown}>
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
            className={s.pickerOption}
            style={{ "--dot": HUES[t].hex } as CSSProperties}
            onClick={() => onChange(t)}
          >
            {on && (
              <motion.span
                layoutId={`${idPrefix}-pill`}
                className={s.pickerPill}
                transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.34, bounce: 0.12 }}
                aria-hidden
              />
            )}
            <span className={s.pickerLabel}>
              <span className={s.dot} aria-hidden />
              {TARGET_LABELS[t]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function LengthPicker({ value, onChange }: { value: Length; onChange: (l: Length) => void }) {
  const { refs, onKeyDown } = useRoving(LENGTHS, value, onChange);
  return (
    <div role="radiogroup" aria-label="Length" className={s.segment} onKeyDown={onKeyDown}>
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
          className={s.segmentOption}
          onClick={() => onChange(l)}
        >
          {LENGTH_LABELS[l]}
        </button>
      ))}
    </div>
  );
}

/**
 * An AI-only action in Basic Mode. It stays focusable so keyboard users reach the reason, reads as
 * unavailable (dashed, no fill), and pressing it says why instead of faking a result.
 */
export function Unavailable({
  label,
  icon,
  reason,
  onExplain,
  trailing,
  tip = true,
  scope,
}: {
  label: string;
  icon?: ReactNode;
  reason: string;
  onExplain: () => void;
  trailing?: ReactNode;
  tip?: boolean;
  scope: string;
}) {
  const id = `why-${scope}-${label.toLowerCase()}`;
  return (
    <span className={s.tipAnchor}>
      <button
        type="button"
        aria-disabled="true"
        aria-describedby={id}
        className={cx(s.btn, s.unavailable)}
        onClick={onExplain}
      >
        {icon}
        {label}
        {trailing}
      </button>
      <span id={id} role="tooltip" className={tip ? s.tooltip : s.srOnly}>
        {reason}
      </span>
    </span>
  );
}
