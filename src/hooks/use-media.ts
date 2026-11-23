"use client";

import { useSyncExternalStore } from "react";
import { isMacPlatform } from "@/lib/utils";

/** Subscribes to a media query. Returns `fallback` during SSR and hydration. */
export function useMediaQuery(query: string, fallback = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => fallback,
  );
}

export const useIsDesktopRail = () => useMediaQuery("(min-width: 900px)", true);
export const useIsMobile = () => useMediaQuery("(max-width: 639.98px)", false);
export const useCoarsePointer = () => useMediaQuery("(pointer: coarse)", false);
export const useReducedMotion = () => useMediaQuery("(prefers-reduced-motion: reduce)", false);

const noop = () => () => {};

export interface KeyLabels {
  isMac: boolean;
  mod: string;
  shift: string;
  alt: string;
  enter: string;
  /** Which New prompt shortcut actually works here (DESIGN §6.10). */
  newPrompt: string[];
}

/**
 * Key glyphs for hints. Browsers reserve Ctrl/⌘ N for a new window, so the hint shows the Alt N
 * fallback unless the app runs as an installed window, where Ctrl/⌘ N reaches the page.
 */
export function useKeyLabels(): KeyLabels {
  const isMac = useSyncExternalStore(noop, isMacPlatform, () => false);
  const standalone = useMediaQuery("(display-mode: standalone)", false);
  const mod = isMac ? "⌘" : "Ctrl";
  const alt = isMac ? "⌥" : "Alt";
  return {
    isMac,
    mod,
    shift: "⇧",
    alt,
    enter: "↵",
    newPrompt: standalone ? [mod, "N"] : [alt, "N"],
  };
}
