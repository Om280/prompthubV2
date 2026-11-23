"use client";

import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { useWorkspace } from "./workspace-context";

/**
 * Copy (DESIGN §6.8). Both labels share one grid cell so the width never changes; the swap
 * crossfades with a 2px blur after a pointer click and is instant from the keyboard.
 */
export function CopyButton({ className, showHint = true }: { className?: string; showHint?: boolean }) {
  const { copy, copyPrompt, keys, copyText } = useWorkspace();
  const disabled = !copyText.trim();
  const swap = copy.animate
    ? "transition-[opacity,filter] duration-160 ease-[ease] motion-reduce:transition-none"
    : "transition-none";
  const on = "opacity-100 blur-0";
  const off = "opacity-0 blur-[2px] motion-reduce:blur-0";

  return (
    <Button
      variant="primary"
      className={cn("gap-2 pl-3.5 pr-3.5", className)}
      disabled={disabled}
      onClick={(e) => copyPrompt(e.detail === 0 ? "keyboard" : "pointer")}
    >
      <span className="grid size-3.5 place-items-center" aria-hidden>
        <Copy className={cn("col-start-1 row-start-1 size-3.5", swap, copy.copied ? off : on)} />
        <Check className={cn("col-start-1 row-start-1 size-3.5", swap, copy.copied ? on : off)} />
      </span>
      <span className="grid">
        <span className={cn("col-start-1 row-start-1", swap, copy.copied ? off : on)} aria-hidden={copy.copied}>
          Copy
        </span>
        <span className={cn("col-start-1 row-start-1", swap, copy.copied ? on : off)} aria-hidden={!copy.copied}>
          Copied
        </span>
      </span>
      {showHint && <Kbd keys={[keys.mod, keys.shift, "C"]} tone="on-accent" className="ml-0.5" />}
    </Button>
  );
}
