"use client";

import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { TARGET_LABELS, type PromptRecord } from "@/lib/contracts";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { relativeShort } from "@/lib/utils";

/**
 * One saved prompt (DIRECTION-C §5): title, the platform in its colour, the version count and the
 * time. The open row gets a 4px platform spine. F2 renames, Delete deletes.
 */
export function HistoryRow({
  item,
  active,
  now,
  versions,
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
  versions: number | undefined;
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
    <div className="ih-row-wrap" data-active={active} data-platform-row={item.target}>
      {renaming ? (
        <RenameInput title={item.title} onRename={onRename} onCancel={onCancelRename} />
      ) : (
        <>
          <button
            type="button"
            data-row-button
            className="ih-row"
            aria-current={active ? "page" : undefined}
            onClick={onOpen}
            onKeyDown={onKey}
          >
            <span className="ih-row-title">{item.title}</span>
            <span className="ih-row-meta">
              <span className="ih-row-platform">
                <i aria-hidden />
                {TARGET_LABELS[item.target]}
              </span>
              {versions !== undefined && <span>{versions === 1 ? "1 version" : `${versions} versions`}</span>}
              {now > 0 && <span className="ih-row-when">{relativeShort(item.updatedAt, now)}</span>}
            </span>
          </button>
          <Menu>
            <MenuTrigger asChild>
              <button type="button" className="ih-row-more" aria-label={`More actions for ${item.title}`}>
                <MoreHorizontal size={17} aria-hidden />
              </button>
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

/** Inline rename: Enter or blur saves, Esc cancels, an empty name reverts. */
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
      className="ih-rename"
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
    <div className="ih-deleted-row">
      <span className="ih-deleted-title">{item.title}</span>
      <Button variant="secondary" size="sm" onClick={onRestore}>
        Restore
      </Button>
      <Menu>
        <MenuTrigger asChild>
          <Button size="sm" icon aria-label={`More actions for ${item.title}`}>
            <MoreHorizontal size={17} aria-hidden />
          </Button>
        </MenuTrigger>
        <MenuContent align="end" className="min-w-[160px]">
          <MenuItem onSelect={onPurge} className="ih-danger-text">
            Delete forever
          </MenuItem>
        </MenuContent>
      </Menu>
    </div>
  );
}
