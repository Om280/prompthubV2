"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Length, TargetPlatform } from "@/lib/contracts";
import { briefByKey, pickBrief, render, SAME_PROMPT_NOTE, TARGET_LABELS, type HistoryItem } from "./data";

import type { PreviewState } from "./states";
export { PREVIEW_LABELS, PREVIEW_STATES, type PreviewState } from "./states";

export type Phase = "compose" | "questions" | "generating" | "result";
export type Answer = { status: "answered"; value: string } | { status: "skipped" };
export type VersionName = "Generated" | "Regenerated" | "Edited" | "Restored";
export interface Version {
  name: VersionName;
  platform: TargetPlatform;
  length: Length;
  text: string;
}

export interface CState {
  preview: PreviewState;
  idea: string;
  briefKey: string;
  platform: TargetPlatform;
  length: Length;
  phase: Phase;
  answers: Record<string, Answer>;
  drafts: Record<string, string>;
  activeQ: number;
  versions: Version[];
  viewIdx: number;
  view: "blocks" | "plain";
  copied: boolean;
  copyRun: number;
  genRun: number;
  regenerating: boolean;
  holdGenerating: boolean;
  historyOpen: boolean;
  historyId: string | null;
  accountOpen: boolean;
  signedIn: boolean;
  theme: "light" | "dark";
  toast: { id: number; text: string } | null;
}

const LANDLORD = "Write a cold email to my landlord about a broken heater";

function v(name: VersionName, briefKey: string, platform: TargetPlatform, length: Length, text?: string): Version {
  return { name, platform, length, text: text ?? render(briefKey, platform, length) };
}

function editedLandlord(): string {
  return render("landlord", "chatgpt", "balanced").replace(
    "- Offer two times when someone can let the engineer in.",
    "- Offer two times when someone can let the engineer in.\n- Sign off with my flat number, 3B.",
  );
}

export function presetFor(preview: PreviewState, theme: CState["theme"] = "light"): CState {
  const base: CState = {
    preview,
    idea: "",
    briefKey: "landlord",
    platform: "chatgpt",
    length: "balanced",
    phase: "compose",
    answers: {},
    drafts: {},
    activeQ: 0,
    versions: [],
    viewIdx: 0,
    view: "blocks",
    copied: false,
    copyRun: 0,
    genRun: 0,
    regenerating: false,
    holdGenerating: false,
    historyOpen: false,
    historyId: null,
    accountOpen: false,
    signedIn: false,
    theme,
    toast: null,
  };
  const answered: Record<string, Answer> = {
    q1: { status: "answered", value: "Repair within 48 hours" },
    q2: { status: "skipped" },
  };
  const result: Partial<CState> = {
    idea: LANDLORD,
    phase: "result",
    answers: answered,
    versions: [v("Generated", "landlord", "chatgpt", "balanced"), v("Edited", "landlord", "chatgpt", "balanced", editedLandlord())],
    viewIdx: 1,
    historyId: "h1",
  };
  switch (preview) {
    case "empty":
      return base;
    case "questions":
      return { ...base, idea: LANDLORD, phase: "questions", answers: answered, activeQ: 2 };
    case "generating":
      return { ...base, idea: LANDLORD, phase: "generating", answers: answered, holdGenerating: true, genRun: 1 };
    case "result":
      return { ...base, ...result };
    case "copied":
      return { ...base, ...result, copied: true, copyRun: 1 };
    case "history":
      return {
        ...base,
        idea: briefByKey("sql").idea,
        briefKey: "sql",
        platform: "claude",
        phase: "result",
        answers: { q1: { status: "answered", value: "PostgreSQL" }, q2: { status: "answered", value: "Basics only" } },
        versions: [v("Generated", "sql", "claude", "balanced")],
        viewIdx: 0,
        historyOpen: true,
        historyId: "h2",
        signedIn: true,
      };
    case "signed-in":
      return { ...base, ...result, signedIn: true, accountOpen: true };
  }
}

