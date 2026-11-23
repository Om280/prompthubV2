"use client";

import { motion } from "motion/react";
import { RadioGroup } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Tip } from "./tooltip";

export interface UnderlineOption<T extends string> {
  value: T;
  label: string;
  tip?: string;
}

/**
 * Text-only segmented control with a sliding brass bar (DESIGN §6.2, §7 #3).
 * Radix RadioGroup gives radiogroup semantics: arrow keys move the selection.
 */
export function UnderlineRadio<T extends string>({
  value,
  onChange,
  options,
  label,
  layoutId,
  size = "md",
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: UnderlineOption<T>[];
  label: string;
  layoutId: string;
  size?: "md" | "sm";
  className?: string;
}) {
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={(v) => onChange(v as T)}
      aria-label={label}
      orientation="horizontal"
      loop
      className={cn("flex items-center", size === "md" ? "gap-4" : "gap-3", className)}
    >
      {options.map((o) => {
        const item = (
          <RadioGroup.Item
            key={o.value}
            value={o.value}
            className={cn(
              "group relative inline-flex shrink-0 items-center rounded-xs",
              size === "md" ? "h-8 type-ui coarse:h-11" : "h-7 type-meta coarse:h-11",
              "text-fg-muted hover:text-fg data-[state=checked]:text-fg-strong",
            )}
          >
            {o.label}
            {value === o.value && (
              <motion.span
                layoutId={layoutId}
                aria-hidden
                className={cn(
                  "absolute inset-x-0 h-0.5 rounded-xs bg-accent",
                  size === "md" ? "bottom-0.5 coarse:bottom-[9px]" : "bottom-px coarse:bottom-[9px]",
                )}
                transition={{ type: "spring", duration: 0.32, bounce: 0 }}
              />
            )}
          </RadioGroup.Item>
        );
        return o.tip ? (
          <TipWrap key={o.value} tip={o.tip}>
            {item}
          </TipWrap>
        ) : (
          item
        );
      })}
    </RadioGroup.Root>
  );
}

function TipWrap({ tip, children }: { tip: string; children: ReactNode }) {
  return <Tip label={tip}>{children}</Tip>;
}
