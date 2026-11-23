/**
 * Shared API contracts (docs/API_CONTRACTS.md). Lead-owned and frozen:
 * change this file and the doc together, with lead sign-off.
 */
import { z } from "zod";

export const TargetPlatform = z.enum(["chatgpt", "claude", "gemini"]);
/** The only AI gateway. Each signed-in user brings their own OpenRouter key (never the owner's). */
export const AiGateway = z.literal("openrouter");
export const Length = z.enum(["concise", "balanced", "detailed"]);
export const Tone = z.enum(["neutral", "friendly", "professional", "direct", "playful"]);
export const TransformAction = z.enum(["improve", "shorten", "expand", "tone"]);

export const Engine = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ai"),
    gateway: AiGateway,
    /** OpenRouter model id, e.g. "anthropic/claude-sonnet-5.5". */
    model: z.string(),
  }),
  z.object({ kind: z.literal("basic") }),
]);

export const ClarifyingQuestion = z.object({
  id: z.string().min(1).max(16),
  question: z.string().min(1).max(140),
  why: z.string().max(100).optional(),
  suggestions: z.array(z.string().min(1).max(40)).max(4),
});

export const Answer = z.object({
  questionId: z.string().min(1).max(16),
  question: z.string().min(1).max(140),
  answer: z.string().trim().min(1).max(1000),
});

export const GenerationInput = z.object({
  idea: z.string().trim().min(1).max(4000),
  target: TargetPlatform,
  length: Length,
  answers: z.array(Answer).max(4),
});

export const ClarifyRequest = GenerationInput.omit({ answers: true });
export const GenerateRequest = GenerationInput;

export const TransformRequest = z
  .object({
    action: TransformAction,
    text: z.string().min(1).max(20000),
    target: TargetPlatform,
    length: Length,
    tone: Tone.optional(),
    idea: z.string().max(4000).optional(),
  })
  .refine((r) => (r.action === "tone") === (r.tone !== undefined), {
    message: "tone is required when action is 'tone', and only then",
    path: ["tone"],
  });

/**
 * Why AI is or isn't available to this visitor. AI runs only through the user's own OpenRouter key:
 * - `unavailable`: this build has no AI generation yet;
 * - `sign-in-required`: AI exists but the visitor isn't signed in;
 * - `key-required`: signed in, but no OpenRouter key is connected for this session;
 * - `ready`: signed in with a key.
 */
export const AiStatus = z.enum(["unavailable", "sign-in-required", "key-required", "ready"]);

/** GET /api/providers */
export const AiStatusResponse = z.object({
  /** 'basic' unless `ai.status` is 'ready'. */
  mode: z.enum(["basic", "ai"]),
  ai: z.object({
    gateway: AiGateway,
    status: AiStatus,
    /** User-facing explanation of `status`. */
    message: z.string(),
  }),
  auth: z.object({
    /** Supabase Auth is configured on this server, so sign-in can work. */
    configured: z.boolean(),
    /** The request carried a session that verified on the server. */
    signedIn: z.boolean(),
  }),
});

/** A verified user, read from the access token's verified claims (never from client-sent ids). */
export const AuthUser = z.object({
  id: z.string().min(1),
  email: z.string().nullable(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});

/** GET /api/session */
export const SessionResponse = z.object({
  configured: z.boolean(),
  user: AuthUser.nullable(),
});

export const ClarifyResponse = z.object({
  questions: z.array(ClarifyingQuestion).max(4),
  engine: Engine,
});

export const ApiErrorCode = z.enum([
  "invalid_request",
  "auth_required",
  "ai_required",
  "rate_limited",
  "too_many_concurrent",
  "provider_unavailable",
  "invalid_output",
  "internal",
]);

export const ApiError = z.object({
  code: ApiErrorCode,
  message: z.string(),
  retryAfterSec: z.number().int().nonnegative().optional(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});

export const StreamEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("meta"), engine: Engine, requestId: z.string() }),
  z.object({ type: z.literal("delta"), text: z.string() }),
  z.object({
    type: z.literal("done"),
    text: z.string(),
    title: z.string().optional(),
    usage: z
      .object({ inputTokens: z.number().optional(), outputTokens: z.number().optional() })
      .optional(),
  }),
  z.object({ type: z.literal("error"), error: ApiError }),
]);

/* ---- client storage (IndexedDB "prompthub" v1) ---- */

export const VersionSource = z.enum([
  "generated",
  "regenerated",
  "improved",
  "shortened",
  "expanded",
  "tone",
  "edited",
  "restored",
]);

export const PromptRecord = z.object({
  id: z.string(),
  title: z.string(),
  idea: z.string(),
  target: TargetPlatform,
  length: Length,
  answers: z.array(Answer),
  currentVersionId: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().nullable(),
});

export const VersionRecord = z.object({
  id: z.string(),
  promptId: z.string(),
  content: z.string(),
  source: VersionSource,
  partial: z.boolean().optional(),
  tone: Tone.optional(),
  restoredFrom: z.string().optional(),
  engine: z.union([Engine, z.object({ kind: z.literal("manual") })]),
  createdAt: z.number(),
});
