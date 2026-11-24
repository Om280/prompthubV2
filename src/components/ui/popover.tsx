"use client";

import { Popover as P } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverClose = P.Close;

/** Paper popover from its trigger: 170 ms ease-out from scale 0.96, origin at the trigger. */
export function PopoverContent({ className, ...props }: ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content sideOffset={8} collisionPadding={12} className={cn("ih-floating ih-popover", className)} {...props} />
    </P.Portal>
  );
}
