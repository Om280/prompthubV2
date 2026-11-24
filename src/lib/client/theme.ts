/** Shared by the root layout (server) and `use-theme` (client). No "use client" here on purpose. */
export const THEME_STORAGE_KEY = "prompthub-theme";

/** Canvas colours, used for the browser chrome (`theme-color`). */
export const THEME_COLORS = { light: "#DCDFE4", dark: "#1A1D23" } as const;

/**
 * Inline script for <head>: applies the saved theme, or the system preference when none is saved,
 * before first paint.
 */
export const THEME_INIT_SCRIPT = `(function(){var t=null;try{t=localStorage.getItem("${THEME_STORAGE_KEY}")}catch(e){}if(t!=="light"&&t!=="dark")t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t})()`;
