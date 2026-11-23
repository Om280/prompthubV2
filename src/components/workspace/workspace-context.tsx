"use client";

import { createContext, useContext, type RefObject } from "react";
import type { AiStatusResponse } from "@/lib/contracts";
import type { PromptHubClient } from "@/lib/client/types";
import type { HistoryStore } from "@/lib/history/types";
import type { SessionActions, SessionState } from "@/hooks/use-session";
import type { KeyLabels } from "@/hooks/use-media";

export type CopyVia = "pointer" | "keyboard";

export interface CopyState {
  copied: boolean;
  /** Whether the label swap should crossfade (pointer) or swap instantly (keyboard). */
  animate: boolean;
}

export interface WorkspaceValue {
  client: PromptHubClient;
  history: HistoryStore;
  /** GET /api/providers: AI availability and auth status, null until loaded. */
  aiStatus: AiStatusResponse | null;
  /** GET /api/providers failed; the indicator offers "Check again". */
  aiStatusFailed: boolean;
  reloadAiStatus: () => void;
  /** True when the AI status says the app runs in Basic Mode. */
  basic: boolean;
  /** True only when the dev `?preview=` mock client is active ("Preview data"). */
  preview: boolean;
  state: SessionState;
  actions: SessionActions;
  keys: KeyLabels;
  railOpen: boolean;
  setRailOpen: (open: boolean, via: "pointer" | "keyboard") => void;
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;
  copy: CopyState;
  copyPrompt: (via: CopyVia) => void;
  announce: (message: string) => void;
  newPrompt: () => void;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  editorRef: RefObject<HTMLTextAreaElement | null>;
  washRef: RefObject<HTMLDivElement | null>;
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
