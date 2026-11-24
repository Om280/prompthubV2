"use client";

import { ChevronDown, LoaderCircle, Lock, Maximize2, Minimize2, PenLine, RotateCcw, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { TONE_LABELS, schemas, type Tone } from "@/lib/contracts";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "@/components/ui/menu";
import { Tip } from "@/components/ui/tooltip";
import { latest, type Activity, type SessionState } from "@/hooks/use-session";
import { MAX_PROMPT_CHARS } from "./editor";
import { BASIC_REASON, SAME_PROMPT_NOTE } from "./labels";
import { useWorkspace } from "./workspace-context";

/** The tones from the contract, in its order. */
export const TONES: Tone[] = [...schemas.Tone.options];

export type RefineAction = "improve" | "shorten" | "expand" | "regenerate";

export const REFINE: { action: RefineAction; label: string; icon: LucideIcon }[] = [
  { action: "improve", label: "Improve", icon: PenLine },
  { action: "shorten", label: "Shorten", icon: Minimize2 },
  { action: "expand", label: "Expand", icon: Maximize2 },
  { action: "regenerate", label: "Regenerate", icon: RotateCcw },
];

export const AI_ACTIONS = REFINE.filter((r) => r.action !== "regenerate");

export function currentTone(state: SessionState): Tone {
  const v = state.viewing !== null ? state.versions[state.viewing] : latest(state);
  return v?.source === "tone" && v.tone ? v.tone : "neutral";
}

export type RefineBlock = "busy" | "basic" | "viewing" | "long" | "empty";

/** Why a refine/tone action is unavailable right now, or null when it can run. */
export function refineBlock(state: SessionState, basic: boolean, action: RefineAction | "tone"): RefineBlock | null {
  if (state.versions.length === 0) return "empty";
  if (state.stream) return "busy";
  if (basic && action !== "regenerate") return "basic";
  if (state.viewing !== null) return "viewing";
  if (action !== "regenerate" && state.draft.length > MAX_PROMPT_CHARS) return "long";
  return null;
}

export const BLOCK_REASONS: Record<RefineBlock, string> = {
  basic: BASIC_REASON,
  busy: "Wait for the current change to finish.",
  viewing: "Restore this version, or go back to the latest, to change it.",
  long: "This prompt is over 20,000 characters. Shorten it to refine it.",
  empty: "Generate a prompt first.",
};

export function isActive(state: SessionState, action: Activity) {
  return state.stream?.activity === action;
}

/** A Needs AI click explains itself instead of doing nothing. */
export function explain(block: RefineBlock) {
  toast(BLOCK_REASONS[block], { id: `refine-${block}` });
}

/**
 * The refine row under the blocks (DIRECTION-C §6). In Basic Mode the AI-only actions are dashed
 * "Needs AI" buttons with a lock, and the reason sits under the row. With AI on they're filled
 * secondary buttons and Tone opens its menu. Regenerate is always available.
 */
export function RefineBar() {
  const { state, actions, basic } = useWorkspace();
  const regen = refineBlock(state, basic, "regenerate");
  return (
    <div className="ih-sheet-foot" role="group" aria-label="Refine" aria-describedby={basic ? "basic-reason" : undefined}>
      {AI_ACTIONS.map((r) => (
        <RefineButton key={r.action} {...r} />
      ))}
      <ToneMenu />
      <div className="ih-sheet-foot-end">
        <Button
          variant="secondary"
          size="sm"
          aria-disabled={regen ? true : undefined}
          onClick={actions.regenerate}
        >
          {isActive(state, "regenerate") ? (
            <LoaderCircle size={14} className="animate-spin" aria-hidden />
          ) : (
            <RotateCcw size={14} aria-hidden />
          )}
          Regenerate
        </Button>
      </div>
      {basic && (
        <p className="ih-reason" id="basic-reason">
          {BASIC_REASON}
        </p>
      )}
      <SheetNotices />
    </div>
  );
}

function RefineButton({ action, label, icon: Icon }: { action: RefineAction; label: string; icon: LucideIcon }) {
  const { state, actions, basic } = useWorkspace();
  const block = refineBlock(state, basic, action);
  const run = () => (action === "regenerate" ? actions.regenerate() : actions.transform(action));
  const button = (
    <Button
      variant={block === "basic" ? "needsAi" : "secondary"}
      size="sm"
      aria-disabled={block ? true : undefined}
      onDisabledClick={block ? () => explain(block) : undefined}
      onClick={run}
    >
      {block === "basic" ? (
        <Lock size={13} aria-hidden />
      ) : isActive(state, action) ? (
        <LoaderCircle size={14} className="animate-spin" aria-hidden />
      ) : (
        <Icon size={14} aria-hidden />
      )}
      {label}
    </Button>
  );
  if (!block || block === "basic") return button;
  return <Tip label={BLOCK_REASONS[block]}>{button}</Tip>;
}

/** Tone: a menu of the contract's tones when AI can run; otherwise disabled with the reason. */
export function ToneMenu() {
  const { state, actions, basic } = useWorkspace();
  const block = refineBlock(state, basic, "tone");
  const spinning = isActive(state, "tone");
  const trigger = (
    <Button
      variant={block === "basic" ? "needsAi" : "secondary"}
      size="sm"
      aria-disabled={block ? true : undefined}
      onDisabledClick={block ? () => explain(block) : undefined}
    >
      {block === "basic" ? (
        <Lock size={13} aria-hidden />
      ) : spinning ? (
        <LoaderCircle size={14} className="animate-spin" aria-hidden />
      ) : null}
      Tone
      {block !== "basic" && <ChevronDown size={14} aria-hidden />}
    </Button>
  );
  if (block === "basic") return trigger;
  if (block) return <Tip label={BLOCK_REASONS[block]}>{trigger}</Tip>;
  return (
    <Menu>
      <MenuTrigger asChild>{trigger}</MenuTrigger>
      <MenuContent align="start" className="min-w-[200px]">
        <MenuRadioGroup value={currentTone(state)} onValueChange={(v) => actions.transform("tone", v as Tone)}>
          {TONES.map((t) => (
            <MenuRadioItem key={t} value={t} label={TONE_LABELS[t]} />
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}

/** Short notes about the last action: stopped, same prompt, restored. */
export function SheetNotices() {
  const { state } = useWorkspace();
  const n = state.notice;
  if (!n || n.kind === "saved") return null;
  const text =
    n.kind === "stopped"
      ? "Stopped. Kept what was written so far."
      : n.kind === "same"
        ? SAME_PROMPT_NOTE
        : `Restored as version ${n.version}`;
  return (
    <p className="ih-notice" role="status">
      {text}
    </p>
  );
}
