"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes, type MouseEvent } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "press relative inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap type-ui select-none disabled:opacity-45 aria-disabled:opacity-45",
  {
    variants: {
      variant: {
        /** Accent fill. Exactly one per view (DESIGN §2). */
        primary:
          "h-9 rounded-sm bg-accent px-4 text-accent-on hover:bg-accent-hover coarse:min-h-11 disabled:hover:bg-accent",
        ghost:
          "h-8 rounded-sm px-2.5 text-fg-muted hover:bg-surface-2 hover:text-fg aria-disabled:hover:bg-transparent aria-disabled:hover:text-fg-muted coarse:min-h-11",
        icon: "size-8 rounded-sm text-fg-muted hover:bg-surface-2 hover:text-fg coarse:size-11",
        /** Plain text button. */
        text: "h-7 rounded-xs px-1 text-fg-muted hover:text-fg coarse:min-h-11",
        subtle: "h-7 rounded-xs px-1 text-fg-subtle hover:text-fg coarse:min-h-11",
        accent: "h-7 rounded-xs px-1 text-accent hover:text-accent-hover coarse:min-h-11",
        outline:
          "h-9 rounded-sm px-4 text-fg shadow-[inset_0_0_0_1px_var(--color-border-control)] hover:bg-surface-2 coarse:min-h-11",
      },
    },
    defaultVariants: { variant: "ghost" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

/**
 * `aria-disabled` keeps the button focusable (so a tooltip can explain why) but swallows clicks.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, type = "button", onClick, ...props },
  ref,
) {
  const ariaDisabled = props["aria-disabled"] === true || props["aria-disabled"] === "true";
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant }), className)}
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        if (ariaDisabled) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
      {...props}
    />
  );
});
