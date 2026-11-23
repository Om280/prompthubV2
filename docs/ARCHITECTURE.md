# PromptHub — Architecture

Status: Phase 0 draft · Last updated: 2026-11-23

## 1. Stack (versions checked on npm 2026-11-23)

| Concern | Choice | Version |
| --- | --- | --- |
| Framework | Next.js App Router, React | next 16.4.x, react 19.3.x |
| Language | TypeScript, strict | 7.0.x |
| Styling | Tailwind CSS v4 (CSS-first `@theme`) | 4.3.x |
| Components | shadcn/ui (copied into `src/components/ui`), Radix primitives | shadcn CLI 4.23.x |
| Icons | lucide-react | 1.78.x |
| Motion | motion (`motion/react`) | 14.14.x |
| AI | Vercel AI SDK core `ai` + `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google` | ai 7.0.x, providers 4.0.x |
| Validation | Zod 4 | 4.6.x |
| Storage | IndexedDB via `idb` | 8.0.x |
| Tests | Vitest + Testing Library + `fake-indexeddb`; Playwright | vitest 5.1.x, @playwright/test 1.65.x |
| Runtime | Node 24 (local), Node runtime for route handlers | |

AI SDK v7 notes, from the current docs: structured output uses `generateText`/`streamText` with
`output: Output.object({ schema })`. Validation failure throws `NoObjectGeneratedError`, and a missing
output throws `NoOutputGeneratedError`; check both with `.isInstance()`. In a stream, errors arrive
*inside* the stream and are handled with `onError`. The Google provider defaults to
`GOOGLE_GENERATIVE_AI_API_KEY`, so we construct it explicitly with `createGoogle({ apiKey:
process.env.GEMINI_API_KEY })`. Re-verify exact factory names in Phase 3 before coding.

## 2. System overview

```
Browser (client components)                           Server (Next route handlers, Node runtime)
┌───────────────────────────────────────┐           ┌──────────────────────────────────────────┐
│ Workspace UI                          │  fetch    │ /api/providers   GET  status (no secrets) │
│  Composer → Questions → Editor        │──────────▶│ /api/clarify     POST JSON                │
│  Action bar · History rail            │           │ /api/generate    POST NDJSON stream       │
│                                       │◀──────────│ /api/transform   POST NDJSON stream       │
│ session store (useReducer + context)  │  NDJSON   │        │                                  │
│ history repo (idb) ── IndexedDB       │           │        ▼                                  │
└───────────────────────────────────────┘           │ lib/ai/engine.ts  ← single entry point    │
                                                    │   ├─ registry.ts  (detect configured)     │
                                                    │   ├─ fallback.ts  (ordered retry)         │
                                                    │   ├─ prompts/*    (meta-prompts per task) │
                                                    │   ├─ basic/*      (template Basic Mode)   │
                                                    │   └─ providers/{openai,anthropic,google}  │
                                                    └──────────────────────────────────────────┘
```

All AI calls go through `lib/ai/engine.ts`. Route handlers only parse, rate-limit and stream. Contracts
are in `docs/API_CONTRACTS.md`, and the shared Zod schemas live in `src/lib/contracts/`.

## 3. Directory layout and ownership

Ownership is exclusive: only the owner writes a path. Others propose changes through the lead.

