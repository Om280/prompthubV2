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
      <DM.Content sideOffset={6} collisionPadding={12} className={cn("ih-floating ih-menu", className)} {...props}>
        {children}
      </DM.Content>
    </DM.Portal>
  );
}

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
    <DM.RadioItem value={value} className="ih-menu-item">
      <span>
        <span>{label}</span>
        {description && <span className="ih-menu-item-desc">{description}</span>}
      </span>
      <DM.ItemIndicator className="ih-menu-check">
        <Check size={15} aria-hidden />
      </DM.ItemIndicator>
    </DM.RadioItem>
  );
}

export function MenuItem({ className, ...props }: ComponentProps<typeof DM.Item>) {
  return <DM.Item className={cn("ih-menu-item", className)} {...props} />;
}
