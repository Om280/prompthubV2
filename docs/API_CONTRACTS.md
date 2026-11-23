# PromptHub — API Contracts

Status: Phase 0, **frozen**; revised for auth and abuse limits (v1.2, lead-authorised). Changes require
lead sign-off and must be made in `src/lib/contracts/schemas.ts` and this file in the same change.

All routes run on the Node.js runtime (the default; with `cacheComponents: true` Next 16 disallows a `runtime` export, so none is declared) and are same-origin. Request bodies are JSON (≤ 64 KB) and are validated
with the Zod schemas named below. Field names are identical in TypeScript (`z.infer`).

## 1. Shared types

```ts
type TargetPlatform = 'chatgpt' | 'claude' | 'gemini';      // how the prompt is written
type Length         = 'concise' | 'balanced' | 'detailed';
type Tone           = 'neutral' | 'friendly' | 'professional' | 'direct' | 'playful';
type TransformAction = 'improve' | 'shorten' | 'expand' | 'tone';
// 'regenerate' is not a transform: it re-calls /api/generate with the original inputs.

type Engine =
  | { kind: 'ai'; gateway: 'openrouter'; model: string }   // provisional, see §2

  | { kind: 'basic' };

interface ClarifyingQuestion {
  id: string;                 // stable within a response, e.g. "q1"
  question: string;           // ≤ 140 chars, plain sentence
  why?: string;               // ≤ 100 chars, shown as a muted hint
  suggestions: string[];      // 0–4 short answer chips, each ≤ 40 chars
}

interface Answer { questionId: string; question: string; answer: string } // skipped = omitted

interface GenerationInput {
  idea: string;               // 1–4000 chars, trimmed
  target: TargetPlatform;
  length: Length;
  answers: Answer[];          // 0–4
}
// v1.2: `preferredProvider` was removed; unknown fields are stripped by validation.
```

## 2. `GET /api/providers`

Reports whether AI is available to this visitor and the auth status. It never includes keys, tokens or
user details. Revised with auth (v1.2): there are no owner-funded AI keys and no provider list.

> **Provisional.** The `ai.gateway` / `ai.status` shape below reflects the earlier "user's own
> OpenRouter key" plan. The product owner has since changed the AI plan (owner's free-tier Gemini key
> only), and the lead will revise this section. `auth` and `mode` are expected to stay.

```ts
// 200
interface AiStatusResponse {
  mode: 'basic' | 'ai';            // 'basic' unless ai.status === 'ready' (always 'basic' in this build)
  ai: {
    gateway: 'openrouter';         // provisional, see note
    status: 'unavailable' | 'sign-in-required' | 'key-required' | 'ready'; // 'unavailable' in this build
    message: string;               // user-facing explanation
  };
  auth: {
    configured: boolean;           // Supabase Auth is configured on this server
    signedIn: boolean;             // the request's session verified on the server (getClaims)
  };
}
```

## 2a. `GET /api/session`

The verified user for this request, from the access token's verified claims (`getClaims()`), or null.
Signed out, expired and forged sessions all read as `user: null`. Never returns tokens.
`Cache-Control: private, no-store`.

```ts
interface AuthUser { id: string; email: string | null; name: string | null; avatarUrl: string | null }
// 200
interface SessionResponse { configured: boolean; user: AuthUser | null }
```

### Basic Mode behaviour (Phase 2)

- `/api/clarify`: questions come from the local engine (task-type detection plus fixed question banks,
  skipping anything the idea already answers); `engine: { kind: 'basic' }`.
- `/api/generate`: the stream is `meta` (engine basic), **one** `delta` with the whole text, then
  `done`. The template is instant, so there is no artificial typing delay.
- `/api/transform`: `401 auth_required` when signed out; `409 ai_required` for a signed-in user (improve, shorten, expand and tone). Regenerate goes through
  `/api/generate` and is deterministic: the same idea, answers and settings give the same text.

## 3. `POST /api/clarify`

Request: `ClarifyRequest = Omit<GenerationInput, 'answers'>`

```ts
// 200
interface ClarifyResponse {
  questions: ClarifyingQuestion[];   // 0–4; [] means "specific enough, generate directly"
  engine: Engine;
}
```

The server tries one repair retry on invalid model output, then falls back to the next provider. If all
providers fail it returns an error (§5). It never returns a Basic Mode result when AI providers are
configured.

## 4. Streaming routes (NDJSON)

`Content-Type: application/x-ndjson; charset=utf-8`. Each line is one JSON `StreamEvent`:

```ts
type StreamEvent =
  | { type: 'meta';  engine: Engine; requestId: string }      // always first line
  | { type: 'delta'; text: string }                           // 0..n
  | { type: 'done';  text: string; title?: string;            // full final text; title on generate only
      usage?: { inputTokens?: number; outputTokens?: number } }
  | { type: 'error'; error: ApiError };                       // terminal; replaces 'done'
```

