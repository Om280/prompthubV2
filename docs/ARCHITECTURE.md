# PromptHub — Architecture

Status: as built (release candidate) · Last updated: 2026-11-24

## 1. Stack (versions checked on npm 2026-11-23)

| Concern | Choice | Version |
| --- | --- | --- |
| Framework | Next.js App Router, React | next 16.4.x, react 19.3.x |
| Language | TypeScript, strict | 7.0.x |
| Styling | Tailwind CSS v4 (CSS-first `@theme`) plus Design C component CSS (`src/app/interlock.css`, `ih-` prefix) | 4.3.x |
| Components | shadcn/ui (copied into `src/components/ui`), Radix primitives | shadcn CLI 4.23.x |
| Icons | lucide-react | 1.78.x |
| Motion | motion (`motion/react`) | 14.14.x |
| AI | Google Gemini API, free tier only (owner's server-side key), via the AI SDK | ai 7.0.166, @ai-sdk/google 4.0.114 |
| Server boundary | `server-only` on every module that reads secrets or calls Gemini | 0.0.1 |
| Auth, quota store | Supabase (`@supabase/ssr`, `@supabase/supabase-js`) | 0.12.7, 2.119.0 |
| Validation | Zod 4 | 4.6.x |
| Storage | IndexedDB via `idb` | 8.0.x |
| Tests | Vitest + Testing Library + `fake-indexeddb`; Playwright | vitest 5.1.x, @playwright/test 1.65.x |
| Runtime | Node 24 (local), Node runtime for route handlers | |

The Gemini model is built only in `lib/ai/gemini/provider.ts` with `createGoogle({ apiKey })` and an
explicit key, so the SDK's `GOOGLE_GENERATIVE_AI_API_KEY` fallback and `@ai-sdk/gateway` string ids are
never used.

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
                                                    │   ├─ status.ts    (Gemini readiness)      │
                                                    │   ├─ gemini-*.ts  (allowlist, errors)     │
                                                    │   ├─ prompts/*    (meta-prompts per task) │
                                                    │   ├─ basic/*      (template Basic Mode)   │
                                                    │   └─ gemini/*     (provider, clarify,     │
                                                    │                    generate, transform)   │
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
    ai/         engine, status, gemini-models,
                gemini-errors, cancellation,
                disclosure, errors, basic/   AI
    server/     env, guard, quota, auth, …   AI
    supabase/   config, client, server, proxy  (auth)
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
- **Editor:** two views of the same text.
  - **Blocks** (the default, `block-editor.tsx` + `blocks.ts`): the prompt is parsed losslessly into labelled sections, each one editable in place. The parser also runs on partial streams, so blocks drop in as their headings arrive.
  - **Plain text** (`prompt-editor`): a styled `<textarea>` with auto-height, not a rich-text editor.

  In more detail: Prompts are plain text or
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

**Google Gemini only, free tier only, with the owner's single server-side key.** There is no OpenAI,
Anthropic or OpenRouter, no paid Gemini model or tool, no fallback model and no user keys. The
*target platform* (ChatGPT, Claude or Gemini) decides how the prompt is written; the *generation
provider* is always Gemini. The engine meta says `{kind:"ai", provider:"gemini", tier:"free", model}`.

- **Config.** `lib/server/env.ts` (server-only) validates server env with Zod. Secrets become booleans
  while parsing. Only the modules that need a value read it from `process.env`, at the point of use:
  `lib/ai/gemini/provider.ts` for the Gemini key and `lib/server/quota.ts` for the Supabase secret.
- **Model allowlist.** `lib/ai/gemini-models.ts` holds the free-tier allowlist (verified 2026-11-23 and
  re-checked 2026-11-24 against https://aistudio.google.com/docs/pricing). It also has a deny-list of
  paid-only ids and families. There is no default model in code; the recommended model is
  `gemini-3.8-flash`, whose `models.get` call succeeded for the owner's key on 2026-11-24.
- **Readiness.** `lib/ai/status.ts` checks, in order: `AI_ENABLED` (the emergency switch), the key, the
  model allowlist, the quota store config, then a cached health probe of the quota functions (60 s
  when healthy, 15 s after a failure; a missing migration reads `unavailable`). Missing project limits
  no longer block AI (§5.1).
- **Every Gemini call** (`lib/ai/gemini/call.ts`):
  - `maxRetries: 0`;
  - `abortSignal` set to the lease signal (client disconnect plus `AI_TIMEOUT_MS`), with the SDK
    `timeout` also set;
  - `maxOutputTokens` = `AI_MAX_OUTPUT_TOKENS` (4096, thinking included);
  - `thinkingLevel` = `GEMINI_THINKING_LEVEL` (default `low`);
  - no temperature, top_p, top_k, tools or grounding.
- **Clarify** (`gemini/clarify.ts`): structured output (`Output.object`) of the task type and 0 to 4
  questions that would materially change the prompt. For a Gemini target, an "example?" question is
  moved forward when format or style matters.
- **Generate** (`gemini/generate.ts`): Gemini returns a structured `PromptBrief` (the target-neutral
  brief); code renders it with `PROFILES[target].render()` and scores it with `evaluatePrompt()`.
  - Rendering in code keeps each target's structure exact (ChatGPT Markdown, Claude XML, Gemini
    task-first), keeps pasted material verbatim, and needs only one call per prompt.
  - Faithfulness checks: every item must trace back to the idea and answers, examples must be the
    user's own, and no emphasis or markup words are allowed.
  - A failed check gets at most one repair. Whatever still fails afterwards is dropped, and any lost
    answer is restored in the user's own words.
  - The rendered prompt streams as paragraph deltas.
- **Transforms** (`gemini/transform.ts`): Improve, Shorten, Expand, Tone and Regenerate.
  - Gemini rewrites the text following `PROFILES[target].guidance`, and the result is streamed.
  - It is then checked for target syntax, kept requirements, verbatim material and the direction of
    the length change. A failure gets one repair; otherwise the result is `invalid_output` and the
    previous version stays.
  - A `length` finish is reported as `done.truncated`, and the client keeps it as a partial version.
- **Errors** (`lib/ai/gemini-errors.ts`):
  - Google 429 `RESOURCE_EXHAUSTED` becomes `quota_exhausted` with `resetsAt`.
  - 503 and other failures become `provider_unavailable`.
  - Timeouts, safety blocks and invalid output each get their own message.
  - **No retries, no fallback.** The provider message is logged with `redact()` and never forwarded.
- **Disclosure.** `lib/ai/disclosure.ts` holds the first-use AI notice: on the free tier, Google uses
  submitted content to improve its products. It appears on `/privacy` and in the first-use dialog.
- **Data minimisation.** Gemini receives only the idea, answers, prompt text and settings. It never
  receives the user's name, email or ids.

### 5.1 Quota design (persistent, atomic)

AI limits live in Supabase Postgres (`supabase/migrations/0001_ai_quota.sql`), reached only with the
server-side secret key through `lib/server/quota.ts` (`QuotaStore`). They are never held in memory for
AI; `createMemoryQuotaStore` is a test double. If the store isn't configured, AI is `not-configured`.
If it fails at runtime, the guard fails closed (`internal`, "couldn't check your AI limits").

- Tables, all with RLS on and no policies: `ai_rate_counters (bucket, window_start, count)`,
  `ai_consumed (bucket, window_start, key, amount)` for idempotency, `ai_inflight (bucket,
  request_id, request_hash, expires_at)` and `ai_usage` (tokens, op, model, status, duration and a
  request hash; **no prompt text**).
- Functions (`security definer`, pinned `search_path`, execute granted to `service_role` only):
  - `ai_consume(buckets, windows, limits, amounts, keys)` checks every window under row locks in
    bucket order and increments all of them or none. A window whose `(bucket, period, key)` was
    already consumed is skipped, so a retry with the same `requestId` is never double-counted, and
    clarify + generate of one `workflowId` count once.
  - `ai_adjust` reconciles the TPM estimate with the actual tokens.
  - `ai_acquire_inflight` / `ai_release_inflight` manage TTL'd leases (advisory lock per user;
    `duplicate` for the same request or identical content). `ai_record_usage` and `ai_prune` complete
    the set.
- Buckets and defaults (all env-configurable): see API_CONTRACTS §5 "AI limits". In short: 5
  workflows and 5 refinements per user per Pacific day, 3/min per user, 10/min per IP, 1 in flight per
  user (TTL 120 s), 20,000 input characters, and app-wide RPM/TPM/RPD ceilings.
- **App-wide ceilings.** When `GEMINI_PROJECT_RPM/TPM/RPD` are supplied, each ceiling is
  `AI_GLOBAL_SAFETY_RATIO` (0.7) × the project's limit from https://aistudio.google.com/rate-limit.
  When they are not, PromptHub's conservative defaults apply: `AI_GLOBAL_RPM` 5, `AI_GLOBAL_TPM`
  100,000 and `AI_GLOBAL_RPD` 100. Explicit `AI_GLOBAL_*` values cap either basis. `/api/providers`
  reports which basis is in use (`ai.limits.basis`). No Google limit is assumed.
- A repair is a second upstream request inside one lease, so `reconcileCalls()` charges it to
  `global:rpm` and `global:rpd`.
- **User-level reads** (`supabase/migrations/0002_usage_read.sql`): `authenticated` users get `select`
  on their own `ai_usage` rows (`user_id = auth.uid()`), on their own two daily counters, and the
  `security invoker` function `ai_my_usage_today()`. `lib/server/usage.ts` reads them through the
  cookie-session client (the publishable key and the user's JWT), never through the secret key. The
  secret key is used only for the privileged quota functions.
- `guardAiRoute` order: verified user → body validation → readiness → `requestId`/`workflowId` and
  input cap → in-flight lease → `ai_consume`. The lease carries `signal`, `reconcileTokens()`,
  `recordUsage()` and an idempotent `release()` (on completion, error, stream cancel and abort).
- Day windows start at midnight America/Los_Angeles (when Gemini's daily free quota resets), so DST
  days are 23 or 25 hours. The SQL and `lib/server/quota-windows.ts` compute the same windows.

## 6. Basic Mode (no AI), as built in Phase 2

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
- `import "server-only"` is in every module under `lib/server/**` and `lib/ai/**` that reads secrets,
  calls Gemini or enforces quotas, so importing one from a client component fails the build. Vitest
  aliases `server-only` to its empty module (`vitest.config.mts`).
- Zod validation at every route boundary; input size caps; JSON body limit 64 KB.
- No provider or database error bodies are forwarded to the client verbatim; messages are mapped.
- `GEMINI_API_KEY` and `SUPABASE_SECRET_KEY` are server-only; `redact()` masks them in logs.
- Security headers are set in `next.config.ts`: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`,
  CSP `frame-ancestors 'none'; base-uri 'self'; form-action 'self'` and `Permissions-Policy`. A full
  script CSP is a later hardening step.

## 7a. Auth and abuse prevention

Added with Google sign-in (feature/auth). Setup: `docs/AUTH_SETUP.md`.

- **Supabase Auth, Google only, PKCE, SSR cookies.** `src/lib/supabase/{config,client,server,proxy}.ts`.
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are public by design and
  inlined at build. If either is missing, auth is "not configured": Basic Mode works and Sign in is
  disabled with the reason. The server-only `SUPABASE_SECRET_KEY` is used for the AI quota store and
  nothing else.
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
  behind Suspense, because Cache Components makes the cookie read request-time), and `/privacy`
  (public notice).
- **Guards** (`src/lib/server/guard.ts`). Every AI route must call `guardAiRoute(request, …)` first
  (order and buckets in §5.1). Public Basic Mode routes call `guardPublicRoute(request)`: an in-memory
  per-IP window (`RATE_LIMIT_PER_MINUTE`, 30), then at most 2 in flight per user (per IP when signed
  out). That's fine because these routes never call Gemini. Both leases release on completion, error,
  stream cancel and request abort (`ndjsonResponse` takes `release` as `onFinish`). `/api/transform` is
  the only AI route today.
- **Logging:** `logServerError` (`src/lib/server/log.ts`) passes every line through `redact()`, which
  masks Google API keys (`AIza…`), the literal values of `GEMINI_API_KEY` and `SUPABASE_SECRET_KEY`,
  bearer tokens and JWTs. Provider, database and auth error bodies are never forwarded to the client.
- **Privacy:** history stays in IndexedDB on the device; signing in doesn't sync or upload it.
  Supabase holds Google account basics, quota counters and usage metadata, never prompt text.
  `/privacy` says so, and says that AI text goes to Gemini's free tier, where Google uses content to
  improve its products.
- **Tests:** unit tests mock the Supabase client at `getClaims`/route level and the quota store with
  the memory double and a mocked RPC client. The SQL itself must be verified against a real database
  (`docs/AUTH_SETUP.md` §8). E2E runs the real PKCE flow against `tests/e2e/fake-supabase` (ES256-signed
  tokens, JWKS, refresh, logout), started by Playwright's `webServer` array.

## 8. Design system

**Production design: Direction C "Interlock"** (`docs/design/DIRECTION-C.md`).
- Tokens for light and dark live in `src/app/globals.css`.
- Component styles live in `src/app/interlock.css` (`ih-` prefix). The Turbopack rule compiles all `.css` as global, so CSS modules aren't used.
- Fonts are Funnel Display and Schibsted Grotesk via `next/font`.
- "Spruce and brass" (`docs/DESIGN.md`) and the Phase 0 draft below are retired and kept for the record only.
- The explorations are archived at the git tag `design-explorations-v1`.

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
| 2–3 | Google Gemini API docs (free tier); Supabase docs |
| 4 | `gestures` (mobile rail sheet), `animation-performance` |
| 5 QA | `playwright-cli`, `break-ui`; user-invoked only: `/review-animations` |
| 6 | none |

`design-taste-frontend` is not used. It targets marketing and company websites (photographs, shader
scenes, one section per screen) and installs a Stop-hook gate built for those pages. That conflicts with
a single-screen writing tool.
