"use client";

import { RotateCcw } from "lucide-react";
import { LENGTH_LABELS, TARGET_LABELS, type Length } from "@/lib/contracts";
import { Button } from "@/components/ui/button";
import { PlatformSwitch, Segment } from "@/components/ui/segment";
import type { SessionState } from "@/hooks/use-session";
import { LENGTH_DESCRIPTIONS, TARGET_TIPS } from "./labels";
import { useWorkspace } from "./workspace-context";

export const LENGTHS: Length[] = ["concise", "balanced", "detailed"];

/** "Regenerate for Claude" / "Regenerate as Detailed" once a setting differs from the prompt's. */
export function regenerateLabel(state: SessionState): string | null {
  const g = state.generated;
  const busy = state.phase === "generating" || state.phase === "transforming" || state.phase === "clarifying";
  if (!g || state.versions.length === 0 || busy) return null;
  if (state.target !== g.target) return `Regenerate for ${TARGET_LABELS[state.target]}`;
  if (state.length !== g.length) return `Regenerate as ${LENGTH_LABELS[state.length]}`;
  return null;
}

export function RegenerateFor({ block = false }: { block?: boolean }) {
  const { state, actions } = useWorkspace();
  const label = regenerateLabel(state);
  if (!label) return null;
  return (
    <Button variant="secondary" size="sm" block={block} className={block ? undefined : "justify-self-start"} onClick={actions.regenerate}>
      <RotateCcw size={14} aria-hidden />
      {label}
    </Button>
  );
}

/** The platform switch and length segment with their notes (brief column and composer). */
export function Settings() {
  const { state, actions } = useWorkspace();
  return (
    <>
      <div className="ih-field">
        <div className="ih-field-head">
          <span className="ih-label-sm" aria-hidden>
            For
          </span>
          <span className="ih-hint">{TARGET_TIPS[state.target]}</span>
        </div>
        <PlatformSwitch value={state.target} onChange={(target) => actions.dispatch({ type: "setTarget", target })} />
      </div>
      <div className="ih-field">
        <div className="ih-field-head">
          <span className="ih-label-sm" aria-hidden>
            Length
          </span>
          <span className="ih-hint">{LENGTH_DESCRIPTIONS[state.length]}</span>
        </div>
        <LengthSegment full />
      </div>
    </>
  );
}

export function LengthSegment({ full = false }: { full?: boolean }) {
  const { state, actions } = useWorkspace();
  return (
    <Segment
      options={LENGTHS}
      value={state.length}
      onChange={(length) => actions.dispatch({ type: "setLength", length })}
      labels={LENGTH_LABELS}
      label="Length"
      full={full}
    />
  );
}
