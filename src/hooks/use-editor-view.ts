"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Blocks (labelled sections) or Plain text (one textarea). Remembered per browser. */
export type EditorView = "blocks" | "plain";

const KEY = "prompthub-editor-view";
const listeners = new Set<() => void>();
let memory: EditorView | null = null;

function read(): EditorView {
  if (memory) return memory;
  try {
    return localStorage.getItem(KEY) === "plain" ? "plain" : "blocks";
  } catch {
    return "blocks";
  }
}

export function setEditorView(view: EditorView) {
  memory = view;
  try {
    localStorage.setItem(KEY, view);
  } catch {
    // Private mode: the choice lasts for this tab.
  }
  listeners.forEach((l) => l());
}

export function useEditorView(): [EditorView, (v: EditorView) => void] {
  const view = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => "blocks" as EditorView,
  );
  return [view, useCallback((v: EditorView) => setEditorView(v), [])];
}
