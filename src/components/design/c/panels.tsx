"use client";

import { AnimatePresence, motion, useDragControls, useReducedMotion, type PanInfo } from "motion/react";
import { History, LogOut, Moon, Plus, Search, Settings, SlidersHorizontal, Sun, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { TargetPlatform } from "@/lib/contracts";
import { ACCOUNT, ENGINE_LABEL, ENGINE_POPOVER, HISTORY, LENGTH_LABELS, LENGTHS, PLATFORMS, TARGET_LABELS } from "./data";
import { CopyButton, RefineBar, VersionSwitch } from "./bench";
import { Kbd, Mark, PLATFORM_HEX, Segment, cx, useModKey } from "./controls";
import { PREVIEW_LABELS, PREVIEW_STATES, currentText, useC } from "./state";
import s from "./styles";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const EASE_DRAWER = [0.32, 0.72, 0, 1] as const;

function useDismiss(open: boolean, close: () => void, refs: React.RefObject<HTMLElement | null>[]) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (refs.some((r) => r.current?.contains(e.target as Node))) return;
      close();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, close, refs]);
}

/* ---------- Preview switcher (outside the product) ---------- */

export function Switcher() {
  const { st, actions } = useC();
  return (
    <nav className={s.switcher} aria-label="Preview states">
      <strong>Direction C preview</strong>
      {PREVIEW_STATES.map((p) => (
        <button key={p} type="button" className={s.switcherBtn} aria-pressed={st.preview === p} onClick={() => actions.setPreview(p)}>
          {PREVIEW_LABELS[p]}
        </button>
      ))}
      <span className={s.switcherSpacer} />
      <button
        type="button"
        className={s.switcherBtn}
        onClick={() => actions.patch((x) => ({ theme: x.theme === "light" ? "dark" : "light" }))}
        aria-label={st.theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
        style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
      >
        {st.theme === "light" ? <Moon size={13} aria-hidden="true" /> : <Sun size={13} aria-hidden="true" />}
        {st.theme === "light" ? "Dark" : "Light"}
      </button>
    </nav>
  );
}

/* ---------- Top bar ---------- */

export function TopBar({ onPalette }: { onPalette: () => void }) {
  const { st, actions } = useC();
  const mod = useModKey();
  return (
    <header className={s.topbar}>
      <button type="button" className={s.brand} onClick={actions.newPrompt} aria-label="PromptHub, new prompt">
        <Mark />
        <span className={s.wordmark}>PromptHub</span>
      </button>
      <button type="button" className={s.cmd} onClick={onPalette} aria-label="Search or run a command">
        <Search size={16} aria-hidden="true" />
        <span>Search or run a command</span>
        <Kbd>{mod} K</Kbd>
      </button>
      <div className={s.topRight}>
        <span className={s.desktopOnly}>
          <EngineButton />
        </span>
        <button
          type="button"
          className={cx(s.btn, s.btnGhost)}
          aria-pressed={st.historyOpen}
          aria-label={st.historyOpen ? "Hide history" : "Show history"}
          onClick={() => actions.patch((x) => ({ historyOpen: !x.historyOpen, accountOpen: false }))}
        >
          <History size={17} aria-hidden="true" />
          <span className={s.desktopOnly}>History</span>
        </button>
        <span className={s.desktopOnly}>
          <button type="button" className={cx(s.btn, s.btnSecondary)} onClick={actions.newPrompt} aria-label="New prompt">
            <Plus size={16} aria-hidden="true" />
            <span className={s.hideTablet}>New prompt</span>
          </button>
        </span>
        <Account />
      </div>
    </header>
  );
}

function EngineButton() {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const refs = useMemo(() => [wrap], []);
  useDismiss(open, () => setOpen(false), refs);
  return (
    <div className={s.rel} ref={wrap}>
      <button
        type="button"
        className={s.engine}
        aria-expanded={open}
        aria-controls="c-engine-pop"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      >
        <span className={s.engineDot} aria-hidden="true" />
        {ENGINE_LABEL}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            id="c-engine-pop"
            role="dialog"
            aria-label="About Basic Mode"
            className={cx(s.popover, s.enginePop)}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            transition={{ duration: 0.16, ease: EASE_OUT }}
          >
            <strong>{ENGINE_LABEL}</strong>
            {ENGINE_POPOVER}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Account() {
  const { st, actions } = useC();
  const reduce = useReducedMotion();
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const refs = useMemo(() => [wrap], []);
  const close = () => actions.patch({ accountOpen: false });
  useDismiss(st.accountOpen, close, refs);

  useEffect(() => {
    if (st.accountOpen) items.current[0]?.focus({ preventScroll: true });
  }, [st.accountOpen]);

  if (!st.signedIn) {
    return (
      <button type="button" className={cx(s.btn, s.btnSecondary)} onClick={actions.signIn}>
        <span aria-hidden="true" style={{ fontWeight: 800, fontFamily: "var(--font-display)" }}>
          G
        </span>
        <span className={s.desktopOnly}>Sign in with Google</span>
        <span className={s.mobileOnly}>Sign in</span>
      </button>
    );
  }

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = items.current.filter(Boolean) as HTMLButtonElement[];
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      list[(i + 1) % list.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      list[(i - 1 + list.length) % list.length]?.focus();
    } else if (e.key === "Escape" || e.key === "Tab") {
      if (e.key === "Escape") e.preventDefault();
      close();
      trigger.current?.focus();
    }
  };

  return (
    <div className={s.rel} ref={wrap}>
      <button
        ref={trigger}
        type="button"
        className={s.avatar}
        aria-haspopup="menu"
        aria-expanded={st.accountOpen}
        aria-label={`Account, ${ACCOUNT.name}`}
        onClick={() => actions.patch((x) => ({ accountOpen: !x.accountOpen }))}
      >
        {ACCOUNT.initials}
      </button>
      <AnimatePresence>
        {st.accountOpen && (
          <motion.div
            role="menu"
            aria-label="Account"
            className={cx(s.popover, s.menu)}
            onKeyDown={onMenuKey}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: reduce ? 1 : 0.98, transition: { duration: 0.12 } }}
            transition={{ duration: 0.18, ease: EASE_OUT }}
          >
            <div className={s.menuHead}>
              <span className={cx(s.avatar, s.avatarLg)} aria-hidden="true">
                {ACCOUNT.initials}
              </span>
              <div style={{ minWidth: 0 }}>
                <div className={s.menuName}>{ACCOUNT.name}</div>
                <div className={s.menuEmail}>{ACCOUNT.email}</div>
              </div>
            </div>
            <button
              ref={(el) => {
                items.current[0] = el;
              }}
              type="button"
              role="menuitem"
              className={s.menuItem}
              onClick={() => {
                close();
                actions.toast("Account settings aren't part of this preview yet.");
              }}
            >
              <Settings size={16} aria-hidden="true" />
              Account settings
            </button>
            <button
              ref={(el) => {
                items.current[1] = el;
              }}
              type="button"
              role="menuitem"
              className={s.menuItem}
              onClick={actions.signOut}
            >
              <LogOut size={16} aria-hidden="true" />
              Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------- History ---------- */

function HistoryContent({ onClose, autoFocus }: { onClose: () => void; autoFocus?: boolean }) {
  const { st, actions } = useC();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | TargetPlatform>("all");
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) searchRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);
  const items = HISTORY.filter(
    (h) => (filter === "all" || h.platform === filter) && h.title.toLowerCase().includes(q.trim().toLowerCase()),
  );
  const groups = ["Today", "Yesterday", "Previous 7 days", "Earlier"] as const;
  const filters = ["all", ...PLATFORMS] as const;
  return (
    <>
      <div className={s.historyHead}>
        <h2 className={s.historyTitle}>History</h2>
        <button type="button" className={s.darkIconBtn} aria-label="Hide history" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div className={s.searchWrap}>
        <Search size={16} aria-hidden="true" />
        <input
          ref={searchRef}
          className={s.search}
          type="search"
          placeholder="Search prompts"
          aria-label="Search prompts"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className={s.filters} role="radiogroup" aria-label="Filter by platform">
        {filters.map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={filter === f}
            className={s.filterChip}
            onClick={() => setFilter(f)}
          >
            {f !== "all" && <i style={{ width: 7, height: 7, borderRadius: 2, background: PLATFORM_HEX[f].onDark }} />}
            {f === "all" ? "All" : TARGET_LABELS[f]}
          </button>
        ))}
      </div>
      <div className={s.histList}>
        {items.length === 0 && (
          <p className={s.histEmpty}>
            {q.trim() ? `No prompts match "${q.trim()}".` : `No ${filter === "all" ? "" : TARGET_LABELS[filter] + " "}prompts yet.`}
          </p>
        )}
        {groups.map((g) => {
          const inGroup = items.filter((h) => h.group === g);
          if (!inGroup.length) return null;
          return (
            <div key={g} role="group" aria-labelledby={`c-hg-${g}`}>
              <div className={s.group} id={`c-hg-${g}`}>
                {g}
              </div>
              {inGroup.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  className={s.row}
                  aria-current={st.historyId === h.id}
                  style={{ ["--row-p" as string]: PLATFORM_HEX[h.platform].onDark }}
                  onClick={() => {
                    actions.openHistory(h);
                    if (window.matchMedia("(max-width: 899px)").matches) onClose();
                  }}
                >
                  <span className={s.rowTitle}>{h.title}</span>
                  <span className={s.rowMeta}>
                    <span className={s.rowPlatform}>
                      <i />
                      {TARGET_LABELS[h.platform]}
                    </span>
                    <span>
                      {h.versions} {h.versions === 1 ? "version" : "versions"}
                    </span>
                    <span className={s.rowWhen}>{h.when}</span>
                  </span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}

export function HistoryPanel() {
  const { st, actions } = useC();
  const reduce = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {st.historyOpen && (
        <motion.aside
          key="history"
          className={s.history}
          aria-label="History"
          initial={reduce ? { opacity: 0 } : { opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: reduce ? 0 : -16, transition: { duration: 0.16 } }}
          transition={{ duration: 0.3, ease: EASE_DRAWER }}
        >
          <HistoryContent onClose={() => actions.patch({ historyOpen: false })} />
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

/** Below 900px history is a bottom sheet you can drag down to close. */
export function BottomSheet({
  open,
  onClose,
  label,
  light,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  light?: boolean;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const controls = useDragControls();
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 500) onClose();
  };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="scrim"
            className={s.scrim}
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            transition={{ duration: 0.3 }}
          />
          <motion.div
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className={cx(s.bottomSheet, light && s.bottomSheetLight)}
            initial={reduce ? { opacity: 0 } : { y: "100%" }}
            animate={reduce ? { opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: "100%", transition: { duration: 0.24, ease: EASE_DRAWER } }}
            transition={{ duration: 0.45, ease: EASE_DRAWER }}
            drag={reduce ? false : "y"}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.05, bottom: 0.9 }}
            dragListener={false}
            dragControls={controls}
            onDragEnd={onDragEnd}
          >
            <div className={s.handle} aria-hidden="true" onPointerDown={(e) => controls.start(e)}>
              <i />
            </div>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function MobileHistory({ isNarrow }: { isNarrow: boolean }) {
  const { st, actions } = useC();
  const close = () => actions.patch({ historyOpen: false });
  return (
    <BottomSheet open={isNarrow && st.historyOpen} onClose={close} label="History">
      <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
        <HistoryContent onClose={close} />
      </div>
    </BottomSheet>
  );
}

/* ---------- Mobile action bar ---------- */

export function MobileBar() {
  const { st, actions } = useC();
  const mod = useModKey();
  const [refine, setRefine] = useState(false);
  if (st.phase !== "result") return null;
  return (
    <>
      <div className={s.mobileBar} role="toolbar" aria-label="Prompt actions">
        <button type="button" className={cx(s.btn, s.btnGhost)} onClick={() => setRefine(true)}>
          <SlidersHorizontal size={16} aria-hidden="true" />
          Refine
        </button>
        <VersionSwitch compact />
        <CopyButton text={currentText(st)} mod={mod} />
      </div>
      <BottomSheet open={refine} onClose={() => setRefine(false)} label="Refine" light>
        <div style={{ padding: "4px 16px 12px", display: "grid", gap: 10 }}>
          <h2 className={s.sheetTitle}>Refine</h2>
          <Segment options={LENGTHS} value={st.length} onChange={actions.setLength} labels={LENGTH_LABELS} label="Length" full />
        </div>
        <RefineBar inSheet />
      </BottomSheet>
    </>
  );
}

/* ---------- Command palette (keyboard-first, no animation) ---------- */

interface Command {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

export function Palette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { st, actions } = useC();
  const mod = useModKey();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const commands: Command[] = [
    { id: "new", label: "New prompt", run: actions.newPrompt },
    { id: "hist", label: st.historyOpen ? "Hide history" : "Show history", run: () => actions.patch((x) => ({ historyOpen: !x.historyOpen })) },
    ...(st.phase === "result"
      ? [{ id: "copy", label: "Copy prompt", hint: `${mod} Shift C`, run: () => actions.copy(currentText(st), mod) }]
      : []),
    ...PLATFORMS.filter((p) => p !== st.platform).map((p) => ({
      id: `p-${p}`,
      label: `Write for ${TARGET_LABELS[p]}`,
      run: () => actions.setPlatform(p),
    })),
    ...LENGTHS.filter((l) => l !== st.length).map((l) => ({
      id: `l-${l}`,
      label: `Make it ${LENGTH_LABELS[l].toLowerCase()}`,
      run: () => actions.setLength(l),
    })),
    ...HISTORY.map((h) => ({ id: h.id, label: `Open "${h.title}"`, hint: TARGET_LABELS[h.platform], run: () => actions.openHistory(h) })),
    {
      id: "theme",
      label: st.theme === "light" ? "Switch to dark theme" : "Switch to light theme",
      run: () => actions.patch((x) => ({ theme: x.theme === "light" ? "dark" : "light" })),
    },
  ];
  const list = commands.filter((c) => c.label.toLowerCase().includes(q.trim().toLowerCase()));
  const safeSel = Math.min(sel, Math.max(0, list.length - 1));

  if (!open) return null;
  const run = (c: Command | undefined) => {
    if (!c) return;
    onClose();
    c.run();
  };
  return (
    <div
      className={s.paletteScrim}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={s.palette} role="dialog" aria-modal="true" aria-label="Commands">
        <div className={s.paletteInputWrap}>
          <Search size={18} aria-hidden="true" />
          <input
            ref={inputRef}
            className={s.paletteInput}
            placeholder="Search or run a command"
            role="combobox"
            aria-expanded="true"
            aria-controls="c-palette-list"
            aria-activedescendant={list[safeSel] ? `c-cmd-${list[safeSel].id}` : undefined}
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
              } else if (e.key === "Enter") {
                e.preventDefault();
                run(list[safeSel]);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
          />
          <Kbd>Esc</Kbd>
        </div>
        <div className={s.paletteList} role="listbox" id="c-palette-list" aria-label="Commands">
          {list.length === 0 && <p className={s.histEmpty}>No commands match &quot;{q}&quot;.</p>}
          {list.map((c, i) => (
            <div
              key={c.id}
              id={`c-cmd-${c.id}`}
              role="option"
              aria-selected={i === safeSel}
              className={s.paletteItem}
              onPointerMove={() => setSel(i)}
              onClick={() => run(c)}
            >
              {c.label}
              {c.hint && <Kbd>{c.hint}</Kbd>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Toast ---------- */

export function Toast() {
  const { st } = useC();
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {st.toast && (
        <motion.div
          key={st.toast.id}
          className={s.toast}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          {st.toast.text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