export function useDesignState(initial: PreviewState) {
  const [st, setSt] = useState<CState>(() => presetFor(initial));
  const copyTimer = useRef<number | undefined>(undefined);
  const toastTimer = useRef<number | undefined>(undefined);
  const [announce, setAnnounce] = useState("");
  const stRef = useRef(st);
  useEffect(() => {
    stRef.current = st;
  }, [st]);

  const patch = useCallback((p: Partial<CState> | ((s: CState) => Partial<CState>)) => {
    setSt((s) => ({ ...s, ...(typeof p === "function" ? p(s) : p) }));
  }, []);

  const toast = useCallback(
    (text: string) => {
      window.clearTimeout(toastTimer.current);
      patch({ toast: { id: Date.now(), text } });
      setAnnounce(text);
      toastTimer.current = window.setTimeout(() => patch({ toast: null }), 3200);
    },
    [patch],
  );

  useEffect(
    () => () => {
      window.clearTimeout(copyTimer.current);
      window.clearTimeout(toastTimer.current);
    },
    [],
  );

  const actions = useMemo(() => {
    const setPreview = (p: PreviewState) => {
      window.clearTimeout(copyTimer.current);
      setSt((s) => presetFor(p, s.theme));
      setAnnounce("");
      const url = new URL(window.location.href);
      url.searchParams.set("state", p);
      window.history.replaceState(null, "", url);
    };

    const startGenerating = (regenerating = false) =>
      patch((s) => ({ phase: "generating", genRun: s.genRun + 1, holdGenerating: false, regenerating, copied: false }));

    const finishGenerating = () =>
      setSt((s) => {
        const name: VersionName = s.regenerating ? "Regenerated" : "Generated";
        const ver = v(name, s.briefKey, s.platform, s.length);
        const versions = s.regenerating ? [...s.versions, ver] : [ver];
        return { ...s, phase: "result", versions, viewIdx: versions.length - 1, regenerating: false };
      });

    const generate = () =>
      setSt((s) => {
        if (s.phase === "compose") {
          if (!s.idea.trim()) return s;
          const mb = pickBrief(s.idea);
          if (mb.questions.length > 0) {
            return { ...s, briefKey: mb.key, phase: "questions", answers: {}, drafts: {}, activeQ: 0, versions: [] };
          }
          return { ...s, briefKey: mb.key, phase: "generating", genRun: s.genRun + 1, holdGenerating: false, versions: [] };
        }
        if (s.phase === "questions") {
          return { ...s, phase: "generating", genRun: s.genRun + 1, holdGenerating: false, regenerating: false };
        }
        return s;
      });

    const nextOpen = (s: CState, answers: Record<string, Answer>, from: number) => {
      const qs = briefByKey(s.briefKey).questions;
      for (let i = 1; i <= qs.length; i++) {
        const j = (from + i) % qs.length;
        if (!answers[qs[j].id]) return j;
      }
      return from;
    };

    const answer = (qid: string, value: string, advance = true) =>
      setSt((s) => {
        const answers: Record<string, Answer> = { ...s.answers, [qid]: { status: "answered", value } };
        const idx = briefByKey(s.briefKey).questions.findIndex((q) => q.id === qid);
        return { ...s, answers, activeQ: advance ? nextOpen(s, answers, idx) : s.activeQ };
      });

    const skip = (qid: string) =>
      setSt((s) => {
        const answers: Record<string, Answer> = { ...s.answers, [qid]: { status: "skipped" } };
        const idx = briefByKey(s.briefKey).questions.findIndex((q) => q.id === qid);
        return { ...s, answers, activeQ: nextOpen(s, answers, idx) };
      });

    const reopen = (qid: string) =>
      setSt((s) => {
        const answers = { ...s.answers };
        const prev = answers[qid];
        delete answers[qid];
        const idx = briefByKey(s.briefKey).questions.findIndex((q) => q.id === qid);
        const drafts = prev?.status === "answered" ? { ...s.drafts, [qid]: prev.value } : s.drafts;
        return { ...s, answers, drafts, activeQ: idx };
      });

    const skipAll = () =>
      setSt((s) => {
        const answers = { ...s.answers };
        for (const q of briefByKey(s.briefKey).questions) if (!answers[q.id]) answers[q.id] = { status: "skipped" };
        return { ...s, answers, phase: "generating", genRun: s.genRun + 1, holdGenerating: false };
      });

    /** Platform and length re-render the latest version in place, unless it holds your edits. */
    const rerender = (key: "platform" | "length", value: TargetPlatform | Length) =>
      setSt((s) => {
        const next = { ...s, [key]: value } as CState;
        if (s.phase !== "result" || s.versions.length === 0) return next;
        const latest = s.versions[s.versions.length - 1];
        const ver = v("Generated", s.briefKey, next.platform, next.length);
        if (latest.name !== "Edited" && latest.name !== "Restored") {
          const versions = [...s.versions.slice(0, -1), { ...ver, name: latest.name }];
          return { ...next, versions, viewIdx: versions.length - 1, copied: false };
        }
        const versions = [...s.versions, { ...ver, name: "Regenerated" as const }];
        return { ...next, versions, viewIdx: versions.length - 1, copied: false };
      });

    const editText = (text: string) => {
      const s0 = stRef.current;
      const c0 = s0.versions[s0.viewIdx];
      const willSave = !!c0 && !(s0.viewIdx === s0.versions.length - 1 && c0.name === "Edited");
      setSt((s) => {
        const cur = s.versions[s.viewIdx];
        if (!cur) return s;
        const isLatest = s.viewIdx === s.versions.length - 1;
        if (isLatest && cur.name === "Edited") {
          const versions = [...s.versions];
          versions[s.viewIdx] = { ...cur, text };
          return { ...s, versions };
        }
        const versions = [...s.versions, { ...cur, name: "Edited" as const, text }];
        return { ...s, versions, viewIdx: versions.length - 1 };
      });
      if (willSave) toast(`Saved as version ${s0.versions.length + 1}`);
    };

    const copy = (text: string, mod: string) => {
      navigator.clipboard.writeText(text).then(
        () => {
          window.clearTimeout(copyTimer.current);
          setSt((s) => ({ ...s, copied: true, copyRun: s.copyRun + 1 }));
          setAnnounce("Prompt copied");
          copyTimer.current = window.setTimeout(
            () => setSt((s) => (s.preview === "copied" ? s : { ...s, copied: false })),
            2400,
          );
        },
        () => toast(`Couldn't copy. Select the text and press ${mod}+C.`),
      );
    };

    return {
      setPreview,
      patch,
      toast,
      generate,
      startGenerating,
      finishGenerating,
      answer,
      skip,
      reopen,
      skipAll,
      setPlatform: (p: TargetPlatform) => rerender("platform", p),
      setLength: (l: Length) => rerender("length", l),
      editText,
      copy,
      regenerate: () => {
        startGenerating(true);
      },
      afterRegenerate: () => toast(SAME_PROMPT_NOTE),
      setVersion: (i: number) => patch({ viewIdx: i, copied: false }),
      restore: () => {
        const n = stRef.current.versions.length + 1;
        setSt((s) => {
          const cur = s.versions[s.viewIdx];
          const versions = [...s.versions, { ...cur, name: "Restored" as const }];
          return { ...s, versions, viewIdx: versions.length - 1 };
        });
        toast(`Restored as version ${n}`);
      },
      newPrompt: () =>
        patch({ phase: "compose", idea: "", versions: [], answers: {}, drafts: {}, historyId: null, copied: false }),
      editIdea: () => patch({ phase: "compose", copied: false }),
      openHistory: (item: HistoryItem) =>
        setSt((s) => {
          const mb = briefByKey(item.briefKey);
          const answers: Record<string, Answer> = {};
          mb.questions.slice(0, 2).forEach((q) => (answers[q.id] = { status: "answered", value: q.suggestions[0] }));
          return {
            ...s,
            idea: mb.idea,
            briefKey: item.briefKey,
            platform: item.platform,
            length: "balanced",
            phase: "result",
            answers,
            versions: [v("Generated", item.briefKey, item.platform, "balanced")],
            viewIdx: 0,
            historyId: item.id,
            copied: false,
          };
        }),
      signIn: () => patch({ signedIn: true }),
      signOut: () => {
        patch({ signedIn: false, accountOpen: false });
        toast("Signed out. Your prompts stay on this device.");
      },
    };
  }, [patch, toast]);

  return { st, actions, announce, setAnnounce };
}

export type DesignStore = ReturnType<typeof useDesignState>;
export const CContext = createContext<DesignStore | null>(null);
export function useC(): DesignStore {
  const c = useContext(CContext);
  if (!c) throw new Error("useC outside Direction C");
  return c;
}

export function currentText(st: CState): string {
  return st.versions[st.viewIdx]?.text ?? "";
}

export function platformName(p: TargetPlatform): string {
  return TARGET_LABELS[p];
}