Rules:
- Exactly one terminal event (`done` or `error`), always last.
- `meta.engine` reflects the provider that actually produced the text. Any fallback happens before
  `meta` is sent.
- The client must treat `done.text` as authoritative, not the concatenated deltas.
- If the client aborts, the server cancels the provider request.

### `POST /api/generate`

Request: `GenerateRequest = GenerationInput`. Used for both Generate and Regenerate.

### `POST /api/transform`

```ts
interface TransformRequest {
  action: TransformAction;
  text: string;              // current editor content, 1–20000 chars
  target: TargetPlatform;
  length: Length;            // informs Shorten/Expand budgets
  tone?: Tone;               // required iff action === 'tone'
  idea?: string;             // original idea, for context
}
```

`/api/transform` is the only AI-only route. It calls `guardAiRoute` first: signed out (or expired,
forged, or auth not configured) → `401 auth_required` ("Sign in with Google to use AI features."),
before body validation. A signed-in user gets the usual validation, then in Basic Mode
`409 { error: { code: 'ai_required', … } }`; the UI keeps these actions disabled.

## 5. Errors

Non-stream errors use HTTP status + body `{ error: ApiError }`. Stream errors use an `error` event.

```ts
interface ApiError {
  code:
    | 'invalid_request'      // 400, Zod failure; `issues` included (413 for an oversize body, 403 for a cross-origin sign-out)
    | 'auth_required'        // 401, AI route without a verified session
    | 'ai_required'          // 409, action needs a configured provider
    | 'rate_limited'         // 429, per-IP or per-user window; `retryAfterSec` + `Retry-After` header
    | 'too_many_concurrent'  // 429, already 2 requests in flight for this user (per IP when signed out)
    | 'provider_unavailable' // 502, all providers failed (network/5xx/auth/timeout)
    | 'invalid_output'       // 502, model output failed validation after repair and fallback
    | 'internal';            // 500
  message: string;           // user-facing, specific, no provider internals
  retryAfterSec?: number;
  issues?: { path: string; message: string }[];
}
```

### Limits (all API routes)

| Limit | Applies to | Default | Error |
| --- | --- | --- | --- |
| Body size | every POST | 64 KB | 413 `invalid_request` |
| Per IP | clarify, generate, transform | `RATE_LIMIT_PER_MINUTE` = 30/min | 429 `rate_limited` |
| Per verified user | transform; clarify and generate when signed in | `RATE_LIMIT_PER_USER_PER_MINUTE` = 20/min | 429 `rate_limited` |
| In flight | all three; per user, per IP when signed out | 2 | 429 `too_many_concurrent`: "You already have 2 requests running. Wait for one to finish." |

Limits are in-memory per server instance (best-effort). A concurrency slot is released when the
response completes, errors, or the client aborts.

## 6. Client storage contract (IndexedDB `prompthub` v1)

```ts
interface PromptRecord {
  id: string;                // uuid
  title: string;
  idea: string;
  target: TargetPlatform;
  length: Length;
  answers: Answer[];
  currentVersionId: string;
  createdAt: number;         // epoch ms
  updatedAt: number;
  deletedAt: number | null;
}

type VersionSource =
  | 'generated' | 'regenerated' | 'improved' | 'shortened' | 'expanded' | 'tone' | 'edited' | 'restored';

interface VersionRecord {
  id: string;
  promptId: string;
  content: string;
  source: VersionSource;
  partial?: boolean;         // true when the stream was stopped before 'done' (added v1.1)
  tone?: Tone;               // when source === 'tone'
  restoredFrom?: string;     // version id, when source === 'restored'
  engine: Engine | { kind: 'manual' };
  createdAt: number;
}
```

Schema migrations bump the DB version and must have an `upgrade` path plus a test that seeds v(n-1)
data.

## 7. Auth routes (not under `/api`)

- `GET /auth/callback?code=…&next=…`: OAuth (PKCE) return leg. Exchanges the code
  (`exchangeCodeForSession`), sets session cookies, 303 to `next`. `next` must be a same-origin path
  (one leading `/`, no `//`, no backslash, no control characters); anything else becomes `/`. On
  failure, 303 to `/?auth_error=<code>` with `code` ∈ `missing_code | exchange_failed | access_denied |
  provider_error | not_configured`. The UI maps codes to fixed messages and never reflects query text.
- `POST /auth/signout`: POST only (405 otherwise). Same-origin only (`Origin` must match, or
  `Sec-Fetch-Site: same-origin` when `Origin` is absent), else 403. Signs out this browser
  (`scope: 'local'`), clears `sb-*-auth-token` cookies, then 303 to `/`, or `200 { signedOut: true }`
  with `Accept: application/json`.
- `/account`: page. Redirects to `/?signin=required` without a verified session.
