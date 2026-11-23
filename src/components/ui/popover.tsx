"use client";

import { Popover as P } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverClose = P.Close;

export function PopoverContent({ className, ...props }: ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        sideOffset={8}
        collisionPadding={12}
        className={cn(
          "floating z-50 w-[300px] max-w-[calc(100vw-32px)] rounded-md bg-surface p-4 text-fg shadow-float",
          className,
        )}
        {...props}
      />
    </P.Portal>
  );
}
