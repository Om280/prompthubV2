"use client";

import type { CSSProperties } from "react";
import { Toaster as Sonner } from "sonner";

/** Sonner styled with design tokens (DESIGN §6.10): bottom center, above the mobile bar, max 3. */
export function Toaster() {
  return (
    <Sonner
      position="bottom-center"
      offset={24}
      mobileOffset={{ bottom: "calc(84px + env(safe-area-inset-bottom))", left: 16, right: 16 }}
      visibleToasts={3}
      duration={4000}
      gap={8}
      style={
        {
          "--normal-bg": "var(--color-surface)",
          "--normal-text": "var(--color-fg)",
          "--normal-border": "transparent",
          "--border-radius": "10px",
          "--width": "360px",
        } as CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "!shadow-float !font-sans !type-ui !font-[450] !py-3 !px-4 !gap-3",
          title: "!font-[450]",
          actionButton:
            "!bg-transparent !text-accent !type-ui !px-1.5 !h-7 hover:!text-accent-hover !ml-auto",
          closeButton: "!bg-surface !text-fg-muted !border-border",
          icon: "!text-success",
        },
      }}
    />
  );
}
