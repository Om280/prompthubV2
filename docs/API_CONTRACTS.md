# PromptHub — API Contracts

Status: Phase 0, **frozen**; revised for auth (v1.2) and the Gemini free-tier AI plan with persistent quotas (v1.3), lead-authorised. Changes require
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

// AI is Google Gemini on its free tier only, with the app owner's server-side key. No other provider,
// no paid tier, no fallback.
type Engine =
  | { kind: 'ai'; provider: 'gemini'; tier: 'free'; model: string }   // model from the free-tier allowlist
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
  requestId?: string;         // v1.3: client-generated UUID per request; REQUIRED for AI requests
  workflowId?: string;        // v1.3: client-generated UUID per idea; REQUIRED for AI clarify/generate
}
// v1.2: `preferredProvider` was removed; unknown fields are stripped by validation.
// requestId: a retry with the same id is never counted twice against any quota.
// workflowId: the clarify and generate calls of one idea share it and count as ONE daily workflow.
```

## 2. `GET /api/providers`

Reports whether AI is available to this visitor, plus the auth status. It never includes keys, tokens
or user details. The model id may be shown.

```ts
// 200
interface AiStatusResponse {
  mode: 'basic' | 'ai';            // 'ai' only when ai.status === 'ready'
  ai: {
    provider: 'gemini';
    tier: 'free';
    model: string | null;          // GEMINI_MODEL when it is on the free-tier allowlist, else null
    status:
      | 'unavailable'              // AI generation not built yet (this build), or AI_ENABLED=false
      | 'not-configured'           // missing/invalid GEMINI_API_KEY, GEMINI_MODEL, quota store
                                   //   (Supabase + SUPABASE_SECRET_KEY) or GEMINI_PROJECT_RPM/TPM/RPD
      | 'sign-in-required'         // AI ready, visitor signed out
      | 'ready'
      | 'quota-exhausted';         // app-wide daily ceiling reached
    message: string;               // user-facing; for not-configured it names what's missing
    resetsAt?: string;             // ISO; next midnight America/Los_Angeles (quota-exhausted)
  };
  auth: {
    configured: boolean;           // Supabase Auth is configured on this server
    signedIn: boolean;             // the request's session verified on the server (getClaims)
  };
}
```

This build: `mode: 'basic'`; status `'unavailable'` ("AI generation with Gemini is coming in a later
update.") when fully configured, else `'not-configured'`. `AI_ENABLED=false` → `'unavailable'` ("AI is
turned off on this server right now. Basic Mode still works.").

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

With AI (later phase), the server tries one repair retry on invalid model output; there is no fallback
to another model, provider or tier. A failure returns an error (§5). It never returns a Basic Mode
result for a request that asked for AI.

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
- `meta.engine` reflects the engine that actually produced the text (Basic Mode, or Gemini free tier).
- The client must treat `done.text` as authoritative, not the concatenated deltas.
- If the client aborts, the server cancels the Gemini request (`AbortSignal`, plus `AI_TIMEOUT_MS`).

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
  requestId?: string;        // v1.3: client-generated UUID; required once AI runs
}
```

`/api/transform` is the only AI-only route. It calls `guardAiRoute`, in this order:

1. no verified session (signed out, expired, forged, or auth not configured) → `401 auth_required`
   ("Sign in with Google to use AI features."), before the body is read;
2. body validation → `400 invalid_request`;
3. AI not ready (not built, switched off, or not configured) → `409 ai_required`. **This build always
   stops here for signed-in users**, and nothing is consumed; the UI keeps these actions disabled;
4. `requestId` missing or not a UUID, or idea + answers + prompt text over `AI_MAX_INPUT_CHARS`
   (20,000) → `400 invalid_request`;
5. in-flight lease and quotas (§5, AI limits).

## 5. Errors

Non-stream errors use HTTP status + body `{ error: ApiError }`. Stream errors use an `error` event.

