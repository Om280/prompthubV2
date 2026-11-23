"use client";

import { PanelLeftClose, Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { TARGET_LABELS, type TargetPlatform } from "@/lib/contracts";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tip } from "@/components/ui/tooltip";
import { UnderlineRadio } from "@/components/ui/underline-radio";
import { useWorkspace } from "@/components/workspace/workspace-context";
import { useHistoryLists, useNow } from "@/hooks/use-history";
import { filterPrompts, groupByDate } from "@/lib/history/group";
import { cn } from "@/lib/utils";
import { DeletedRow, HistoryRow } from "./history-row";

type Filter = TargetPlatform | "all";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  ...(["chatgpt", "claude", "gemini"] as const).map((t) => ({ value: t, label: TARGET_LABELS[t] })),
];

const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;
const timestamp = () => Date.now();

/**
 * History rail contents (DESIGN §6.9), shared by the docked rail (≥900) and the mobile sheet.
 */
export function HistoryPanel({ variant, onChosen }: { variant: "docked" | "sheet"; onChosen?: () => void }) {
  const { history, state, actions, setRailOpen, keys, searchRef, newPrompt } = useWorkspace();
  const lists = useHistoryLists(history);
  const now = useNow();
  const [view, setView] = useState<"list" | "deleted">("list");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [renaming, setRenaming] = useState<string | null>(null);

  const groups = useMemo(
    () => groupByDate(filterPrompts(lists.active, { query, target: filter }), now),
    [lists.active, query, filter, now],
  );

  const remove = async (id: string) => {
    await history.softDelete(id, timestamp());
    if (state.promptId === id) newPrompt();
    toast("Moved to Recently deleted", {
      id: `deleted-${id}`,
      duration: 6000,
      action: { label: "Undo", onClick: () => void history.restore(id) },
    });
  };

  const onListKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const rows = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("[data-row-button]"));
    const i = rows.indexOf(document.activeElement as HTMLButtonElement);
    if (i === -1) return;
    e.preventDefault();
    rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))]?.focus();
  };

  const header =
    variant === "docked" ? (
      <div className="flex h-14 shrink-0 items-center justify-between pl-5 pr-2">
        <h2 className="type-ui text-fg">History</h2>
        <Tip label="Hide history" keys={[keys.mod, "\\"]}>
          <Button variant="icon" aria-label="Hide history" onClick={() => setRailOpen(false, "pointer")}>
            <PanelLeftClose className="size-[18px]" aria-hidden />
          </Button>
        </Tip>
      </div>
    ) : null;

  const pad = variant === "docked" ? "px-3" : "";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {header}

      {!history.persistent && (
        <p className={cn("mb-3 type-meta text-fg-muted", variant === "docked" ? "px-5" : "")}>
          History can&apos;t be saved in this browser mode. It will clear when you close the tab.
        </p>
      )}

      {view === "list" ? (
        <>
          <div className={cn("shrink-0", variant === "docked" ? "px-5" : "")}>
            <label className="field-line flex h-9 items-center gap-2 coarse:h-11">
              <Search className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
              <span className="sr-only">Search prompts</span>
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && query) {
                    e.preventDefault();
                    e.stopPropagation();
                    setQuery("");
                  }
                }}
                placeholder="Search prompts"
                className="h-full min-w-0 flex-1 bg-transparent text-[14px] leading-5 text-fg [&::-webkit-search-cancel-button]:hidden coarse:text-base"
              />
              <Kbd keys={["/"]} />
            </label>
            <UnderlineRadio
              className="mt-2"
              size="sm"
              value={filter}
              onChange={setFilter}
              options={FILTERS}
              label="Filter by platform"
              layoutId={`history-filter-${variant}`}
            />
          </div>

          <div className={cn("mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4", pad)} onKeyDown={onListKey}>
            {lists.loaded && lists.active.length === 0 && (
              <p className="px-4 pt-10 text-center type-meta text-fg-subtle">
                Prompts you generate are saved here automatically.
              </p>
            )}
            {lists.active.length > 0 && groups.length === 0 && (
              <div className="px-4 pt-10 text-center">
                <p className="type-meta text-fg-subtle">No prompts match &ldquo;{query}&rdquo;.</p>
                <Button
                  variant="accent"
                  className="mt-1 type-meta"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                    searchRef.current?.focus();
                  }}
                >
                  Clear search
                </Button>
              </div>
            )}
            {groups.map((g) => (
              <section key={g.label} aria-label={g.label}>
                <h3 className="px-3 pb-1 pt-4 type-meta text-fg-subtle">{g.label}</h3>
                <ul>
                  <AnimatePresence initial={false}>
                    {g.items.map((item) => (
                      <motion.li
                        key={item.id}
                        layout="position"
                        exit={{ height: 0, opacity: 0, transition: { duration: 0.2, ease: EASE_IN_OUT } }}
                        className="overflow-hidden"
                      >
                        <HistoryRow
                          item={item}
                          now={now}
                          active={state.promptId === item.id}
                          renaming={renaming === item.id}
                          onOpen={() => {
                            void actions.load(item.id);
                            onChosen?.();
                          }}
                          onStartRename={() => setRenaming(item.id)}
                          onCancelRename={() => setRenaming(null)}
                          onRename={(title) => {
                            setRenaming(null);
                            void history.rename(item.id, title);
                            if (state.promptId === item.id) actions.dispatch({ type: "setTitle", title });
                          }}
                          onDelete={() => void remove(item.id)}
                        />
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              </section>
            ))}
          </div>

          <div
            className={cn(
              "flex shrink-0 flex-col items-start gap-0.5 border-t border-border py-2",
              variant === "docked" ? "px-3" : "-mx-4 px-2",
            )}
          >
            <Button variant="text" className="h-8 gap-2 px-2" onClick={() => setView("deleted")}>
              Recently deleted
              {lists.deleted.length > 0 && <span className="type-meta text-fg-subtle tabular-nums">{lists.deleted.length}</span>}
            </Button>
            {variant === "docked" && (
              <Button variant="text" className="h-8 gap-2 px-2" onClick={() => setRailOpen(false, "pointer")}>
                Hide history
                <Kbd keys={[keys.mod, "\\"]} />
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className={cn("shrink-0", variant === "docked" ? "px-5" : "")}>
            <Button variant="text" className="-ml-1" onClick={() => setView("list")}>
              Back to history
            </Button>
            <p className="mt-2 type-meta text-fg-subtle">Items here are deleted for good after 30 days.</p>
          </div>
          <div className={cn("mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4", pad)}>
            {lists.deleted.length === 0 ? (
              <p className="px-4 pt-10 text-center type-meta text-fg-subtle">Nothing deleted in the last 30 days.</p>
            ) : (
              <ul>
                <AnimatePresence initial={false}>
                  {lists.deleted.map((item) => (
                    <motion.li
                      key={item.id}
                      layout="position"
                      exit={{ height: 0, opacity: 0, transition: { duration: 0.2, ease: EASE_IN_OUT } }}
                      className="overflow-hidden"
                    >
                      <DeletedRow
                        item={item}
                        onRestore={() => {
                          void history.restore(item.id);
                          toast("Restored");
                        }}
                        onPurge={() => {
                          void history.purge(item.id);
                          toast("Deleted for good");
                        }}
                      />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
