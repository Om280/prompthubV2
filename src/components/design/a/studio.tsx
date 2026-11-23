"use client";

import {
  Check,
  ChevronDown,
  History as HistoryIcon,
  LogIn,
  LogOut,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PenLine,
  Plus,
  RotateCw,
  Search,
  Settings,
  Square,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Length, TargetPlatform } from "@/lib/contracts";
import { MOCK_BRIEFS, type MockBrief } from "@/lib/mock/briefs";
import { LengthPicker, PlatformPicker } from "./controls";
import {
  ACCOUNT,
  BASIC_POPOVER,
  BASIC_REASON,
  EDIT_LINES,
  HISTORY,
  STATE_LABELS,
  STATES,
  TARGET_LABELS,
  TARGETS,
  TRY_ONE,
  briefFor,
  historyGroup,
  relTime,
  versionText,
  type HistoryItem,
  type PreviewState,
  type PreviewVersion,
} from "./data";
import { CopyButton, CropMarks, Proof } from "./proof";
import s from "./cls";

type View = "empty" | "questions" | "generating" | "result";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const EASE_DRAWER = [0.32, 0.72, 0, 1] as const;

const PLATFORM_VAR: Record<TargetPlatform, string> = {
  chatgpt: "var(--p-chatgpt)",
  claude: "var(--p-claude)",
  gemini: "var(--p-gemini)",
};

function initialVersions(key: string, length: Length, count = 3): PreviewVersion[] {
  const all: PreviewVersion[] = [
    { source: "generated", length: "concise" },
    { source: "edited", length: "concise", edit: EDIT_LINES[key] ?? "Keep it under 200 words." },
    { source: "regenerated", length },
  ];
  if (count <= 1) return [{ source: "generated", length }];
  if (count === 2) return [{ source: "generated", length: "concise" }, { source: "regenerated", length }];
  const extra = Array.from({ length: count - 3 }, () => ({ source: "regenerated" as const, length }));
  return [...all.slice(0, 2), ...extra, all[2]];
}

interface Init {
  view: View;
  loopPress: boolean;
  copiedPinned: boolean;
  historyOpen: boolean;
  signedIn: boolean;
  accountOpen: boolean;
  answers: Record<string, string>;
  skipped: string[];
}

function initFor(state: PreviewState): Init {
  const base: Init = {
    view: "result",
    loopPress: false,
    copiedPinned: false,
    historyOpen: false,
    signedIn: false,
    accountOpen: false,
    answers: { q1: "Repair within 48 hours", q2: "Polite but firm" },
    skipped: [],
  };
  switch (state) {
    case "empty":
      return { ...base, view: "empty", answers: {} };
    case "questions":
      return { ...base, view: "questions", answers: { q1: "Repair within 48 hours" }, skipped: ["q2"] };
    case "generating":
      return { ...base, view: "generating", loopPress: true };
    case "copied":
      return { ...base, copiedPinned: true };
    case "history":
      return { ...base, historyOpen: true, signedIn: true };
    case "signed-in":
      return { ...base, signedIn: true, accountOpen: true };
    default:
      return base;
  }
}

/* ---------- media ---------- */

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

/* ================================================================== */

export function Studio({ initialState }: { initialState: PreviewState }) {
  const [state, setState] = useState<PreviewState>(initialState);
  const init = useMemo(() => initFor(state), [state]);

  // `key` remounts the whole studio when the preview state changes, so every state starts clean.
  return (
    <StudioInner
      key={state}
      state={state}
      init={init}
      onState={(next) => {
        const url = new URL(window.location.href);
        url.searchParams.set("state", next);
        window.history.replaceState(null, "", url);
        setState(next);
      }}
    />
  );
}

