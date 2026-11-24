"use client";

import { createContext, useContext, type RefObject } from "react";
import type { AiStatusResponse, TargetPlatform } from "@/lib/contracts";
import type { PromptHubClient } from "@/lib/client/types";
import type { HistoryStore } from "@/lib/history/types";
import type { SessionActions, SessionState } from "@/hooks/use-session";
import type { KeyLabels } from "@/hooks/use-media";
import type { EditorView } from "@/hooks/use-editor-view";
import type { AiState, EnginePreference } from "./ai";

export type CopyVia = "pointer" | "keyboard";

export interface CopyState {
  copied: boolean;
  /** Whether the label swap should crossfade (pointer) or swap instantly (keyboard). */
  animate: boolean;
  /** What went to the clipboard, for "Copied 170 words for ChatGPT". */
  words: number;
}

/** Where the single engine indicator sits (DIRECTION-C §13): one instance, never two. */
export type EnginePlacement = "topbar" | "composer" | "sheet" | "brief";

export interface WorkspaceValue {
  client: PromptHubClient;
  history: HistoryStore;
  /** GET /api/providers: AI availability and auth status, null until loaded. */
  aiStatus: AiStatusResponse | null;
  /** GET /api/providers failed; the indicator offers "Check again". */
  aiStatusFailed: boolean;
  reloadAiStatus: () => void;
  /** True when AI-only actions are off: AI isn't on for this visitor (see `aiState`). */
  basic: boolean;
  /** Whether AI is on, chosen off, or why it can't run. */
  aiState: AiState;
  /** "auto" uses Gemini when AI is ready; "basic" keeps everything in Basic Mode (per browser). */
  enginePref: EnginePreference;
  setEnginePref: (p: EnginePreference) => void;
  state: SessionState;
  actions: SessionActions;
  keys: KeyLabels;
  /** ≥1200px: the brief keeps its own column. */
  wide: boolean;
  /** <640px: phone layout with the floating action bar. */
  mobile: boolean;
  enginePlacement: EnginePlacement;
  /** The platform the shown prompt was written for (tints the blocks). */
  writtenFor: TargetPlatform;
  railOpen: boolean;
  setRailOpen: (open: boolean, via: "pointer" | "keyboard") => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;
  view: EditorView;
  setView: (view: EditorView) => void;
  /** The open question in the stepper (null: the first unanswered one). */
  activeQuestion: string | null;
  setActiveQuestion: (id: string | null) => void;
  copy: CopyState;
  copyPrompt: (via: CopyVia) => void;
  announce: (message: string) => void;
  newPrompt: () => void;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  editorRef: RefObject<HTMLTextAreaElement | null>;
  /** The prompt sheet; the copy charge runs over its pieces. */
  sheetRef: RefObject<HTMLElement | null>;
  searchRef: RefObject<HTMLInputElement | null>;
  generateRef: RefObject<HTMLButtonElement | null>;
  /** The text Copy would write right now. */
  copyText: string;
}

export const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function useWorkspace(): WorkspaceValue {
  const v = useContext(WorkspaceContext);
  if (!v) throw new Error("useWorkspace must be used inside <Workspace>");
  return v;
}
