"use client";

import { motion } from "motion/react";
import { RadioGroup } from "radix-ui";
import { useId, type ReactNode } from "react";
import { TARGET_LABELS, type TargetPlatform } from "@/lib/contracts";
import { Tip } from "./tooltip";

/** The thumb springs between options (DIRECTION-C §12): 0.36 s, bounce 0.22. */
export const SPRING_THUMB = { type: "spring", duration: 0.36, bounce: 0.22 } as const;

export const PLATFORMS: TargetPlatform[] = ["chatgpt", "claude", "gemini"];

/**
 * The platform switch: an inset track, a raised thumb with the platform-coloured nub, and a square
 * dot per platform. Radix RadioGroup gives radiogroup semantics (arrow keys move the choice).
 */
export function PlatformSwitch({
  value,
  onChange,
  size = "md",
  label = "Target platform",
  tips,
}: {
  value: TargetPlatform;
  onChange: (p: TargetPlatform) => void;
  size?: "md" | "sm";
  label?: string;
  /** Short note per platform, shown as a tooltip on fine pointers. */
  tips?: Record<TargetPlatform, string>;
}) {
  const id = useId();
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={(v) => onChange(v as TargetPlatform)}
      aria-label={label}
      orientation="horizontal"
      loop
      className="ih-pswitch"
      data-size={size}
      data-platform={value}
    >
      {PLATFORMS.map((p) => {
        const item = (
          <RadioGroup.Item key={p} value={p} className="ih-popt">
            {p === value && <motion.span layoutId={`${id}-thumb`} className="ih-pthumb" transition={SPRING_THUMB} />}
            <span className="ih-plabel">
              <span className="ih-pdot" data-platform={p} aria-hidden />
              {TARGET_LABELS[p]}
            </span>
          </RadioGroup.Item>
        );
        return tips ? <TipWrap key={p} tip={tips[p]}>{item}</TipWrap> : item;
      })}
    </RadioGroup.Root>
  );
}

function TipWrap({ tip, children }: { tip: string; children: ReactNode }) {
  return <Tip label={tip}>{children}</Tip>;
}

/** Neutral segmented control (length, editor view). */
export function Segment<T extends string>({
  options,
  value,
  onChange,
  labels,
  label,
  full = false,
  names,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labels: Record<T, ReactNode>;
  /** Accessible name of the group. */
  label: string;
  full?: boolean;
  /** Accessible name per option when the visible label is shortened ("Text" for "Plain text"). */
  names?: Partial<Record<T, string>>;
}) {
  const id = useId();
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={(v) => onChange(v as T)}
      aria-label={label}
      orientation="horizontal"
      loop
      className="ih-seg"
      data-full={full}
    >
      {options.map((o) => (
        <RadioGroup.Item key={o} value={o} className="ih-seg-opt" aria-label={names?.[o]}>
          {o === value && <motion.span layoutId={`${id}-thumb`} className="ih-seg-thumb" transition={SPRING_THUMB} />}
          <span>{labels[o]}</span>
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
