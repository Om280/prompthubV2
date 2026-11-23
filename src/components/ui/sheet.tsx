"use client";

import { AnimatePresence, motion, useDragControls, type PanInfo } from "motion/react";
import { Dialog } from "radix-ui";
import { useRef, type ReactNode } from "react";
import { useReducedMotion } from "@/hooks/use-media";
import { cn } from "@/lib/utils";

const DRAWER = [0.32, 0.72, 0, 1] as const;

/**
 * Mobile bottom sheet (DESIGN §6.9, §7 #16): slides up 360 ms, closes in 260 ms, follows the
 * finger 1:1 from the handle/header and dismisses past 30% of its height or at >0.4 px/ms.
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  headerRight,
  children,
  tall = false,
  description,
  titleHidden = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  headerRight?: ReactNode;
  children: ReactNode;
  tall?: boolean;
  description?: string;
  titleHidden?: boolean;
}) {
  const reduced = useReducedMotion();
  const controls = useDragControls();
  const sheetRef = useRef<HTMLDivElement>(null);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const h = sheetRef.current?.offsetHeight ?? 600;
    if (info.offset.y > h * 0.3 || info.velocity.y > 400) onOpenChange(false);
  };

  const slide = reduced
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1, transition: { duration: 0.2 } },
        exit: { opacity: 0, transition: { duration: 0.2 } },
      }
    : {
        initial: { y: "100%" },
        animate: { y: 0, transition: { duration: 0.36, ease: DRAWER } },
        exit: { y: "100%", transition: { duration: 0.26, ease: DRAWER } },
      };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-40 bg-scrim"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: reduced ? 0.2 : 0.36 } }}
                exit={{ opacity: 0, transition: { duration: reduced ? 0.2 : 0.26 } }}
              />
            </Dialog.Overlay>
            <Dialog.Content
              asChild
              forceMount
              {...(description ? {} : { "aria-describedby": undefined })}
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
                dragElastic={{ top: 0, bottom: 1 }}
                dragMomentum={false}
                onDragEnd={onDragEnd}
                className={cn(
                  "fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-lg bg-surface text-fg shadow-float outline-none",
                  tall ? "h-[92dvh]" : "max-h-[92dvh]",
                )}
              >
                <div
                  className="shrink-0 cursor-grab touch-none select-none px-4 pt-2 active:cursor-grabbing"
                  onPointerDown={(e) => controls.start(e)}
                >
                  <div className="mx-auto h-1 w-9 rounded-full bg-border-control" aria-hidden />
                  <div className={cn("flex min-h-12 items-center justify-between gap-3", titleHidden && "min-h-4")}>
                    <Dialog.Title className={cn("type-ui text-fg", titleHidden && "sr-only")}>{title}</Dialog.Title>
                    {headerRight}
                  </div>
                  {description && <Dialog.Description className="sr-only">{description}</Dialog.Description>}
                </div>
                <div className="safe-bottom min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">{children}</div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

/** Centered dialog used by the shortcut sheet (§6.10, §7 #19). */
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
  const reduced = useReducedMotion();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-40 bg-scrim"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: 0.2 } }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
              />
            </Dialog.Overlay>
            <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center p-4">
              <Dialog.Content asChild forceMount aria-describedby={undefined}>
                <motion.div
                  initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1, transition: { duration: 0.2, ease: [0.23, 1, 0.32, 1] } }}
                  exit={
                    reduced
                      ? { opacity: 0, transition: { duration: 0.15 } }
                      : { opacity: 0, scale: 0.98, transition: { duration: 0.15, ease: [0.23, 1, 0.32, 1] } }
                  }
                  className="pointer-events-auto w-full max-w-[520px] rounded-lg bg-surface p-6 text-fg shadow-float outline-none"
                >
                  <Dialog.Title className="mb-4 type-ui text-fg-strong">{title}</Dialog.Title>
                  {children}
                  {footer}
                </motion.div>
              </Dialog.Content>
            </div>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

export const DialogClose = Dialog.Close;
