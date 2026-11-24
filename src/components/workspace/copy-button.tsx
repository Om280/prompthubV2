"use client";

import { Check, Copy } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { useReducedMotion } from "@/hooks/use-media";
import { cn } from "@/lib/utils";
import { useWorkspace } from "./workspace-context";

const EASE = [0.23, 1, 0.32, 1] as const;

/**
 * Copy (DIRECTION-C §10): press scales to 0.97; on resolve the icon and label crossfade to Copied
 * with a 2px blur in 160 ms after a click, and swap instantly from the keyboard. Both labels share
 * one cell, so the width never changes.
 */
export function CopyButton({ className, showHint = true }: { className?: string; showHint?: boolean }) {
  const { copy, copyPrompt, keys, copyText } = useWorkspace();
  const reduced = useReducedMotion();
  const disabled = !copyText.trim();
  const animate = copy.animate && !reduced;

  return (
    <Button
      variant="primary"
      className={cn("min-w-[104px]", className)}
      disabled={disabled}
      aria-label={copy.copied ? "Copied" : "Copy prompt"}
      onClick={(e) => copyPrompt(e.detail === 0 ? "keyboard" : "pointer")}
    >
      <span className="ih-swap" aria-hidden>
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={copy.copied ? "done" : "copy"}
            initial={animate ? { opacity: 0, scale: 0.9, filter: "blur(2px)" } : false}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={animate ? { opacity: 0, scale: 0.9, filter: "blur(2px)" } : { opacity: 0, transition: { duration: 0 } }}
            transition={{ duration: 0.16, ease: EASE }}
          >
            {copy.copied ? <Check size={16} strokeWidth={2.75} /> : <Copy size={16} />}
            {copy.copied ? "Copied" : "Copy"}
          </motion.span>
        </AnimatePresence>
      </span>
      {showHint && <Kbd keys={[keys.mod, keys.shift, "C"]} tone="on-accent" />}
    </Button>
  );
}
