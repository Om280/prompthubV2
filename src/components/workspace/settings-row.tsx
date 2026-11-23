"use client";

import { ChevronDown } from "lucide-react";
import { LENGTH_LABELS, TARGET_LABELS, type Length, type TargetPlatform } from "@/lib/contracts";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "@/components/ui/menu";
import { UnderlineRadio } from "@/components/ui/underline-radio";
import { cn } from "@/lib/utils";
import { LENGTH_DESCRIPTIONS, TARGET_TIPS } from "./labels";
import { useWorkspace } from "./workspace-context";

const TARGETS: TargetPlatform[] = ["chatgpt", "claude", "gemini"];
const LENGTHS: Length[] = ["concise", "balanced", "detailed"];

export function SettingsRow({ className }: { className?: string }) {
  const { state, actions } = useWorkspace();
  const busy = state.phase === "generating" || state.phase === "transforming" || state.phase === "clarifying";
  const g = state.generated;
  const hasPrompt = state.versions.length > 0;

  let regen: string | null = null;
  if (hasPrompt && g && !busy) {
    if (state.target !== g.target) regen = `Regenerate for ${TARGET_LABELS[state.target]}`;
    else if (state.length !== g.length) regen = `Regenerate as ${LENGTH_LABELS[state.length]}`;
  }

  return (
    <div className={cn("flex min-h-9 items-center gap-3", className)}>
      <div className="fade-x -my-1 flex min-w-0 flex-1 items-center gap-3 py-1 pr-4 sm:[mask-image:none] sm:pr-0">
        <span className="shrink-0 type-ui text-fg-subtle" id="target-label">
          For
        </span>
        <UnderlineRadio
          value={state.target}
          onChange={(target) => actions.dispatch({ type: "setTarget", target })}
          label="Target platform"
          layoutId="target-bar"
          options={TARGETS.map((t) => ({ value: t, label: TARGET_LABELS[t], tip: TARGET_TIPS[t] }))}
        />
        {regen && (
          <Button variant="accent" className="ml-2 hidden shrink-0 sm:inline-flex" onClick={actions.regenerate}>
            {regen}
          </Button>
        )}
      </div>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="ghost" className="-mr-2.5 shrink-0 gap-1 text-fg-muted" aria-label={`Length: ${LENGTH_LABELS[state.length]}`}>
            {LENGTH_LABELS[state.length]}
            <ChevronDown className="size-3.5" aria-hidden />
          </Button>
        </MenuTrigger>
        <MenuContent align="end">
          <MenuRadioGroup
            value={state.length}
            onValueChange={(v) => actions.dispatch({ type: "setLength", length: v as Length })}
          >
            {LENGTHS.map((l) => (
              <MenuRadioItem key={l} value={l} label={LENGTH_LABELS[l]} description={LENGTH_DESCRIPTIONS[l]} />
            ))}
          </MenuRadioGroup>
        </MenuContent>
      </Menu>
    </div>
  );
}

/** On phones the "Regenerate for …" button sits on its own line under the settings row. */
export function RegenerateForMobile() {
  const { state, actions } = useWorkspace();
  const g = state.generated;
  const busy = state.phase === "generating" || state.phase === "transforming";
  if (!g || state.versions.length === 0 || busy) return null;
  const label =
    state.target !== g.target
      ? `Regenerate for ${TARGET_LABELS[state.target]}`
      : state.length !== g.length
        ? `Regenerate as ${LENGTH_LABELS[state.length]}`
        : null;
  if (!label) return null;
  return (
    <Button variant="accent" className="-ml-1 sm:hidden" onClick={actions.regenerate}>
      {label}
    </Button>
  );
}
