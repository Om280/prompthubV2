"use client";

import { ChevronDown, LoaderCircle, Maximize2, Minimize2, PenLine, RotateCw, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { TONE_LABELS, type Tone } from "@/lib/contracts";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "@/components/ui/menu";
import { Tip } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-media";
import { latest, type Activity, type SessionState } from "@/hooks/use-session";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";
import { MAX_PROMPT_CHARS } from "./editor";
import { BASIC_REASON, writingLabel } from "./labels";
import { VersionSwitcher } from "./version-switcher";
import { useWorkspace } from "./workspace-context";

export const TONES: Tone[] = ["neutral", "friendly", "professional", "direct", "playful"];

export type RefineAction = "improve" | "shorten" | "expand" | "regenerate";

export const REFINE: { action: RefineAction; label: string; icon: LucideIcon }[] = [
  { action: "improve", label: "Improve", icon: PenLine },
  { action: "shorten", label: "Shorten", icon: Minimize2 },
  { action: "expand", label: "Expand", icon: Maximize2 },
  { action: "regenerate", label: "Regenerate", icon: RotateCw },
];

export function currentTone(state: SessionState): Tone {
  const v = state.viewing !== null ? state.versions[state.viewing] : latest(state);
  return v?.source === "tone" && v.tone ? v.tone : "neutral";
}

/** Why a refine/tone action is unavailable right now, or null when it can run. */
export function refineBlock(
  state: SessionState,
  basic: boolean,
  action: RefineAction | "tone",
): "busy" | "basic" | "viewing" | "long" | "empty" | null {
  if (state.versions.length === 0) return "empty";
  if (state.stream) return "busy";
  if (basic && action !== "regenerate") return "basic";
  if (state.viewing !== null) return "viewing";
  if (action !== "regenerate" && state.draft.length > MAX_PROMPT_CHARS) return "long";
  return null;
}

export function isActive(state: SessionState, action: Activity) {
  return state.stream?.activity === action;
}

/**
 * Sticky toolbar (DESIGN §6.6), inside the column: refine group and Tone on the left, Copy flush with
 * the column's right edge. The version switcher lives on the meta row under the title (≥640).
 */
export function Toolbar() {
  const { state, actions, preview } = useWorkspace();
  const mobile = useIsMobile();
  const sentinel = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting), {
      rootMargin: "-57px 0px 0px 0px",
      threshold: 0,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const streaming = !!state.stream;
  const hasVersions = state.versions.length > 0;
  const status = writingLabel(state, preview);
  const stop = (
    <Button variant="outline" className="hidden h-8 shrink-0 gap-2 px-3 sm:inline-flex" onClick={() => actions.stop()}>
      Stop
      <Kbd keys={["Esc"]} />
    </Button>
  );

  return (
    <>
      <div ref={sentinel} aria-hidden className="h-px" />
      {/* Phones: the version switcher (or the stream status) gets its own row; actions live in the bottom bar. */}
      <div className="flex min-h-12 items-center sm:hidden">
        {streaming ? (
          <p className="truncate type-ui text-fg-muted" aria-live="polite">
            {status}
          </p>
        ) : (
          mobile && <VersionSwitcher />
        )}
      </div>
      <div
        data-stuck={stuck || undefined}
        className={cn(
          "z-20 -mt-px hidden border-b border-transparent bg-bg sm:sticky sm:top-14 sm:block",
          "data-[stuck]:border-border data-[stuck]:shadow-float",
        )}
      >
        <div className="@container flex min-h-12 items-center gap-3">
          {hasVersions ? (
            <>
              <div className="-ml-2 flex min-w-0 items-center gap-0.5 @min-[660px]:-ml-2.5">
                {REFINE.map((r) => (
                  <RefineButton key={r.action} {...r} />
                ))}
                <ToneMenu />
              </div>
              <div className="flex-1" />
              <CopyButton />
            </>
          ) : (
            streaming && (
              <>
                <p className="truncate type-ui text-fg-muted" aria-live="polite">
                  {status}
                </p>
                {stop}
              </>
            )
          )}
        </div>
      </div>
      {/* A regenerate or transform over an existing prompt: status and Stop sit just under the toolbar. */}
      {hasVersions && streaming && (
        <div className="mt-2 hidden items-center gap-3 sm:flex">
          <p className="truncate type-ui text-fg-muted" aria-live="polite">
            {status}
          </p>
          {stop}
        </div>
      )}
    </>
  );
}

function RefineButton({ action, label, icon: Icon }: { action: RefineAction; label: string; icon: LucideIcon }) {
  const { state, actions, basic } = useWorkspace();
  const block = refineBlock(state, basic, action);
  const spinning = isActive(state, action);
  const run = () => (action === "regenerate" ? actions.regenerate() : actions.transform(action));
  return (
    <Tip label={block === "basic" ? BASIC_REASON : label} className={block === "basic" ? "max-w-[300px]" : undefined}>
      <Button
        variant="ghost"
        aria-disabled={block ? true : undefined}
        aria-label={label}
        className="gap-1.5 px-2 @min-[660px]:px-2.5"
        onClick={run}
      >
        {spinning ? (
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <Icon className="size-3.5" aria-hidden />
        )}
        <span className="hidden @min-[660px]:inline">{label}</span>
      </Button>
    </Tip>
  );
}

function ToneMenu() {
  const { state, actions, basic } = useWorkspace();
  const block = refineBlock(state, basic, "tone");
  const spinning = isActive(state, "tone");
  const trigger = (
    <Button variant="ghost" aria-disabled={block ? true : undefined} className="gap-1 px-2 @min-[660px]:px-2.5">
      {spinning && <LoaderCircle className="size-3.5 animate-spin" aria-hidden />}
      Tone
      <ChevronDown className="size-3.5" aria-hidden />
    </Button>
  );
  if (block) {
    return (
      <Tip label={block === "basic" ? BASIC_REASON : "Tone"} className="max-w-[300px]">
        {trigger}
      </Tip>
    );
  }
  return (
    <Menu>
      <MenuTrigger asChild>{trigger}</MenuTrigger>
      <MenuContent align="end" className="min-w-[200px]">
        <MenuRadioGroup value={currentTone(state)} onValueChange={(v) => actions.transform("tone", v as Tone)}>
          {TONES.map((t) => (
            <MenuRadioItem key={t} value={t} label={TONE_LABELS[t]} />
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}