```
src/
  app/
    layout.tsx, page.tsx, globals.css        FE   (globals.css holds design tokens)
    api/**/route.ts                          AI
  components/
    ui/                                      FE   (shadcn generated)
    workspace/  composer, questions, editor,
                action-bar, engine-badge     FE
    history/    rail, list, item, versions   FE
    shortcuts/  hint, sheet                  FE
  hooks/        use-shortcuts, use-session,
                use-history, use-stream      FE
  lib/
    contracts/  schemas.ts, types.ts         LEAD (frozen after Phase 0; changes need lead sign-off)
    prompting/  brief, profiles/, evaluate,
                shared                       LEAD (target profiles; pure TS, used by Basic Mode and
                                             by AI meta-prompts via each profile's `guidance`)
    ai/         engine, registry, fallback,
                errors, prompts/, basic/,
                providers/                   AI
    server/     env.ts, rate-limit.ts        AI
    client/     api.ts, ndjson.ts            FE   (typed fetch + NDJSON reader of the contracts)
    history/    db.ts, repo.ts, search.ts    FE
    mock/       fixtures.ts                  FE   (Phase 1 only; removed or test-only after Phase 2)
tests/
  unit/ai/**                                 AI
  unit/{history,client,components}/**        FE
  e2e/**                                     LEAD (QA proposes cases; lead writes them)
docs/**, .env.example, CLAUDE.md             LEAD
.claude/agents/**                            LEAD
```

Roles: **LEAD** is the orchestrator (main session). **FE** is `frontend-engineer`. **AI** is
`ai-integration-engineer`. `visual-reviewer` and `qa-engineer` are read-only: they write reports only
under `docs/reviews/`.

## 4. Client architecture

- **Single route** `/`. A server component shell renders the client `Workspace`.
- **Session state** (`use-session`) is a reducer with an explicit state machine:

  ```
  idle ──generate──▶ clarifying ──questions──▶ answering ──submit/skip──▶ generating ──done──▶ ready
    ▲                     │ (0 questions)                                       │error         │action
    │                     └──────────────────────────────────────────▶ generating          ▼
    └────────────── new prompt ◀──────────────────────────────── error ◀──── transforming ◀─┘
  ```

  Only one request can be in flight. Starting a new request aborts the previous `AbortController`.
- **Streaming:** `lib/client/ndjson.ts` reads the response body line by line into typed events
  (`meta | delta | done | error`). The editor shows deltas live; the version is committed on `done`
  only. A stream that ends with an error keeps the previous text and shows the error inline.
- **Editor:** a styled `<textarea>` with auto-height, not a rich-text editor. Prompts are plain text or
  Markdown that gets pasted elsewhere, so what you see is exactly what you copy. A tint layer with
  identical metrics sits beneath the transparent textarea text and colors the prompt's structure: tags,
  Markdown markers and [slots] (DESIGN §6.5).
- **History** (`lib/history`): `idb` database `prompthub`, version 1.
  - store `prompts` (key `id`), indexes `by-updated`, `by-deleted`.
  - store `versions` (key `id`), index `by-prompt` → `[promptId, createdAt]`.
  - `repo.ts` exposes typed operations (`createPrompt`, `addVersion`, `rename`, `softDelete`,
    `restore`, `purgeExpired`, `list({query, target, deleted})`, `getVersions`).
  - Search is in-memory over the list, which is fine at personal scale (hundreds to low thousands of
    items).
  - A `BroadcastChannel('prompthub')` notifies other tabs to refresh.
  - If IndexedDB is unavailable (some private modes), the app runs with in-memory history and shows a
    one-line notice.
- **Shortcuts:** one `use-shortcuts` hook on `window` with a registry. It ignores events while a modal is
  open, except Escape. It uses `event.metaKey` on macOS and `ctrlKey` elsewhere. Ctrl/Cmd+Enter works
  inside text fields; `?` does not.

## 5. Server / AI architecture

> **Superseded in part (feature/auth):** the multi-provider registry, owner-held provider keys,
> `PROVIDER_ORDER` and `*_MODEL` described below were removed; see §7a. The lead is revising the AI plan.

- `lib/server/env.ts` reads and validates server env with Zod. It imports `server-only`, so importing it
  from a client file fails the build.
