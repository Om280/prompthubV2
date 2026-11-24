import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Windows: a shell can report the project path with a lowercase drive letter (Git Bash gives
 * "d:\…", PowerShell "D:\…"). Vite then resolves "vitest" through two differently-cased paths and
 * loads two copies of it ("Cannot read properties of undefined (reading 'config')"). Pinning the
 * root to the canonical on-disk path makes every resolution use the same casing.
 */
const root = realpathSync.native(fileURLToPath(new URL(".", import.meta.url)));

export default defineConfig({
  root,
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    // `server-only` throws outside a React Server environment; tests import server modules directly.
    alias: { "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)) },
  },
  test: {
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
