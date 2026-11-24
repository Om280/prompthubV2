"use client";

import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import type { AiStatusResponse } from "@/lib/contracts";
import type { PromptHubClient } from "@/lib/client/types";
import type { HistoryStore } from "@/lib/history/types";
import { createApiClient } from "@/lib/client/api";
import { createBrowserStore } from "@/lib/history/browser-store";
import { createMemoryStore } from "@/lib/history/memory-store";
import { createMockClient } from "@/lib/mock/adapter";
import { buildHistorySeed } from "@/lib/mock/history-seed";
import { buildPreviewSession, readPreview, type PreviewConfig } from "@/lib/mock/preview";
import { HistoryPanel } from "@/components/history/history-panel";
import { ShortcutSheet } from "@/components/shortcuts/shortcut-sheet";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useIsDesktopRail, useIsMobile, useKeyLabels, useReducedMotion } from "@/hooks/use-media";
import { initialSession, latest, useSession, type SessionState } from "@/hooks/use-session";
import { keys as match, useShortcuts } from "@/hooks/use-shortcuts";
import { applyTheme } from "@/hooks/use-theme";
import { cn, isMacPlatform } from "@/lib/utils";
import { AuthProvider, useAuth } from "@/components/auth/auth-context";
import { Composer, EntranceFade } from "./composer";
import { Editor } from "./editor";
import { Header } from "./header";
import { activityLabel } from "./labels";
import { MobileBar } from "./mobile-bar";
import { AnswersSummary, ClarifyingSkeleton, Questions } from "./questions";
import { RegenerateForMobile, SettingsRow } from "./settings-row";
import { FirstRunError, Provenance, StatusLines } from "./status-lines";
import { Toolbar } from "./toolbar";
import { VersionSwitcher } from "./version-switcher";
import { WorkspaceContext, type CopyState, type CopyVia, type WorkspaceValue } from "./workspace-context";

const noopSubscribe = () => () => {};

/**
 * Client root. Reads the dev-only `?preview=` config after hydration and remounts the workspace
 * with it, so production renders exactly one default tree.
 */
export function Workspace() {
  const search = useSyncExternalStore(
    noopSubscribe,
    () => window.location.search,
    () => null,
  );
  const config = useMemo(() => (search === null ? null : readPreview(search)), [search]);
  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider>
        <AuthProvider>
          <WorkspaceInner key={config ? `preview-${search}` : "default"} config={config} />
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </MotionConfig>
  );
}

interface Env {
  client: PromptHubClient;
  history: HistoryStore;
  initial: SessionState;
}

/**
 * Default tree: the real API client and IndexedDB history (opened lazily on first use, never during
 * server render). The mock client and seeded history exist only behind the dev `?preview=<state>`
 * parameter; `history`, `theme` and `storage` alone apply to the real app.
 */
function createEnv(config: PreviewConfig | null): Env {
  if (!config?.state) {
    return {
      client: createApiClient(),
      history: config?.storageOff ? createMemoryStore({}, { persistent: false }) : createBrowserStore(),
      initial: initialSession(),
    };
  }
  const client = createMockClient({ mode: config.state === "basic" ? "basic" : "ai" });
  // Preview configs only exist after hydration (client-side), so building eagerly is safe.
  const seed = config.state === "history-empty" ? { prompts: [], versions: [] } : buildHistorySeed(Date.now());
  return {
    client,
    history: createMemoryStore(seed, { persistent: !config.storageOff }),
    initial: buildPreviewSession(config, seed) ?? initialSession(),
  };
}

function textToCopy(s: SessionState): string {
  if (s.viewing !== null) return s.versions[s.viewing]?.content ?? "";
  if (s.stream) return latest(s)?.content ?? "";
  return s.versions.length > 0 ? s.draft : "";
}

