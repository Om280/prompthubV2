"use client";

import { createContext, useContext, type RefObject } from "react";
import type { ProvidersResponse, TargetPlatform } from "@/lib/contracts";
import type { PromptHubClient } from "@/lib/client/types";
import type { HistoryStore } from "@/lib/history/types";
import type { SessionActions, SessionState } from "@/hooks/use-session";
import type { KeyLabels } from "@/hooks/use-media";
import type { EditorView } from "@/hooks/use-editor-view";

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
  providers: ProvidersResponse | null;
  /** GET /api/providers failed; the indicator offers "Check again". */
  providersFailed: boolean;
  reloadProviders: () => void;
  /** True when the provider list says no AI is configured. */
  basic: boolean;
  /** True only when the dev `?preview=` mock client is active ("Preview data"). */
  preview: boolean;
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
