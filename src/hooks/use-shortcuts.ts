"use client";

import { useEffect, useRef } from "react";
import { isMacPlatform } from "@/lib/utils";

/**
 * One window-level keyboard registry (ARCHITECTURE §4). Uses ⌘ on macOS and Ctrl elsewhere.
 * While a modal is open only bindings marked `inModal` run (Escape is left to the modal itself).
 * Bindings without `inEditable` are ignored while typing in a field.
 */
export interface Shortcut {
  id: string;
  match: (e: KeyboardEvent, mod: boolean) => boolean;
  run: (e: KeyboardEvent) => boolean | void;
  inEditable?: boolean;
  inModal?: boolean;
}

export function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT") {
    const type = (el as HTMLInputElement).type;
    return !["button", "checkbox", "radio", "submit", "reset", "range", "color"].includes(type);
  }
  return false;
}

/** Key matchers shared by the app and the shortcut sheet. */
export const keys = {
  generate: (e: KeyboardEvent, mod: boolean) => mod && !e.shiftKey && !e.altKey && e.key === "Enter",
  copy: (e: KeyboardEvent, mod: boolean) => mod && e.shiftKey && !e.altKey && e.code === "KeyC",
  newPrompt: (e: KeyboardEvent, mod: boolean) =>
    e.code === "KeyN" && !e.shiftKey && ((mod && !e.altKey) || (e.altKey && !e.ctrlKey && !e.metaKey)),
  toggleHistory: (e: KeyboardEvent, mod: boolean) => mod && !e.altKey && (e.code === "Backslash" || e.key === "\\"),
  help: (e: KeyboardEvent) => e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey,
  escape: (e: KeyboardEvent) => e.key === "Escape",
  skipQuestion: (e: KeyboardEvent) => e.altKey && !e.ctrlKey && !e.metaKey && e.code === "KeyS",
  prevVersion: (e: KeyboardEvent) => e.altKey && !e.ctrlKey && !e.metaKey && e.code === "BracketLeft",
  nextVersion: (e: KeyboardEvent) => e.altKey && !e.ctrlKey && !e.metaKey && e.code === "BracketRight",
  search: (e: KeyboardEvent) => e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey,
  palette: (e: KeyboardEvent, mod: boolean) => mod && !e.shiftKey && !e.altKey && e.code === "KeyK",
};

export function useShortcuts(bindings: Shortcut[], opts: { modalOpen: boolean }) {
  const ref = useRef({ bindings, opts });
  useEffect(() => {
    ref.current = { bindings, opts };
  });

  useEffect(() => {
    const mac = isMacPlatform();
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const mod = mac ? e.metaKey : e.ctrlKey;
      const editable = isEditable(e.target);
      const { bindings: list, opts: o } = ref.current;
      const inLayer =
        e.target instanceof Element && !!e.target.closest('[role="dialog"], [role="menu"], [role="alertdialog"]');
      const modal = o.modalOpen || inLayer;
      for (const b of list) {
        if (modal && !b.inModal) continue;
        if (editable && !b.inEditable) continue;
        if (!b.match(e, mod)) continue;
        const handled = b.run(e);
        if (handled !== false) {
          e.preventDefault();
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
