"use client";

import { CenterDialog } from "@/components/ui/sheet";
import { useWorkspace } from "@/components/workspace/workspace-context";

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="flex items-center gap-0.5">
      <span className="sr-only">{keys.join(" ")}</span>
      {keys.map((k, i) => (
        <kbd
          key={`${k}-${i}`}
          aria-hidden
          className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-xs px-[5px] font-sans type-kbd text-fg-subtle shadow-[inset_0_0_0_1px_var(--color-border-control)]"
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}

/** "?" sheet (DESIGN §6.10). */
export function ShortcutSheet() {
  const { shortcutsOpen, setShortcutsOpen, keys } = useWorkspace();
  const k = keys;
  const rows: { label: string; keys: string[][] }[] = [
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
        <p className="mt-5 type-meta text-fg-subtle">
          If {k.mod} N opens a new window, use {k.alt} N.
        </p>
      }
    >
      <dl className="flex flex-col">
        {rows.map((r) => (
          <div key={r.label} className="flex min-h-9 items-center justify-between gap-4 border-b border-border last:border-b-0">
            <dt className="type-ui text-fg">{r.label}</dt>
            <dd className="flex items-center gap-1.5">
              {r.keys.map((combo, i) => (
                <span key={combo.join("+")} className="flex items-center gap-1.5">
                  {i > 0 && <span className="type-meta text-fg-subtle">or</span>}
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
