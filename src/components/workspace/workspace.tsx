"use client";

import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { AiStatusResponse } from "@/lib/contracts";
import type { PromptHubClient } from "@/lib/client/types";
import type { HistoryStore } from "@/lib/history/types";
import { createApiClient } from "@/lib/client/api";
import { createBrowserStore } from "@/lib/history/browser-store";
import { AccountButton } from "@/components/auth/account-button";
import { AuthProvider, useAuth } from "@/components/auth/auth-context";
import { SignInCard } from "@/components/auth/sign-in-card";
import { HistoryPanel } from "@/components/history/history-panel";
import { ShortcutSheet } from "@/components/shortcuts/shortcut-sheet";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEditorView } from "@/hooks/use-editor-view";
import { useIsDesktopRail, useIsMobile, useIsWide, useKeyLabels, useReducedMotion } from "@/hooks/use-media";
import { latest, useSession, type SessionState } from "@/hooks/use-session";
import { keys as match, useShortcuts } from "@/hooks/use-shortcuts";
import { useSystemThemeSync } from "@/hooks/use-theme";
import { isMacPlatform, wordCount } from "@/lib/utils";
import {
  aiState as aiStateOf,
  readAiConsent,
  readEnginePreference,
  STATUS_STALE_CODES,
  writeAiConsent,
  writeEnginePreference,
  type EnginePreference,
} from "./ai";
import { AiDisclosure } from "./ai-disclosure";
import { BriefColumn, BriefCompact } from "./brief";
import { CommandPalette } from "./command-palette";
import { Composer } from "./composer";
import { activityLabel } from "./labels";
import { MobileBar } from "./mobile-bar";
import { ErrorSheet, GhostPlate } from "./plate";
import { PromptSheet } from "./prompt-sheet";
import { answerFieldId, ClarifyingSheet, Questions } from "./questions";
import { activeQuestion as activeQuestionOf, nextOpenQuestion } from "./stepper";
import { TopBar } from "./top-bar";
import {
  WorkspaceContext,
  type CopyState,
  type CopyVia,
  type EnginePlacement,
  type WorkspaceValue,
} from "./workspace-context";

const DRAWER = [0.32, 0.72, 0, 1] as const;
const COPIED_MS = 2400;

/** Client root: the real API client and IndexedDB history. */
export function Workspace() {
  useSystemThemeSync();
  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider>
        <AuthProvider>
          <WorkspaceInner />
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </MotionConfig>
  );
}

interface Env {
  client: PromptHubClient;
  history: HistoryStore;
}

/** History opens lazily on first use, never during server render. */
function createEnv(): Env {
  return { client: createApiClient(), history: createBrowserStore() };
}

function textToCopy(s: SessionState): string {
  if (s.viewing !== null) return s.versions[s.viewing]?.content ?? "";
  if (s.stream) return latest(s)?.content ?? "";
  return s.versions.length > 0 ? s.draft : "";
}

/**
 * The copy charge (DIRECTION-C §10): each piece flashes from its tint to the platform's solid colour
 * and back, lifting 2px, top to bottom, ~50ms apart. WAAPI, so it runs on the compositor. Reduced
 * motion: one cobalt-wash fade on every piece at once.
 */
function runCharge(sheet: HTMLElement | null, reduced: boolean) {
  if (!sheet) return;
  const pieces = Array.from(sheet.querySelectorAll<HTMLElement>("[data-piece]"));
  const cs = getComputedStyle(sheet);
  const tint = cs.getPropertyValue("--p-tint").trim();
  const solid = cs.getPropertyValue("--p").trim();
  const deep = cs.getPropertyValue("--p-deep").trim();
  const on = cs.getPropertyValue("--p-on").trim() || "#fff";
  const wash = cs.getPropertyValue("--cobalt-wash").trim();
  if (pieces.length === 0) {
    sheet
      .querySelector<HTMLElement>("[data-wash]")
      ?.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 520, easing: "cubic-bezier(0.23, 1, 0.32, 1)" });
    return;
  }
  pieces.forEach((el, i) => {
    if (reduced) {
      el.animate([{ backgroundColor: tint }, { backgroundColor: wash }, { backgroundColor: tint }], { duration: 600 });
      return;
    }
    el.animate(
      [
        { backgroundColor: tint, color: deep, transform: "translateY(0)" },
        { backgroundColor: solid, color: on, transform: "translateY(-2px)", offset: 0.3 },
        { backgroundColor: tint, color: deep, transform: "translateY(0)" },
      ],
      { duration: 620, delay: i * 52 - Math.min(i, 4) * 4, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
    );
  });
}

