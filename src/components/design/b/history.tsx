"use client";

import { PanelLeftClose, Search, Trash2 } from "lucide-react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform, type PanInfo } from "motion/react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { TargetPlatform } from "@/lib/contracts";
import { cx } from "./controls";
import { GROUPS, HISTORY, HUES, TARGET_LABELS, TARGETS, type HistoryItem } from "./data";
import s from "./styles";

const DRAWER = [0.32, 0.72, 0, 1] as const;

function HistoryBody({
  selected,
  onOpen,
  onClose,
  closeLabel,
  autoFocus,
}: {
  selected: string;
  onOpen: (item: HistoryItem) => void;
  onClose: () => void;
  closeLabel: "Hide history" | "Done";
  autoFocus: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TargetPlatform | "all">("all");
  const [deleted, setDeleted] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoFocus && window.matchMedia("(pointer: fine)").matches) searchRef.current?.focus();
  }, [autoFocus]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return HISTORY.filter((h) => (filter === "all" || h.target === filter) && (!q || h.title.toLowerCase().includes(q)));
  }, [query, filter]);

  // Arrow keys move between rows; Enter opens (native button behaviour).
  const onListKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("[data-row]") ?? []);
    const i = rows.indexOf(document.activeElement as HTMLButtonElement);
    const next = rows[e.key === "ArrowDown" ? Math.min(i + 1, rows.length - 1) : Math.max(i - 1, 0)];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  };

  return (
    <>
      <div className={s.railHead}>
        <h2 className={s.railTitle} id="history-title">
          {deleted ? "Recently deleted" : "History"}
        </h2>
        {closeLabel === "Done" ? (
          <button type="button" className={cx(s.btn, s.ghost)} onClick={onClose}>
            Done
          </button>
        ) : (
          <button type="button" className={cx(s.btn, s.ghost, s.iconBtn)} aria-label="Hide history" onClick={onClose}>
            <PanelLeftClose aria-hidden />
          </button>
        )}
      </div>

      {deleted ? (
        <div className={s.railList}>
          <p className={s.empty}>Nothing deleted in the last 30 days.</p>
        </div>
      ) : (
        <>
          <label className={s.search}>
            <span className={s.srOnly}>Search prompts</span>
            <Search aria-hidden />
            <input
              ref={searchRef}
              type="search"
              className={s.searchInput}
              placeholder="Search prompts"
              value={query}
              enterKeyHint="search"
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className={s.filter} role="group" aria-label="Filter by platform">
            {(["all", ...TARGETS] as const).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                className={s.filterBtn}
                style={f === "all" ? undefined : ({ "--dot": HUES[f].hex } as CSSProperties)}
                onClick={() => setFilter(f)}
              >
                {f !== "all" && <span className={s.dot} aria-hidden />}
                {f === "all" ? "All" : TARGET_LABELS[f]}
              </button>
            ))}
          </div>
          <div className={s.railList} ref={listRef} onKeyDown={onListKey}>
            {items.length === 0 ? (
              <div className={s.empty} role="status">
                <p style={{ margin: 0 }}>
                  {query.trim() ? `No prompts match "${query.trim()}".` : `No ${TARGET_LABELS[filter as TargetPlatform]} prompts yet.`}
                </p>
                <button
                  type="button"
                  className={cx(s.btn, s.secondary)}
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                    searchRef.current?.focus();
                  }}
                >
                  {query.trim() ? "Clear search" : "Show all"}
                </button>
              </div>
            ) : (
              GROUPS.map((g) => {
                const rows = items.filter((h) => h.group === g);
                if (!rows.length) return null;
                return (
                  <section key={g} aria-label={g}>
                    <h3 className={s.group}>{g}</h3>
                    <ul className={s.rows}>
                      {rows.map((h) => (
                        <li key={h.key}>
                          <button
                            type="button"
                            data-row
                            className={s.row}
                            aria-current={h.key === selected ? "true" : undefined}
                            style={{ "--dot": HUES[h.target].hex } as CSSProperties}
                            onClick={() => onOpen(h)}
                          >
                            <span className={s.dot} aria-hidden />
                            <span className={s.rowTitle}>{h.title}</span>
                            <span className={s.srOnly}>, for {TARGET_LABELS[h.target]}, </span>
                            <span className={s.rowTime}>{h.time}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })
            )}
          </div>
        </>
      )}
      <div className={s.railFoot}>
        <button type="button" className={cx(s.btn, s.ghost)} onClick={() => setDeleted(!deleted)}>
          {deleted ? (
            "Back to history"
          ) : (
            <>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <Trash2 aria-hidden />
                Recently deleted
              </span>
              <span>0</span>
            </>
          )}
        </button>
      </div>
    </>
  );
}

