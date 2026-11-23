# PromptHub — API Contracts

Status: Phase 0, **frozen**. Changes require lead sign-off and must be made in
`src/lib/contracts/schemas.ts` and this file in the same change.

All routes run on the Node.js runtime (the default; with `cacheComponents: true` Next 16 disallows a `runtime` export, so none is declared) and are same-origin. Request bodies are JSON (≤ 64 KB) and are validated
with the Zod schemas named below. Field names are identical in TypeScript (`z.infer`).

## 1. Shared types

```ts
type TargetPlatform = 'chatgpt' | 'claude' | 'gemini';      // how the prompt is written
type ProviderId     = 'openai' | 'anthropic' | 'google';     // who writes it
type Length         = 'concise' | 'balanced' | 'detailed';
type Tone           = 'neutral' | 'friendly' | 'professional' | 'direct' | 'playful';
type TransformAction = 'improve' | 'shorten' | 'expand' | 'tone';
// 'regenerate' is not a transform: it re-calls /api/generate with the original inputs.

type Engine =
  | { kind: 'ai'; provider: ProviderId; model: string; fellBackFrom?: ProviderId[] }
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
  preferredProvider?: ProviderId;
}
```

## 2. `GET /api/providers`

Reports which engines are available. It never includes keys or key fragments.

```ts
// 200
interface ProvidersResponse {
  mode: 'ai' | 'basic';                     // 'basic' iff providers.length === 0
  providers: { id: ProviderId; label: string; model: string }[];  // configured only, in fallback order
  default: ProviderId | null;
  detected: ProviderId[];   // v1.1: keys present but provider not usable by this build (Phase 2); [] otherwise
}
```

Phase 2 note: no provider adapters exist yet, so `mode` is always `'basic'`. `detected` lists keys that
were found, so the UI can say AI isn't connected in this build rather than claiming no key is set.

### Basic Mode behaviour (Phase 2)

- `/api/clarify`: questions come from the local engine (task-type detection plus fixed question banks,
  skipping anything the idea already answers); `engine: { kind: 'basic' }`.
- `/api/generate`: the stream is `meta` (engine basic), **one** `delta` with the whole text, then
  `done`. The template is instant, so there is no artificial typing delay.
- `/api/transform`: `409 ai_required` for improve, shorten, expand and tone. Regenerate goes through
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
  preferredProvider?: ProviderId;
}
```

In Basic Mode `/api/transform` returns `409 { error: { code: 'ai_required', … } }` and the UI keeps
these actions disabled.

## 5. Errors

Non-stream errors use HTTP status + body `{ error: ApiError }`. Stream errors use an `error` event.

```ts
interface ApiError {
  code:
    | 'invalid_request'      // 400, Zod failure; `issues` included
    | 'ai_required'          // 409, action needs a configured provider
    | 'rate_limited'         // 429, our limiter, or every provider rate-limited; `retryAfterSec`
    | 'provider_unavailable' // 502, all providers failed (network/5xx/auth/timeout)
    | 'invalid_output'       // 502, model output failed validation after repair and fallback
    | 'internal';            // 500
  message: string;           // user-facing, specific, no provider internals
  retryAfterSec?: number;
  attempted?: ProviderId[];  // providers tried, in order
  issues?: { path: string; message: string }[];
}
```

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
