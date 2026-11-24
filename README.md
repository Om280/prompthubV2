# PromptHub

Turn a rough idea into a polished prompt for **ChatGPT, Claude or Gemini**. PromptHub asks only the
follow-up questions that change the result. You then pick a length and tone, edit the prompt as
connected blocks or as plain text, refine it, and copy it. Every prompt and version is saved in your
browser.

- **Gemini writes, your target decides the shape.** All AI work runs on the Google Gemini API **free
  tier**, through one server-side key. The target platform you pick decides how the prompt is
  structured, using one of three profiles: ChatGPT (Markdown, goal first, success criteria), Claude
  (XML tags, reasons, material first) or Gemini (task and constraints first, defined terms). Picking
  Claude doesn't call Claude. See `docs/PROMPTING_RESEARCH.md`.
- **Basic Mode** works signed out and without any keys. It is a local, deterministic template engine,
  labelled "Basic Mode, no AI" everywhere it appears.
- **Sign in with Google** (Supabase Auth) to use AI. The server enforces persistent per-user, per-IP
  and app-wide limits, because every user shares one free quota.
- **Privacy:** on the Gemini free tier, Google may use submitted content to improve its products.
  PromptHub says this on `/privacy` and before your first AI request. History stays in your browser
  (IndexedDB); the server stores only usage metadata, never prompt text.

## Features

| Area | What you get |
| --- | --- |
| Compose | Idea input, 0–4 essential follow-up questions (answer, skip, undo, skip all), target platform, Concise / Balanced / Detailed, tone |
| Generate | Streaming generation into a block editor (Blocks or Plain text view), copy with confirmation |
| Refine | Improve, Shorten, Expand, Change tone, Regenerate; every result is a new version |
| History | Persistent IndexedDB history, search, platform filter, rename, delete with Undo, Recently deleted, restore old versions, cross-tab sync |
| Account | Google profile, sign out, today's AI usage and limits (`/account`), privacy notice (`/privacy`) |
| Keyboard | Ctrl/⌘ Enter generate, Ctrl/⌘ Shift C copy, Ctrl/⌘ K command palette, Ctrl/⌘ \\ history, Alt N new prompt, Esc stop, Alt S skip question, Alt [ / ] versions, `/` search, `?` shortcut sheet |
| Design | Direction C "Interlock" (`docs/design/DIRECTION-C.md`): light and dark themes, responsive from 360 px, reduced motion respected |

## Quick start (Basic Mode, no accounts needed)

Requirements: Node.js 22 or newer (developed on 24) and npm.

```bash
npm install
npm run dev          # http://localhost:3000
```

With no environment variables, the app runs in Basic Mode and sign-in is off.

## Full setup (Google sign-in and Gemini free tier)

1. `cp .env.example .env.local`. `.env.local` is git-ignored; never put real values in `.env.example`.
2. **Supabase and Google OAuth:** follow `docs/AUTH_SETUP.md` §1–6. You will create a Supabase project,
   a Google OAuth web client, enable the Google provider, and set the Site URL and redirect URLs.
3. **Database migrations:** in the Supabase SQL Editor, run these in order (`docs/AUTH_SETUP.md` §8):
   1. `supabase/migrations/0001_ai_quota.sql`: quota tables (RLS on) and the privileged quota functions
   2. `supabase/migrations/0002_usage_read.sql`: lets each user read their own usage, through RLS
4. **Gemini free tier:** create an API key in Google AI Studio, in a project with **no billing account**
   (`docs/AUTH_SETUP.md` §7). Set `GEMINI_API_KEY` and `GEMINI_MODEL=gemini-3.8-flash`. Optionally copy
   your project's RPM, TPM and RPD from https://aistudio.google.com/rate-limit into
   `GEMINI_PROJECT_RPM/TPM/RPD`; without them, conservative app-wide defaults apply.
5. `npm run dev`, sign in with Google, and generate.

### Environment variables

