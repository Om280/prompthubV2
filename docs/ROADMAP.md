# PromptHub — Roadmap and task breakdown

Each phase ends with a lead review gate. The next phase starts only once the gate passes.
Owners: **LEAD** (main session), **FE** `frontend-engineer`, **AI** `ai-integration-engineer`,
**VR** `visual-reviewer` (read-only), **QA** `qa-engineer` (read-only).

## Phase 0: Foundations ✅ (this change)

- [x] Inspect repo (empty) and installed skills
- [x] PRD, Architecture, API contracts, Roadmap
- [x] Agent definitions in `.claude/agents/`
- [x] CLAUDE.md with ownership rules

Gate: the user reviews the architecture and task breakdown. ✅ Reviewed, with two revisions requested
(target-specific prompting research, new UI direction).

## Phase 0.5: Prompting research and target strategies ✅

| # | Task | Owner | Status |
| --- | --- | --- | --- |
| R.1 | Read current OpenAI, Anthropic and Google prompting docs; write `docs/PROMPTING_RESEARCH.md` with sources | LEAD | ✅ |
| R.2 | Target-neutral `PromptBrief` and three profiles (`src/lib/prompting/profiles/`) with `render()` and `guidance` | LEAD | ✅ |
| R.3 | Deterministic rubric `evaluate.ts` (intent, clarity, completeness, actionability, context, formatting, unnecessary instructions, length) | LEAD | ✅ |
| R.4 | Six identical tasks (coding, research, creative, analysis, planning, productivity) × 3 targets × 3 lengths; differentiation and documented-behaviour tests | LEAD | ✅ 80/80 |
| R.5 | Re-check vendor docs at each phase gate; update research doc if guidance changes | LEAD | recurring |
| R.6 | API export format (developer/system payloads) | — | future, not scheduled |

## Phase 0.6: New design direction ✅

| # | Task | Owner | Status |
| --- | --- | --- | --- |
| D.1 | Fresh direction with the frontend-design skill → `docs/DESIGN.md` ("Spruce and brass") | UI specialist | ✅ |
| D.2 | Lead review; approve the additions (Stop, Alt+S, Alt+[ ], `/`, Regenerate-for) | LEAD | ✅ |

## Phase 1: Visual interface with realistic mock data

| # | Task | Owner | Depends |
| --- | --- | --- | --- |
| 1.1 | Scaffold Next 16 + TS + Tailwind 4; ESLint, Vitest configs; `npm run` scripts (shadcn-style components hand-written on `radix-ui`, no CLI) | LEAD ✅ | — |
| 1.2 | `src/lib/contracts/schemas.ts` + types from API_CONTRACTS | LEAD ✅ | 1.1 |
| 1.3 | DESIGN.md tokens in `globals.css` (dark + light), Mona Sans with `wdth` axis via `next/font` | FE | 1.1 |
| 1.4 | Workspace shell: rail + centered column, responsive rail sheet | FE | 1.3 |
| 1.5 | Composer, target/length selectors, questions panel, editor, action bar, engine badge, shortcut hints | FE | 1.4 |
| 1.6 | History rail UI (search, filters, date groups, rename/delete affordances, versions popover) on `lib/mock/fixtures.ts` | FE | 1.4 |
| 1.7 | Empty, loading (streaming), error and Basic Mode states, all reachable from fixtures | FE | 1.5 |
| 1.8 | Visual review at 1440 / 1024 / 768 / 390, dark + light, reduced motion | VR | 1.7 |

In this phase, actions run against a mock adapter whose output is rendered through the real target
profiles, and the header labels it "Preview data". A dev-only `?preview=<state>` parameter renders each
state directly for review and screenshots. Nothing pretends to be AI.

## Phase 2: Clarification and generation (Basic Mode end-to-end + AI contract)

| # | Task | Owner | Parallel with |
| --- | --- | --- | --- |
| 2.1 | `lib/server/env.ts`, `/api/providers` | AI | 2.4 |
| 2.2 | Basic Mode: classify, questions, templates per target × length | AI | 2.4 |
| 2.3 | `/api/clarify`, `/api/generate` with NDJSON writer, wired to the engine (Basic only for now) | AI | 2.4 |
| 2.4 | `lib/client/api.ts`, `ndjson.ts`, `use-session` state machine; replace mocks | FE | 2.1–2.3 |
| 2.5 | Unit tests: Basic Mode, NDJSON parser, reducer | AI / FE | — |