function WorkspaceInner({ config }: { config: PreviewConfig | null }) {
  const [env] = useState(() => createEnv(config));
  const { client, history } = env;
  const [aiStatus, setAiStatus] = useState<AiStatusResponse | null>(null);
  const [aiStatusFailed, setAiStatusFailed] = useState(false);
  const authStatus = useAuth().state.status;
  const [railOpen, setRailOpenState] = useState(config?.historyOpen ?? false);
  const [railAnimated, setRailAnimated] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [copy, setCopy] = useState<CopyState>({ copied: false, animate: false });
  const [answersOpen, setAnswersOpen] = useState(false);
  const [liveMessage, setLiveMessage] = useState("");
  const desktopRail = useIsDesktopRail();
  const mobile = useIsMobile();
  const reduced = useReducedMotion();
  const keyLabels = useKeyLabels();

  const composerRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const washRef = useRef<HTMLDivElement>(null);
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

  const { state, actions } = useSession(
    client,
    history,
    {
      onAnnounce: announce,
      onAiRequired: loadAiStatus,
      onPersistError: () => toast("Couldn't save this version to history. It stays open here."),
      onStreamStart: (activity, tone) => announce(activity === "generate" ? "Writing" : activityLabel(activity, tone)),
    },
    () => env.initial,
  );

  // Theme override from the preview param (not persisted).
  useEffect(() => {
    if (config?.theme) applyTheme(config.theme, false);
  }, [config?.theme]);

  // Fetched once per mount, when sign-in state settles or changes, and after an unexpected
  // ai_required answer.
  useEffect(() => {
    if (authStatus === "loading") return;
    void fetchAiStatus();
  }, [fetchAiStatus, authStatus]);

  // Desktop only: the composer has focus on load (§6.1).
  useEffect(() => {
    if (state.phase === "idle" && window.matchMedia("(pointer: fine)").matches) composerRef.current?.focus();
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Short-lived meta notes.
  useEffect(() => {
    const n = state.notice;
    if (!n || n.kind === "stopped" || n.kind === "same") return;
    const t = setTimeout(() => actions.dispatch({ type: "clearNotice", kind: n.kind }), n.kind === "saved" ? 2000 : 4000);
    return () => clearTimeout(t);
  }, [state.notice, actions]);

  const railAnimTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setRailOpen = useCallback((open: boolean, via: "pointer" | "keyboard") => {
    setRailAnimated(via === "pointer");
    setRailOpenState(open);
    // Layout animation is only for the toggle itself; switch it off so streaming re-renders stay cheap.
    if (railAnimTimer.current) clearTimeout(railAnimTimer.current);
    if (via === "pointer") railAnimTimer.current = setTimeout(() => setRailAnimated(false), 300);
  }, []);

  const copyText = textToCopy(state);
  const copyTextRef = useRef(copyText);
  useEffect(() => {
    copyTextRef.current = copyText;
  });

  const copyPrompt = useCallback(
    async (via: CopyVia) => {
      // Exactly the textarea value of the version on screen. While a stream runs the textarea shows
      // incoming text, so Copy falls back to the last committed version.
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
        const el = editorRef.current;
        if (el) {
          el.focus();
          el.select();
        }
        return;
      }
      setCopy((c) => (c.copied ? c : { copied: true, animate: via === "pointer" && !reduced }));
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopy({ copied: false, animate: false }), 1600);
      announce("Prompt copied");
      if (!reduced) {
        washRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 520,
          easing: "cubic-bezier(0.23, 1, 0.32, 1)",
        });
      }
    },
    [actions, announce, reduced],
  );

  const newPrompt = useCallback(() => {
    actions.reset();
    setAnswersOpen(false);
    requestAnimationFrame(() => {
      if (window.matchMedia("(pointer: fine)").matches) composerRef.current?.focus();
    });
  }, [actions]);

  const skipFocused = useCallback(() => {
    const el = document.activeElement?.closest("[data-question-id]");
    const id = el?.getAttribute("data-question-id");
    if (!id) return false;
    const qs = actions.getState().questions;
    actions.dispatch({ type: "skip", id });
    const idx = qs.findIndex((q) => q.id === id);
    const next = qs.slice(idx + 1).find((q) => !q.skipped);
    requestAnimationFrame(() => {
      if (next) document.getElementById(`answer-${next.id}`)?.focus();
      else generateRef.current?.focus();
    });
    return true;
  }, [actions]);

  useShortcuts(
    [
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
    { modalOpen: shortcutsOpen },
  );

  const basic = aiStatus?.mode === "basic";
  const value: WorkspaceValue = {
    client,
    history,
    aiStatus,
    aiStatusFailed,
    reloadAiStatus: loadAiStatus,
    basic,
    preview: client.kind === "mock",
    state,
    actions,
    keys: keyLabels,
    railOpen,
    setRailOpen,
    shortcutsOpen,
    setShortcutsOpen,
    copy,
    copyPrompt: (via) => void copyPrompt(via),
    announce,
    newPrompt,
    composerRef,
    editorRef,
    washRef,
    searchRef,
    generateRef,
    copyText,
  };

  const phase = state.phase;
  const hasOutput = state.versions.length > 0 || !!state.stream;
  const docked = desktopRail && railOpen;
  const drawer = [0.32, 0.72, 0, 1] as const;

  return (
    <WorkspaceContext.Provider value={value}>
      <div className="min-h-dvh">
        <AnimatePresence initial={false}>
          {docked && (
            <motion.aside
              id="history-rail"
              aria-label="History"
              key="rail"
              initial={railAnimated ? { opacity: 0, x: -16 } : false}
              animate={{ opacity: 1, x: 0, transition: { duration: railAnimated ? 0.24 : 0, ease: drawer } }}
              exit={
                railAnimated
                  ? { opacity: 0, x: -16, transition: { duration: 0.18, ease: drawer } }
                  : { opacity: 0, transition: { duration: 0 } }
              }
              className="fixed inset-y-0 left-0 z-30 w-[var(--w-rail)] border-r border-border bg-surface"
            >
              <HistoryPanel variant="docked" />
            </motion.aside>
          )}
        </AnimatePresence>

        <div className={cn("flex min-h-dvh flex-col", docked && "pl-[var(--w-rail)]")}>
          <Header />
          <motion.main
            layout={railAnimated ? "position" : false}
            transition={{ duration: 0.24, ease: drawer }}
            className={cn("flex-1 pb-32 sm:pb-24", phase === "idle" ? "pt-[max(24px,calc(30dvh-128px))]" : "pt-8")}
          >
            <div className="column">
              <EntranceFade>
                <SettingsRow />
              </EntranceFade>
              <div className="mt-1">
                <RegenerateForMobile />
              </div>
              <div className={phase === "idle" ? "mt-6" : "mt-4"}>
                <Composer />
              </div>

              {phase === "error" && !hasOutput && (
                <div className="mt-8">
                  <FirstRunError />
                </div>
              )}

              <AnimatePresence initial={false} mode="popLayout">
                {phase === "clarifying" && (
                  <motion.div
                    key="clarifying"
                    className="mt-12"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.12 } }}
                  >
                    <ClarifyingSkeleton />
                  </motion.div>
                )}
                {phase === "answering" && (
                  <motion.div
                    key="questions"
                    // -mx-2/px-2: room so the height-collapse clip doesn't cut glyph overhangs or chip borders at the column edge.
                    className="mt-12 -mx-2 overflow-hidden px-2"
                    exit={{ opacity: 0, height: 0, transition: { duration: 0.22, ease: [0.77, 0, 0.175, 1] } }}
                  >
                    <Questions />
                  </motion.div>
                )}
              </AnimatePresence>

              {hasOutput && (
                <div className="mt-3">
                  <AnswersSummary
                    open={answersOpen}
                    onToggle={() => setAnswersOpen((o) => !o)}
                    right={mobile ? null : <VersionSwitcher />}
                  />
                </div>
              )}

              {hasOutput && (
                <div className="mt-6">
                  <Toolbar />
                  <StatusLines />
                  <Editor />
                  <Provenance />
                </div>
              )}
            </div>
          </motion.main>
        </div>

        {!desktopRail && (
          <BottomSheet
            open={railOpen}
            onOpenChange={(o) => setRailOpen(o, "pointer")}
            title="History"
            tall
            headerRight={
              <Button variant="text" className="-mr-1" onClick={() => setRailOpen(false, "pointer")}>
                Done
              </Button>
            }
          >
            <HistoryPanel variant="sheet" onChosen={() => setRailOpen(false, "pointer")} />
          </BottomSheet>
        )}

        <MobileBar />
        <ShortcutSheet />
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {liveMessage}
        </div>
      </div>
    </WorkspaceContext.Provider>
  );
}
