"use client";

import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  History as HistoryIcon,
  LogIn,
  LogOut,
  Maximize2,
  Minimize2,
  PenLine,
  Plus,
  RotateCw,
  Settings as SettingsIcon,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { Length, TargetPlatform } from "@/lib/contracts";
import { cx, Kbd, LengthPicker, Mark, PlatformPicker, Unavailable, useModKey } from "./controls";
import {
  BASIC_DETAIL,
  BASIC_EXPLANATION,
  BASIC_REASON,
  briefByKey,
  EXAMPLES,
  HUES,
  MOCK_BRIEFS,
  PREVIEW_STATES,
  TARGET_LABELS,
  TARGET_TIPS,
  USER,
  VERSIONS,
  versionText,
  wordCount,
  type Answers,
  type HistoryItem,
  type PreviewState,
  type VersionSpec,
} from "./data";
import { HistoryRail, HistorySheet } from "./history";
import { CopySweep, Materialise } from "./materialise";
import s from "./styles";

const EASE = [0.23, 1, 0.32, 1] as const;
type View = "empty" | "questions" | "generating" | "result";

interface Model {
  preset: PreviewState;
  view: View;
  idea: string;
  briefKey: string;
  target: TargetPlatform;
  length: Length;
  answers: Answers;
  versions: VersionSpec[];
  index: number;
  draft: string | null;
  copied: boolean;
  copyRun: number;
  historyOpen: boolean;
  signedIn: boolean;
  accountOpen: boolean;
  loop: boolean;
  toast: string | null;
}

const LANDLORD = briefByKey("landlord");

function presetModel(p: PreviewState): Model {
  const base: Model = {
    preset: p,
    view: "result",
    idea: LANDLORD.idea,
    briefKey: "landlord",
    target: "chatgpt",
    length: "balanced",
    answers: { q1: { answer: "Repair within 48 hours", skipped: false }, q2: { answer: "", skipped: true } },
    versions: VERSIONS,
    index: VERSIONS.length - 1,
    draft: null,
    copied: false,
    copyRun: 0,
    historyOpen: false,
    signedIn: false,
    accountOpen: false,
    loop: false,
    toast: null,
  };
  switch (p) {
    case "empty":
      return { ...base, view: "empty", idea: "", answers: {} };
    case "questions":
      return { ...base, view: "questions" };
    case "generating":
      return { ...base, view: "generating", versions: VERSIONS.slice(0, 1), index: 0, loop: true };
    case "copied":
      return { ...base, copied: true, copyRun: 1, toast: "Prompt copied" };
    case "history":
      return { ...base, historyOpen: true };
    case "signed-in":
      return { ...base, signedIn: true, accountOpen: true };
    default:
      return base;
  }
}

function subscribeNarrow(cb: () => void) {
  const mq = window.matchMedia("(max-width: 899px)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function useNarrow() {
  return useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia("(max-width: 899px)").matches,
    () => false,
  );
}

function useAutosize(ref: React.RefObject<HTMLTextAreaElement | null>, value: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [ref, value]);
}