```ts
interface ApiError {
  code:
    | 'invalid_request'      // 400, Zod failure; `issues` included (413 for an oversize body, 403 for a cross-origin sign-out)
    | 'auth_required'        // 401, AI route without a verified session
    | 'ai_required'          // 409, AI isn't available (not built, switched off or not configured)
    | 'duplicate_request'    // 409, this requestId (or an identical request) is already running
    | 'rate_limited'         // 429, a per-minute window (user, IP, or app-wide RPM/TPM ceiling)
    | 'too_many_concurrent'  // 429, AI: 1 request in flight per user; Basic Mode: 2 per user/IP
    | 'user_daily_limit'     // 429, daily workflows (5) or refinements (5) used; `resetsAt`
    | 'daily_budget_exhausted' // 503, app-wide daily ceiling (70% of project RPD) reached; `resetsAt`
    | 'quota_exhausted'      // 503, Google answered 429 RESOURCE_EXHAUSTED; `resetsAt`; no retry, no fallback
    | 'provider_unavailable' // 502, Gemini failed (network/5xx/permission/timeout); no fallback
    | 'invalid_output'       // 502, model output failed validation after one repair retry
    | 'internal';            // 500 (also: quota store unreachable, failing closed)
  message: string;           // user-facing, specific, no provider internals
  retryAfterSec?: number;    // also sent as Retry-After on 429/503
  resetsAt?: string;         // ISO time the limit resets (daily limits: next midnight America/Los_Angeles)
  issues?: { path: string; message: string }[];
}
// Every AI limit message says that Basic Mode still works and the user's draft is kept.
```

### Basic Mode limits (public routes; in-memory, never touch Gemini)

| Limit | Applies to | Default | Error |
| --- | --- | --- | --- |
| Body size | every POST | 64 KB | 413 `invalid_request` |
| Per IP | clarify, generate | `RATE_LIMIT_PER_MINUTE` = 30/min | 429 `rate_limited` |
| In flight | clarify, generate; per user, per IP when signed out | 2 | 429 `too_many_concurrent` |

### AI limits (persistent and atomic in Supabase; `supabase/migrations/0001_ai_quota.sql`)

All are configurable through env (Zod-validated). Consumption is all-or-nothing across windows and
idempotent per `requestId`. Day windows reset at midnight America/Los_Angeles.

| Bucket | Limit (env, default) | Error |
| --- | --- | --- |
| `user:<id>:workflows:day` | new prompt workflows (clarify + generate of one `workflowId` = 1), `AI_USER_DAILY_WORKFLOWS` = 5 | 429 `user_daily_limit` |
| `user:<id>:refinements:day` | improve, shorten, expand, tone, regenerate, `AI_USER_DAILY_REFINEMENTS` = 5 | 429 `user_daily_limit` |
| `user:<id>:min` | `AI_USER_PER_MINUTE` = 3 | 429 `rate_limited` |
| `ip:<ip>:min` | `AI_IP_PER_MINUTE` = 10 | 429 `rate_limited` |
| `global:rpm`, `global:tpm` | `AI_GLOBAL_SAFETY_RATIO` (0.7) × `GEMINI_PROJECT_RPM` / `_TPM` (no defaults) | 429 `rate_limited` |
| `global:rpd` | 0.7 × `GEMINI_PROJECT_RPD` (no default) | 503 `daily_budget_exhausted` |
| in-flight lease | `AI_MAX_CONCURRENT_PER_USER` = 1, TTL `AI_INFLIGHT_TTL_SECONDS` = 120 | 429 `too_many_concurrent` / 409 `duplicate_request` |
| input | idea + answers + prompt text ≤ `AI_MAX_INPUT_CHARS` = 20,000 | 400 `invalid_request` |

TPM is charged with an estimate at reservation (input characters ÷ 4 + `AI_MAX_OUTPUT_TOKENS`) and
reconciled with the actual token count after the call. Usage records (`ai_usage`) hold tokens, op,
model, status and duration, never prompt text. `AI_TIMEOUT_MS` (30 s) bounds each Gemini call, and the
call is also cancelled when the client aborts.

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