- `registry.ts` builds `ProviderAdapter` objects only for providers whose key is present:

  ```ts
  interface ProviderAdapter {
    id: 'openai' | 'anthropic' | 'google';
    label: string;              // "OpenAI", "Anthropic", "Google Gemini"
    model: string;              // resolved from env override or default
    languageModel(): LanguageModel;
  }
  ```

  Models are set by env (`OPENAI_MODEL`, `ANTHROPIC_MODEL`, `GEMINI_MODEL`). Defaults are decided and
  verified against each provider's current model list in Phase 3: Anthropic `claude-sonnet-5-5`, Gemini
  `gemini-3.5-flash`, OpenAI's current general flagship.
- `engine.ts` exposes `clarify()`, `generate()` and `transform()`. Each picks the engine with
  `fallback.ts`.
- **Fallback policy:** providers are tried in `PROVIDER_ORDER`, with the request's preferred provider
  first when one is given. Move to the next provider on: missing response, 429, 5xx, timeout (clarify
  20 s, first token 25 s), auth errors (a bad key is logged server-side and that provider is skipped for
  5 minutes), or invalid structured output after one repair retry. **No fallback after the first delta
  has been sent**; a mid-stream failure ends with an `error` event. When every provider fails, the
  response is an error, never Basic Mode output. Basic Mode is used only when *zero* providers are
  configured, so the app never presents template text as AI output.
- **Meta-prompts** (`prompts/`): one builder per task (clarify, generate, transform) plus per-target
  style guides (`targets/chatgpt.ts`, `claude.ts`, `gemini.ts`) and per-length budgets. The user's idea
  and answers are passed as delimited data, never concatenated into instructions.
- **Clarify** uses `generateText` + `Output.object(ClarifyModelOutput)`. Generate and transform use
  `streamText` for plain text, wrapped in our NDJSON stream.
- **Errors** (`errors.ts`) map SDK and HTTP errors to an `ErrorCode` union (see API_CONTRACTS §5).
- **Rate limit:** an in-memory sliding window per IP (30 req/min across AI routes). It is best-effort on
  serverless and documented as such. An Upstash adapter can be added at deploy time.

## 6. Basic Mode (no providers), as built in Phase 2

- `basic/classify.ts`: weighted keyword scores give one of the 8 `TaskCategory` values (falling back to
  `general`). `splitMaterial` separates pasted code, CSV and long text from the instruction.
- `basic/signals.ts`: detectors for what the idea already states (audience, format, goal, constraints,
  tone, timeframe, budget, language, runtime, material-only phrasing, recency).
- `basic/questions.ts`: per-category question banks with stable ids mapped to brief fields.
  - It asks 0 to 3 questions and skips anything the idea already answers.
  - The source question appears only when material is pasted.
  - For Gemini, the example question moves forward.
  - The example question has no chips, because chips there would be invented sample text.
- `basic/brief.ts`: the idea plus answers become a `PromptBrief` in the user's own words, with nothing
  invented. `basic/title.ts` makes a short title.
- `engine.ts` renders the brief through the `src/lib/prompting` profiles. The stream is `meta`, one
  `delta`, then `done`; transform answers `409 ai_required`.
- Responses carry `engine: { kind: 'basic' }`. The UI labels this "Basic Mode, no AI" and disables
  Improve, Shorten, Expand and Tone with the reason. Regenerate is deterministic: identical inputs add
  no version and show a note.
- `RATE_LIMIT_PER_MINUTE` (default 30) sets the per-IP limit. The e2e server raises it because every
  test runs from one IP.

## 7. Security

- No `NEXT_PUBLIC_` variables for secrets.
- `server-only` guard for `lib/ai/**` and `lib/server/**` is **required before Phase 3** starts reading
  key values. Next bundles the alias internally; adding it needs a type declaration and a Vitest alias.
  Until then:
  - these modules are imported only from route handlers and tests (checked in the Phase 2 audit);
  - `env.ts` turns each key into a boolean while parsing, so no key value can be returned or logged.
- Zod validation at every route boundary; input size caps; JSON body limit 64 KB.
- No provider error bodies are forwarded to the client verbatim; messages are mapped.
- CSP and security headers set in `next.config.ts` at Phase 6.