export function Studio({ initial }: { initial: PreviewState }) {
  const [m, setM] = useState<Model>(() => presetModel(initial));
  const set = useCallback((patch: Partial<Model>) => setM((prev) => ({ ...prev, ...patch })), []);
  const narrow = useNarrow();
  const reduce = useReducedMotion();
  const mod = useModKey();
  const [engineOpen, setEngineOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [refineOpen, setRefineOpen] = useState(false);
  const avatarRef = useRef<HTMLButtonElement>(null);
  const historyBtnRef = useRef<HTMLButtonElement>(null);

  const mb = briefByKey(m.briefKey);
  const version = m.versions[m.index] ?? m.versions[0];
  const rendered = versionText(mb, m.target, m.length, version, m.answers);
  const text = m.draft ?? rendered;
  const hue = HUES[m.target].hex;

  const choosePreset = (p: PreviewState) => {
    setM(presetModel(p));
    setEngineOpen(false);
    setSettingsOpen(false);
    setRefineOpen(false);
  };

  // Keep ?state= in step with whatever state the preview is showing.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("state") === m.preset) return;
    url.searchParams.set("state", m.preset);
    window.history.replaceState(null, "", url);
  }, [m.preset]);

  // Toasts: 4s, then gone. The "copied" preset holds its toast so it can be reviewed.
  useEffect(() => {
    if (!m.toast || m.preset === "copied") return;
    const t = setTimeout(() => set({ toast: null }), 4000);
    return () => clearTimeout(t);
  }, [m.toast, m.preset, set]);
  useEffect(() => {
    if (!m.copied || m.preset === "copied") return;
    const t = setTimeout(() => set({ copied: false }), 2000);
    return () => clearTimeout(t);
  }, [m.copied, m.copyRun, m.preset, set]);

  const generate = () => {
    if (m.view === "empty") {
      if (!m.idea.trim()) return;
      const pick = MOCK_BRIEFS.find((b) => b.idea === m.idea) ?? pickByKeywords(m.idea);
      const next: Partial<Model> = { briefKey: pick.key, answers: {}, preset: "questions" };
      if (pick.questions.length) set({ ...next, view: "questions" });
      else set({ ...next, view: "generating", versions: [{ label: "Generated", when: "Just now", edits: [] }], index: 0, loop: false, preset: "generating" });
      return;
    }
    set({ view: "generating", versions: [{ label: "Generated", when: "Just now", edits: [] }], index: 0, draft: null, loop: false, preset: "generating" });
  };

  const regenerate = () =>
    setM((prev) => ({
      ...prev,
      view: "generating",
      versions: [...prev.versions, { label: "Regenerated", when: "Just now", edits: [] }],
      index: prev.versions.length,
      draft: null,
      loop: false,
      copied: false,
    }));

  const finishGenerating = useCallback(() => setM((prev) => ({ ...prev, view: "result", preset: "result" })), []);

  const copy = () => {
    navigator.clipboard?.writeText(text).catch(() => undefined);
    setM((prev) => ({ ...prev, copied: true, copyRun: prev.copyRun + 1, toast: "Prompt copied", preset: "result" }));
  };

  const explain = () => set({ toast: BASIC_REASON });

  const openHistoryItem = (h: HistoryItem) => {
    const b = briefByKey(h.key);
    set({
      briefKey: h.key,
      idea: b.idea,
      target: h.target,
      view: "result",
      answers: {},
      versions: [{ ...VERSIONS[0], when: h.time === "2 min" || h.time === "1 hr" ? `${h.time} ago` : h.time }],
      index: 0,
      draft: null,
      copied: false,
      historyOpen: narrow ? false : m.historyOpen,
    });
  };

  const newPrompt = () =>
    set({ ...presetModel("empty"), target: m.target, signedIn: m.signedIn, historyOpen: m.historyOpen, preset: "empty" });

  // Keyboard: Ctrl/⌘ Enter generates, Ctrl/⌘ Shift C copies, Esc closes the top layer.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const modKey = e.metaKey || e.ctrlKey;
      if (modKey && e.key === "Enter" && (m.view === "empty" || m.view === "questions")) {
        e.preventDefault();
        generate();
      } else if (modKey && e.shiftKey && e.key.toLowerCase() === "c" && m.view === "result") {
        e.preventDefault();
        copy();
      } else if (e.key === "Escape") {
        if (settingsOpen) setSettingsOpen(false);
        else if (m.accountOpen) {
          set({ accountOpen: false });
          avatarRef.current?.focus();
        } else if (engineOpen) setEngineOpen(false);
        else if (refineOpen) setRefineOpen(false);
        else if (m.historyOpen) {
          set({ historyOpen: false });
          historyBtnRef.current?.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const showTitle = m.view !== "empty";
  const title = m.view === "questions" ? m.idea : mb.title;

  return (
    <div className={s.root} data-platform={m.target}>
      <div className={s.lamps} aria-hidden>
        {(Object.keys(HUES) as TargetPlatform[]).map((t) => (
          <div key={t} className={s.lamp} data-target={t} data-on={t === m.target} />
        ))}
      </div>

      <nav className={s.switcher} aria-label="Preview state">
        <span className={s.switcherLabel}>Preview state</span>
        {PREVIEW_STATES.map((p) => (
          <button
            key={p.key}
            type="button"
            className={s.switcherBtn}
            aria-pressed={m.preset === p.key}
            onClick={() => choosePreset(p.key)}
          >
            {p.label}
          </button>
        ))}
      </nav>

      <header className={s.header}>
        <span className={s.brand}>
          <Mark className={s.mark} />
          <span className={s.wordmark}>PromptHub</span>
        </span>
        <button
          ref={historyBtnRef}
          type="button"
          className={cx(s.btn, s.ghost, s.hideNarrow)}
          aria-expanded={m.historyOpen}
          aria-controls={narrow ? undefined : "history-panel"}
          onClick={() => set({ historyOpen: !m.historyOpen })}
        >
          <HistoryIcon aria-hidden />
          History
        </button>
        <span className={s.spacer} />

        <EnginePill open={engineOpen} setOpen={setEngineOpen} />

        <button type="button" className={cx(s.btn, s.ghost, s.hideNarrow)} onClick={newPrompt}>
          <Plus aria-hidden />
          New prompt
        </button>
        <button
          type="button"
          className={cx(s.btn, s.ghost, s.iconBtn, s.onlyNarrow)}
          aria-label="New prompt"
          onClick={newPrompt}
        >
          <Plus aria-hidden />
        </button>
        <button
          type="button"
          className={cx(s.btn, s.ghost, s.iconBtn, s.onlyNarrow)}
          aria-label={m.historyOpen ? "Hide history" : "Show history"}
          aria-expanded={m.historyOpen}
          onClick={() => set({ historyOpen: !m.historyOpen })}
        >
          <HistoryIcon aria-hidden />
        </button>

        {m.signedIn ? (
          <AccountMenu
            open={m.accountOpen}
            avatarRef={avatarRef}
            setOpen={(o) => set({ accountOpen: o })}
            onSettings={() => {
              set({ accountOpen: false });
              setSettingsOpen(true);
            }}
            onSignOut={() => set({ signedIn: false, accountOpen: false, toast: "Signed out" })}
          />
        ) : (
          <>
            <button
              type="button"
              className={cx(s.btn, s.secondary, s.hideNarrow)}
              onClick={() => set({ signedIn: true, toast: `Signed in as ${USER.name}` })}
            >
              Sign in with Google
            </button>
            <button
              type="button"
              className={cx(s.btn, s.ghost, s.iconBtn, s.onlyNarrow)}
              aria-label="Sign in with Google"
              onClick={() => set({ signedIn: true, toast: `Signed in as ${USER.name}` })}
            >
              <LogIn aria-hidden />
            </button>
          </>
        )}
      </header>

      <div className={s.body}>
        <AnimatePresence initial={false}>
          {m.historyOpen && !narrow && (
            <HistoryRail
              key="rail"
              selected={m.briefKey}
              onOpen={openHistoryItem}
              onClose={() => {
                set({ historyOpen: false });
                historyBtnRef.current?.focus();
              }}
            />
          )}
        </AnimatePresence>

        <main className={s.main} style={m.view === "empty" ? { paddingTop: "clamp(24px, 9vh, 96px)" } : undefined}>
          <div className={s.column}>
            {showTitle ? (
              <motion.div
                key={`title-${m.briefKey}-${m.view === "questions"}`}
                className={s.titleBlock}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.18, ease: EASE }}
              >
                <h1 className={s.title}>{title}</h1>
                {m.view !== "questions" && <p className={s.idea}>{m.idea}</p>}
              </motion.div>
            ) : (
              <h1 className={s.srOnly}>New prompt</h1>
            )}

            {m.view !== "empty" && (
              <SettingsRow
                target={m.target}
                length={m.length}
                onTarget={(t) => set({ target: t, draft: null })}
                onLength={(l) => set({ length: l, draft: null })}
              />
            )}

            {m.view === "empty" && (
              <EmptyComposer
                idea={m.idea}
                setIdea={(idea) => set({ idea })}
                target={m.target}
                length={m.length}
                onTarget={(t) => set({ target: t })}
                onLength={(l) => set({ length: l })}
                onGenerate={generate}
                mod={mod}
              />
            )}

            {m.view === "questions" && (
              <QuestionsSheet
                questions={mb.questions}
                answers={m.answers}
                setAnswers={(answers) => set({ answers })}
                onGenerate={generate}
                mod={mod}
              />
            )}

            {(m.view === "generating" || m.view === "result") && (
              <>
                <section className={s.sheet} aria-label="Generated prompt" style={{ "--hue": hue } as CSSProperties}>
                  <span className={s.seam} data-quiet={m.view === "result" && !m.copied}>
                    {m.view === "generating" && !reduce && <span className={s.seamBead} />}
                  </span>
                  <span className={s.sheetGlow} data-on={m.copied} aria-hidden />
                  <CopySweep run={m.copyRun} />
                  <div className={s.sheetMeta}>
                    {m.view === "generating" ? (
                      <p className={s.status} role="status" aria-live="polite">
                        <span className={s.statusDot} aria-hidden />
                        Writing with Basic Mode, no AI
                      </p>
                    ) : (
                      <VersionSwitch
                        versions={m.versions}
                        index={m.index}
                        onStep={(d) => set({ index: m.index + d, draft: null })}
                      />
                    )}
                    <div className={s.metaRight}>
                      <span className={s.forTag}>
                        <span className={s.dot} style={{ "--dot": hue } as CSSProperties} aria-hidden />
                        For {TARGET_LABELS[m.target]}
                      </span>
                      {m.view === "result" && <span className={s.hideNarrow}>{wordCount(text)} words</span>}
                    </div>
                  </div>
                  {m.view === "generating" ? (
                    <Materialise
                      key={`${m.target}-${m.length}-${m.index}-${m.briefKey}`}
                      text={rendered}
                      loop={m.loop}
                      onDone={finishGenerating}
                    />
                  ) : (
                    <Editor
                      key={`${m.target}-${m.length}-${m.index}-${m.briefKey}`}
                      value={text}
                      onChange={(v) => set({ draft: v })}
                    />
                  )}
                </section>

                {m.view === "result" && (
                  <>
                    <p className={s.provenance}>
                      Built with Basic Mode, no AI. Same idea and settings give the same prompt.
                    </p>
                    <Dock copied={m.copied} onCopy={copy} onRegenerate={regenerate} onExplain={explain} mod={mod} />
                    <MobileDock
                      copied={m.copied}
                      onCopy={copy}
                      onRegenerate={regenerate}
                      onExplain={explain}
                      refineOpen={refineOpen}
                      setRefineOpen={setRefineOpen}
                    />
                  </>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      <AnimatePresence>
        {m.historyOpen && narrow && (
          <HistorySheet
            key="sheet"
            selected={m.briefKey}
            onOpen={openHistoryItem}
            onClose={() => set({ historyOpen: false })}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>{settingsOpen && <AccountSettings onClose={() => setSettingsOpen(false)} />}</AnimatePresence>

      <div aria-live="polite" role="status">
        <AnimatePresence>
          {m.toast && (
            <motion.div
              key={m.toast}
              className={s.toast}
              style={{ "--hue": hue } as CSSProperties}
              initial={{ opacity: 0, y: reduce ? 0 : 16 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } }}
              exit={{ opacity: 0, y: reduce ? 0 : 12, transition: { duration: 0.25, ease: "easeOut" } }}
            >
              {m.toast === "Prompt copied" && <Check aria-hidden />}
              {m.toast}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function pickByKeywords(idea: string) {
  let best = MOCK_BRIEFS.find((b) => b.key === "productivity")!;
  let score = 0;
  for (const b of MOCK_BRIEFS) {
    const n = (idea.match(new RegExp(b.keywords.source, "gi")) ?? []).length;
    if (n > score) {
      best = b;
      score = n;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */

function SettingsRow({
  target,
  length,
  onTarget,
  onLength,
  inSheet = false,
}: {
  target: TargetPlatform;
  length: Length;
  onTarget: (t: TargetPlatform) => void;
  onLength: (l: Length) => void;
  inSheet?: boolean;
}) {
  return (
    <div className={s.settings} style={inSheet ? { margin: 0 } : undefined}>
      <span className={s.settingsLabel} aria-hidden>
        For
      </span>
      <PlatformPicker value={target} onChange={onTarget} idPrefix={inSheet ? "compose" : "settings"} />
      <LengthPicker value={length} onChange={onLength} />
      <p className={s.tipLine}>{TARGET_TIPS[target]}</p>
    </div>
  );
}

function EmptyComposer({
  idea,
  setIdea,
  target,
  length,
  onTarget,
  onLength,
  onGenerate,
  mod,
}: {
  idea: string;
  setIdea: (v: string) => void;
  target: TargetPlatform;
  length: Length;
  onTarget: (t: TargetPlatform) => void;
  onLength: (l: Length) => void;
  onGenerate: () => void;
  mod: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const reduce = useReducedMotion();
  useAutosize(ref, idea);
  const can = idea.trim().length > 0;
  const atCap = idea.length >= 4000;

  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: EASE }}
    >
      <section className={cx(s.sheet, s.composerSheet)} aria-label="Your idea">
        <span className={s.seam} data-quiet={!can} />
        <label htmlFor="b-composer" className={s.srOnly}>
          Describe what you want the AI to do
        </label>
        <textarea
          id="b-composer"
          ref={ref}
          rows={2}
          value={idea}
          maxLength={4000}
          spellCheck
          placeholder="Describe what you want the AI to do"
          className={s.composer}
          onChange={(e) => setIdea(e.target.value)}
        />
        <div className={s.composerFoot}>
          <SettingsRow target={target} length={length} onTarget={onTarget} onLength={onLength} inSheet />
        </div>
        <div className={s.composerFoot} style={{ borderTop: 0, paddingTop: 0, marginTop: 18 }}>
          <p className={s.helper} aria-live="polite" style={atCap ? { color: "var(--coral)" } : undefined}>
            {atCap ? "Ideas can be up to 4,000 characters." : "Rough is fine. You can refine it after."}
          </p>
          <button
            type="button"
            className={cx(s.btn, s.primary)}
            aria-disabled={!can}
            onClick={() => {
              if (can) onGenerate();
              else ref.current?.focus();
            }}
          >
            Generate prompt
            <Kbd keys={[mod, "Enter"]} />
          </button>
        </div>
      </section>

      {!idea && (
        <motion.div
          className={s.examples}
          initial={{ opacity: 0, y: reduce ? 0 : 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42, ease: EASE, delay: 0.08 }}
        >
          <h2 className={s.examplesTitle}>Try one</h2>
          <ul className={s.exampleList}>
            {EXAMPLES.map((ex) => (
              <li key={ex}>
                <button
                  type="button"
                  className={s.chip}
                  onClick={() => {
                    setIdea(ex);
                    requestAnimationFrame(() => {
                      ref.current?.focus();
                      ref.current?.setSelectionRange(ex.length, ex.length);
                    });
                  }}
                >
                  {ex}
                </button>
              </li>
            ))}
          </ul>
        </motion.div>
      )}
    </motion.div>
  );
}

function QuestionsSheet({
  questions,
  answers,
  setAnswers,
  onGenerate,
  mod,
}: {
  questions: { id: string; question: string; suggestions: string[] }[];
  answers: Answers;
  setAnswers: (a: Answers) => void;
  onGenerate: () => void;
  mod: string;
}) {
  const reduce = useReducedMotion();
  const get = (id: string) => answers[id] ?? { answer: "", skipped: false };
  const answered = questions.filter((q) => !get(q.id).skipped && get(q.id).answer.trim()).length;
  const skipped = questions.filter((q) => get(q.id).skipped).length;
  const update = (id: string, patch: Partial<{ answer: string; skipped: boolean }>) =>
    setAnswers({ ...answers, [id]: { ...get(id), ...patch } });
  const focusNext = (id: string) => {
    const i = questions.findIndex((q) => q.id === id);
    const next = questions.slice(i + 1).find((q) => !get(q.id).skipped);
    requestAnimationFrame(() =>
      (next ? document.getElementById(`b-answer-${next.id}`) : document.getElementById("b-generate"))?.focus(),
    );
  };
  const n = questions.length;

  return (
    <section className={cx(s.sheet, s.qSheet)} aria-labelledby="b-q-intro">
      <span className={s.seam} data-quiet="true" />
      <div className={s.qHead}>
        <h2 id="b-q-intro" className={s.qIntro}>
          {n === 1 ? "1 question to sharpen the prompt" : `${n} questions to sharpen the prompt`}
        </h2>
        <div className={s.progress} aria-hidden>
          {questions.map((q) => {
            const a = get(q.id);
            return (
              <span
                key={q.id}
                className={s.progressStep}
                data-state={a.skipped ? "skipped" : a.answer.trim() ? "answered" : "open"}
              />
            );
          })}
        </div>
        <span className={s.spacer} />
        <button
          type="button"
          className={cx(s.btn, s.ghost)}
          style={{ height: 32, padding: "0 12px", fontSize: 13.5 }}
          onClick={() => setAnswers(Object.fromEntries(questions.map((q) => [q.id, { answer: "", skipped: true }])))}
        >
          Skip all
        </button>
      </div>

      <div className={s.qList}>
        {questions.map((q, i) => {
          const a = get(q.id);
          const done = !a.skipped && a.answer.trim().length > 0;
          const qid = `b-q-${q.id}`;
          return (
            <motion.div
              key={q.id}
              className={s.question}
              initial={{ opacity: 0, y: reduce ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.26, ease: EASE, delay: reduce ? 0 : [0, 0.045, 0.08][i] ?? 0.1 }}
            >
              <div className={s.qRow}>
                <p id={qid} className={s.qText} data-skipped={a.skipped}>
                  {q.question}
                </p>
                <div className={s.qActions}>
                  {a.skipped ? (
                    <>
                      <span className={s.qStatus}>Skipped</span>
                      <button
                        type="button"
                        className={cx(s.btn, s.ghost)}
                        aria-describedby={qid}
                        onClick={() => {
                          update(q.id, { skipped: false });
                          requestAnimationFrame(() => document.getElementById(`b-answer-${q.id}`)?.focus());
                        }}
                      >
                        Undo
                      </button>
                    </>
                  ) : done ? (
                    <>
                      <span className={s.qStatus}>
                        <Check aria-hidden />
                        Answered
                      </span>
                      <button
                        type="button"
                        className={cx(s.btn, s.ghost)}
                        aria-describedby={qid}
                        onClick={() => update(q.id, { answer: "" })}
                      >
                        Clear
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className={cx(s.btn, s.secondary)}
                      aria-describedby={qid}
                      onClick={() => {
                        update(q.id, { skipped: true });
                        focusNext(q.id);
                      }}
                    >
                      Skip
                    </button>
                  )}
                </div>
              </div>
              <AnimatePresence initial={false}>
                {!a.skipped && (
                  <motion.div
                    key="body"
                    className={s.collapse}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1, transition: { duration: reduce ? 0 : 0.2, ease: [0.77, 0, 0.175, 1] } }}
                    exit={{
                      height: 0,
                      opacity: 0,
                      transition: { height: { duration: reduce ? 0 : 0.2, ease: [0.77, 0, 0.175, 1] }, opacity: { duration: 0.12 } },
                    }}
                  >
                    <AnswerField
                      id={`b-answer-${q.id}`}
                      labelledBy={qid}
                      value={a.answer}
                      onChange={(v) => update(q.id, { answer: v })}
                      onEnter={() => focusNext(q.id)}
                      onEscape={() => (a.answer ? update(q.id, { answer: "" }) : update(q.id, { skipped: true }))}
                    />
                    <div className={s.chips}>
                      {q.suggestions.slice(0, 3).map((sug) => {
                        const on = a.answer.trim() === sug;
                        return (
                          <button
                            key={sug}
                            type="button"
                            className={s.chip}
                            aria-pressed={on}
                            onClick={() => {
                              update(q.id, { answer: sug });
                              focusNext(q.id);
                            }}
                          >
                            {on && <Check aria-hidden />}
                            {sug}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      <div className={s.qFoot}>
        <button id="b-generate" type="button" className={cx(s.btn, s.primary)} onClick={onGenerate}>
          Generate prompt
          <Kbd keys={[mod, "Enter"]} />
        </button>
        <p className={s.count} aria-live="polite">
          {answered} answered, {skipped} skipped
        </p>
      </div>
    </section>
  );
}

function AnswerField({
  id,
  labelledBy,
  value,
  onChange,
  onEnter,
  onEscape,
}: {
  id: string;
  labelledBy: string;
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
  onEscape: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useAutosize(ref, value);
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      onEnter();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onEscape();
    }
  };
  return (
    <textarea
      ref={ref}
      id={id}
      rows={1}
      value={value}
      maxLength={1000}
      aria-labelledby={labelledBy}
      placeholder="Type an answer or pick one"
      className={s.answerField}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
    />
  );
}

function VersionSwitch({
  versions,
  index,
  onStep,
}: {
  versions: VersionSpec[];
  index: number;
  onStep: (d: number) => void;
}) {
  const v = versions[index];
  return (
    <div className={s.versions}>
      <button
        type="button"
        className={cx(s.btn, s.ghost, s.iconBtn)}
        aria-label="Previous version"
        disabled={index === 0}
        style={index === 0 ? { opacity: 0.4, cursor: "default" } : undefined}
        onClick={() => onStep(-1)}
      >
        <ChevronLeft aria-hidden />
      </button>
      <span className={s.versionLabel} aria-live="polite">
        Version {index + 1} of {versions.length}
      </span>
      <button
        type="button"
        className={cx(s.btn, s.ghost, s.iconBtn)}
        aria-label="Next version"
        disabled={index === versions.length - 1}
        style={index === versions.length - 1 ? { opacity: 0.4, cursor: "default" } : undefined}
        onClick={() => onStep(1)}
      >
        <ChevronRight aria-hidden />
      </button>
      <span className={s.versionKind}>
        {v.label}
        <span className={s.hideNarrow}>, {v.when}</span>
      </span>
    </div>
  );
}

function Editor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useAutosize(ref, value);
  return (
    <div className={s.editorWrap}>
      <label htmlFor="b-editor" className={s.srOnly}>
        Prompt text
      </label>
      <textarea
        id="b-editor"
        ref={ref}
        value={value}
        spellCheck={false}
        className={cx(s.editor, s.editorFade)}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function CopyLabel({ copied, mod, showKbd }: { copied: boolean; mod: string; showKbd: boolean }) {
  const reduce = useReducedMotion();
  const t = { duration: reduce ? 0 : 0.16, ease: "easeInOut" as const };
  const on = { opacity: 1, filter: "blur(0px)" };
  const off = { opacity: 0, filter: reduce ? "blur(0px)" : "blur(2px)" };
  return (
    <span className={s.swap}>
      <motion.span animate={copied ? off : on} transition={t} aria-hidden={copied}>
        <Copy aria-hidden />
        Copy
        {showKbd && <Kbd keys={[mod, "Shift", "C"]} />}
      </motion.span>
      <motion.span animate={copied ? on : off} transition={t} aria-hidden={!copied}>
        <Check aria-hidden />
        Copied
      </motion.span>
    </span>
  );
}

function Dock({
  copied,
  onCopy,
  onRegenerate,
  onExplain,
  mod,
}: {
  copied: boolean;
  onCopy: () => void;
  onRegenerate: () => void;
  onExplain: () => void;
  mod: string;
}) {
  return (
    <div className={s.dockWrap}>
      <div className={s.dock} role="toolbar" aria-label="Prompt actions">
        <Unavailable scope="dock" label="Improve" icon={<PenLine aria-hidden />} reason={BASIC_REASON} onExplain={onExplain} />
        <Unavailable scope="dock" label="Shorten" icon={<Minimize2 aria-hidden />} reason={BASIC_REASON} onExplain={onExplain} />
        <Unavailable scope="dock" label="Expand" icon={<Maximize2 aria-hidden />} reason={BASIC_REASON} onExplain={onExplain} />
        <Unavailable
          scope="dock"
          label="Tone"
          reason={BASIC_REASON}
          onExplain={onExplain}
          trailing={<ChevronDown aria-hidden />}
        />
        <span className={s.dockSep} aria-hidden />
        <button type="button" className={cx(s.btn, s.secondary)} onClick={onRegenerate}>
          <RotateCw aria-hidden />
          Regenerate
        </button>
        <button type="button" className={cx(s.btn, s.primary, s.copyBtn)} onClick={onCopy}>
          <CopyLabel copied={copied} mod={mod} showKbd />
        </button>
      </div>
    </div>
  );
}

function MobileDock({
  copied,
  onCopy,
  onRegenerate,
  onExplain,
  refineOpen,
  setRefineOpen,
}: {
  copied: boolean;
  onCopy: () => void;
  onRegenerate: () => void;
  onExplain: () => void;
  refineOpen: boolean;
  setRefineOpen: (o: boolean) => void;
}) {
  const reduce = useReducedMotion();
  return (
    <div className={s.mobileDock} role="toolbar" aria-label="Prompt actions">
      <AnimatePresence>
        {refineOpen && (
          <motion.div
            id="b-refine"
            className={s.refineSheet}
            initial={{ opacity: 0, scale: reduce ? 1 : 0.97, y: reduce ? 0 : 6 }}
            animate={{ opacity: 1, scale: 1, y: 0, transition: { duration: 0.2, ease: EASE } }}
            exit={{ opacity: 0, scale: reduce ? 1 : 0.98, transition: { duration: 0.14, ease: EASE } }}
          >
            <p className={s.refineNote}>{BASIC_REASON}</p>
            <div className={s.refineGrid}>
              {[
                { l: "Improve", i: <PenLine aria-hidden /> },
                { l: "Shorten", i: <Minimize2 aria-hidden /> },
                { l: "Expand", i: <Maximize2 aria-hidden /> },
                { l: "Tone", i: <ChevronDown aria-hidden /> },
              ].map((a) => (
                <Unavailable
                  key={a.l}
                  scope="mobile"
                  label={a.l}
                  icon={a.i}
                  reason={BASIC_REASON}
                  onExplain={onExplain}
                  tip={false}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <button
        type="button"
        className={cx(s.btn, s.ghost)}
        aria-expanded={refineOpen}
        aria-controls="b-refine"
        onClick={() => setRefineOpen(!refineOpen)}
      >
        <SlidersHorizontal aria-hidden />
        Refine
      </button>
      <button type="button" className={cx(s.btn, s.secondary, s.iconBtn)} aria-label="Regenerate" onClick={onRegenerate}>
        <RotateCw aria-hidden />
      </button>
      <button type="button" className={cx(s.btn, s.primary, s.copyBtn)} onClick={onCopy}>
        <CopyLabel copied={copied} mod="" showKbd={false} />
      </button>
    </div>
  );
}

function EnginePill({ open, setOpen }: { open: boolean; setOpen: (o: boolean) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  useOutside(wrap, open, () => setOpen(false));
  return (
    <div className={s.anchor} ref={wrap}>
      <button
        type="button"
        className={cx(s.btn, s.enginePill)}
        aria-expanded={open}
        aria-controls="b-engine"
        onClick={() => setOpen(!open)}
      >
        <span className={s.engineDot} aria-hidden />
        <span className={s.hideNarrow}>Basic Mode, no AI</span>
        <span className={cx(s.srOnly, s.onlyNarrow)}>Basic Mode, no AI</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            id="b-engine"
            role="dialog"
            aria-label="Basic Mode, no AI"
            className={s.popover}
            initial={{ opacity: 0, scale: reduce ? 1 : 0.97 }}
            animate={{ opacity: 1, scale: 1, transition: { duration: 0.16, ease: EASE } }}
            exit={{ opacity: 0, scale: reduce ? 1 : 0.98, transition: { duration: 0.11, ease: EASE } }}
          >
            <p className={s.popoverTitle} style={{ margin: 0 }}>
              Basic Mode, no AI
            </p>
            <p className={s.popoverBody}>{BASIC_EXPLANATION}</p>
            <p className={s.popoverBody}>{BASIC_DETAIL}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function useOutside(ref: React.RefObject<HTMLElement | null>, active: boolean, onOutside: () => void) {
  useEffect(() => {
    if (!active) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [ref, active, onOutside]);
}

function AccountMenu({
  open,
  setOpen,
  avatarRef,
  onSettings,
  onSignOut,
}: {
  open: boolean;
  setOpen: (o: boolean) => void;
  avatarRef: React.RefObject<HTMLButtonElement | null>;
  onSettings: () => void;
  onSignOut: () => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const close = useCallback(() => setOpen(false), [setOpen]);
  useOutside(wrap, open, close);

  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? []);
  const onKeyDown = (e: KeyboardEvent) => {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") list[(i + 1) % list.length]?.focus();
    else if (e.key === "ArrowUp") list[(i - 1 + list.length) % list.length]?.focus();
    else if (e.key === "Tab") setOpen(false);
    else return;
    if (e.key !== "Tab") e.preventDefault();
  };

  return (
    <div className={s.anchor} ref={wrap}>
      <button
        ref={avatarRef}
        type="button"
        className={s.avatar}
        aria-label={`Account, ${USER.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          if (!open) requestAnimationFrame(() => items()[0]?.focus({ preventScroll: true }));
        }}
      >
        {USER.initials}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={menuRef}
            role="menu"
            aria-label="Account"
            className={cx(s.popover, s.menu)}
            onKeyDown={onKeyDown}
            initial={{ opacity: 0, scale: reduce ? 1 : 0.97 }}
            animate={{ opacity: 1, scale: 1, transition: { duration: 0.16, ease: EASE } }}
            exit={{ opacity: 0, scale: reduce ? 1 : 0.98, transition: { duration: 0.11, ease: EASE } }}
          >
            <div className={s.menuHead}>
              <span className={cx(s.avatar, s.avatarLarge)} aria-hidden>
                {USER.initials}
              </span>
              <span style={{ minWidth: 0 }}>
                <span className={s.menuName} style={{ display: "block" }}>
                  {USER.name}
                </span>
                <span className={s.menuEmail} style={{ display: "block" }}>
                  {USER.email}
                </span>
              </span>
            </div>
            <MenuItem icon={<SettingsIcon aria-hidden />} onClick={onSettings}>
              Account settings
            </MenuItem>
            <MenuItem icon={<LogOut aria-hidden />} onClick={onSignOut}>
              Sign out
            </MenuItem>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuItem({ icon, children, onClick }: { icon: ReactNode; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" tabIndex={-1} className={s.menuItem} onClick={onClick}>
      {icon}
      {children}
    </button>
  );
}

function AccountSettings({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const reduce = useReducedMotion();
  useEffect(() => closeRef.current?.focus(), []);
  return (
    <>
      <motion.div
        className={s.scrim}
        style={{ zIndex: 94 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        aria-hidden
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="b-settings-title"
        className={s.dialog}
        initial={{ opacity: 0, scale: reduce ? 1 : 0.98 }}
        animate={{ opacity: 1, scale: 1, transition: { duration: 0.2, ease: EASE } }}
        exit={{ opacity: 0, scale: reduce ? 1 : 0.98, transition: { duration: 0.15, ease: EASE } }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <h2 id="b-settings-title" className={s.dialogTitle}>
            Account settings
          </h2>
          <button
            ref={closeRef}
            type="button"
            className={cx(s.btn, s.ghost, s.iconBtn)}
            aria-label="Close"
            onClick={onClose}
          >
            <X aria-hidden />
          </button>
        </div>
        <div className={s.field}>
          <span className={s.fieldKey}>Name</span>
          <span className={s.fieldVal}>{USER.name}</span>
        </div>
        <div className={s.field}>
          <span className={s.fieldKey}>Email</span>
          <span className={s.fieldVal}>{USER.email}</span>
        </div>
        <div className={s.field}>
          <span className={s.fieldKey}>Signed in with</span>
          <span className={s.fieldVal}>Google</span>
        </div>
        <div className={s.field} style={{ borderBottom: 0 }}>
          <span className={s.fieldKey}>History</span>
          <span className={s.fieldVal}>Saved to this account</span>
        </div>
        <div className={s.dialogFoot}>
          <button type="button" className={cx(s.btn, s.secondary)} onClick={onClose}>
            Done
          </button>
        </div>
      </motion.div>
    </>
  );
}
