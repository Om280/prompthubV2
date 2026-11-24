"use client";

import Link from "next/link";
import { Dialog } from "radix-ui";
import { AI_DISCLOSURE } from "@/lib/ai/disclosure";
import { Button } from "@/components/ui/button";

/**
 * First-use AI notice. Shown once per browser, before the first request that would go to Gemini:
 * what is sent, that Google may use it on the free tier, and that Basic Mode sends nothing.
 * "Keep using Basic Mode" switches the engine and carries on without AI.
 */
export function AiDisclosure({
  open,
  onContinue,
  onBasic,
  onDismiss,
}: {
  open: boolean;
  onContinue: () => void;
  onBasic: () => void;
  onDismiss: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onDismiss()}>
      <Dialog.Portal>
        <Dialog.Overlay className="ih-dialog-scrim" />
        <Dialog.Content className="ih-dialog ih-disclosure" data-testid="ai-disclosure">
          <Dialog.Title className="ih-sheet-title">{AI_DISCLOSURE.title}</Dialog.Title>
          <Dialog.Description asChild>
            <div className="ih-disclosure-body">
              {AI_DISCLOSURE.body.map((p) => (
                <p key={p}>{p}</p>
              ))}
              <p>
                <Link href="/privacy" className="ih-link" target="_blank">
                  Read the privacy notice
                </Link>{" "}
                or{" "}
                <a href={AI_DISCLOSURE.sourceUrl} className="ih-link" target="_blank" rel="noreferrer">
                  {AI_DISCLOSURE.sourceLabel}
                </a>
                .
              </p>
            </div>
          </Dialog.Description>
          <div className="ih-disclosure-actions">
            <Button variant="secondary" onClick={onBasic}>
              {AI_DISCLOSURE.decline}
            </Button>
            <Button variant="primary" onClick={onContinue} autoFocus>
              {AI_DISCLOSURE.accept}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
