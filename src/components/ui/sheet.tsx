"use client";

import { AnimatePresence, motion, useDragControls, type PanInfo } from "motion/react";
import { Dialog } from "radix-ui";
import { useRef, type ReactNode } from "react";
import { useReducedMotion } from "@/hooks/use-media";
import { cn } from "@/lib/utils";

const DRAWER = [0.32, 0.72, 0, 1] as const;

/**
 * Bottom sheet below 900px (DIRECTION-C §5, §12): rises in 450 ms on the drawer curve, leaves in
 * 240 ms, follows the finger 1:1 from its handle and header, and closes past 120px or at 500px/s.
 * Graphite for history, paper for Refine.
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  headerRight,
  children,
  tone = "graphite",
  tall = false,
  titleHidden = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  headerRight?: ReactNode;
  children: ReactNode;
  tone?: "graphite" | "paper";
  tall?: boolean;
  titleHidden?: boolean;
}) {
  const reduced = useReducedMotion();
  const controls = useDragControls();
  const sheetRef = useRef<HTMLDivElement>(null);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 500) onOpenChange(false);
  };

  const slide = reduced
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1, transition: { duration: 0.2 } },
        exit: { opacity: 0, transition: { duration: 0.16 } },
      }
    : {
        initial: { y: "100%" },
        animate: { y: 0, transition: { duration: 0.45, ease: DRAWER } },
        exit: { y: "100%", transition: { duration: 0.24, ease: DRAWER } },
      };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="ih-scrim"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: reduced ? 0.2 : 0.3 } }}
                exit={{ opacity: 0, transition: { duration: 0.2 } }}
              />
            </Dialog.Overlay>
            <Dialog.Content
              asChild
              forceMount
              aria-describedby={undefined}
              onOpenAutoFocus={(e) => {
                // Focus the sheet itself so no control shows a ring after a tap.
                e.preventDefault();
                sheetRef.current?.focus();
              }}
            >
              <motion.div
                ref={sheetRef}
                tabIndex={-1}
                {...slide}
                drag={reduced ? false : "y"}
                dragControls={controls}
                dragListener={false}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0.05, bottom: 0.9 }}
                dragMomentum={false}
                onDragEnd={onDragEnd}
                className={cn("ih-bsheet", tone === "graphite" && "ih-on-graphite")}
                data-tone={tone}
                data-tall={tall}
              >
                <div className="ih-bsheet-grab" onPointerDown={(e) => controls.start(e)}>
                  <div className="ih-handle" aria-hidden>
                    <i />
                  </div>
                  <div className="ih-bsheet-head">
                    <Dialog.Title
                      className={cn(tone === "graphite" ? "ih-history-title" : "ih-sheet-title", titleHidden && "ih-sr")}
                    >
                      {title}
                    </Dialog.Title>
                    {headerRight}
                  </div>
                </div>
                <div className="ih-bsheet-body">{children}</div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

/** Centred dialog (keyboard shortcuts). Opened from the keyboard, so it appears without motion. */
export function CenterDialog({
  open,
  onOpenChange,
  title,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="ih-dialog-scrim" />
        <Dialog.Content className="ih-dialog" aria-describedby={undefined}>
          <Dialog.Title className="ih-sheet-title">{title}</Dialog.Title>
          {children}
          {footer}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export const DialogClose = Dialog.Close;
