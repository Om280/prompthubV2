"use client";

import { CenterDialog } from "@/components/ui/sheet";
import { useWorkspace } from "@/components/workspace/workspace-context";

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="ih-kbd-group">
      <span className="ih-sr">{keys.join(" ")}</span>
      {keys.map((k, i) => (
        <kbd key={`${k}-${i}`} aria-hidden className="ih-kbd">
          {k}
        </kbd>
      ))}
    </span>
  );
}

/** "?" sheet: every shortcut, with the Alt N fallback for browsers that keep Ctrl/⌘ N. */
export function ShortcutSheet() {
  const { shortcutsOpen, setShortcutsOpen, keys } = useWorkspace();
  const k = keys;
  const rows: { label: string; keys: string[][] }[] = [
    { label: "Search or run a command", keys: [[k.mod, "K"]] },
    { label: "Generate or continue", keys: [[k.mod, k.enter]] },
    { label: "Copy prompt", keys: [[k.mod, k.shift, "C"]] },
    { label: "New prompt", keys: [[k.mod, "N"], [k.alt, "N"]] },
    { label: "Show or hide history", keys: [[k.mod, "\\"]] },
    { label: "Skip question", keys: [[k.alt, "S"]] },
    { label: "Previous or next version", keys: [[k.alt, "["], [k.alt, "]"]] },
    { label: "Search history", keys: [["/"]] },
    { label: "Show shortcuts", keys: [["?"]] },
  ];
  return (
    <CenterDialog
      open={shortcutsOpen}
      onOpenChange={setShortcutsOpen}
      title="Keyboard shortcuts"
      footer={
        <p className="ih-hint mt-4">
          If {k.mod} N opens a new window, use {k.alt} N.
        </p>
      }
    >
      <dl className="ih-shortcut-list">
        {rows.map((r) => (
          <div key={r.label} className="ih-shortcut-row">
            <dt>{r.label}</dt>
            <dd>
              {r.keys.map((combo, i) => (
                <span key={combo.join("+")} className="flex items-center gap-1.5">
                  {i > 0 && <span>or</span>}
                  <Keys keys={combo} />
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </CenterDialog>
  );
}