/** ≥900: a floating glass panel beside the work. Slides 16px and fades; reduced motion fades only. */
export function HistoryRail(props: { selected: string; onOpen: (i: HistoryItem) => void; onClose: () => void }) {
  const reduce = useReducedMotion();
  return (
    <motion.aside
      id="history-panel"
      aria-labelledby="history-title"
      className={s.rail}
      initial={{ opacity: 0, x: reduce ? 0 : -16 }}
      animate={{ opacity: 1, x: 0, transition: { duration: 0.24, ease: DRAWER } }}
      exit={{ opacity: 0, x: reduce ? 0 : -12, transition: { duration: 0.18, ease: DRAWER } }}
    >
      <HistoryBody {...props} closeLabel="Hide history" autoFocus />
    </motion.aside>
  );
}

/** <900: a bottom sheet. Follows the finger 1:1; dismisses past 30% of its height or on a quick flick. */
export function HistorySheet(props: { selected: string; onOpen: (i: HistoryItem) => void; onClose: () => void }) {
  const reduce = useReducedMotion();
  const y = useMotionValue(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrim = useTransform(y, [0, 600], [1, 0]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const h = sheetRef.current?.offsetHeight ?? 600;
    if (info.offset.y > h * 0.3 || info.velocity.y > 400) props.onClose();
    else animate(y, 0, { type: "spring", duration: 0.4, bounce: 0.15, velocity: info.velocity.y });
  };

  return (
    <>
      <motion.div
        className={s.scrim}
        style={{ opacity: scrim }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: 0.3 } }}
        exit={{ opacity: 0, transition: { duration: 0.2 } }}
        onClick={props.onClose}
        aria-hidden
      />
      <motion.div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-title"
        className={s.bottomSheet}
        style={{ y }}
        initial={reduce ? { opacity: 0 } : { y: "100%" }}
        animate={reduce ? { opacity: 1 } : { y: 0, transition: { duration: 0.36, ease: DRAWER } }}
        exit={reduce ? { opacity: 0 } : { y: "100%", transition: { duration: 0.26, ease: DRAWER } }}
      >
        <DragHandle y={y} onEnd={onDragEnd} />
        <HistoryBody {...props} closeLabel="Done" autoFocus={false} />
      </motion.div>
    </>
  );
}

/** The handle is the only drag surface, so the list keeps native scrolling. Tracks the pointer 1:1. */
function DragHandle({
  y,
  onEnd,
}: {
  y: ReturnType<typeof useMotionValue<number>>;
  onEnd: (e: unknown, info: PanInfo) => void;
}) {
  const start = useRef<{ y: number; t: number } | null>(null);
  return (
    <div
      className={s.handleZone}
      aria-hidden
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { y: e.clientY, t: performance.now() };
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const d = e.clientY - start.current.y;
        y.set(d > 0 ? d : d * 0.15);
      }}
      onPointerUp={(e) => {
        if (!start.current) return;
        const d = e.clientY - start.current.y;
        const dt = Math.max(1, performance.now() - start.current.t);
        start.current = null;
        onEnd(e, { offset: { x: 0, y: d }, velocity: { x: 0, y: (d / dt) * 1000 } } as PanInfo);
      }}
    >
      <span className={s.handle} />
    </div>
  );
}