function StudioInner({
  state,
  init,
  onState,
}: {
  state: PreviewState;
  init: Init;
  onState: (s: PreviewState) => void;
}) {
  const reduce = useReducedMotion();
  const narrow = useNarrow();

  const [view, setView] = useState<View>(init.view);
  const [loopPress, setLoopPress] = useState(init.loopPress);
  const [briefKey, setBriefKey] = useState("landlord");
  const [idea, setIdea] = useState(init.view === "empty" ? "" : briefFor("landlord").idea);
  const [target, setTarget] = useState<TargetPlatform>("claude");
  const [length, setLength] = useState<Length>("balanced");
  const [versions, setVersions] = useState<PreviewVersion[]>(() => initialVersions("landlord", "balanced"));
  const [vi, setVi] = useState(2);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<Record<string, string>>(init.answers);
  const [skipped, setSkipped] = useState<string[]>(init.skipped);
  const [copied, setCopied] = useState(init.copiedPinned);
  const [historyOpen, setHistoryOpen] = useState(init.historyOpen);
  const [selected, setSelected] = useState<string | null>("h1");
  const [signedIn, setSignedIn] = useState(init.signedIn);
  const [accountOpen, setAccountOpen] = useState(init.accountOpen);
  const [engineOpen, setEngineOpen] = useState(false);
  const [refineOpen, setRefineOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(init.copiedPinned ? "Copied. Paste it into Claude." : null);
  const [announce, setAnnounce] = useState("");

  const mb: MockBrief = briefFor(briefKey);
  const latest = vi === versions.length - 1;
  const draftKey = `${vi}-${target}`;
  const text = useMemo(
    () => drafts[draftKey] ?? versionText(mb, target, versions[vi]),
    [drafts, draftKey, mb, target, versions, vi],
  );

  /* ---------- toasts ---------- */
  const toastTimer = useRef<number | undefined>(undefined);
  const showToast = useCallback(
    (msg: string, pinned = false) => {
      setToast(msg);
      window.clearTimeout(toastTimer.current);
      if (!pinned) toastTimer.current = window.setTimeout(() => setToast(null), 4000);
    },
    [],
  );

  /* ---------- actions ---------- */
  const copyTimer = useRef<number | undefined>(undefined);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setAnnounce("Prompt copied");
      showToast(`Copied. Paste it into ${TARGET_LABELS[target]}.`, init.copiedPinned);
      window.clearTimeout(copyTimer.current);
      if (!init.copiedPinned) copyTimer.current = window.setTimeout(() => setCopied(false), 1600);
    } catch {
      showToast("Couldn't copy. Select the text and press Ctrl+C.");
    }
  }, [text, target, showToast, init.copiedPinned]);

  const startGenerate = useCallback(() => {
    setLoopPress(false);
    setView("generating");
    setAnnounce("Writing with Basic Mode, no AI");
  }, []);

  const submitIdea = useCallback(() => {
    const value = idea.trim();
    if (!value) return;
    const found = MOCK_BRIEFS.find((b) => b.keywords.test(value)) ?? MOCK_BRIEFS[0];
    setBriefKey(found.key);
    setVersions([{ source: "generated", length }]);
    setVi(0);
    setDrafts({});
    setAnswers({});
    setSkipped([]);
    if (found.questions.length) setView("questions");
    else startGenerate();
  }, [idea, length, startGenerate]);

  const regenerate = useCallback(() => {
    setVersions((v) => [...v, { source: "regenerated", length }]);
    setVi(versions.length);
    startGenerate();
  }, [length, versions.length, startGenerate]);

  const newPrompt = useCallback(() => {
    setView("empty");
    setIdea("");
    setAnswers({});
    setSkipped([]);
    setCopied(false);
    setSelected(null);
    if (narrow) setHistoryOpen(false);
  }, [narrow]);

  const changeLength = (l: Length) => {
    setLength(l);
    // Basic Mode templates are instant: the latest version re-sets at the new length.
    setVersions((vs) => vs.map((v, i) => (i === vs.length - 1 ? { ...v, length: l } : v)));
  };

  const openHistoryItem = (item: HistoryItem) => {
    setSelected(item.id);
    setBriefKey(item.key);
    setIdea(briefFor(item.key).idea);
    setTarget(item.target);
    const vs = initialVersions(item.key, length, item.versions);
    setVersions(vs);
    setVi(vs.length - 1);
    setDrafts({});
    setView("result");
    setCopied(false);
    if (narrow) setHistoryOpen(false);
  };

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === "c" && view === "result") {
        e.preventDefault();
        void copy();
      } else if (mod && e.key === "Enter") {
        if (view === "empty") submitIdea();
        else if (view === "questions") startGenerate();
      } else if (mod && e.key === "\\") {
        e.preventDefault();
        setHistoryOpen((o) => !o);
      } else if (e.key === "Escape") {
        if (accountOpen || engineOpen || refineOpen) {
          setAccountOpen(false);
          setEngineOpen(false);
          setRefineOpen(false);
        } else if (view === "generating") setView("result");
        else if (historyOpen && narrow) setHistoryOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, copy, submitIdea, startGenerate, accountOpen, engineOpen, refineOpen, historyOpen, narrow]);

  const showProof = view === "generating" || view === "result";

  return (
    <div className={s.root} data-platform={target} data-rail={historyOpen && !narrow ? "docked" : "closed"}>
      <StateSwitcher state={state} onState={onState} />

      <Header
        signedIn={signedIn}
        accountOpen={accountOpen}
        setAccountOpen={setAccountOpen}
        engineOpen={engineOpen}
        setEngineOpen={setEngineOpen}
        historyOpen={historyOpen}
        onHistory={() => setHistoryOpen((o) => !o)}
        onNew={newPrompt}
        onSignIn={() => {
          setSignedIn(true);
          showToast(`Signed in as ${ACCOUNT.name}`);
        }}
        onSignOut={() => {
          setSignedIn(false);
          setAccountOpen(false);
          showToast("Signed out. Your history stays on this device.");
        }}
        onSettings={() => {
          setAccountOpen(false);
          showToast("Account settings are not part of this preview.");
        }}
      />

      <AnimatePresence>
        {historyOpen && (
          <HistoryRail
            key="rail"
            narrow={narrow}
            reduce={!!reduce}
            selected={selected}
            onOpen={openHistoryItem}
            onClose={() => setHistoryOpen(false)}
            onNew={newPrompt}
          />
        )}
      </AnimatePresence>

      <main className={s.main} id="main">
        <div className={s.frame}>
          {view === "empty" && (
            <EmptyView
              idea={idea}
              setIdea={setIdea}
              target={target}
              setTarget={setTarget}
              length={length}
              setLength={changeLength}
              onGenerate={submitIdea}
              onTry={(key) => {
                setIdea(briefFor(key).idea);
              }}
            />
          )}

          {view !== "empty" && (
            <div className={s.work}>
              <aside className={s.aside} aria-label="Idea and settings">
                <div>
                  <h1 className={s.ideaTitle}>{idea}</h1>
                  {view === "result" && (
                    <p className={s.ideaEdit}>
                      <button type="button" className={s.textBtn} onClick={newPrompt}>
                        Start a new prompt
                      </button>
                    </p>
                  )}
                </div>
                {showProof && Object.keys(answers).length > 0 && (
                  <ul className={`${s.answers} ${s.hideMobile}`} aria-label="Your answers">
                    {mb.questions
                      .filter((q) => answers[q.id])
                      .map((q) => (
                        <li key={q.id}>
                          <span className={s.answerQ}>{q.question}</span>
                          <span className={s.answerA}>{answers[q.id]}</span>
                        </li>
                      ))}
                  </ul>
                )}
                <div className={s.asideSettings}>
                  <div className={s.asideBlock}>
                    <span className={`${s.asideLabel} ${s.hideMobile}`}>Write it for</span>
                    <PlatformPicker value={target} onChange={setTarget} compact />
                  </div>
                  <div className={s.asideBlock}>
                    <span className={`${s.asideLabel} ${s.hideMobile}`}>Length</span>
                    <LengthPicker value={length} onChange={changeLength} onDesk />
                  </div>
                </div>
              </aside>

              <div>
                {view === "questions" && (
                  <Questions
                    mb={mb}
                    answers={answers}
                    setAnswers={setAnswers}
                    skipped={skipped}
                    setSkipped={setSkipped}
                    onGenerate={startGenerate}
                    reduce={!!reduce}
                  />
                )}
                {showProof && (
                  <Proof
                    key={`${briefKey}`}
                    target={target}
                    length={length}
                    text={text}
                    mode={view === "generating" ? "generating" : "ready"}
                    loopPress={loopPress}
                    onPressDone={() => {
                      setView("result");
                      setAnnounce("Prompt ready");
                    }}
                    onStop={() => setView("result")}
                    versions={versions}
                    versionIndex={vi}
                    onVersion={setVi}
                    onEdit={(t) => setDrafts((d) => ({ ...d, [draftKey]: t }))}
                    onRegenerate={regenerate}
                    copied={copied}
                    onCopy={() => void copy()}
                    edited={draftKey in drafts}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      <MobileBar
        view={view}
        hasIdea={idea.trim().length > 0}
        onGenerate={view === "empty" ? submitIdea : startGenerate}
        onStop={() => setView("result")}
        copied={copied}
        onCopy={() => void copy()}
        refineOpen={refineOpen}
        setRefineOpen={setRefineOpen}
        onRegenerate={() => {
          setRefineOpen(false);
          regenerate();
        }}
        latest={latest}
        onUnavailable={() => showToast(BASIC_REASON)}
      />

      <p className={s.srOnly} aria-live="polite">
        {announce}
      </p>
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast}
            className={s.toast}
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: reduce ? 0 : 16, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: reduce ? 0 : 12, x: "-50%", transition: { duration: 0.2 } }}
            transition={{ duration: 0.4, ease: EASE_OUT }}
          >
            <Check size={16} strokeWidth={2.5} aria-hidden />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ================================================================== */

function StateSwitcher({ state, onState }: { state: PreviewState; onState: (s: PreviewState) => void }) {
  return (
    <nav className={s.switcher} aria-label="Preview state">
      <span className={s.switcherLabel}>Preview state</span>
      {STATES.map((st) => (
        <button
          key={st}
          type="button"
          className={s.switcherBtn}
          aria-current={st === state}
          onClick={() => onState(st)}
        >
          {STATE_LABELS[st]}
        </button>
      ))}
    </nav>
  );
}

/* ---------- Header ---------- */

function Header(p: {
  signedIn: boolean;
  accountOpen: boolean;
  setAccountOpen: (v: boolean) => void;
  engineOpen: boolean;
  setEngineOpen: (v: boolean) => void;
  historyOpen: boolean;
  onHistory: () => void;
  onNew: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onSettings: () => void;
}) {
  const reduce = useReducedMotion();
  const accountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<HTMLDivElement>(null);
  const { accountOpen, setAccountOpen, engineOpen, setEngineOpen } = p;

  useEffect(() => {
    if (!accountOpen && !engineOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (accountOpen && !accountRef.current?.contains(t)) setAccountOpen(false);
      if (engineOpen && !engineRef.current?.contains(t)) setEngineOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [accountOpen, engineOpen, setAccountOpen, setEngineOpen]);

  const pop = {
    initial: reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: reduce ? 1 : 0.98, transition: { duration: 0.12 } },
    transition: { duration: 0.18, ease: EASE_OUT },
  };

  return (
    <header className={s.header}>
      <a className={s.brand} href="/design/a" aria-label="PromptHub, preview home">
        <span className={s.mark} aria-hidden>
          P
        </span>
        <span className={s.wordmark}>PromptHub</span>
      </a>

      <div className={s.anchor} ref={engineRef}>
        <button
          type="button"
          className={s.engine}
          aria-expanded={engineOpen}
          aria-label="Basic Mode, no AI. About the engine"
          onClick={() => setEngineOpen(!engineOpen)}
        >
          <span className={s.engineDot} aria-hidden />
          <span className={s.hideMobile}>Basic Mode, no AI</span>
        </button>
        <AnimatePresence>
          {engineOpen && (
            <motion.div className={s.popover} style={{ right: 0, transformOrigin: "top right" }} role="dialog" aria-label="Basic Mode" {...pop}>
              <p className={s.popoverTitle}>Basic Mode, no AI</p>
              <p style={{ margin: 0 }}>{BASIC_POPOVER}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className={s.headerGroup}>
        <button
          type="button"
          className={`${s.btn} ${s.quiet}`}
          aria-pressed={p.historyOpen}
          aria-label={p.historyOpen ? "Hide history" : "Show history"}
          onClick={p.onHistory}
        >
          <HistoryIcon size={18} aria-hidden />
          <span className={s.hideMobile}>History</span>
          <span className={`${s.kbd} ${s.hideTablet}`}>Ctrl \</span>
        </button>
        <button type="button" className={`${s.btn} ${s.secondary} ${s.hideMobile}`} onClick={p.onNew}>
          <Plus size={17} aria-hidden />
          New prompt
        </button>

        {p.signedIn ? (
          <div className={s.anchor} ref={accountRef}>
            <button
              type="button"
              className={s.avatarBtn}
              aria-haspopup="menu"
              aria-expanded={accountOpen}
              aria-label={`Account: ${ACCOUNT.name}`}
              onClick={() => setAccountOpen(!accountOpen)}
            >
              <span className={s.avatar} aria-hidden>
                {ACCOUNT.initials}
              </span>
            </button>
            <AnimatePresence>
              {accountOpen && (
                <motion.div className={s.menu} role="menu" aria-label="Account" {...pop}>
                  <div className={s.menuHead}>
                    <span className={s.avatar} aria-hidden>
                      {ACCOUNT.initials}
                    </span>
                    <div>
                      <div className={s.menuName}>{ACCOUNT.name}</div>
                      <div className={s.menuEmail}>{ACCOUNT.email}</div>
                    </div>
                  </div>
                  <button type="button" role="menuitem" className={s.menuItem} onClick={p.onSettings} autoFocus>
                    <Settings size={18} aria-hidden />
                    Account settings
                  </button>
                  <button type="button" role="menuitem" className={s.menuItem} onClick={p.onSignOut}>
                    <LogOut size={18} aria-hidden />
                    Sign out
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <button type="button" className={`${s.btn} ${s.quiet}`} onClick={p.onSignIn} aria-label="Sign in with Google">
            <LogIn size={18} aria-hidden />
            <span className={s.hideMobile}>Sign in with Google</span>
          </button>
        )}
      </div>
    </header>
  );
}

/* ---------- Empty ---------- */

function EmptyView(p: {
  idea: string;
  setIdea: (v: string) => void;
  target: TargetPlatform;
  setTarget: (t: TargetPlatform) => void;
  length: Length;
  setLength: (l: Length) => void;
  onGenerate: () => void;
  onTry: (key: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const has = p.idea.trim().length > 0;
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) ref.current?.focus();
  }, []);

  return (
    <div className={s.emptyGrid}>
      <div>
        <div className={s.plate}>
          <CropMarks />
          <label htmlFor="idea" className={s.srOnly}>
            Your idea
          </label>
          <textarea
            id="idea"
            ref={ref}
            className={s.composer}
            rows={2}
            maxLength={4000}
            value={p.idea}
            placeholder="Describe what you want the AI to do"
            onChange={(e) => p.setIdea(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                p.onGenerate();
              }
            }}
          />
          <div className={s.composerFoot}>
            <span>Rough is fine. You can refine it after.</span>
            {p.idea.length > 3500 && <span className={s.count}>{p.idea.length.toLocaleString()} / 4,000</span>}
          </div>
        </div>
        {!has && (
          <div className={s.tryOne}>
            <p className={s.tryLabel}>Try one</p>
            <ul className={s.tryList}>
              {TRY_ONE.map((key, i) => (
                <li key={key}>
                  <button
                    type="button"
                    className={s.tryBtn}
                    onClick={() => {
                      p.onTry(key);
                      requestAnimationFrame(() => {
                        const el = ref.current;
                        if (el) {
                          el.focus();
                          el.setSelectionRange(el.value.length, el.value.length);
                        }
                      });
                    }}
                  >
                    <span className={s.tryDot} style={{ background: PLATFORM_VAR[TARGETS[i]] }} aria-hidden />
                    {briefFor(key).idea}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className={`${s.slip} ${s.settingsStack}`}>
        <div>
          <p className={s.slipTitle}>Write it for</p>
          <PlatformPicker value={p.target} onChange={p.setTarget} />
        </div>
        <div>
          <p className={s.slipTitle}>Length</p>
          <LengthPicker value={p.length} onChange={p.setLength} describe />
        </div>
        <div className={s.generateRow}>
          <button
            type="button"
            className={`${s.btn} ${s.primary} ${s.big}`}
            aria-disabled={!has}
            onClick={() => has && p.onGenerate()}
          >
            Generate prompt
            <span className={s.kbd}>Ctrl ↵</span>
          </button>
          <p className={s.generateHint}>
            {has ? `Sets a ${TARGET_LABELS[p.target]} prompt from local templates.` : "Write your idea first."}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------- Questions ---------- */

function Questions(p: {
  mb: MockBrief;
  answers: Record<string, string>;
  setAnswers: (fn: (a: Record<string, string>) => Record<string, string>) => void;
  skipped: string[];
  setSkipped: (fn: (s: string[]) => string[]) => void;
  onGenerate: () => void;
  reduce: boolean;
}) {
  const qs = p.mb.questions;
  const fields = useRef<Record<string, HTMLInputElement | null>>({});
  const answered = qs.filter((q) => p.answers[q.id]?.trim()).length;
  const skippedN = p.skipped.length;
  const focusNext = (i: number) => {
    const next = qs.slice(i + 1).find((q) => !p.skipped.includes(q.id));
    if (next) fields.current[next.id]?.focus();
  };

  return (
    <motion.section
      className={s.slip}
      aria-labelledby="q-title"
      initial={p.reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: EASE_OUT }}
    >
      <div className={s.questionsHead}>
        <h2 className={s.questionsTitle} id="q-title">
          {qs.length} questions to sharpen the prompt
        </h2>
        <button type="button" className={s.textBtn} onClick={p.onGenerate}>
          Skip all
        </button>
      </div>
      <div className={s.progress} aria-hidden>
        {qs.map((q) => (
          <span
            key={q.id}
            className={s.progressBar}
            data-s={p.skipped.includes(q.id) ? "skipped" : p.answers[q.id]?.trim() ? "answered" : "open"}
          />
        ))}
      </div>

      {qs.map((q, i) => {
        const isSkipped = p.skipped.includes(q.id);
        const value = p.answers[q.id] ?? "";
        const isAnswered = value.trim().length > 0;
        return (
          <div key={q.id} className={s.question} data-s={isSkipped ? "skipped" : isAnswered ? "answered" : "open"}>
            <div className={s.questionLine}>
              <p className={s.questionText} id={`${q.id}-label`}>
                {q.question}
              </p>
              <span className={s.qMeta}>
                {isSkipped ? (
                  <>
                    Skipped
                    <button
                      type="button"
                      className={s.textBtn}
                      onClick={() => {
                        p.setSkipped((sk) => sk.filter((x) => x !== q.id));
                        requestAnimationFrame(() => fields.current[q.id]?.focus());
                      }}
                    >
                      Undo
                    </button>
                  </>
                ) : isAnswered ? (
                  <>
                    <Check size={15} aria-label="Answered" />
                    <button
                      type="button"
                      className={s.textBtn}
                      onClick={() => p.setAnswers((a) => ({ ...a, [q.id]: "" }))}
                    >
                      Clear
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className={s.textBtn}
                    onClick={() => {
                      p.setSkipped((sk) => [...sk, q.id]);
                      focusNext(i);
                    }}
                  >
                    Skip
                  </button>
                )}
              </span>
            </div>
            <AnimatePresence initial={false}>
              {!isSkipped && (
                <motion.div
                  initial={p.reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={p.reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                  transition={{ duration: 0.22, ease: EASE_OUT }}
                  style={{ overflow: "hidden" }}
                >
                  <input
                    ref={(el) => {
                      fields.current[q.id] = el;
                    }}
                    className={s.answerField}
                    aria-labelledby={`${q.id}-label`}
                    placeholder="Type an answer or pick one"
                    value={value}
                    onChange={(e) => p.setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !(e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        focusNext(i);
                      }
                    }}
                  />
                  <div className={s.chips} role="group" aria-label="Suggestions">
                    {q.suggestions.map((sug) => (
                      <button
                        key={sug}
                        type="button"
                        className={s.chip}
                        aria-pressed={value === sug}
                        onClick={() => {
                          p.setAnswers((a) => ({ ...a, [q.id]: sug }));
                          focusNext(i);
                        }}
                      >
                        {value === sug && <Check size={15} strokeWidth={2.6} aria-hidden />}
                        {sug}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}

      <div className={s.questionsFoot}>
        <button type="button" className={`${s.btn} ${s.primary} ${s.big}`} onClick={p.onGenerate}>
          Generate prompt
          <span className={s.kbd}>Ctrl ↵</span>
        </button>
        <span className={s.liveCount} aria-live="polite">
          {answered} answered, {skippedN} skipped
        </span>
      </div>
    </motion.section>
  );
}

/* ---------- History rail ---------- */

function HistoryRail(p: {
  narrow: boolean;
  reduce: boolean;
  selected: string | null;
  onOpen: (item: HistoryItem) => void;
  onClose: () => void;
  onNew: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | TargetPlatform>("all");
  const filters = ["all", ...TARGETS] as const;
  const filterRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const items = HISTORY.filter(
    (h) => (filter === "all" || h.target === filter) && h.title.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const groups: { label: string; items: HistoryItem[] }[] = [];
  for (const it of items) {
    const g = historyGroup(it.ago);
    const last = groups[groups.length - 1];
    if (last?.label === g) last.items.push(it);
    else groups.push({ label: g, items: [it] });
  }

  const hidden = p.reduce ? { opacity: 0, x: 0, y: 0 } : p.narrow ? { x: 0, y: "100%" } : { x: "-100%", y: 0 };
  const shown = { opacity: 1, x: 0, y: 0 };

  return (
    <>
      {p.narrow && (
        <motion.div
          className={s.scrim}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          onClick={p.onClose}
          aria-hidden
        />
      )}
      <motion.aside
        className={s.rail}
        aria-label="History"
        role={p.narrow ? "dialog" : undefined}
        aria-modal={p.narrow ? true : undefined}
        initial={hidden}
        animate={shown}
        exit={{ ...hidden, transition: { duration: 0.24, ease: EASE_DRAWER } }}
        transition={{ duration: 0.4, ease: EASE_DRAWER }}
      >
        <span className={s.handle} aria-hidden />
        <div className={s.railHead}>
          <h2 className={s.railTitle}>History</h2>
          <div className={s.headerGroup}>
            {p.narrow && (
              <button type="button" className={`${s.btn} ${s.quiet} ${s.railBtn}`} onClick={p.onNew}>
                <Plus size={17} aria-hidden />
                New prompt
              </button>
            )}
            <button
              type="button"
              className={`${s.btn} ${s.quiet} ${s.railBtn} ${s.iconBtn}`}
              aria-label="Hide history"
              title="Hide history (Ctrl \)"
              onClick={p.onClose}
            >
              {p.narrow ? <X size={20} aria-hidden /> : <PanelLeftClose size={20} aria-hidden />}
            </button>
          </div>
        </div>
        <div className={s.search}>
          <Search size={17} aria-hidden />
          <input
            className={s.searchInput}
            type="search"
            placeholder="Search prompts"
            aria-label="Search prompts"
            value={query}
            enterKeyHint="search"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div
          className={s.filters}
          role="radiogroup"
          aria-label="Filter by platform"
          onKeyDown={(e) => {
            const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
            if (!dir) return;
            e.preventDefault();
            const n = (filters.indexOf(filter) + dir + filters.length) % filters.length;
            setFilter(filters[n]);
            filterRefs.current[n]?.focus();
          }}
        >
          {filters.map((f, i) => (
            <button
              key={f}
              ref={(el) => {
                filterRefs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={filter === f}
              tabIndex={filter === f ? 0 : -1}
              className={s.filter}
              onClick={() => setFilter(f)}
            >
              {f !== "all" && <span className={s.dot} style={{ background: PLATFORM_VAR[f] }} aria-hidden />}
              {f === "all" ? "All" : TARGET_LABELS[f]}
            </button>
          ))}
        </div>

        <div className={s.list}>
          {items.length === 0 ? (
            <div className={s.railEmpty}>
              <strong>{query ? `No prompts match “${query}”` : `No ${filter === "all" ? "" : TARGET_LABELS[filter]} prompts yet`}</strong>
              {query ? "Check the spelling or search a shorter word." : "Prompts you write for this platform appear here."}
              <p style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className={s.textBtn}
                  style={{ color: "var(--rail-text)" }}
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                >
                  Clear search and filter
                </button>
              </p>
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.label} role="group" aria-label={g.label}>
                <p className={s.group}>{g.label}</p>
                {g.items.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    className={s.row}
                    aria-current={p.selected === it.id}
                    style={{ ["--row-p" as string]: PLATFORM_VAR[it.target] }}
                    onClick={() => p.onOpen(it)}
                  >
                    <span style={{ minWidth: 0 }}>
                      <span className={s.rowTitle} style={{ display: "block" }}>
                        {it.title}
                      </span>
                      <span className={s.rowMeta}>
                        {TARGET_LABELS[it.target]}, {it.versions} {it.versions === 1 ? "version" : "versions"}
                      </span>
                    </span>
                    <span className={s.rowTime}>{relTime(it.ago)}</span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
        <div className={s.railFoot}>
          <span>{HISTORY.length} prompts on this device</span>
        </div>
      </motion.aside>
    </>
  );
}

/* ---------- Mobile action bar ---------- */

function MobileBar(p: {
  view: View;
  hasIdea: boolean;
  onGenerate: () => void;
  onStop: () => void;
  copied: boolean;
  onCopy: () => void;
  refineOpen: boolean;
  setRefineOpen: (v: boolean) => void;
  onRegenerate: () => void;
  latest: boolean;
  onUnavailable: () => void;
}) {
  const reduce = useReducedMotion();
  return (
    <div className={s.mobileBar}>
      {(p.view === "empty" || p.view === "questions") && (
        <button
          type="button"
          className={`${s.btn} ${s.primary} ${s.grow}`}
          aria-disabled={!p.hasIdea}
          onClick={() => p.hasIdea && p.onGenerate()}
        >
          Generate prompt
        </button>
      )}
      {p.view === "generating" && (
        <button type="button" className={`${s.btn} ${s.secondary} ${s.grow}`} onClick={p.onStop}>
          <Square size={15} aria-hidden />
          Stop
        </button>
      )}
      {p.view === "result" && (
        <>
          <div className={s.anchor}>
            <button
              type="button"
              className={`${s.btn} ${s.secondary}`}
              aria-haspopup="menu"
              aria-expanded={p.refineOpen}
              onClick={() => p.setRefineOpen(!p.refineOpen)}
            >
              Refine
              <ChevronDown size={16} aria-hidden />
            </button>
            <AnimatePresence>
              {p.refineOpen && (
                <motion.div
                  className={s.menu}
                  role="menu"
                  aria-label="Refine"
                  style={{ top: "auto", bottom: "calc(100% + 10px)", left: 0, right: "auto", transformOrigin: "bottom left", width: "calc(100vw - 24px)" }}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.12 } }}
                  transition={{ duration: 0.2, ease: EASE_OUT }}
                >
                  {[
                    { icon: PenLine, label: "Improve" },
                    { icon: Minimize2, label: "Shorten" },
                    { icon: Maximize2, label: "Expand" },
                  ].map(({ icon: Icon, label }) => (
                    <button
                      key={label}
                      type="button"
                      role="menuitem"
                      aria-disabled="true"
                      className={s.menuItem}
                      style={{ color: "var(--ink-muted)", cursor: "default" }}
                    >
                      <Icon size={18} aria-hidden />
                      {label}
                      <span style={{ marginLeft: "auto", fontSize: 13 }}>Needs AI</span>
                    </button>
                  ))}
                  <button type="button" role="menuitem" className={s.menuItem} onClick={p.onRegenerate}>
                    <RotateCw size={18} aria-hidden />
                    Regenerate
                  </button>
                  <p className={s.slipNote} style={{ padding: "4px 12px 8px", margin: 0 }}>
                    {BASIC_REASON}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <button
            type="button"
            className={`${s.btn} ${s.unavailable}`}
            aria-disabled="true"
            aria-describedby="basic-reason"
            onClick={p.onUnavailable}
          >
            Tone
            <ChevronDown size={16} aria-hidden />
          </button>
          <CopyButton copied={p.copied} onCopy={p.onCopy} wide />
        </>
      )}
    </div>
  );
}
