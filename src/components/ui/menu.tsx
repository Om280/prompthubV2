"use client";

import { Check } from "lucide-react";
import { DropdownMenu as DM } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Menu = DM.Root;
export const MenuTrigger = DM.Trigger;
export const MenuRadioGroup = DM.RadioGroup;

export function MenuContent({ className, children, ...props }: ComponentProps<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content
        sideOffset={6}
        collisionPadding={12}
        className={cn(
          "floating z-50 min-w-[240px] max-w-[320px] rounded-md bg-surface p-1 text-fg shadow-float",
          className,
        )}
        {...props}
      >
        {children}
      </DM.Content>
    </DM.Portal>
  );
}

const itemClass =
  "relative flex w-full cursor-pointer select-none items-start gap-2 rounded-sm px-2.5 py-2 type-ui text-fg outline-none data-[highlighted]:bg-surface-2 data-[disabled]:opacity-45 coarse:min-h-11";

export function MenuRadioItem({
  value,
  label,
  description,
}: {
  value: string;
  label: ReactNode;
  description?: ReactNode;
}) {
  return (
    <DM.RadioItem value={value} className={cn(itemClass, "pr-8")}>
      <span className="flex flex-col">
        <span>{label}</span>
        {description && <span className="type-meta text-fg-subtle">{description}</span>}
      </span>
      <DM.ItemIndicator className="absolute right-2.5 top-2.5">
        <Check className="size-3.5 text-fg" aria-hidden />
      </DM.ItemIndicator>
    </DM.RadioItem>
  );
}

export function MenuItem({ className, ...props }: ComponentProps<typeof DM.Item>) {
  return <DM.Item className={cn(itemClass, "items-center", className)} {...props} />;
}
