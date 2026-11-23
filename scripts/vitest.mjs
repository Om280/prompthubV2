/**
 * Launch Vitest from the canonical on-disk path.
 *
 * On Windows, shells disagree on drive-letter case (Git Bash and some IDE terminals report "d:\…",
 * PowerShell "D:\…"). When Vitest itself is loaded through one casing and the test files resolve
 * "vitest" through the other, Node treats them as two modules and every suite fails with
 * "Cannot read properties of undefined (reading 'config')". Switching to the real path before
 * Vitest loads makes both resolve identically. On macOS/Linux this is a no-op.
 */
import { realpathSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = realpathSync.native(process.cwd());
process.chdir(root);
await import(pathToFileURL(path.join(root, "node_modules", "vitest", "vitest.mjs")).href);
