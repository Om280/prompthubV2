"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, ChevronLeft, ChevronRight, Copy, CornerDownLeft, CornerDownRight, Lock, PencilLine, RotateCcw, Square } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { TargetPlatform } from "@/lib/contracts";
import {
  BASIC_REASON,
  EXAMPLES,
  GHOST_BLOCKS,
  LENGTH_DESCRIPTIONS,
  LENGTH_LABELS,
  LENGTHS,
  TARGET_LABELS,
  TARGET_TIPS,
  briefByKey,
  joinBlocks,
  parseBlocks,
  render,
  wordCount,
  type Block,
} from "./data";
import { Kbd, PlatformSwitch, Segment, cx, useModKey } from "./controls";
import { currentText, useC } from "./state";
import s from "./styles";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
/* Arrival gaps shrink as the build goes on: the first piece lands alone, the rest follow as one wave. */
const ARRIVALS = [0, 0.14, 0.25, 0.34, 0.41, 0.47, 0.52, 0.56];

/** Preview-only slow motion for reviewing the build frame by frame: /design/c?state=generating&slow=4 */
function useSlow(): number {
  return useSyncExternalStore(
    () => () => {},
    () => Math.min(10, Math.max(1, Number(new URLSearchParams(window.location.search).get("slow")) || 1)),
    () => 1,
  );
}

/* ---------- Brief column (left at 1440) ---------- */

function answerSummary(list: ({ status: string } | undefined)[]): string {
  const a = list.filter((x) => x?.status === "answered").length;
  const k = list.filter((x) => x?.status === "skipped").length;
  return `${a} answered, ${k} skipped`;
}

export function Brief() {
  const { st, actions } = useC();
  const mod = useModKey();
  if (st.phase === "compose") return <Composer />;
  const mb = briefByKey(st.briefKey);
  const answered = mb.questions.filter((q) => st.answers[q.id]);
  return (
    <aside className={s.brief} aria-label="Your idea and settings">
      <div className={s.ideaBlock}>
        <span className={s.ideaPiece} style={{ marginBottom: 0 }}>
          Your idea
        </span>
        <h1 className={s.ideaTitle}>{st.idea}</h1>
        <div className={s.ideaActions}>
          <button type="button" className={cx(s.btn, s.btnGhost, s.btnSm)} onClick={actions.editIdea}>
            <PencilLine size={15} aria-hidden="true" />
            Edit idea
          </button>
        </div>
      </div>
      <Settings />
      {st.phase !== "questions" && answered.length > 0 && (
        <div className={s.answers}>
          <span className={s.smallLabel}>{answerSummary(mb.questions.map((q) => st.answers[q.id]))}</span>
          {answered.map((q) => {
            const a = st.answers[q.id];
            return (
              <div key={q.id} className={s.answerRow}>
                <span>{q.question}</span>
                <span>{a?.status === "answered" ? a.value : "Skipped"}</span>
              </div>
            );
          })}
        </div>
      )}
      <span className={s.helper}>
        <Kbd>{mod}</Kbd> <Kbd>K</Kbd> runs any command from the keyboard.
      </span>
    </aside>
  );
}

function Settings() {
  const { st, actions } = useC();
  return (
    <>
      <div className={s.field}>
        <div className={s.fieldHead}>
          <span className={s.smallLabel} id="c-for">
            For
          </span>
          <span className={s.fieldHint}>{TARGET_TIPS[st.platform]}</span>
        </div>
        <PlatformSwitch value={st.platform} onChange={actions.setPlatform} />
      </div>
      <div className={s.field}>
        <div className={s.fieldHead}>
          <span className={s.smallLabel}>Length</span>
          <span className={s.fieldHint}>{LENGTH_DESCRIPTIONS[st.length]}</span>
        </div>
        <Segment options={LENGTHS} value={st.length} onChange={actions.setLength} labels={LENGTH_LABELS} label="Length" full />
      </div>
    </>
  );
}

/** Tablet, mobile and history-open: the brief collapses to a title and two switches above the sheet. */
export function BriefCompact() {
  const { st, actions } = useC();
  if (st.phase === "compose") return null;
  return (
    <div className={s.briefCompact}>
      <h1 className={s.briefCompactTitle}>{st.idea}</h1>
      <div className={s.compactControls}>
        <PlatformSwitch value={st.platform} onChange={actions.setPlatform} small />
        <span className={s.desktopOnly}>
          <Segment options={LENGTHS} value={st.length} onChange={actions.setLength} labels={LENGTH_LABELS} label="Length" />
        </span>
      </div>
    </div>
  );
}