## 7a. Auth and abuse prevention

Added with Google sign-in (feature/auth). Setup: `docs/AUTH_SETUP.md`.

- **Supabase Auth, Google only, PKCE, SSR cookies.** `src/lib/supabase/{config,client,server,proxy}.ts`.
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are public by design and
  inlined at build. There is no service-role or secret key. If either is missing, auth is "not
  configured": Basic Mode works and Sign in is disabled with the reason.
- **Proxy** (`src/proxy.ts`, Next 16's renamed middleware, Node runtime): on every page and API request
  (static assets excluded) it creates a per-request server client and calls `getClaims()`, which
  refreshes the session cookie when needed. It also redirects signed-out visitors from `/account`.
  It's a no-op when auth isn't configured.
- **Identity** is only `getVerifiedUser()` (`src/lib/server/auth.ts`). It calls `getClaims()`, which
  verifies the JWT signature against the project's JWKS (or the Auth server for symmetric keys) and
  its expiry. `getSession()`'s user, `x-user-id`-style headers and ids in bodies are never trusted.
  Expired, forged and missing sessions are all "signed out".
- **Routes:** `/auth/callback` (code exchange; same-origin, path-only `next`), `POST /auth/signout`
  (same-origin check), `GET /api/session` (verified user for the UI), `/account` (server component
  behind Suspense, because Cache Components makes the cookie read request-time).
- **Guards** (`src/lib/server/guard.ts`). Every AI route must call `guardAiRoute(request)` first:
  auth (401 `auth_required`) → per-user window → per-IP window → concurrency (max 2 in flight per
  user) → 429s. Public Basic Mode routes call `guardPublicRoute(request)`: per-IP → per-user when
  signed in → concurrency (per user, or per IP when signed out). Both return a lease whose idempotent
  `release()` runs on completion, error, stream cancel and request abort (`ndjsonResponse` takes it
  as `onFinish`). `/api/transform` is the only AI route today.
- **Limits** are in-memory per instance (best-effort on serverless): `RATE_LIMIT_PER_MINUTE` (30),
  `RATE_LIMIT_PER_USER_PER_MINUTE` (20), concurrency 2, body 64 KB.
- **Logging:** `logServerError` (`src/lib/server/log.ts`) passes every line through `redact()`, which
  masks bearer tokens, JWTs and key-like strings. Provider and auth error bodies are never forwarded
  to the client.
- **History** stays in IndexedDB on the device. Signing in doesn't sync or upload it.
- **Tests:** unit tests mock the Supabase client at `getClaims`/route level. E2E runs the real PKCE
  flow against `tests/e2e/fake-supabase` (ES256-signed tokens, JWKS, refresh, logout), started by
  Playwright's `webServer` array.
- AI billing: no owner-funded multi-provider keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,
  `PROVIDER_ORDER`, `*_MODEL` were removed). The AI plan is being revised by the lead. Some
  user-key scaffolding from an earlier plan remains (`src/lib/client/ai-key.ts`,
  `src/lib/server/user-key.ts`) pending that revision.

## 8. Design system

**Superseded.** The approved system is `docs/DESIGN.md` ("Spruce and brass"). The plan below was the
Phase 0 draft and was not approved. It is kept for the record only; do not implement it.

### 8.0 Prompt generation path (added with the target profiles)

```
idea + answers ──▶ brief (structured, target-neutral)
                     ├─ Basic Mode: heuristic brief → PROFILES[target].render()   (deterministic, labeled)
                     └─ AI mode:    model writes the prompt following PROFILES[target].guidance
                                    → evaluatePrompt() checks banned phrases and structure; one repair retry
```

### 8.x Retired draft (Phase 0)

**Subject:** a writing desk for instructions you hand to a machine. Its vernacular is the drafting
table, the editor's manuscript and margin notes, not analytics.

**Color (dark first):**

