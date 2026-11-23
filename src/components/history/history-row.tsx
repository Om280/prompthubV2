"use client";

import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { PromptRecord } from "@/lib/contracts";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { cn, relativeShort } from "@/lib/utils";

/** One saved prompt in the rail (DESIGN §6.9). */
export function HistoryRow({
  item,
  active,
  now,
  renaming,
  onOpen,
  onStartRename,
  onRename,
  onCancelRename,
  onDelete,
}: {
  item: PromptRecord;
  active: boolean;
  now: number;
  renaming: boolean;
  onOpen: () => void;
  onStartRename: () => void;
  onRename: (title: string) => void;
  onCancelRename: () => void;
  onDelete: () => void;
}) {
  const pendingRename = useRef(false);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "F2") {
      e.preventDefault();
      onStartRename();
    } else if (e.key === "Delete") {
      e.preventDefault();
      onDelete();
    }
  };

  return (
    <div
      className={cn(
        "group relative flex h-9 items-center rounded-sm coarse:h-11",
        active ? "bg-surface-2" : "hover:bg-surface-2 focus-within:bg-surface-2",
      )}
    >
      {active && <span aria-hidden className="absolute inset-y-1.5 left-0 w-0.5 rounded-xs bg-accent" />}
      {renaming ? (
        <RenameInput title={item.title} onRename={onRename} onCancel={onCancelRename} />
      ) : (
        <>
          <button
            type="button"
            data-row-button
            aria-current={active ? "page" : undefined}
            onClick={onOpen}
            onKeyDown={onKey}
            className="flex h-full min-w-0 flex-1 items-center gap-3 rounded-sm pl-3 pr-10 text-left"
          >
            <span className="min-w-0 flex-1 truncate text-[14px] leading-5 text-fg">{item.title}</span>
          </button>
          <span
            aria-hidden
            className="pointer-events-none absolute right-3 type-meta text-fg-subtle tabular-nums group-focus-within:opacity-0 fine:group-hover:opacity-0 coarse:right-12"
          >
            {relativeShort(item.updatedAt, now)}
          </span>
          <Menu>
            <MenuTrigger asChild>
              <Button
                variant="icon"
                aria-label={`More actions for ${item.title}`}
                className="absolute right-1 size-7 opacity-0 group-focus-within:opacity-100 data-[state=open]:opacity-100 fine:group-hover:opacity-100 coarse:size-11 coarse:opacity-100"
              >
                <MoreHorizontal className="size-4" aria-hidden />
              </Button>
            </MenuTrigger>
            <MenuContent
              align="end"
              className="min-w-[160px]"
              onCloseAutoFocus={(e) => {
                if (pendingRename.current) e.preventDefault();
                pendingRename.current = false;
              }}
            >
              <MenuItem
                onSelect={() => {
                  pendingRename.current = true;
                  onStartRename();
                }}
              >
                Rename
              </MenuItem>
              <MenuItem onSelect={onDelete}>Delete</MenuItem>
            </MenuContent>
          </Menu>
        </>
      )}
    </div>
  );
}

/** Inline rename (§6.9): Enter or blur saves, Esc cancels, an empty name reverts. */
function RenameInput({
  title,
  onRename,
  onCancel,
}: {
  title: string;
  onRename: (title: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(title);
  const input = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    const t = value.trim();
    if (save && t && t !== title) onRename(t);
    else onCancel();
  };

  return (
    <input
      ref={input}
      value={value}
      aria-label="Rename prompt"
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          finish(true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
      className="mx-3 h-7 min-w-0 flex-1 bg-transparent text-[14px] leading-5 text-fg shadow-[inset_0_-2px_0_0_var(--color-accent)] coarse:text-base"
    />
  );
}

export function DeletedRow({
  item,
  onRestore,
  onPurge,
}: {
  item: PromptRecord;
  onRestore: () => void;
  onPurge: () => void;
}) {
  return (
    <div className="group flex h-9 items-center gap-1 rounded-sm pl-3 pr-1 hover:bg-surface-2 focus-within:bg-surface-2 coarse:h-11">
      <span className="min-w-0 flex-1 truncate text-[14px] leading-5 text-fg-muted">{item.title}</span>
      <Button variant="accent" className="shrink-0" onClick={onRestore}>
        Restore
      </Button>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="icon" aria-label={`More actions for ${item.title}`} className="size-7 coarse:size-11">
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
        </MenuTrigger>
        <MenuContent align="end" className="min-w-[160px]">
          <MenuItem onSelect={onPurge} className="text-danger">
            Delete forever
          </MenuItem>
        </MenuContent>
      </Menu>
    </div>
  );
}
