# PromptHub: setting up Google sign-in (Supabase Auth)

PromptHub signs users in with Google through Supabase Auth (PKCE flow, cookies, verified on the
server). Without this setup the app still works: it runs in Basic Mode and the header's **Sign in**
button is disabled with "Sign-in isn't set up on this server yet."

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

Both are public by design: they ship to the browser. **Do not** use the secret (`sb_secret_…`) or
legacy `service_role` key anywhere in PromptHub.

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
