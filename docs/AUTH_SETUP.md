# PromptHub: setting up Google sign-in, Gemini (free tier) and the AI quota store

PromptHub signs users in with Google through Supabase Auth (PKCE flow, cookies, verified on the
server). Without this setup the app still works: it runs in Basic Mode and the header's **Sign in**
button is disabled with "Sign-in isn't set up on this server yet."

AI (§7–8) is optional on top of sign-in and needs both. Without it AI stays off and Basic Mode works.

You need: a Supabase account, a Google Cloud account, and the domain you'll deploy to. Nothing below
invents credentials. Every ID, secret and URL comes from your own Supabase and Google projects.

## 1. Create a Supabase project

1. In the Supabase dashboard, create a new project. Pick a region close to your users.
2. Note the **project reference**. It's the `<project-ref>` in `https://<project-ref>.supabase.co`,
   shown in the project URL.

## 2. Google Cloud: OAuth consent screen and Web client

1. In the Google Cloud Console, pick (or create) a project.
2. **APIs & Services → OAuth consent screen** (Google Auth Platform → Branding / Audience):
   - App name: `PromptHub` (or your name), user support email, developer contact email.
   - Audience: **External**. While the app is in *Testing*, add your Google accounts as test users.
     Publish the app when you're ready for anyone to sign in.
   - Scopes: the defaults Supabase asks for (`openid`, `.../auth/userinfo.email`,
     `.../auth/userinfo.profile`). PromptHub needs nothing more.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorised JavaScript origins**:
     - `http://localhost:3000` (local development)
     - `https://<your-domain>` (production)
   - **Authorised redirect URIs**: exactly one, Supabase's callback:
     - `https://<project-ref>.supabase.co/auth/v1/callback`

     This is Supabase's URL, not PromptHub's. Google sends the user to Supabase, and Supabase then
     sends them to PromptHub's `/auth/callback`.
4. Copy the **Client ID** and **Client secret**. The secret goes into Supabase only (next step), never
   into PromptHub's environment.

## 3. Enable the Google provider in Supabase

1. Supabase dashboard → **Authentication → Sign In / Providers → Google**.
2. Turn it on, paste the **Client ID** and **Client secret** from step 2, save.
3. The page shows the callback URL `https://<project-ref>.supabase.co/auth/v1/callback`. It must match
   the redirect URI you entered in Google exactly.

## 4. Supabase URL configuration

Supabase dashboard → **Authentication → URL Configuration**:

- **Site URL**: your production URL, e.g. `https://<your-domain>`.
- **Redirect URLs** (allow list). Add both:
  - `http://localhost:3000/auth/callback`
  - `https://<your-domain>/auth/callback`

PromptHub always asks Supabase to return to `<origin>/auth/callback?next=<path>`. Supabase only
redirects to URLs on this list. If yours isn't listed, sign-in falls back to the Site URL. Preview
deployments with their own domains need their own entries (Supabase supports `*` wildcards, e.g.
`https://*-<team>.vercel.app/auth/callback`; keep wildcards as narrow as you can).

## 5. Copy the project URL and publishable key into PromptHub

Supabase dashboard → **Project Settings → API Keys** (and **Data API** for the URL):

- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL` (e.g. `https://<project-ref>.supabase.co`)
- **Publishable key** (`sb_publishable_…`) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Both are public by design: they ship to the browser. **Do not** put the secret (`sb_secret_…`) or
legacy `service_role` key in these variables. The only secret key PromptHub uses is
`SUPABASE_SECRET_KEY`, set server-side only, for the AI quota store (§8).

- Local: put them in `.env.local` (copy `.env.example`), then restart `npm run dev`.
- Hosting: add both to the host's environment **for the build step**. `NEXT_PUBLIC_` values are
  inlined by `next build`, so changing them needs a rebuild.

Recommended: in **Project Settings → JWT Keys**, make sure the project signs tokens with an
asymmetric key (ECC P-256 or RSA, the default for new projects). Then `getClaims()` verifies tokens
locally against the cached JWKS. With a legacy symmetric secret it falls back to asking the Auth
server on every request, which works but is slower.

## 6. Verify

1. `npm run dev`, open `http://localhost:3000`.
2. The header shows **Sign in** (enabled). If it's disabled with "Sign-in isn't set up on this server
   yet", the two env vars aren't reaching the build. Check the names and restart.
3. Click **Sign in** → Google's account chooser → you land back where you started, and the header
   shows your avatar (or initials). The account menu shows your name and email.
4. `http://localhost:3000/api/session` returns your `{ id, email, name, avatarUrl }`, and
   `/api/providers` reports `auth: { configured: true, signedIn: true }`.
5. Open **Account settings** (`/account`). Sign out there or from the menu, and the header shows
   **Sign in** again.

Common problems:

| Symptom | Fix |
| --- | --- |
| Google: `redirect_uri_mismatch` | The Google client's redirect URI must be exactly `https://<project-ref>.supabase.co/auth/v1/callback`. |
| Back on PromptHub with "Sign-in didn't finish" | The code expired or was used twice, or the PKCE cookie was lost (e.g. you started on `localhost` and returned on `127.0.0.1`). Use one origin and try again. |
| Returned to the Site URL instead of PromptHub | Add `<origin>/auth/callback` to Supabase's Redirect URLs. |
| "Access blocked: app not verified" | Add your account as a test user, or publish the consent screen. |

