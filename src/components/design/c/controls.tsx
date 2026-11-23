"use client";

import { motion } from "motion/react";
import { useId, useRef, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import type { TargetPlatform } from "@/lib/contracts";
import { PLATFORMS, TARGET_LABELS } from "./data";
import s from "./styles";

export const SPRING_THUMB = { type: "spring", duration: 0.36, bounce: 0.22 } as const;

/** Platform hues, used where a single element needs a platform's colour outside its own scope. */
export const PLATFORM_HEX: Record<TargetPlatform, { light: string; onDark: string }> = {
  chatgpt: { light: "#c2255c", onDark: "#ff7fae" },
  claude: { light: "#0b7a75", onDark: "#4cc8bf" },
  gemini: { light: "#a35f00", onDark: "#e8ae45" },
};

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(" ");
}

/** The brand mark: two pieces snapped together, the same connector the prompt blocks use. */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <path
        d="M5 2H23A3 3 0 0 1 26 5V10A3 3 0 0 1 23 13H15V16A2 2 0 0 1 13 18H11A2 2 0 0 1 9 16V13H5A3 3 0 0 1 2 10V5A3 3 0 0 1 5 2Z"
        fill="var(--cobalt)"
      />
      <path
        d="M5 15H8V17A2 2 0 0 0 10 19H14A2 2 0 0 0 16 17V15H23A3 3 0 0 1 26 18V23A3 3 0 0 1 23 26H5A3 3 0 0 1 2 23V18A3 3 0 0 1 5 15Z"
        fill="var(--ink)"
      />
    </svg>
  );
}

function subscribePlatform() {
  return () => {};
}
export function useModKey(): string {
  return useSyncExternalStore(
    subscribePlatform,
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"),
    () => "Ctrl",
  );
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export function Kbd({ children, onAccent }: { children: ReactNode; onAccent?: boolean }) {
  return <kbd className={cx(s.kbd, onAccent && s.kbdOnAccent)}>{children}</kbd>;
}

/** Arrow-key handling shared by the radio groups. */
function useRadioKeys<T extends string>(options: readonly T[], value: T, onChange: (v: T) => void) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = options.indexOf(value);
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % options.length;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + options.length) % options.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = options.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(options[next]);
    refs.current[next]?.focus();
  };
  return { refs, onKeyDown };
}

export function PlatformSwitch({
  value,
  onChange,
  small,
  label = "Target platform",
}: {
  value: TargetPlatform;
  onChange: (p: TargetPlatform) => void;
  small?: boolean;
  label?: string;
}) {
  const id = useId();
  const { refs, onKeyDown } = useRadioKeys(PLATFORMS, value, onChange);
  return (
    <div role="radiogroup" aria-label={label} className={cx(s.platformSwitch, small && s.platformSwitchSm)}>
      {PLATFORMS.map((p, i) => {
        const on = p === value;
        return (
          <button
            key={p}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            className={s.platformOpt}
            onClick={() => onChange(p)}
            onKeyDown={onKeyDown}
          >
            {on && <motion.span layoutId={`${id}-thumb`} className={s.platformThumb} transition={SPRING_THUMB} />}
            <span className={s.platformLabel}>
              <span className={s.platformDot} style={{ background: `var(--c-${p})` }} />
              {TARGET_LABELS[p]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function Segment<T extends string>({
  options,
  value,
  onChange,
  labels,
  label,
  full,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labels: Record<T, string>;
  label: string;
  full?: boolean;
}) {
  const id = useId();
  const { refs, onKeyDown } = useRadioKeys(options, value, onChange);
  return (
    <div role="radiogroup" aria-label={label} className={cx(s.segment, full && s.segmentFull)}>
      {options.map((o, i) => {
        const on = o === value;
        return (
          <button
            key={o}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            className={s.segmentOpt}
            onClick={() => onChange(o)}
            onKeyDown={onKeyDown}
          >
            {on && <motion.span layoutId={`${id}-thumb`} className={s.segmentThumb} transition={SPRING_THUMB} />}
            <span>{labels[o]}</span>
          </button>
        );
      })}
    </div>
  );
}
