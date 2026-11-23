/** Shared by the root layout (server) and `use-theme` (client). No "use client" here on purpose. */
export const THEME_STORAGE_KEY = "prompthub-theme";

/** Inline script for <head>: applies the saved theme before first paint. */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
