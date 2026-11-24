"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes, type MouseEvent } from "react";
import { cn } from "@/lib/utils";

/**
 * Buttons (DIRECTION-C §11). Primary is cobalt and appears once per view (Generate or Copy).
 * "Needs AI" is dashed and unfilled with a lock, so it never reads as a secondary action.
 */
export const buttonVariants = cva("ih-btn select-none", {
  variants: {
    variant: {
      primary: "ih-btn-primary",
      secondary: "ih-btn-secondary",
      ghost: "ih-btn-ghost",
      needsAi: "ih-btn-needs-ai",
      danger: "ih-btn-ghost ih-btn-danger",
    },
    size: {
      md: "",
      sm: "ih-btn-sm",
      lg: "ih-btn-lg",
    },
    icon: { true: "ih-btn-icon", false: "" },
    block: { true: "ih-btn-block", false: "" },
  },
  defaultVariants: { variant: "ghost", size: "md", icon: false, block: false },
});

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

/**
 * `aria-disabled` keeps the button focusable (so its reason can be read and shown) but swallows the
 * click; `onDisabledClick` lets a Needs AI action explain itself instead.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps & { onDisabledClick?: () => void }>(function Button(
  { className, variant, size, icon, block, type = "button", onClick, onDisabledClick, ...props },
  ref,
) {
  const ariaDisabled = props["aria-disabled"] === true || props["aria-disabled"] === "true";
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size, icon, block }), className)}
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        if (ariaDisabled) {
          e.preventDefault();
          onDisabledClick?.();
          return;
        }
        onClick?.(e);
      }}
      {...props}
    />
  );
});
