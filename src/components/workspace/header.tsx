"use client";

import { Moon, PanelLeft, Plus, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tip } from "@/components/ui/tooltip";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";
import { EngineIndicator } from "./engine-indicator";
import { useWorkspace } from "./workspace-context";

export function Header({ hideBrand = false }: { hideBrand?: boolean }) {
  const { railOpen, setRailOpen, setShortcutsOpen, keys, newPrompt } = useWorkspace();
  const { theme, toggle } = useTheme();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const historyLabel = railOpen ? "Hide history" : "Show history";

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-bg px-[calc(var(--gutter)-8px)]",
        scrolled ? "border-border" : "border-transparent",
      )}
    >
      {!hideBrand && (
        <>
          <Tip label={historyLabel} keys={[keys.mod, "\\"]}>
            <Button
              variant="icon"
              aria-label={historyLabel}
              aria-expanded={railOpen}
              aria-controls="history-rail"
              data-testid="history-toggle"
              onClick={() => setRailOpen(!railOpen, "pointer")}
            >
              <PanelLeft className="size-[18px]" aria-hidden />
            </Button>
          </Tip>
          <span className="type-wordmark text-fg-strong">PromptHub</span>
        </>
      )}
      <div className="flex-1" />
      <EngineIndicator />
      <Tip label="New prompt" keys={keys.newPrompt}>
        <Button variant="ghost" className="hidden gap-2 sm:inline-flex" onClick={newPrompt}>
          New prompt
          <Kbd keys={keys.newPrompt} />
        </Button>
      </Tip>
      <Button variant="icon" className="sm:hidden" aria-label="New prompt" onClick={newPrompt}>
        <Plus className="size-[18px]" aria-hidden />
      </Button>
      <Tip label="Keyboard shortcuts" keys={["?"]}>
        <Button
          variant="icon"
          className="hidden type-ui sm:fine:inline-flex"
          aria-label="Keyboard shortcuts"
          onClick={() => setShortcutsOpen(true)}
        >
          ?
        </Button>
      </Tip>
      <Tip label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
        <Button
          variant="icon"
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          onClick={toggle}
        >
          {theme === "dark" ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
        </Button>
      </Tip>
    </header>
  );
}
