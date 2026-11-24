"use client";

import { Toaster as Sonner } from "sonner";

/**
 * Toasts on the graphite plane (DIRECTION-C §4): bottom centre, above the phone action bar, at most
 * three. Sonner's own enter/exit is a transition, so rapid toasts retarget instead of restarting.
 */
export function Toaster() {
  return (
    <Sonner
      position="bottom-center"
      offset={24}
      mobileOffset={{ bottom: "calc(84px + env(safe-area-inset-bottom))", left: 16, right: 16 }}
      visibleToasts={3}
      duration={4000}
      gap={8}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: "ih-toast",
          title: "ih-toast-title",
          actionButton: "ih-toast-action",
          closeButton: "ih-toast-close",
        },
      }}
    />
  );
}
