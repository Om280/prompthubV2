# Deploying PromptHub to Vercel

This guide is for the owner. It assumes the local setup in `README.md` and the external services in
`docs/AUTH_SETUP.md` (Supabase, Google OAuth, Gemini free tier) are already done.

## 1. Before the first deploy

1. **Gemini key:** the Google Cloud project behind the key must have **no billing account linked**.
   - Linking billing upgrades the project to a paid tier immediately, and PromptHub must stay on the
     free tier.
   - Check this in Google AI Studio under *API keys* (the project's tier is shown there) and in the
     Google Cloud console under *Billing*.
2. **Supabase:** run `supabase/migrations/0001_ai_quota.sql` once in the SQL editor, then check it with
   the script in `AUTH_SETUP.md` §8.
3. **Rate limits:** copy the selected model's RPM, TPM and RPD from https://aistudio.google.com/rate-limit.
   These are per project, not per key.

## 2. Create the Vercel project

1. Import the Git repository in Vercel. It is detected as Next.js, so keep the default build command
   (`next build`) and output.
2. Node.js version: 22.x or newer (Project Settings → General).
3. API routes run on the Node runtime. Next 16 with `cacheComponents` doesn't allow per-route `runtime`
   exports, and none are needed.

## 3. Environment variables

Set these in Project Settings → Environment Variables, for Production (and Preview if you use it).

| Variable | Scope | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | public, **build time** | Inlined by `next build`. Redeploy after changing it. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public, **build time** | The `sb_publishable_…` key. Public by design. |
| `SUPABASE_SECRET_KEY` | **secret**, server only | The `sb_secret_…` key. Mark it *Sensitive*. Never prefix it with `NEXT_PUBLIC_`. |
| `GEMINI_API_KEY` | **secret**, server only | From Google AI Studio (free-tier project). Mark it *Sensitive*. |
| `GEMINI_MODEL` | server | Must be on the allowlist in `src/lib/ai/gemini-models.ts`, for example `gemini-3.8-flash`. |
| `GEMINI_PROJECT_RPM`, `GEMINI_PROJECT_TPM`, `GEMINI_PROJECT_RPD` | server | Your project's free-tier limits for that model. |
| `AI_ENABLED` | server | `true`. Set it to `false` and redeploy (or change the value and redeploy) to switch AI off. |
| `AI_*` limits | server, optional | The defaults are in `.env.example`. |

Use separate Gemini keys (and ideally separate Supabase projects) for Preview and Production if you
deploy previews. Every key shares its Google project's quota.

## 4. Supabase and Google redirect URLs for the production domain

- **Supabase → Authentication → URL Configuration:**
  - set *Site URL* to `https://<your-domain>`
  - add `https://<your-domain>/auth/callback` to *Redirect URLs*
  - for previews, add `https://*-<team>.vercel.app/auth/callback`
- **Google Cloud → OAuth client:** the authorised redirect URI stays the Supabase callback
  (`https://<project-ref>.supabase.co/auth/v1/callback`). Add your domain to the *Authorised JavaScript
  origins*, and to the consent screen's authorised domains if you publish the app.

## 5. After deploying

1. Open `/privacy` and check that the free-tier disclosure is shown.
2. Signed out: generate a prompt in Basic Mode. It should be labelled "Basic Mode, no AI".
3. Sign in with Google, then generate once. The engine label should read Gemini and show your model.
4. Open `/account` and check that the usage counts went up by one.
5. In Supabase, check that `select count(*) from public.ai_usage;` increased and that no prompt text is
   stored there.
6. Schedule `select public.ai_prune();` once a day (Supabase → Database → Cron) to delete expired
   counters.

## 6. Emergency stop

Set `AI_ENABLED=false` in Vercel and redeploy. Every AI route then refuses before it calls Gemini, and
Basic Mode keeps working. To stop everything immediately without a redeploy, revoke the key in Google
AI Studio.

## 7. Security headers

`next.config.ts` doesn't yet set a Content-Security-Policy. Before a public launch, add CSP,
`Referrer-Policy` and `Permissions-Policy` headers and check them in a production build (ROADMAP Phase 6).