| Variable | Where | Required for | Notes |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | public, build time | sign-in | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public, build time | sign-in | `sb_publishable_…`; public by design |
| `SUPABASE_SECRET_KEY` | **server secret** | AI | `sb_secret_…`; used only for the quota functions |
| `GEMINI_API_KEY` | **server secret** | AI | Google AI Studio key from a free-tier project |
| `GEMINI_MODEL` | server | AI | Must be on the free-tier allowlist (`src/lib/ai/gemini-models.ts`); recommended `gemini-3.8-flash` |
| `GEMINI_PROJECT_RPM`, `_TPM`, `_RPD` | server | optional | Your project's limits; PromptHub uses 70% (`AI_GLOBAL_SAFETY_RATIO`) |
| `AI_GLOBAL_RPM`, `_TPM`, `_RPD` | server | optional | App-wide ceilings when project limits are absent (defaults 5 / 100,000 / 100) |
| `AI_ENABLED` | server | optional | `false` is the emergency switch: no Gemini calls, Basic Mode stays on |
| `AI_USER_DAILY_WORKFLOWS`, `AI_USER_DAILY_REFINEMENTS` | server | optional | Defaults 5 and 5 per user per Pacific day |
| `AI_USER_PER_MINUTE`, `AI_IP_PER_MINUTE`, `AI_MAX_CONCURRENT_PER_USER` | server | optional | Defaults 3, 10, 1 |
| `AI_MAX_INPUT_CHARS`, `AI_MAX_OUTPUT_TOKENS`, `AI_TIMEOUT_MS` | server | optional | Defaults 20,000, 4,096, 30,000 |
| `GEMINI_THINKING_LEVEL` | server | optional | `low` (default), `medium` or `high` |
| `RATE_LIMIT_PER_MINUTE` | server | optional | Basic Mode per-IP limit (default 30) |

Secrets are never prefixed `NEXT_PUBLIC_`, never sent to the browser and never logged. The Google
OAuth client secret lives only in the Supabase dashboard, never in this app.

## Tests

```bash
npm run typecheck
npm run lint
npm test                          # Vitest unit tests (use this rather than bare `npx vitest` on Windows)
npx playwright install chromium   # once
npm run test:e2e                  # Playwright: builds, starts fake Supabase and fake Gemini servers, runs desktop + mobile
npm run build
```

Unit and end-to-end tests never call Gemini or Google. The e2e suite runs against local fake
Supabase and fake Gemini servers, so it proves the app's own behaviour, not that a real Google
login works.

**Opt-in live check (uses your free quota):**

```bash
npm run eval:gemini -- --smoke --confirm-free-tier          # 3 requests: clarify, generate, transform
npm run eval:gemini -- --confirm-free-tier --budget 18      # 6 sample tasks × 3 target profiles
```

It refuses to run in CI, without `--confirm-free-tier`, or with a model that isn't on the allowlist.
Reports go to `reports/`, which is git-ignored. It checks that the generated prompts follow each profile;
it does not measure answer quality on ChatGPT, Claude or Gemini.

## Deploy

See `docs/DEPLOYMENT.md` for the Vercel steps: environment variables, Supabase and Google redirect
URLs for your domain, post-deploy checks and the emergency stop.

## Docs

| File | Contents |
| --- | --- |
| `docs/PRD.md` | Product requirements |
| `docs/ARCHITECTURE.md` | Architecture as built, AI and quota design, security |
| `docs/API_CONTRACTS.md` | Route and stream contracts (v1.4) |
| `docs/PROMPTING_RESEARCH.md` | Vendor prompting guidance and the three target profiles |
| `docs/AUTH_SETUP.md` | Supabase, Google OAuth, Gemini free tier, migrations |
| `docs/DEPLOYMENT.md` | Vercel deployment |
| `docs/design/DIRECTION-C.md` | The production design system |
| `docs/ROADMAP.md` | Phases and status |

## License

No license has been chosen yet. Add one before publishing the repository publicly.
