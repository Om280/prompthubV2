# PromptHub

Turn a rough idea into a polished prompt for ChatGPT, Claude or Gemini. Answer a few optional
questions, pick a length, edit the result, copy it. Every prompt and version is saved in your browser.

**Current build: Basic Mode.** Prompts are assembled by a local template engine that follows each
platform's published prompting guidance (see `docs/PROMPTING_RESEARCH.md`). No AI model is called, and
the app says so everywhere ("Basic Mode, no AI"). AI generation through OpenAI, Anthropic or Gemini
arrives in Phase 3.

## Run locally

Requirements: Node.js 22 or newer (developed on 24), npm.

```bash
npm install
cp .env.example .env.local   # optional; all values are optional
npm run dev                  # http://localhost:3000
```

Production build:

```bash
npm run build
npm start
```

### Environment (`.env.local`, server-side only)

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` | Detected and reported ("keys found, AI not connected in this build yet"). Not used until Phase 3. Never prefix with `NEXT_PUBLIC_`. |
| `PROVIDER_ORDER` | Fallback order for Phase 3, e.g. `anthropic,openai,google`. |
| `RATE_LIMIT_PER_MINUTE` | Requests per minute per IP across the generation routes (default 30). |

## Tests

```bash
npm run typecheck
npm run lint
npm test                          # Vitest unit tests
npx playwright install chromium   # once
npm run test:e2e                  # Playwright: builds, starts on :3300, runs desktop + mobile journeys
```

Use `npm test` rather than bare `npx vitest`. On Windows, `scripts/vitest.mjs` normalises the
drive-letter case first, so tests behave the same from PowerShell, Git Bash and IDE terminals.

## Docs

`docs/PRD.md` (product), `docs/DESIGN.md` (the "Spruce and brass" design system),
`docs/ARCHITECTURE.md`, `docs/API_CONTRACTS.md`, `docs/PROMPTING_RESEARCH.md`, `docs/ROADMAP.md`.