type Shape = "single" | "compose-split" | "work-split" | "docked";

function WorkspaceInner() {
  const [env] = useState(createEnv);
  const { client, history } = env;
  const [aiStatus, setAiStatus] = useState<AiStatusResponse | null>(null);
  const [aiStatusFailed, setAiStatusFailed] = useState(false);
  const authStatus = useAuth().state.status;
  // The visitor's engine choice, per browser. Read after mount (storage isn't there on the server).
  const [enginePref, setEnginePrefState] = useState<EnginePreference>("auto");
  const [disclosure, setDisclosure] = useState<{ run: () => void; basic: () => void } | null>(null);
  const [railOpen, setRailOpenState] = useState(false);
  const [railAnimated, setRailAnimated] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [copy, setCopy] = useState<CopyState>({ copied: false, animate: false, words: 0 });
  const [activeQuestion, setActiveQuestion] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState("");
  const [view, setView] = useEditorView();
  const split = useIsDesktopRail();
  const wide = useIsWide();
  const mobile = useIsMobile();
  const reduced = useReducedMotion();
  const keyLabels = useKeyLabels();

  const composerRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const generateRef = useRef<HTMLButtonElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const announce = useCallback((message: string) => {
    setLiveMessage("");
    if (liveTimer.current) clearTimeout(liveTimer.current);
    liveTimer.current = setTimeout(() => setLiveMessage(message), 60);
  }, []);

  const fetchAiStatus = useCallback(
    () =>
      client.getAiStatus().then(
        (p) => {
          setAiStatus(p);
          setAiStatusFailed(false);
        },
        () => setAiStatusFailed(true),
      ),
    [client],
  );
  const loadAiStatus = useCallback(() => {
    setAiStatusFailed(false);
    void fetchAiStatus();
  }, [fetchAiStatus]);

  const { state, actions: sessionActions } = useSession(
    client,
    history,
    {
      onAnnounce: announce,
      onAiRequired: loadAiStatus,
      onPersistError: () => toast("Couldn't save this version to history. It stays open here."),
      onStreamStart: (activity, tone) => announce(activity === "generate" ? "Writing" : activityLabel(activity, tone)),
    },
  );

  const setEnginePref = useCallback(
    (p: EnginePreference) => {
      writeEnginePreference(p);
      client.setEnginePreference?.(p);
      setEnginePrefState(p);
    },
    [client],
  );
  // First-use AI notice: before the first request that would go to Gemini, show what is sent and
  // where, with Continue or Basic Mode. The choice is remembered per browser.
  const ai = aiStateOf(aiStatus, enginePref);
  const usingAi = ai === "on";
  const gate = useCallback(
    (needsAi: boolean, run: () => void, basicRun?: () => void) => {
      if (!needsAi || readAiConsent()) return run();
      setDisclosure({
        run: () => {
          writeAiConsent();
          run();
        },
        basic: () => {
          setEnginePref("basic");
          basicRun?.();
        },
      });
    },
    [setEnginePref],
  );
  const actions = useMemo(() => {
    const a = sessionActions;
    /** Whether the primary action (Generate / continue) would send a request right now. */
    const primarySends = () => {
      const s = a.getState();
      if (s.phase === "idle") return s.idea.trim().length > 0;
      if (s.phase === "answering") return true;
      const g = s.generated;
      if ((s.phase === "ready" || s.phase === "error") && g) {
        return !!s.idea.trim() && (s.idea.trim() !== g.idea || s.target !== g.target || s.length !== g.length);
      }
      return s.phase === "error" && s.error?.retry === "clarify";
    };
    return {
      ...a,
      primary: () => gate(usingAi && primarySends(), a.primary, a.primary),
      skipAll: () => gate(usingAi, a.skipAll, a.skipAll),
      regenerate: () => gate(usingAi, a.regenerate, a.regenerate),
      transform: (action: Parameters<typeof a.transform>[0], tone?: Parameters<typeof a.transform>[1]) =>
        gate(true, () => a.transform(action, tone)),
      retry: () => {
        const r = a.getState().error?.retry;
        const transform = r !== undefined && r !== "clarify" && r !== "generate" && r !== "regenerate";
        gate(transform || usingAi, a.retry, transform ? undefined : a.retry);
      },
    };
  }, [sessionActions, gate, usingAi]);

  // Apply the saved choice once on mount; the client asks for Basic Mode from then on if chosen.
  useEffect(() => {
    const saved = readEnginePreference();
    client.setEnginePreference?.(saved);
    // Storage is read after mount so the server render and hydration agree.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved !== "auto") setEnginePrefState(saved);
  }, [client]);

  // Fetched once per mount, when sign-in state settles or changes, and after an unexpected
  // ai_required answer.
  useEffect(() => {
    if (authStatus === "loading") return;
    void fetchAiStatus();
  }, [fetchAiStatus, authStatus]);

  // A limit, sign-in or availability error means the status shown is out of date: check again.
  const errorCode = state.error?.code;
  useEffect(() => {
    if (errorCode && STATUS_STALE_CODES.has(errorCode)) void fetchAiStatus();
  }, [errorCode, fetchAiStatus]);

  // Desktop only: the composer has focus on load.
  useEffect(() => {
    if (state.phase === "idle" && window.matchMedia("(pointer: fine)").matches) composerRef.current?.focus();
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Each new set of questions opens on its first unanswered step.
  const [lastPhase, setLastPhase] = useState(state.phase);
  if (state.phase !== lastPhase) {
    setLastPhase(state.phase);
    // Pin the open step, so typing an answer into it doesn’t move the stepper on.
    if (state.phase === "answering") setActiveQuestion(activeQuestionOf(state.questions, null));
    else if (state.phase === "clarifying") setActiveQuestion(null);
  }

  // Short-lived notes.
  useEffect(() => {
    const n = state.notice;
    if (!n || n.kind === "stopped" || n.kind === "same") return;
    const t = setTimeout(() => actions.dispatch({ type: "clearNotice", kind: n.kind }), n.kind === "saved" ? 2000 : 4000);
    return () => clearTimeout(t);
  }, [state.notice, actions]);

  // The blocks are tinted for the platform the text on screen was written for. A failed regenerate
  // for another platform leaves the old prompt (and its tint) in place.
  const [shown, setShown] = useState({ count: state.versions.length, id: state.promptId, target: state.generated?.target ?? state.target });
  if (state.versions.length !== shown.count || state.promptId !== shown.id) {
    setShown({ count: state.versions.length, id: state.promptId, target: state.generated?.target ?? state.target });
  }
  const writtenFor =
    state.stream && (state.stream.text || state.versions.length === 0)
      ? (state.generated?.target ?? state.target)
      : state.versions.length > 0
        ? shown.target
        : state.target;

  const railAnimTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setRailOpen = useCallback((open: boolean, via: "pointer" | "keyboard") => {
    setRailAnimated(via === "pointer");
    setRailOpenState(open);
    if (railAnimTimer.current) clearTimeout(railAnimTimer.current);
    if (via === "pointer") railAnimTimer.current = setTimeout(() => setRailAnimated(false), 320);
  }, []);

  const copyText = textToCopy(state);
  const copyTextRef = useRef(copyText);
  useEffect(() => {
    copyTextRef.current = copyText;
  });

  const copyPrompt = useCallback(
    async (via: CopyVia) => {
      // Exactly the text of the version on screen. While a stream runs, Copy falls back to the last
      // committed version.
      const s = actions.getState();
      const el = editorRef.current;
      const text = el && !s.stream && s.versions.length > 0 ? el.value : copyTextRef.current;
      if (!text.trim()) return;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        toast.error(`Couldn't copy. Select the text and press ${isMacPlatform() ? "⌘C" : "Ctrl+C"}.`, {
          duration: Infinity,
          closeButton: true,
        });
        // Show the whole prompt as one field and select it, so a manual copy takes everything.
        setView("plain");
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const field = editorRef.current;
            field?.focus();
            field?.select();
          }),
        );
        return;
      }
      setCopy({ copied: true, animate: via === "pointer" && !reduced, words: wordCount(text) });
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopy((c) => ({ ...c, copied: false, animate: false })), COPIED_MS);
      announce("Prompt copied");
      // The charge answers a click; from the keyboard the outline and header line confirm it.
      if (via === "pointer") runCharge(sheetRef.current, reduced);
    },
    [actions, announce, reduced, setView],
  );

  const newPrompt = useCallback(() => {
    actions.reset();
    setActiveQuestion(null);
    requestAnimationFrame(() => {
      if (window.matchMedia("(pointer: fine)").matches) composerRef.current?.focus();
    });
  }, [actions]);

  const skipFocused = useCallback(() => {
    const el = document.activeElement?.closest("[data-question-id]");
    const id = el?.getAttribute("data-question-id");
    if (!id) return false;
    actions.dispatch({ type: "skip", id });
    const next = nextOpenQuestion(actions.getState().questions, id);
    setActiveQuestion(next);
    requestAnimationFrame(() => {
      if (next) document.getElementById(answerFieldId(next))?.focus();
      else generateRef.current?.focus();
    });
    return true;
  }, [actions]);

  useShortcuts(
    [
      {
        id: "palette",
        match: match.palette,
        inEditable: true,
        inModal: true,
        run: () => {
          if (shortcutsOpen) return false;
          setPaletteOpen(!paletteOpen);
        },
      },
      { id: "generate", match: match.generate, inEditable: true, run: () => actions.primary() },
      {
        id: "copy",
        match: match.copy,
        inEditable: true,
        inModal: false,
        run: () => {
          if (!copyTextRef.current.trim()) return false;
          void copyPrompt("keyboard");
        },
      },
      { id: "new", match: match.newPrompt, inEditable: true, run: () => newPrompt() },
      {
        id: "history",
        match: match.toggleHistory,
        inEditable: true,
        inModal: true,
        run: () => setRailOpen(!railOpen, "keyboard"),
      },
      { id: "help", match: match.help, run: () => setShortcutsOpen(true) },
      { id: "stop", match: match.escape, inEditable: true, run: () => actions.stop() },
      { id: "skip", match: match.skipQuestion, inEditable: true, run: () => skipFocused() },
      { id: "prev", match: match.prevVersion, run: () => actions.dispatch({ type: "stepVersion", delta: -1 }) },
      { id: "next", match: match.nextVersion, run: () => actions.dispatch({ type: "stepVersion", delta: 1 }) },
      {
        id: "search",
        match: match.search,
        run: () => {
          if (!railOpen || !searchRef.current) return false;
          searchRef.current.focus();
          searchRef.current.select();
        },
      },
    ],
    { modalOpen: shortcutsOpen || paletteOpen },
  );

  const phase = state.phase;
  const compose = phase === "idle";
  const hasOutput = state.versions.length > 0 || !!state.stream;
  const docked = split && railOpen;
  const shape: Shape = docked ? "docked" : compose && split ? "compose-split" : !compose && wide ? "work-split" : "single";
  const enginePlacement: EnginePlacement = !mobile ? "topbar" : compose ? "composer" : hasOutput ? "sheet" : "brief";
  /** AI-only actions (Improve, Shorten, Expand, Tone) are off: AI isn't on for this visitor. */
  const basic = !usingAi;

  const value: WorkspaceValue = {
    client,
    history,
    aiStatus,
    aiStatusFailed,
    reloadAiStatus: loadAiStatus,
    basic,
    aiState: ai,
    enginePref,
    setEnginePref,
    state,
    actions,
    keys: keyLabels,
    wide,
    mobile,
    enginePlacement,
    writtenFor,
    railOpen,
    setRailOpen,
    paletteOpen,
    setPaletteOpen,
    shortcutsOpen,
    setShortcutsOpen,
    view,
    setView,
    activeQuestion,
    setActiveQuestion,
    copy,
    copyPrompt: (via) => void copyPrompt(via),
    announce,
    newPrompt,
    composerRef,
    editorRef,
    sheetRef,
    searchRef,
    generateRef,
    copyText,
  };

  const side =
    shape === "docked" ? (
      <motion.aside
        key="history"
        id="history-panel"
        aria-label="History"
        className="ih-side"
        initial={railAnimated ? (reduced ? { opacity: 0 } : { opacity: 0, x: -24 }) : false}
        animate={{ opacity: 1, x: 0, transition: { duration: railAnimated ? 0.3 : 0, ease: DRAWER } }}
      >
        <HistoryPanel variant="docked" />
      </motion.aside>
    ) : shape === "compose-split" ? (
      <div key="composer" className="ih-side">
        <Composer />
      </div>
    ) : shape === "work-split" ? (
      <BriefColumn key="brief" />
    ) : null;

  return (
    <WorkspaceContext.Provider value={value}>
      <div className="ih-app" data-platform={state.target}>
        <TopBar accountSlot={<AccountButton />} />
        <main className="ih-layout" data-shape={shape} data-bar={mobile && hasOutput}>
          {side}
          <motion.div
            className="ih-main"
            layout={railAnimated && !reduced ? "position" : false}
            transition={{ duration: 0.3, ease: DRAWER }}
          >
            <SignInCard />
            {compose ? (
              <>
                {(shape === "docked" || shape === "single") && <Composer />}
                {shape !== "docked" && <GhostPlate />}
              </>
            ) : (
              <>
                {shape !== "work-split" && <BriefCompact />}
                <AnimatePresence initial={false} mode="popLayout">
                  {phase === "clarifying" && (
                    <motion.div key="clarifying" exit={{ opacity: 0, transition: { duration: 0.12 } }}>
                      <ClarifyingSheet />
                    </motion.div>
                  )}
                  {phase === "answering" && (
                    <motion.div key="questions" exit={{ opacity: 0, transition: { duration: 0.12 } }}>
                      <Questions />
                    </motion.div>
                  )}
                </AnimatePresence>
                {phase === "error" && !hasOutput && <ErrorSheet />}
                {hasOutput && <PromptSheet />}
              </>
            )}
          </motion.div>
        </main>

        {!split && (
          <BottomSheet
            open={railOpen}
            onOpenChange={(o) => setRailOpen(o, "pointer")}
            title="History"
            tall
            headerRight={
              <Button size="sm" onClick={() => setRailOpen(false, "pointer")}>
                Done
              </Button>
            }
          >
            <HistoryPanel variant="sheet" onChosen={() => setRailOpen(false, "pointer")} />
          </BottomSheet>
        )}

        {mobile && <MobileBar />}
        <CommandPalette />
        <AiDisclosure
          open={disclosure !== null}
          onContinue={() => {
            const d = disclosure;
            setDisclosure(null);
            d?.run();
          }}
          onBasic={() => {
            const d = disclosure;
            setDisclosure(null);
            d?.basic();
          }}
          onDismiss={() => setDisclosure(null)}
        />
        <ShortcutSheet />
        <div className="ih-sr" aria-live="polite" aria-atomic="true">
          {liveMessage}
        </div>
      </div>
    </WorkspaceContext.Provider>
  );
}