## 7. AI: a Gemini API key on the free tier only

PromptHub's AI uses **only** Google Gemini's free tier, with one server-side key owned by you. It
never uses a paid tier and never falls back to another model or provider. AI generation itself
arrives in a later update. Until then `/api/providers` reports `unavailable` ("coming in a later
update") when everything below is set, and `not-configured` (naming what's missing) otherwise.

1. In **Google AI Studio** (https://aistudio.google.com), create an API key in a Google Cloud
   project that has **no billing account**. Keep it that way: never link billing to this project.
   With no billing account, the key can only use the free tier.
2. Pick a model from the free-tier allowlist in `src/lib/ai/gemini-models.ts` (verified against
   https://aistudio.google.com/docs/pricing on 2026-11-23). Recommended: `gemini-3.5-flash-lite`.
   Paid-only models (Gemini 4 Carbon/Argon/Neon, any `-pro`, image, Omni, Genie) are refused, and an
   unknown model is never silently replaced.
3. Open https://aistudio.google.com/rate-limit and note that model's free-tier limits **for your
   project**: requests per minute (RPM), tokens per minute (TPM) and requests per day (RPD).
4. Set, server-side only (never `NEXT_PUBLIC_`):
   - `GEMINI_API_KEY`: the key
   - `GEMINI_MODEL`: the model id
   - `GEMINI_PROJECT_RPM`, `GEMINI_PROJECT_TPM`, `GEMINI_PROJECT_RPD`: the numbers from step 3
   - optionally `AI_GLOBAL_SAFETY_RATIO` (default `0.7`). PromptHub uses at most 70% of each limit
     app-wide, leaving headroom so Google's own limit is never the one that trips.
5. Leave `AI_ENABLED=true`. Setting it to `false` stops every Gemini call at once (the emergency
   switch). Basic Mode keeps working.

On the free tier Google states that submitted content is used to improve its products. The public
`/privacy` page and the first-use AI notice (`src/lib/ai/disclosure.ts`) tell users this.

## 8. The AI quota store (Supabase migration and secret key)

AI limits are enforced persistently and atomically in your Supabase database. In-memory limits are
never used for AI. Without this step AI stays `not-configured`.

1. Supabase dashboard → **SQL Editor** → new query → paste the whole of
   `supabase/migrations/0001_ai_quota.sql` → **Run**. (With the Supabase CLI linked to the project,
   `supabase db push` applies it instead.) It creates four tables (`ai_rate_counters`, `ai_consumed`,
   `ai_inflight`, `ai_usage`) with RLS on and no policies, plus the `ai_*` functions. Only the service
   role can execute them. No prompt text is stored anywhere.
2. **Project Settings → API Keys → Secret keys**: create or copy a secret key (`sb_secret_…`). Set it
   as `SUPABASE_SECRET_KEY` in the **server** environment only (e.g. the host's runtime env vars).
   Never put it in a `NEXT_PUBLIC_` variable or in client code.
3. Optional housekeeping: schedule `select public.ai_prune();` daily (Database → Cron, or pg_cron),
   which drops counters older than two days and expired in-flight leases.

Verify the migration in the SQL editor (it leaves no data behind):

```sql
begin;
-- Two calls with different request keys against a limit of 1: the second is refused.
select * from public.ai_consume(array['test:verify:min'], array['minute'], array[1], array[1], array['k1']);
select * from public.ai_consume(array['test:verify:min'], array['minute'], array[1], array[1], array['k2']);
-- A retry with the same key is a replay, not counted again.
select * from public.ai_consume(array['test:verify:min'], array['minute'], array[1], array[1], array['k1']);
-- Day windows start at midnight America/Los_Angeles.
select public.ai_window_start('day', now()), public.ai_window_reset('day', now());
rollback;
```

Expected: the first call returns `ok = true`, the second `ok = false` with
`failed_bucket = test:verify:min` and `resets_at` at the next minute, and the third `ok = true,
replay = true`. As an anonymous client, `select * from ai_usage` must return no rows (RLS).

The unit tests exercise the same semantics with an in-memory double (`createMemoryQuotaStore`) and a
mocked RPC client. The SQL itself can only be checked against a real database, as above.

## How it works (for maintainers)

- Browser: `src/lib/supabase/client.ts` (`createBrowserClient`) starts `signInWithOAuth({ provider:
  "google", options: { redirectTo: <origin>/auth/callback?next=… } })`. PKCE is `@supabase/ssr`'s
  default. The code verifier is stored in a cookie.
- `src/app/auth/callback/route.ts` exchanges the code (`exchangeCodeForSession`) and redirects to a
  same-origin, path-only `next` (anything else → `/`). Failures go to `/?auth_error=<code>`.
- `src/proxy.ts` → `src/lib/supabase/proxy.ts` refreshes the session cookie on every page/API request
  (`getClaims()`), and sends signed-out visitors from `/account` to `/?signin=required`.
- Server identity is only `getVerifiedUser()` (`src/lib/server/auth.ts`, `getClaims()`). It never
  uses `getSession()`'s user or any client-sent id.
- `POST /auth/signout` (same-origin only) clears the session cookies.
- End-to-end tests use a local fake of Supabase Auth (`tests/e2e/fake-supabase/`), never a real
  project.
