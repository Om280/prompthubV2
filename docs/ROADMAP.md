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

## Phase 2.5: Final product decisions (2026-11-24)

| # | Task | Owner | Status |
| --- | --- | --- | --- |
| P.1 | Redesign: audit, three directions at `/design` (dev only); owner selected **Direction C "Interlock"**; A and B archived at tag `design-explorations-v1` | LEAD / FE | ✅ selected |
| P.2 | Integrate Design C into `/` and every screen (`feature/design-c`, `feature/ai-ui`) | FE | ✅ merged |
| P.3 | Supabase Google sign-in (PKCE, `proxy.ts`, `getClaims()`), account menu, `/account`, `/privacy` | AI (auth) | ✅ merged (5184ec5) |
| P.4 | Gemini free-tier-only architecture: allowlist, persistent atomic quota in Supabase (`supabase/migrations/0001_ai_quota.sql`), emergency switch, disclosure | AI (auth) | ✅ merged |
| P.5 | Re-verify vendor prompting guidance and Gemini free-tier eligibility | LEAD | ✅ 2026-11-24 |

## Phase 3: Gemini free-tier integration

Gates (all met on 2026-11-24): design selected, auth merged and reviewed, Gemini-only architecture
documented, free-tier model eligibility verified from the official pricing page. Calls with the
owner's real key happen only when the owner has configured it.

| # | Task | Owner | Status |
| --- | --- | --- | --- |
| 3.1 | `server-only` guard on every module that reads secrets or calls Gemini | AI | ✅ |
| 3.2 | Gemini engine via `@ai-sdk/google` `createGoogle({apiKey})`, `maxRetries: 0`, no sampling params, thinking level configurable, no tools or grounding | AI | ✅ |
| 3.3 | Meta-prompts: clarify (structured), generate (brief → target profile), transforms (improve, shorten, expand, tone, regenerate) | AI | ✅ |
| 3.4 | Quota lease wiring: abort on disconnect, timeout, token reconcile, usage record; `quota_exhausted` with `resetsAt`, no retry, no fallback | AI | ✅ |
| 3.5 | Client: `requestId`/`workflowId`, Stop, new error states, draft kept | AI / FE | ✅ |
| 3.6 | Tone menu, AI states in the engine popover, first-use disclosure, usage remaining on `/account` | FE | ✅ |
| 3.7 | Tests with AI SDK mock models: per-target generation, transforms preserve requirements, no retry on 429, secret-leak scan | AI | ✅ |
| 3.8 | Opt-in `npm run eval:gemini` (real free-tier calls, request budget, never in CI) | AI / LEAD | ✅ |
| 3.9 | Manual smoke with the owner's key and Google OAuth credentials | LEAD + owner | partly: OAuth redirect chain verified to Google sign-in; Gemini key and model verified (models.get 200); generation calls blocked by Google 503 "high demand" on 2026-11-24 |


**Phase 3 status (2026-11-24): ✅ built, merged and tested with fakes.** Unit 844, e2e 43 (desktop and mobile), build clean. Live checks: RLS isolation on the real database, OAuth PKCE redirect chain, API auth (401 for signed-out and forged sessions), no secrets in build output.

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
4. Gemini quota exhausted (mocked 429): clear temporary message with reset time, draft kept, Basic Mode works, no fallback.
5. Signed out: AI actions ask for sign-in; Basic Mode works end to end.
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
- Supabase project: run the quota migration, schedule `ai_prune()`; Google OAuth redirect URLs for the production domain

## Parallelism and write-conflict rules

- Contracts (`src/lib/contracts/**`) are written by LEAD before any parallel work and are then frozen.
- FE and AI run in parallel only on disjoint paths (ARCHITECTURE §3). Shared files (`package.json`,
  configs) are edited only by LEAD; agents ask for dependencies in their report.
- Each agent finishes with a report listing files changed, dependencies needed and contract questions.
- VR and QA never edit source. They write only `docs/reviews/<phase>-<role>.md`.
