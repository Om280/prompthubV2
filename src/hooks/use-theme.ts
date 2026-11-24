"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { THEME_COLORS, THEME_STORAGE_KEY } from "@/lib/client/theme";

export type Theme = "dark" | "light";
/** "system" follows `prefers-color-scheme`; light or dark is an explicit choice from the palette. */
export type ThemePreference = Theme | "system";

const listeners = new Set<() => void>();
const DARK_QUERY = "(prefers-color-scheme: dark)";

function read(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function systemTheme(): Theme {
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function readPreference(): ThemePreference {
  try {
    const t = localStorage.getItem(THEME_STORAGE_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

/** Browser chrome follows the page: one value when chosen, each scheme's own when following the system. */
function syncThemeColor(explicit: Theme | null) {
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    const media = m.getAttribute("media") ?? "";
    const scheme: Theme = explicit ?? (media.includes("dark") ? "dark" : "light");
    m.setAttribute("content", THEME_COLORS[scheme]);
  });
}

/** Swaps the theme instantly, with transitions suspended for the frame. */
export function applyTheme(theme: Theme, persist = true) {
  const root = document.documentElement;
  root.setAttribute("data-theme-switching", "");
  root.dataset.theme = theme;
  if (persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Storage can be unavailable (private mode); the theme still applies for this tab.
    }
  }
  syncThemeColor(persist || readPreference() !== "system" ? theme : null);
  requestAnimationFrame(() => requestAnimationFrame(() => root.removeAttribute("data-theme-switching")));
  listeners.forEach((l) => l());
}

export function setThemePreference(pref: ThemePreference) {
  if (pref !== "system") return applyTheme(pref, true);
  try {
    localStorage.removeItem(THEME_STORAGE_KEY);
  } catch {
    // Nothing saved to clear.
  }
  applyTheme(systemTheme(), false);
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, read, () => "light" as Theme);
  const preference = useSyncExternalStore(subscribe, readPreference, () => "system" as ThemePreference);
  const toggle = useCallback(() => applyTheme(read() === "dark" ? "light" : "dark"), []);
  return { theme, preference, toggle, setPreference: setThemePreference };
}

/** While no theme is chosen, follow the system setting as it changes (e.g. at sunset). */
export function useSystemThemeSync() {
  useEffect(() => {
    const mql = window.matchMedia(DARK_QUERY);
    const onChange = () => {
      if (readPreference() === "system") applyTheme(systemTheme(), false);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
}
