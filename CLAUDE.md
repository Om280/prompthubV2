# PromptHub

AI prompt-writing workspace. Next.js App Router · TypeScript strict · Tailwind v4 · shadcn/ui · AI SDK v7.

Source of truth: `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/API_CONTRACTS.md`, `docs/ROADMAP.md`.

## Rules
- File ownership is exclusive (ARCHITECTURE §3). Agents write only their paths; shared files
  (`package.json`, configs, `src/lib/contracts/**`, docs) are lead-only.
- API keys are server-only (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`). Never `NEXT_PUBLIC_`.
- Never fake AI output. Basic Mode is the labeled template engine, used only when no provider is configured.
- Target platform (ChatGPT/Claude/Gemini, how the prompt is written) ≠ generation provider (who writes it).
- No placeholder buttons; every control works as labeled.
- Verify SDK APIs against current official docs, not memory.

## Commands (from Phase 1)
`npm run dev` · `npm run typecheck` · `npm run lint` · `npm test` · `npm run test:e2e` · `npm run build`

Run unit tests with `npm test` (not bare `npx vitest`): `scripts/vitest.mjs` normalizes the Windows
drive-letter case first, so tests work from PowerShell, Git Bash and IDE terminals alike.
