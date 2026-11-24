"use client";

import { LoaderCircle, Lock, RotateCcw, SlidersHorizontal, Square } from "lucide-react";
import { useState } from "react";
import { TONE_LABELS } from "@/lib/contracts";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/ui/sheet";
import { BASIC_REASON } from "./labels";
import { CopyButton } from "./copy-button";
import { LengthSegment, regenerateLabel } from "./settings-row";
import { AI_ACTIONS, BLOCK_REASONS, TONES, currentTone, explain, isActive, refineBlock, SheetNotices } from "./toolbar";
import { VersionSwitcher } from "./version-switcher";
import { useWorkspace } from "./workspace-context";

/**
 * Phones (DIRECTION-C §13): a small white floating bar, safe-area aware, so the prompt stays the hero.
 * Refine opens a paper sheet with length, the AI actions (Needs AI in Basic Mode) and Regenerate.
 */
export function MobileBar() {
  const { state, actions } = useWorkspace();
  const [refine, setRefine] = useState(false);
  const streaming = !!state.stream;
  if (state.versions.length === 0 && !streaming) return null;

  return (
    <>
      <div className="ih-mbar" role="toolbar" aria-label="Prompt actions">
        <Button aria-haspopup="dialog" aria-disabled={streaming ? true : undefined} onClick={() => setRefine(true)}>
          <SlidersHorizontal size={16} aria-hidden />
          Refine
        </Button>
        {!streaming && <VersionSwitcher compact />}
        {streaming ? (
          <Button variant="secondary" onClick={() => actions.stop()}>
            <Square size={13} aria-hidden />
            Stop
          </Button>
        ) : (
          <CopyButton showHint={false} />
        )}
      </div>
      <BottomSheet open={refine} onOpenChange={setRefine} title="Refine" tone="paper">
        <RefineSheet onDone={() => setRefine(false)} />
      </BottomSheet>
    </>
  );
}

function RefineSheet({ onDone }: { onDone: () => void }) {
  const { state, actions, basic } = useWorkspace();
  const toneBlock = refineBlock(state, basic, "tone");
  const regen = refineBlock(state, basic, "regenerate");
  return (
    <div className="ih-refine">
      <div className="ih-field">
        <span className="ih-label-sm" aria-hidden>
          Length
        </span>
        <LengthSegment full />
      </div>
      <div className="ih-refine-list">
        {AI_ACTIONS.map(({ action, label, icon: Icon }) => {
          const block = refineBlock(state, basic, action);
          return (
            <Button
              key={action}
              variant={block === "basic" ? "needsAi" : "secondary"}
              aria-disabled={block ? true : undefined}
              onDisabledClick={block ? () => explain(block) : undefined}
              onClick={() => {
                onDone();
                if (action !== "regenerate") actions.transform(action);
              }}
            >
              {block === "basic" ? (
                <Lock size={14} aria-hidden />
              ) : isActive(state, action) ? (
                <LoaderCircle size={15} className="animate-spin" aria-hidden />
              ) : (
                <Icon size={15} aria-hidden />
              )}
              {label}
            </Button>
          );
        })}
        {toneBlock === "basic" ? (
          <Button variant="needsAi" aria-disabled onDisabledClick={() => explain("basic")}>
            <Lock size={14} aria-hidden />
            Tone
          </Button>
        ) : (
          <div className="ih-field">
            <span className="ih-label-sm" id="tone-label">
              Tone
            </span>
            <div className="ih-refine-tones" role="radiogroup" aria-labelledby="tone-label">
              {TONES.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  className="ih-chip"
                  aria-checked={currentTone(state) === t}
                  aria-disabled={toneBlock ? true : undefined}
                  onClick={() => {
                    if (toneBlock) return explain(toneBlock);
                    onDone();
                    actions.transform("tone", t);
                  }}
                >
                  {TONE_LABELS[t]}
                </button>
              ))}
            </div>
            {toneBlock && <p className="ih-hint">{BLOCK_REASONS[toneBlock]}</p>}
          </div>
        )}
        <Button
          variant="secondary"
          aria-disabled={regen ? true : undefined}
          onDisabledClick={regen ? () => explain(regen) : undefined}
          onClick={() => {
            onDone();
            actions.regenerate();
          }}
        >
          <RotateCcw size={15} aria-hidden />
          {regenerateLabel(state) ?? "Regenerate"}
        </Button>
      </div>
      {basic && <p className="ih-hint">{BASIC_REASON}</p>}
      <div className="flex flex-wrap">
        <SheetNotices />
      </div>
    </div>
  );
}
