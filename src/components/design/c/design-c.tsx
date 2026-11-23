"use client";

import { MotionConfig } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { BriefCompact, Brief, GhostPlate, Generating, Questions, ResultSheet } from "./bench";
import { useMediaQuery, useModKey } from "./controls";
import { HistoryPanel, MobileBar, MobileHistory, Palette, Switcher, Toast, TopBar } from "./panels";
import { CContext, currentText, useDesignState, type PreviewState } from "./state";
import s from "./styles";

export function DesignC({ initial }: { initial: PreviewState }) {
  const store = useDesignState(initial);
  const { st, actions, announce } = store;
  const mod = useModKey();
  const [palette, setPalette] = useState(false);
  const narrow = useMediaQuery("(max-width: 899px)");
  const closePalette = useCallback(() => setPalette(false), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && k === "c" && st.phase === "result") {
        e.preventDefault();
        actions.copy(currentText(st), mod);
      } else if ((e.metaKey || e.ctrlKey) && k === "enter" && (st.phase === "questions" || st.phase === "compose")) {
        e.preventDefault();
        actions.generate();
      } else if (e.altKey && k === "n") {
        e.preventDefault();
        actions.newPrompt();
      } else if (e.key === "Escape" && st.accountOpen) {
        actions.patch({ accountOpen: false });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [st, actions, mod]);

  return (
    <CContext.Provider value={store}>
      <MotionConfig reducedMotion="user">
        <div className={s.root} data-theme={st.theme} data-platform={st.platform}>
          <Switcher />
          <TopBar onPalette={() => setPalette(true)} />
          <main className={s.layout} data-history={st.historyOpen && !narrow} data-phase={st.phase}>
            {st.historyOpen && !narrow ? <HistoryPanel /> : <Brief />}
            <div className={s.mainCol}>
              <BriefCompact />
              {st.phase === "compose" && (st.historyOpen && !narrow ? <Brief /> : <GhostPlate />)}
              {st.phase === "questions" && <Questions />}
              {st.phase === "generating" && <Generating />}
              {st.phase === "result" && <ResultSheet />}
            </div>
          </main>
          <MobileBar />
          <MobileHistory isNarrow={narrow} />
          <Palette open={palette} onClose={closePalette} />
          <Toast />
          <div className={s.srOnly} aria-live="polite" aria-atomic="true">
            {announce}
          </div>
        </div>
      </MotionConfig>
    </CContext.Provider>
  );
}