**Phase 2 status (2026-11-23): ✅ complete.** Basic Mode works end to end over the real routes.
Several Phase 4 items were pulled forward and are done: 4.1–4.4 (IndexedDB history, autosave, edited
versions, rename, delete with undo, Recently deleted, restore, purge, cross-tab sync, shortcuts). The
remaining Phase 4 work is 4.5 (a mobile pass on real devices) and the migration test.
- Unit tests: 354 passing.
- End-to-end: 22 passing (desktop and mobile), with two consecutive green runs.
- Lead tasks completed: Windows path-case fix for Vitest; source grounding made conditional on the
  task; a configurable rate limit for e2e runs.

## Phase 3: Provider integrations and fallback

Before Phase 3 reads key values: add the `server-only` guard (ARCHITECTURE §7).

| # | Task | Owner |
| --- | --- | --- |
| 3.1 | Re-check AI SDK v7 and provider docs; pin model defaults | AI |
| 3.2 | Adapters: OpenAI, Anthropic, Google; registry; `PROVIDER_ORDER` | AI |
| 3.3 | Meta-prompts: clarify (structured, Gemini gives higher priority to an "example?" question), generate and transform. The generate step asks the model for a `PromptBrief`, then writes the prompt per `PROFILES[target].guidance`; `evaluatePrompt()` checks it, with one repair retry | AI |
| 3.4 | Fallback + error mapping + repair retry + timeouts + rate limiter | AI |
| 3.5 | `/api/transform`; Regenerate path | AI |
| 3.6 | Engine badge with fallback notice; transform actions wired; tone menu | FE |
| 3.7 | Tests with mocked `LanguageModel` (AI SDK test models): fallback order, no fallback after first delta, error codes, secret-leak scan | AI |
| 3.8 | Manual smoke with real keys (whichever the user configures) | LEAD |
| 3.9 | Comparative evaluation: the 6 fixture tasks, PromptHub prompt vs raw idea on each target's own model; blind pairwise judge from a different vendor, randomized order; report win, tie and loss with n. No superiority claims before this | AI + LEAD |
| 3.10 | Basic Mode brief heuristic (idea → `PromptBrief`) feeding the same profiles | AI |

## Phase 4: History, versions, shortcuts, responsiveness

| # | Task | Owner |
| --- | --- | --- |
| 4.1 | `lib/history` db/repo/search, purge, BroadcastChannel, in-memory fallback | FE |
| 4.2 | Autosave on done; manual edit debounce → `edited` version | FE |
| 4.3 | Rename, delete + Undo toast, Recently deleted, restore prompt, restore version | FE |
| 4.4 | `use-shortcuts`, shortcut sheet, platform-aware hints, Ctrl+N fallback detection | FE |
| 4.5 | Mobile: rail sheet gestures, sticky action bar safe-area, 360 px pass | FE |
| 4.6 | Unit tests with `fake-indexeddb`: repo, migrations, search | FE |

## Phase 5: Automated and visual QA, fixes

Critical journeys (Playwright, Chromium, desktop + 390 px):
1. Idea → questions → answer one, skip one → generate → copy (clipboard asserted).
2. Skip all → generate → Improve → version list shows 2 → restore v1 → 3 versions.
3. Basic Mode (no keys): badge visible, AI actions disabled with reason, prompt generated from template.
4. Provider failure: mocked first provider 429 → result from second, fallback notice shown.
5. All providers fail → actionable error, previous text preserved.
6. History persists across reload; rename, delete, undo, restore from Recently deleted; search + filter.
7. Shortcuts: Ctrl/Cmd+Enter, Ctrl/Cmd+Shift+C, new prompt.
8. Accessibility: axe scan with no serious violations; keyboard-only journey 1.

| # | Task | Owner |
| --- | --- | --- |
| 5.1 | Write e2e specs (provider responses mocked at the route layer with a test-only env flag) | LEAD |
| 5.2 | Exploratory QA with `playwright-cli`, `break-ui` worst-case data; report | QA |
| 5.3 | Visual review pass 2 | VR |
| 5.4 | Fix findings, by owner | FE / AI |

## Phase 6: Deployment preparation

- `.env.example` final, README setup (`.env.local`), Vercel env var guide
- Security headers + CSP, `server-only` audit, bundle check for leaked env
- `npm run build` clean, lint/typecheck/test in CI (GitHub Actions)
- Optional: Upstash rate-limit adapter

## Parallelism and write-conflict rules

- Contracts (`src/lib/contracts/**`) are written by LEAD before any parallel work and are then frozen.
- FE and AI run in parallel only on disjoint paths (ARCHITECTURE §3). Shared files (`package.json`,
  configs) are edited only by LEAD; agents ask for dependencies in their report.
- Each agent finishes with a report listing files changed, dependencies needed and contract questions.
- VR and QA never edit source. They write only `docs/reviews/<phase>-<role>.md`.
