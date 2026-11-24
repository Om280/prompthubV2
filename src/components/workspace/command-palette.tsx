"use client";

import {
  Copy,
  FileText,
  History,
  Keyboard,
  Monitor,
  Moon,
  Plus,
  RotateCcw,
  Ruler,
  Search,
  Sparkle,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { Dialog } from "radix-ui";
import { useMemo, useState, type ReactNode } from "react";
import { LENGTH_LABELS, TARGET_LABELS, type TargetPlatform } from "@/lib/contracts";
import { Kbd } from "@/components/ui/kbd";
import { PLATFORMS } from "@/components/ui/segment";
import { useHistoryLists } from "@/hooks/use-history";
import { useTheme } from "@/hooks/use-theme";
import { LENGTHS, regenerateLabel } from "./settings-row";
import { useWorkspace } from "./workspace-context";

interface Command {
  id: string;
  label: string;
  group: "Actions" | "Prompts";
  icon: LucideIcon;
  /** Extra words that should find it ("dark", "mode"). */
  keywords?: string;
  hint?: ReactNode;
  platform?: TargetPlatform;
  run: () => void;
}

/**
 * Ctrl/⌘ K (DIRECTION-C §5). Graphite, at 14vh, an input and a listbox. Opened from the keyboard many
 * times a day, so it never animates. Arrow keys move, Enter runs, Esc closes.
 */
export function CommandPalette() {
  const { paletteOpen, setPaletteOpen } = useWorkspace();
  return (
    <Dialog.Root open={paletteOpen} onOpenChange={setPaletteOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="ih-palette-scrim" />
        <Dialog.Content className="ih-palette ih-on-graphite" aria-describedby={undefined}>
          <Dialog.Title className="ih-sr">Commands</Dialog.Title>
          {paletteOpen && <PaletteBody close={() => setPaletteOpen(false)} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PaletteBody({ close }: { close: () => void }) {
  const w = useWorkspace();
  const { state, actions, keys, history, railOpen, setRailOpen, copyText, copyPrompt, newPrompt, setShortcutsOpen } = w;
  const { theme, preference, setPreference } = useTheme();
  const lists = useHistoryLists(history);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);

  const commands = useMemo<Command[]>(() => {
    const out: Command[] = [];
    const canGenerate =
      (state.phase === "idle" && state.idea.trim()) || state.phase === "answering";
    if (canGenerate)
      out.push({ id: "generate", group: "Actions", icon: Sparkle, label: "Generate prompt", hint: <Kbd keys={[keys.mod, keys.enter]} tone="on-graphite" />, run: actions.primary });
    const regen = regenerateLabel(state);
    if (regen) out.push({ id: "regen-for", group: "Actions", icon: RotateCcw, label: regen, run: actions.regenerate });
    if (copyText.trim())
      out.push({ id: "copy", group: "Actions", icon: Copy, label: "Copy prompt", hint: <Kbd keys={[keys.mod, keys.shift, "C"]} tone="on-graphite" />, run: () => copyPrompt("keyboard") });
    out.push({ id: "new", group: "Actions", icon: Plus, label: "New prompt", hint: <Kbd keys={keys.newPrompt} tone="on-graphite" />, run: newPrompt });
    out.push({
      id: "history",
      group: "Actions",
      icon: History,
      label: railOpen ? "Hide history" : "Show history",
      hint: <Kbd keys={[keys.mod, "\\"]} tone="on-graphite" />,
      run: () => setRailOpen(!railOpen, "keyboard"),
    });
    for (const p of PLATFORMS)
      if (p !== state.target)
        out.push({
          id: `for-${p}`,
          group: "Actions",
          icon: FileText,
          label: `Write for ${TARGET_LABELS[p]}`,
          keywords: "platform target",
          platform: p,
          run: () => actions.dispatch({ type: "setTarget", target: p }),
        });
    for (const l of LENGTHS)
      if (l !== state.length)
        out.push({
          id: `len-${l}`,
          group: "Actions",
          icon: Ruler,
          label: `Make it ${LENGTH_LABELS[l].toLowerCase()}`,
          keywords: "length",
          run: () => actions.dispatch({ type: "setLength", length: l }),
        });
    out.push({
      id: "theme",
      group: "Actions",
      icon: theme === "dark" ? Sun : Moon,
      label: theme === "dark" ? "Switch to light theme" : "Switch to dark theme",
      keywords: "theme appearance mode",
      run: () => setPreference(theme === "dark" ? "light" : "dark"),
    });
    if (preference !== "system")
      out.push({ id: "system", group: "Actions", icon: Monitor, label: "Use system theme", keywords: "theme appearance", run: () => setPreference("system") });
    out.push({ id: "keys", group: "Actions", icon: Keyboard, label: "Keyboard shortcuts", hint: <Kbd keys={["?"]} tone="on-graphite" />, run: () => setShortcutsOpen(true) });
    for (const p of lists.active)
      out.push({
        id: `open-${p.id}`,
        group: "Prompts",
        icon: FileText,
        label: `Open “${p.title}”`,
        keywords: p.idea,
        platform: p.target,
        hint: TARGET_LABELS[p.target],
        run: () => void actions.load(p.id),
      });
    return out;
  }, [state, actions, keys, copyText, copyPrompt, newPrompt, railOpen, setRailOpen, theme, preference, setPreference, setShortcutsOpen, lists.active]);

  const needle = q.trim().toLowerCase();
  const list = useMemo(() => {
    const matched = commands.filter(
      (c) => !needle || c.label.toLowerCase().includes(needle) || c.keywords?.toLowerCase().includes(needle),
    );
    // With no query, show the five most recent prompts; typing searches all of them.
    let prompts = 0;
    return matched.filter((c) => c.group !== "Prompts" || needle || ++prompts <= 5);
  }, [commands, needle]);
  const safeSel = Math.min(sel, Math.max(0, list.length - 1));

  const run = (c: Command | undefined) => {
    if (!c) return;
    close();
    c.run();
  };

  let lastGroup: string | null = null;
  return (
    <>
      <div className="ih-palette-input-wrap">
        <Search size={18} aria-hidden />
        <input
          autoFocus
          className="ih-palette-input"
          placeholder="Search or run a command"
          aria-label="Search or run a command"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-autocomplete="list"
          aria-activedescendant={list[safeSel] ? `cmd-${list[safeSel].id}` : undefined}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSel((safeSel + 1) % Math.max(1, list.length));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel((safeSel - 1 + list.length) % Math.max(1, list.length));
            } else if (e.key === "Home" && !q) {
              e.preventDefault();
              setSel(0);
            } else if (e.key === "End" && !q) {
              e.preventDefault();
              setSel(list.length - 1);
            } else if (e.key === "Enter") {
              e.preventDefault();
              run(list[safeSel]);
            }
          }}
        />
        <Kbd keys={["Esc"]} tone="on-graphite" />
      </div>
      <div className="ih-palette-list" role="listbox" id="palette-list" aria-label="Commands">
        {list.length === 0 && <p className="ih-palette-empty">No commands or prompts match &ldquo;{q.trim()}&rdquo;.</p>}
        {list.map((c, i) => {
          const header = c.group !== lastGroup && c.group === "Prompts" ? c.group : null;
          lastGroup = c.group;
          const Icon = c.icon;
          return (
            <div key={c.id} role="presentation">
              {header && (
                <div className="ih-palette-group" role="presentation">
                  {needle ? "Prompts" : "Recent prompts"}
                </div>
              )}
              <div
                id={`cmd-${c.id}`}
                role="option"
                aria-selected={i === safeSel}
                className="ih-palette-item"
                data-platform-row={c.platform}
                onPointerMove={() => i !== safeSel && setSel(i)}
                onClick={() => run(c)}
              >
                <Icon size={16} aria-hidden />
                <span>{c.label}</span>
                {c.hint && <span className="ih-palette-hint">{c.hint}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