/* ---------- Composer ---------- */

function Composer() {
  const { st, actions } = useC();
  const mod = useModKey();
  const ref = useRef<HTMLTextAreaElement>(null);
  const empty = !st.idea.trim();
  return (
    <section className={s.brief} aria-label="New prompt">
      <form
        className={s.intake}
        onSubmit={(e) => {
          e.preventDefault();
          actions.generate();
        }}
      >
        <label htmlFor="c-idea" className={s.ideaPiece}>
          Your idea
        </label>
        <textarea
          id="c-idea"
          ref={ref}
          className={s.ideaInput}
          placeholder="Describe what you want the AI to do"
          value={st.idea}
          maxLength={4000}
          onChange={(e) => actions.patch({ idea: e.target.value })}
        />
        <div className={s.intakeFoot}>
          <span className={s.helper}>Rough is fine. You can refine it after.</span>
          <button type="submit" className={cx(s.btn, s.btnPrimary)} disabled={empty}>
            Generate prompt
            <span className={s.desktopOnly}>
              <Kbd onAccent={!empty}>
                {mod} <CornerDownLeft size={11} aria-label="Enter" />
              </Kbd>
            </span>
          </button>
        </div>
      </form>
      <span className={cx(s.mobileOnly, s.engineInline)}>
        <span className={s.engineDot} aria-hidden="true" />
        Basic Mode, no AI
      </span>
      <Settings />
      <div className={s.field}>
        <span className={s.smallLabel}>Try one</span>
        <div className={s.examples}>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              className={s.example}
              onClick={() => {
                actions.patch({ idea: ex });
                ref.current?.focus();
              }}
            >
              <CornerDownRight size={15} aria-hidden="true" />
              {ex}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Questions: a short guided stepper ---------- */

export function Questions() {
  const { st, actions } = useC();
  const mod = useModKey();
  const mb = briefByKey(st.briefKey);
  const qs = mb.questions;
  const answeredN = qs.filter((q) => st.answers[q.id]?.status === "answered").length;
  const skippedN = qs.filter((q) => st.answers[q.id]?.status === "skipped").length;
  const inputRef = useRef<HTMLInputElement>(null);
  const reduce = useReducedMotion();

  return (
    <section className={s.sheet} aria-labelledby="c-q-title">
      <div className={s.qHead}>
        <div className={s.qHeadTop}>
          <h2 id="c-q-title" className={s.sheetTitle}>
            {qs.length} {qs.length === 1 ? "question" : "questions"} to sharpen the prompt
          </h2>
          <button type="button" className={cx(s.btn, s.btnGhost, s.btnSm)} onClick={actions.skipAll}>
            Skip all
          </button>
        </div>
        <div className={s.progress} aria-hidden="true">
          {qs.map((q, i) => {
            const a = st.answers[q.id];
            return <span key={q.id} className={s.progressSeg} data-s={a ? a.status : i === st.activeQ ? "active" : "open"} />;
          })}
        </div>
      </div>
      <ol className={s.steps}>
        {qs.map((q, i) => {
          const a = st.answers[q.id];
          const active = !a && i === st.activeQ;
          const draft = st.drafts[q.id] ?? "";
          if (!active) {
            return (
              <li key={q.id} className={s.step} data-s={a?.status ?? "open"}>
                <span className={s.stepNum}>{a?.status === "answered" ? <Check size={15} aria-label="Answered" /> : i + 1}</span>
                <div>
                  <div className={s.stepQ}>{q.question}</div>
                  {a?.status === "answered" && <div className={s.stepA}>{a.value}</div>}
                  {a?.status === "skipped" && <div className={s.stepSkipped}>Skipped</div>}
                </div>
                {a ? (
                  <button type="button" className={cx(s.btn, s.btnGhost, s.btnSm)} onClick={() => actions.reopen(q.id)}>
                    {a.status === "skipped" ? "Undo" : "Change"}
                  </button>
                ) : (
                  <button type="button" className={cx(s.btn, s.btnGhost, s.btnSm)} onClick={() => actions.patch({ activeQ: i })}>
                    Answer
                  </button>
                )}
              </li>
            );
          }
          return (
            <motion.li
              key={q.id}
              className={s.step}
              data-s="active"
              initial={reduce ? false : { opacity: 0.6 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              <span className={s.stepNum}>{i + 1}</span>
              <h3 className={s.stepActiveQ} id={`c-q-${q.id}`}>
                {q.question}
              </h3>
              <span className={s.qCount}>
                {i + 1} of {qs.length}
              </span>
              <div className={s.stepBody}>
                <input
                  ref={inputRef}
                  className={s.answerInput}
                  aria-labelledby={`c-q-${q.id}`}
                  placeholder="Type an answer or pick one"
                  value={draft}
                  enterKeyHint="next"
                  onChange={(e) => actions.patch((p) => ({ drafts: { ...p.drafts, [q.id]: e.target.value } }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !(e.metaKey || e.ctrlKey) && draft.trim()) {
                      e.preventDefault();
                      actions.answer(q.id, draft.trim());
                    }
                  }}
                />
                <div className={s.chips} role="group" aria-label="Suggested answers">
                  {q.suggestions.map((sg) => (
                    <button
                      key={sg}
                      type="button"
                      className={s.chip}
                      aria-pressed={draft === sg}
                      onClick={() => {
                        actions.patch((p) => ({ drafts: { ...p.drafts, [q.id]: sg } }));
                        window.setTimeout(() => actions.answer(q.id, sg), reduce ? 0 : 180);
                      }}
                    >
                      {sg}
                    </button>
                  ))}
                </div>
                <div className={s.stepActions}>
                  <button
                    type="button"
                    className={cx(s.btn, s.btnSecondary, s.btnSm)}
                    disabled={!draft.trim()}
                    onClick={() => actions.answer(q.id, draft.trim())}
                  >
                    Save answer
                  </button>
                  <button type="button" className={cx(s.btn, s.btnGhost, s.btnSm)} onClick={() => actions.skip(q.id)}>
                    Skip
                  </button>
                </div>
              </div>
            </motion.li>
          );
        })}
      </ol>
      <div className={s.qFoot}>
        <button type="button" className={cx(s.btn, s.btnPrimary)} onClick={actions.generate}>
          Generate prompt
          <span className={s.desktopOnly}>
            <Kbd onAccent>
              {mod} <CornerDownLeft size={11} aria-label="Enter" />
            </Kbd>
          </span>
        </button>
        <span className={s.qCount} aria-live="polite">
          {`${answeredN} answered, ${skippedN} skipped`}
        </span>
      </div>
    </section>
  );
}

/* ---------- Block pieces ---------- */

function Tab({ block, syntax, style }: { block: { label: string }; syntax: string; style?: React.CSSProperties }) {
  return (
    <div className={s.tab} data-tab="" style={style}>
      <span className={s.tabLabel}>{block.label}</span>
      <span className={s.tabSyntax}>{syntax}</span>
    </div>
  );
}

function AutoText({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || CSS.supports("field-sizing", "content")) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      className={s.blockText}
      aria-label={label}
      value={value}
      rows={1}
      spellCheck
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/* ---------- Empty build plate ---------- */

export function GhostPlate() {
  const { st } = useC();
  return (
    <section className={cx(s.sheet, s.ghost)} aria-labelledby="c-ghost-title">
      <div className={s.sheetBody}>
        <div className={s.ghostIntro}>
          <h2 id="c-ghost-title" className={s.sheetTitle}>
            Your prompt is built from blocks
          </h2>
          <p>
            Each part of the prompt gets its own labelled block, written the way {TARGET_LABELS[st.platform]} reads best. You can
            edit any block, then copy the whole thing.
          </p>
        </div>
        <div className={s.blocks}>
          {GHOST_BLOCKS.map((g, i) => (
            <div key={g.label} className={s.block} style={{ zIndex: 10 - i }}>
              <Tab block={g} syntax={g.syntax[st.platform]} />
              <div className={s.blockBody}>{g.hint}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Generating: the blocks snap together ---------- */

export function Generating() {
  const { st, actions } = useC();
  const reduce = useReducedMotion();
  const [loop, setLoop] = useState(0);
  const slow = useSlow();
  const text = useMemo(() => render(st.briefKey, st.platform, st.length), [st.briefKey, st.platform, st.length]);
  const blocks = useMemo(() => parseBlocks(text), [text]);
  const [placed, setPlaced] = useState(0);

  useEffect(() => {
    const timers: number[] = [];
    const speed = reduce ? 0 : 1;
    blocks.forEach((_, i) =>
      timers.push(window.setTimeout(() => setPlaced(i + 1), ((ARRIVALS[i] ?? 0.6) * 1000 + 220) * speed * slow)),
    );
    const doneAt = reduce ? 350 : ((ARRIVALS[blocks.length - 1] ?? 0.6) + 0.55) * 1000 * slow;
    if (st.holdGenerating) {
      timers.push(window.setTimeout(() => setLoop((l) => l + 1), doneAt + 1800));
    } else {
      timers.push(
        window.setTimeout(() => {
          const wasRegen = st.regenerating;
          actions.finishGenerating();
          if (wasRegen) actions.afterRegenerate();
        }, doneAt),
      );
    }
    return () => {
      timers.forEach(window.clearTimeout);
      setPlaced(0);
    };
    // genRun restarts the build; loop replays it in the held preview state.
  }, [blocks, loop, st.genRun, st.holdGenerating, st.regenerating, reduce, actions, slow]);

  return (
    <section className={s.sheet} aria-labelledby="c-gen-status" aria-busy="true">
      <div className={s.sheetHead}>
        <div className={s.status} id="c-gen-status">
          <span className={s.statusPulse} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span role="status">Writing with Basic Mode, no AI</span>
          <span className={s.statusCount}>
            {placed} of {blocks.length} blocks
          </span>
        </div>
        <div className={s.sheetHeadRight}>
          <button
            type="button"
            className={cx(s.btn, s.btnSecondary, s.btnSm)}
            onClick={() => {
              actions.patch({ holdGenerating: false });
              actions.finishGenerating();
            }}
          >
            <Square size={13} aria-hidden="true" />
            Stop
          </button>
        </div>
      </div>
      <div className={s.sheetBody}>
        <div className={s.blocks} key={`${st.genRun}-${loop}-${slow}`}>
          {blocks.map((b, i) => {
            const delay = reduce ? 0 : (ARRIVALS[i] ?? 0.6) * slow;
            return (
              <div key={b.key} className={s.block} style={{ zIndex: 20 - i }}>
                <motion.div
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: -18, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={
                    reduce
                      ? { duration: 0.2 }
                      : {
                          y: { type: "spring", duration: 0.42 * slow, bounce: 0.32, delay },
                          scale: { type: "spring", duration: 0.42 * slow, bounce: 0.32, delay },
                          opacity: { duration: 0.12, delay },
                        }
                  }
                  style={{ display: "grid" }}
                >
                  <Tab block={b} syntax={b.syntax} />
                </motion.div>
                <motion.div
                  className={s.blockBody}
                  initial={reduce ? { opacity: 0 } : { clipPath: "inset(0 100% 0 0)", opacity: 0.4 }}
                  animate={reduce ? { opacity: 1 } : { clipPath: "inset(0 0% 0 0)", opacity: 1 }}
                  transition={{ duration: reduce ? 0.2 : 0.42 * slow, ease: EASE_OUT, delay: reduce ? 0 : delay + 0.1 * slow }}
                >
                  <div className={s.blockText} style={{ whiteSpace: "pre-wrap" }}>
                    {b.body}
                  </div>
                </motion.div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ---------- Result sheet ---------- */

function useCopySweep(sheetRef: React.RefObject<HTMLElement | null>, run: number) {
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!run || !sheetRef.current) return;
    const tabs = Array.from(sheetRef.current.querySelectorAll<HTMLElement>("[data-tab]"));
    const anims = tabs.map((el, i) => {
      const cs = getComputedStyle(el);
      const tint = cs.getPropertyValue("--p-tint").trim();
      const solid = cs.getPropertyValue("--p").trim();
      const deep = cs.getPropertyValue("--p-deep").trim();
      const wash = cs.getPropertyValue("--cobalt-wash").trim();
      const dark = el.closest("[data-theme='dark']") !== null;
      if (reduce) {
        return el.animate([{ backgroundColor: tint }, { backgroundColor: wash }, { backgroundColor: tint }], { duration: 600 });
      }
      return el.animate(
        [
          { backgroundColor: tint, color: deep, transform: "translateY(0)" },
          { backgroundColor: solid, color: dark ? "#14161b" : "#ffffff", transform: "translateY(-2px)", offset: 0.3 },
          { backgroundColor: tint, color: deep, transform: "translateY(0)" },
        ],
        { duration: 620, delay: i * 52 - Math.min(i, 4) * 4, easing: "cubic-bezier(0.23, 1, 0.32, 1)", fill: "none" },
      );
    });
    return () => anims.forEach((a) => a.cancel());
  }, [run, sheetRef, reduce]);
}

export function ResultSheet() {
  const { st, actions } = useC();
  const mod = useModKey();
  const reduce = useReducedMotion();
  const sheetRef = useRef<HTMLElement>(null);
  const text = currentText(st);
  const blocks = useMemo(() => parseBlocks(text), [text]);
  const cur = st.versions[st.viewIdx];
  const total = st.versions.length;
  const latest = st.viewIdx === total - 1;
  useCopySweep(sheetRef, st.copyRun);

  const editBlock = (i: number, body: string) => {
    const next: Block[] = blocks.map((b, j) => (j === i ? { ...b, body } : b));
    actions.editText(joinBlocks(next));
  };

  return (
    <section ref={sheetRef} className={s.sheet} data-copied={st.copied} aria-label="Generated prompt">
      <div className={s.sheetHead}>
        <AnimatePresence mode="popLayout" initial={false}>
          {st.copied ? (
            <motion.div
              key="copied"
              className={s.status}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6, filter: "blur(2px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              transition={{ duration: 0.22, ease: EASE_OUT }}
            >
              <span className={s.copyCheck}>
                <Check size={14} strokeWidth={3} aria-hidden="true" />
              </span>
              <span>
                Copied {wordCount(text)} words for {TARGET_LABELS[cur?.platform ?? st.platform]}.{" "}
                <span className={s.desktopOnly} style={{ color: "var(--ink-3)", fontWeight: 450 }}>
                  Paste it into a new chat.
                </span>
              </span>
            </motion.div>
          ) : (
            <motion.div
              key="versions"
              className={cx(s.versionSwitch, s.desktopOnly)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
            >
              <VersionSwitch />
            </motion.div>
          )}
        </AnimatePresence>
        {!st.copied && (
          <span className={cx(s.mobileOnly, s.engineInline)}>
            <span className={s.engineDot} aria-hidden="true" />
            Basic Mode, no AI
          </span>
        )}
        <div className={s.sheetHeadRight}>
          <span className={s.desktopOnly}>
            <Segment
              options={["blocks", "plain"] as const}
              value={st.view}
              onChange={(v) => actions.patch({ view: v })}
              labels={{ blocks: "Blocks", plain: "Plain text" }}
              label="Editor view"
            />
          </span>
          <span className={s.mobileOnly}>
            <Segment
              options={["blocks", "plain"] as const}
              value={st.view}
              onChange={(v) => actions.patch({ view: v })}
              labels={{ blocks: "Blocks", plain: "Text" }}
              label="Editor view"
            />
          </span>
          <span className={s.desktopOnly}>
            <CopyButton text={text} mod={mod} />
          </span>
        </div>
      </div>
      <div className={s.sheetBody}>
        {!latest && (
          <div className={s.olderNote}>
            <span>
              Viewing version {st.viewIdx + 1}, {cur?.name.toLowerCase()}.
            </span>
            <button type="button" className={cx(s.btn, s.btnSecondary, s.btnSm)} onClick={actions.restore}>
              <RotateCcw size={14} aria-hidden="true" />
              Restore this version
            </button>
            <button type="button" className={cx(s.btn, s.btnGhost, s.btnSm)} onClick={() => actions.setVersion(total - 1)}>
              Back to latest
            </button>
          </div>
        )}
        {st.view === "blocks" ? (
          <div className={s.blocks}>
            <AnimatePresence initial={false} mode="popLayout">
              {blocks.map((b, i) => (
                <motion.div
                  key={b.key}
                  layout={reduce ? false : "position"}
                  className={s.block}
                  style={{ zIndex: 20 - i }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.12 } }}
                  transition={{ layout: { type: "spring", duration: 0.4, bounce: 0.15 }, opacity: { duration: 0.18 } }}
                >
                  <Tab block={b} syntax={b.syntax} />
                  <div className={s.blockBody}>
                    <AutoText value={b.body} label={`${b.label} block`} onChange={(v) => editBlock(i, v)} />
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <textarea
            className={s.plain}
            aria-label="Prompt text"
            value={text}
            spellCheck
            onChange={(e) => actions.editText(e.target.value)}
          />
        )}
      </div>
      <RefineBar />
      <div className={s.provenance} style={{ padding: "0 20px 18px" }}>
        <b>Built with Basic Mode, no AI</b>
        <span>{wordCount(text)} words</span>
        <span>{TARGET_TIPS[cur?.platform ?? st.platform]}</span>
      </div>
    </section>
  );
}

export function VersionSwitch({ compact }: { compact?: boolean }) {
  const { st, actions } = useC();
  const total = st.versions.length;
  const cur = st.versions[st.viewIdx];
  return (
    <>
      <button
        type="button"
        className={cx(s.btn, s.btnGhost, s.btnSm, s.iconBtn)}
        style={{ width: 32 }}
        aria-label="Previous version"
        disabled={st.viewIdx === 0}
        onClick={() => actions.setVersion(st.viewIdx - 1)}
      >
        <ChevronLeft size={16} aria-hidden="true" />
      </button>
      <span className={s.versionLabel} aria-live="polite">
        {compact ? `${st.viewIdx + 1} of ${total}` : `Version ${st.viewIdx + 1} of ${total}`}
      </span>
      <button
        type="button"
        className={cx(s.btn, s.btnGhost, s.btnSm, s.iconBtn)}
        style={{ width: 32 }}
        aria-label="Next version"
        disabled={st.viewIdx >= total - 1}
        onClick={() => actions.setVersion(st.viewIdx + 1)}
      >
        <ChevronRight size={16} aria-hidden="true" />
      </button>
      {!compact && cur && <span className={s.versionName}>{cur.name}</span>}
    </>
  );
}

export function CopyButton({ text, mod, large }: { text: string; mod: string; large?: boolean }) {
  const { st, actions } = useC();
  const reduce = useReducedMotion();
  return (
    <button
      type="button"
      className={cx(s.btn, s.btnPrimary, large && s.btnLarge)}
      onClick={() => actions.copy(text, mod)}
      aria-label={st.copied ? "Copied" : "Copy prompt"}
      style={{ minWidth: large ? 112 : 104 }}
    >
      <span className={s.btnLabelSwap}>
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={st.copied ? "done" : "copy"}
            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9, filter: "blur(2px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9, filter: "blur(2px)" }}
            transition={{ duration: 0.16, ease: EASE_OUT }}
          >
            {st.copied ? <Check size={16} strokeWidth={2.75} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
            {st.copied ? "Copied" : "Copy"}
          </motion.span>
        </AnimatePresence>
      </span>
    </button>
  );
}

const AI_ACTIONS = ["Improve", "Shorten", "Expand", "Tone"] as const;

export function RefineBar({ inSheet }: { inSheet?: boolean }) {
  const { actions } = useC();
  return (
    <div className={inSheet ? s.sheetList : s.sheetFoot} role="group" aria-label="Refine" aria-describedby="c-basic-reason">
      {AI_ACTIONS.map((a) => (
        <button
          key={a}
          type="button"
          className={cx(s.btn, s.btnNeedsAi, !inSheet && s.btnSm)}
          aria-disabled="true"
          title={BASIC_REASON}
          onClick={() => actions.toast(BASIC_REASON)}
        >
          <Lock size={13} aria-hidden="true" />
          {a}
        </button>
      ))}
      <button type="button" className={cx(s.btn, s.btnSecondary, !inSheet && s.btnSm)} onClick={actions.regenerate}>
        <RotateCcw size={14} aria-hidden="true" />
        Regenerate
      </button>
      <p className={s.reason} id="c-basic-reason">
        {BASIC_REASON}
      </p>
    </div>
  );
}

export type { TargetPlatform };