| Token | Hex | Role |
| --- | --- | --- |
| `--ink-0` | `#16181F` | page ground (blue-graphite, not neutral black) |
| `--ink-1` | `#1D2029` | raised surfaces: rail, popovers |
| `--line` | `#2C303C` | hairline borders, dividers |
| `--paper` | `#E9E5DA` | primary text, read like ink on paper inverted |
| `--graphite` | `#9A9DA8` | secondary text, hints (≥ 4.5:1 on ink-0) |
| `--lapis` | `#8FA3FF` | single accent: primary action, focus ring, caret |

The light theme inverts to paper `#F6F5F1`, ink `#1B1D24`, and accent lapis `#3D55D6`.

**Type:** *Newsreader* (variable, optical sizes) for the idea composer and the prompt editor, the
user's words. *Instrument Sans* for UI chrome. *JetBrains Mono* only inside `<kbd>` shortcut hints,
where keys are code-like. Scale from 1.2 ratio steps on a 15 px UI base; editor body at 19 px / 1.65,
line length capped at 68ch.

**Layout:**

```
┌ rail (collapsible, 280px) ┬──────────────── workspace ────────────────────────┐
│ ⌕ Search                  │                                                   │
│ All · ChatGPT · Claude ·  │        [ ChatGPT ▾ ]  [ Balanced ▾ ]   engine ●   │
│ Gemini · Deleted          │                                                   │
│                           │        What do you want the AI to do?             │
│ Today                     │        ┌──────────────────────────────────────┐   │
│  Cold email to landlord   │        │ rough idea, serif, generous           │   │
│  SQL query review         │        └──────────────────────────────────────┘   │
│ Earlier                   │        2 quick questions          Skip all        │
│  …                        │        ─ Who is the audience? [chip] [chip]       │
│                           │                                                   │
│                           │        ── Your prompt ───────────── v3 ▾ ───      │
│                           │        manuscript editor (the hero)               │
│                           │                                                   │
│ ⌘\ hide                   │        Improve Shorten Expand Regenerate Tone▾  [ Copy ⌘⇧C ] │
└───────────────────────────┴───────────────────────────────────────────────────┘
```

Content is left-aligned inside a centered 68ch column. The action bar sticks to the bottom of the
viewport once the editor has content.

**Principles:**
1. The prompt is the page. Everything else recedes: graphite text, hairlines, no boxes around groups.
2. Boldness spent once: the editor's serif manuscript treatment. No gradients, glows or card grids.
3. Motion answers actions: questions stagger in (60 ms), text streams, version switches crossfade.
   Nothing loops. Reduced motion turns these into instant changes.
4. Copy says what happens: "Generate prompt", "Copy", "Copied", "Restore this version".

**Review against defaults:** the first instinct was a near-black ground with a single vivid green accent,
which is a known generated-design tell (frontend-design trait 2). It was revised to a blue-graphite
ground with a soft lapis accent and warm paper text. A sidebar of rounded cards (trait 4) was rejected in
favor of a plain text list with date groups. Platform filters are plain text toggles, not middle-dot meta
strings or pills. Mono is limited to `<kbd>`.

## 9. Skills used per phase

Installed skills were checked in `.claude/skills/`. There is no `webapp-testing` skill installed;
**`playwright-cli`** covers browser driving and visual QA.

| Phase | Skills |
| --- | --- |
| 1 UI | `frontend-design` (primary), `emil-design-eng`, `animate`, `choreograph`, `mobile-native` |
| 2–3 | `claude-api` (Anthropic specifics); vendor docs for OpenAI and Gemini |
| 4 | `gestures` (mobile rail sheet), `animation-performance` |
| 5 QA | `playwright-cli`, `break-ui`; user-invoked only: `/review-animations` |
| 6 | none |

`design-taste-frontend` is not used. It targets marketing and company websites (photographs, shader
scenes, one section per screen) and installs a Stop-hook gate built for those pages. That conflicts with
a single-screen writing tool.
