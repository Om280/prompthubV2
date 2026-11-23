"use client";

import { Tooltip as T } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Kbd } from "./kbd";

/** 600 ms delay, then instant for the next tooltip (DESIGN §6.2, §7 #13). */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <T.Provider delayDuration={600} skipDelayDuration={400}>
      {children}
    </T.Provider>
  );
}

export function Tip({
  label,
  keys,
  children,
  side = "bottom",
  align = "center",
  className,
}: {
  label: ReactNode;
  keys?: string[];
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  className?: string;
}) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={12}
          className={cn(
            "floating tooltip z-50 flex max-w-[280px] items-center gap-2 rounded-md bg-surface px-2.5 py-1.5 text-fg type-meta shadow-float",
            className,
          )}
        >
          <span>{label}</span>
          {keys && <Kbd keys={keys} />}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
