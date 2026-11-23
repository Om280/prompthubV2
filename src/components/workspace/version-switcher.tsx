"use client";

import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tip } from "@/components/ui/tooltip";
import { useNow } from "@/hooks/use-history";
import { useIsMobile } from "@/hooks/use-media";
import { cn, relativeLong } from "@/lib/utils";
import { engineName, versionLabel } from "./labels";
import { useWorkspace } from "./workspace-context";

/** ‹ Version 3 of 5 › Improved (DESIGN §6.7). */
export function VersionSwitcher() {
  const { state, actions, keys, preview } = useWorkspace();
  const [open, setOpen] = useState(false);
  const now = useNow();
  const mobile = useIsMobile();
  const total = state.versions.length;
  if (total === 0) return null;
  const index = state.viewing ?? total - 1;
  const current = state.versions[index];
  const busy = !!state.stream;

  return (
    <div className="flex min-w-0 items-center gap-1">
      <Tip label="Previous version" keys={[keys.alt, "["]}>
        <Button
          variant="icon"
          className="size-7 coarse:size-11"
          aria-label="Previous version"
          disabled={index === 0 || busy}
          onClick={() => actions.dispatch({ type: "stepVersion", delta: -1 })}
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
      </Tip>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            className="h-7 px-1.5 text-fg tabular-nums"
            disabled={busy}
            data-testid="version-label"
            aria-label={`Version ${index + 1} of ${total}`}
          >
            {mobile ? `v${index + 1} of ${total}` : `Version ${index + 1} of ${total}`}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[280px] p-1">
          <ol className="flex max-h-[320px] flex-col overflow-y-auto" aria-label="Versions">
            {[...state.versions]
              .map((v, i) => ({ v, i }))
              .reverse()
              .map(({ v, i }) => (
                <li key={v.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-start gap-2 rounded-sm px-2.5 py-2 text-left hover:bg-surface-2 focus-visible:bg-surface-2 coarse:min-h-11",
                    )}
                    aria-current={i === index ? "true" : undefined}
                    onClick={() => {
                      actions.dispatch({ type: "viewVersion", index: i });
                      setOpen(false);
                    }}
                  >
                    <span className="w-5 shrink-0 pt-px type-ui text-fg-subtle tabular-nums">{i + 1}</span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="type-ui text-fg">
                        {versionLabel(v)}, {relativeLong(v.createdAt, now)}
                      </span>
                      <span className="type-meta text-fg-subtle">
                        {v.engine.kind === "manual" ? "Edited by you" : engineName(v.engine, preview)}
                      </span>
                    </span>
                    {i === index && <Check className="mt-0.5 size-3.5 shrink-0 text-fg" aria-hidden />}
                  </button>
                </li>
              ))}
          </ol>
        </PopoverContent>
      </Popover>
      <Tip label="Next version" keys={[keys.alt, "]"]}>
        <Button
          variant="icon"
          className="size-7 coarse:size-11"
          aria-label="Next version"
          disabled={index === total - 1 || busy}
          onClick={() => actions.dispatch({ type: "stepVersion", delta: 1 })}
        >
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </Tip>
      <span className="ml-1.5 truncate type-ui text-fg-subtle">{versionLabel(current)}</span>
    </div>
  );
}
