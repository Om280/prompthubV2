"use client";

import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tip } from "@/components/ui/tooltip";
import { useNow } from "@/hooks/use-history";
import { relativeLong } from "@/lib/utils";
import { engineName, versionLabel } from "./labels";
import { useWorkspace } from "./workspace-context";

/**
 * ‹ Version 2 of 2 › Edited (DIRECTION-C §6). The label opens the list of versions. `compact` is the
 * phone action bar's "2 of 2" (its accessible name stays "Version 2 of 2").
 */
export function VersionSwitcher({ compact = false }: { compact?: boolean }) {
  const { state, actions, keys, preview } = useWorkspace();
  const [open, setOpen] = useState(false);
  const now = useNow();
  const total = state.versions.length;
  if (total === 0) return null;
  const index = state.viewing ?? total - 1;
  const current = state.versions[index];
  const busy = !!state.stream;

  return (
    <div className="ih-vswitch">
      <Tip label="Previous version" keys={[keys.alt, "["]}>
        <Button
          size="sm"
          icon
          aria-label="Previous version"
          disabled={index === 0 || busy}
          onClick={() => actions.dispatch({ type: "stepVersion", delta: -1 })}
        >
          <ChevronLeft size={16} aria-hidden />
        </Button>
      </Tip>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="ih-vlabel"
            disabled={busy}
            data-testid="version-label"
            aria-label={`Version ${index + 1} of ${total}`}
          >
            {compact ? `${index + 1} of ${total}` : `Version ${index + 1} of ${total}`}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[288px] p-1.5">
          <ol className="ih-vlist" aria-label="Versions">
            {[...state.versions]
              .map((v, i) => ({ v, i }))
              .reverse()
              .map(({ v, i }) => (
                <li key={v.id}>
                  <button
                    type="button"
                    className="ih-menu-item items-start"
                    aria-current={i === index ? "true" : undefined}
                    onClick={() => {
                      actions.dispatch({ type: "viewVersion", index: i });
                      setOpen(false);
                    }}
                  >
                    <span className="ih-vlist-num">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block">
                        {versionLabel(v)}, {relativeLong(v.createdAt, now)}
                      </span>
                      <span className="ih-menu-item-desc">
                        {v.engine.kind === "manual" ? "Edited by you" : engineName(v.engine, preview)}
                      </span>
                    </span>
                    {i === index && <Check size={15} className="ih-menu-check" aria-hidden />}
                  </button>
                </li>
              ))}
          </ol>
        </PopoverContent>
      </Popover>
      <Tip label="Next version" keys={[keys.alt, "]"]}>
        <Button
          size="sm"
          icon
          aria-label="Next version"
          disabled={index === total - 1 || busy}
          onClick={() => actions.dispatch({ type: "stepVersion", delta: 1 })}
        >
          <ChevronRight size={16} aria-hidden />
        </Button>
      </Tip>
      {!compact && <span className="ih-vname">{versionLabel(current)}</span>}
    </div>
  );
}
