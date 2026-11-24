"use client";

import { History, Plus, Search } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tip } from "@/components/ui/tooltip";
import { EngineIndicator } from "./engine-indicator";
import { Mark } from "./mark";
import { useWorkspace } from "./workspace-context";

/**
 * Top bar on the canvas (DIRECTION-C §5): mark and wordmark (new prompt), the command field, the
 * engine label, History, New prompt, and the account slot.
 *
 * `accountSlot` is where the account control goes when sign-in lands (auth branch:
 * `<AccountButton />`). Until then nothing renders there: no avatar, no sign-in button.
 */
export function TopBar({ accountSlot }: { accountSlot?: ReactNode }) {
  const { railOpen, setRailOpen, setPaletteOpen, keys, newPrompt, wide, mobile, enginePlacement } = useWorkspace();
  const historyLabel = railOpen ? "Hide history" : "Show history";

  return (
    <header className="ih-topbar">
      <button type="button" className="ih-brand" onClick={newPrompt} aria-label="PromptHub, new prompt">
        <Mark />
        <span className="ih-wordmark" aria-hidden>
          PromptHub
        </span>
      </button>

      {mobile ? (
        <Button icon aria-label="Search or run a command" onClick={() => setPaletteOpen(true)}>
          <Search size={18} aria-hidden />
        </Button>
      ) : (
        <button
          type="button"
          className="ih-cmd"
          onClick={() => setPaletteOpen(true)}
          aria-label={wide ? undefined : "Search or run a command"}
          style={wide ? undefined : { flex: "none" }}
        >
          <Search size={16} aria-hidden />
          {wide && <span className="ih-cmd-text">Search or run a command</span>}
          <Kbd keys={[keys.mod, "K"]} />
        </button>
      )}

      <div className="ih-top-right">
        {enginePlacement === "topbar" && <EngineIndicator />}
        <Tip label={historyLabel} keys={[keys.mod, "\\"]}>
          <Button
            icon={mobile}
            aria-label={historyLabel}
            aria-expanded={railOpen}
            aria-controls="history-panel"
            data-testid="history-toggle"
            onClick={() => setRailOpen(!railOpen, "pointer")}
          >
            <History size={17} aria-hidden />
            {!mobile && <span aria-hidden>History</span>}
          </Button>
        </Tip>
        <Tip label="New prompt" keys={keys.newPrompt}>
          <Button
            variant={mobile ? "ghost" : "secondary"}
            icon={!wide}
            aria-label="New prompt"
            onClick={newPrompt}
          >
            <Plus size={16} aria-hidden />
            {wide && <span aria-hidden>New prompt</span>}
          </Button>
        </Tip>
        {accountSlot != null && (
          <div className="ih-account-slot" data-slot="account">
            {accountSlot}
          </div>
        )}
      </div>
    </header>
  );
}
