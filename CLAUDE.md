# PromptHub

AI prompt-writing workspace. Next.js App Router · TypeScript strict · Tailwind v4 · shadcn/ui · AI SDK v7.

Source of truth: `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/API_CONTRACTS.md`, `docs/ROADMAP.md`.

## Rules
- File ownership is exclusive (ARCHITECTURE §3). Agents write only their paths; shared files
  (`package.json`, configs, `src/lib/contracts/**`, docs) are lead-only.
- AI is **Gemini free tier only**, through the owner's server-only `GEMINI_API_KEY`. No OpenAI, Anthropic,
  OpenRouter, paid Gemini models, paid tools or fallback providers. Never link billing or enable paid
  usage without the owner's explicit approval. `GEMINI_MODEL` must be on the verified free-tier allowlist.
- Secrets are server-only (`GEMINI_API_KEY`, `SUPABASE_SECRET_KEY`). Never `NEXT_PUBLIC_`. Never log them.
- Every AI route requires a verified user (`getClaims()`) and the persistent quota guard. Basic Mode stays public.
- Never fake AI output. Basic Mode is the labeled template engine.
- Target platform (ChatGPT/Claude/Gemini, how the prompt is written) ≠ generation provider (always Gemini).
  Never claim ChatGPT or Claude APIs were called.
- No placeholder buttons; every control works as labeled.
- Verify SDK APIs against current official docs, not memory.

## Commands (from Phase 1)
`npm run dev` · `npm run typecheck` · `npm run lint` · `npm test` · `npm run test:e2e` · `npm run build`

Run unit tests with `npm test` (not bare `npx vitest`): `scripts/vitest.mjs` normalizes the Windows
drive-letter case first, so tests work from PowerShell, Git Bash and IDE terminals alike.
