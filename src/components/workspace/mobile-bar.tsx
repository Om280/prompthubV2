"use client";

import { Check, ChevronDown, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { TONE_LABELS } from "@/lib/contracts";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";
import { BASIC_REASON, REFINE_DESCRIPTIONS } from "./labels";
import { REFINE, TONES, currentTone, isActive, refineBlock } from "./toolbar";
import { useWorkspace } from "./workspace-context";

/**
 * Bottom action bar below 640px (DESIGN §5 mobile rules, §6.6): Generate before a prompt exists,
 * Refine / Tone / Copy after. Sits above the keyboard via interactive-widget=resizes-content.
 */
export function MobileBar() {
  const { state, actions, basic } = useWorkspace();
  const [sheet, setSheet] = useState<"refine" | "tone" | null>(null);
  const hasVersions = state.versions.length > 0;
  const streaming = !!state.stream;
  const showGenerate = !hasVersions && !streaming;
  const busyRefine = streaming && state.stream?.activity !== "generate";
  const toneBlock = refineBlock(state, basic, "tone");

  return (
    <>
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/92 px-4 pt-3 backdrop-blur-[12px] sm:hidden">
        {showGenerate ? (
          <Button
            variant="primary"
            className="h-11 w-full"
            disabled={
              state.phase === "clarifying" || (state.phase === "idle" && !state.idea.trim())
            }
            onClick={actions.primary}
          >
            {state.phase === "clarifying" && <LoaderCircle className="size-3.5 animate-spin" aria-hidden />}
            Generate prompt
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            {streaming ? (
              <Button variant="outline" className="h-11 px-4" onClick={() => actions.stop()}>
                Stop
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  className="h-11 gap-1 px-3.5"
                  aria-haspopup="dialog"
                  aria-disabled={!hasVersions || busyRefine ? true : undefined}
                  onClick={() => setSheet("refine")}
                >
                  Refine
                  <ChevronDown className="size-3.5" aria-hidden />
                </Button>
                <Button
                  variant="outline"
                  className="h-11 gap-1 px-3.5"
                  aria-haspopup="dialog"
                  aria-disabled={toneBlock === "busy" || toneBlock === "empty" ? true : undefined}
                  onClick={() => setSheet("tone")}
                >
                  Tone
                  <ChevronDown className="size-3.5" aria-hidden />
                </Button>
              </>
            )}
            <CopyButton className="h-11 flex-1" showHint={false} />
          </div>
        )}
      </div>

      <BottomSheet open={sheet === "refine"} onOpenChange={(o) => setSheet(o ? "refine" : null)} title="Refine">
        {basic && <p className="mb-2 type-meta text-fg-subtle">{BASIC_REASON}</p>}
        <ul className="flex flex-col pb-2">
          {REFINE.map(({ action, label, icon: Icon }) => {
            const block = refineBlock(state, basic, action);
            return (
              <li key={action}>
                <button
                  type="button"
                  aria-disabled={block ? true : undefined}
                  className={cn(
                    "press flex min-h-14 w-full items-start gap-3 rounded-sm px-2 py-3 text-left aria-disabled:opacity-45",
                  )}
                  onClick={() => {
                    if (block) return;
                    setSheet(null);
                    if (action === "regenerate") actions.regenerate();
                    else actions.transform(action);
                  }}
                >
                  {isActive(state, action) ? (
                    <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin text-fg-muted" aria-hidden />
                  ) : (
                    <Icon className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden />
                  )}
                  <span className="flex flex-col">
                    <span className="type-ui text-fg">{label}</span>
                    <span className="type-meta text-fg-subtle">{REFINE_DESCRIPTIONS[action]}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </BottomSheet>

      <BottomSheet open={sheet === "tone"} onOpenChange={(o) => setSheet(o ? "tone" : null)} title="Tone">
        {toneBlock === "basic" && <p className="mb-2 type-meta text-fg-subtle">{BASIC_REASON}</p>}
        <div role="radiogroup" aria-label="Tone" className="flex flex-col pb-2">
          {TONES.map((t) => {
            const checked = currentTone(state) === t;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={checked}
                aria-disabled={toneBlock ? true : undefined}
                className="press flex min-h-12 w-full items-center justify-between rounded-sm px-2 text-left type-ui text-fg aria-disabled:opacity-45"
                onClick={() => {
                  if (toneBlock) return;
                  setSheet(null);
                  actions.transform("tone", t);
                }}
              >
                {TONE_LABELS[t]}
                {checked && <Check className="size-4 text-fg" aria-hidden />}
              </button>
            );
          })}
        </div>
      </BottomSheet>
    </>
  );
}
