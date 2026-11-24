"use client";

import { ChevronLeft, Search, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { RadioGroup } from "radix-ui";
import { useMemo, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { TARGET_LABELS, type TargetPlatform } from "@/lib/contracts";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tip } from "@/components/ui/tooltip";
import { useWorkspace } from "@/components/workspace/workspace-context";
import { useHistoryLists, useNow } from "@/hooks/use-history";
import { filterPrompts, groupByDate } from "@/lib/history/group";
import { DeletedRow, HistoryRow } from "./history-row";

type Filter = TargetPlatform | "all";
const FILTERS: Filter[] = ["all", "chatgpt", "claude", "gemini"];

const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;
const timestamp = () => Date.now();

/**
 * History on the graphite plane (DIRECTION-C §5). The same contents dock as a panel at 900px and up
 * and open as a bottom sheet below it.
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

  const q = query.trim();

  return (
    <div className="ih-history ih-on-graphite" data-variant={variant}>
      {variant === "docked" && (
        <div className="ih-history-head">
          <h2 className="ih-history-title">History</h2>
          <Tip label="Hide history" keys={[keys.mod, "\\"]}>
            <Button icon aria-label="Hide history" onClick={() => setRailOpen(false, "pointer")}>
              <X size={18} aria-hidden />
            </Button>
          </Tip>
        </div>
      )}

      {!history.persistent && (
        <p className="ih-history-note">History can&apos;t be saved in this browser mode. It will clear when you close the tab.</p>
      )}

      {view === "list" ? (
        <>
          <div className="ih-search-wrap">
            <Search size={16} aria-hidden />
            <input
              ref={searchRef}
              type="search"
              className="ih-search"
              aria-label="Search prompts"
              placeholder="Search prompts"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && query) {
                  e.preventDefault();
                  e.stopPropagation();
                  setQuery("");
                }
              }}
            />
            <Kbd keys={["/"]} tone="on-graphite" />
          </div>
          <RadioGroup.Root
            className="ih-filters"
            aria-label="Filter by platform"
            value={filter}
            onValueChange={(v) => setFilter(v as Filter)}
            orientation="horizontal"
            loop
          >
            {FILTERS.map((f) => (
              <RadioGroup.Item key={f} value={f} className="ih-filter" data-platform-row={f === "all" ? undefined : f}>
                {f !== "all" && <i aria-hidden />}
                {f === "all" ? "All" : TARGET_LABELS[f]}
              </RadioGroup.Item>
            ))}
          </RadioGroup.Root>

          <div className="ih-hist-list" onKeyDown={onListKey}>
            {!lists.loaded && <p className="ih-hist-empty">Loading your prompts</p>}
            {lists.loaded && lists.active.length === 0 && (
              <p className="ih-hist-empty">Prompts you generate are saved here automatically.</p>
            )}
            {lists.active.length > 0 && groups.length === 0 && (
              <div className="ih-hist-empty">
                <p>
                  {q
                    ? `No prompts match “${q}”.`
                    : `No ${filter === "all" ? "" : `${TARGET_LABELS[filter]} `}prompts yet.`}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                    searchRef.current?.focus();
                  }}
                >
                  {q ? "Clear search" : "Show all"}
                </Button>
              </div>
            )}
            {groups.map((g) => (
              <section key={g.label} aria-label={g.label}>
                <h3 className="ih-group">{g.label}</h3>
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
                          versions={lists.counts[item.id]}
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

          <div className="ih-hist-foot">
            <Button size="sm" onClick={() => setView("deleted")}>
              <Trash2 size={14} aria-hidden />
              Recently deleted
              {lists.deleted.length > 0 && <span className="ih-hist-count">{lists.deleted.length}</span>}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="ih-deleted-head">
            <Button size="sm" onClick={() => setView("list")}>
              <ChevronLeft size={15} aria-hidden />
              Back to history
            </Button>
            <p className="ih-history-note m-0">Items here are deleted for good after 30 days.</p>
          </div>
          <div className="ih-hist-list">
            {lists.deleted.length === 0 ? (
              <p className="ih-hist-empty">Nothing deleted in the last 30 days.</p>
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
