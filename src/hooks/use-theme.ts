"use client";

import { useCallback, useSyncExternalStore } from "react";

export type Theme = "dark" | "light";

import { THEME_STORAGE_KEY } from "@/lib/client/theme";
const THEME_COLORS: Record<Theme, string> = { dark: "#121816", light: "#F2F4F1" };

const listeners = new Set<() => void>();

function read(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/** Swaps the theme instantly, with transitions suspended for the frame (DESIGN §7 #20). */
export function applyTheme(theme: Theme, persist = true) {
  const root = document.documentElement;
  root.setAttribute("data-theme-switching", "");
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme]);
  if (persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Storage can be unavailable (private mode); the theme still applies for this tab.
    }
  }
  requestAnimationFrame(() => requestAnimationFrame(() => root.removeAttribute("data-theme-switching")));
  listeners.forEach((l) => l());
}

export function useTheme() {
  const theme = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => "dark" as Theme,
  );
  const toggle = useCallback(() => applyTheme(read() === "dark" ? "light" : "dark"), []);
  return { theme, toggle };
}

