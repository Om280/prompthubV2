/**
 * Shared API contracts (docs/API_CONTRACTS.md). Lead-owned and frozen:
 * change this file and the doc together, with lead sign-off.
 */
import { z } from "zod";

export const TargetPlatform = z.enum(["chatgpt", "claude", "gemini"]);
/**
 * The only AI provider: Google Gemini, on the free tier only, with the app owner's single server-side
 * key. No other provider, no paid tier, no fallback.
 */
export const AiProvider = z.literal("gemini");
export const AiTier = z.literal("free");
export const Length = z.enum(["concise", "balanced", "detailed"]);
export const Tone = z.enum(["neutral", "friendly", "professional", "direct", "playful"]);
export const TransformAction = z.enum(["improve", "shorten", "expand", "tone"]);
/** v1.4: task kind detected for an idea (same values as the prompting brief's `category`). */
export const TaskType = z.enum(["coding", "research", "creative", "brainstorm", "analysis", "planning", "productivity", "general"]);
/**
 * v1.4: the engine the client asks for on clarify/generate. Absent or "basic" → Basic Mode (public).
 * "ai" → Gemini free tier; it needs a verified session and AI ready, and it never falls back to
 * Basic Mode (a failure is an error).
 */
export const EngineRequest = z.enum(["ai", "basic"]);

export const Engine = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ai"),
    provider: AiProvider,
    tier: AiTier,
    /** Gemini model id from the free-tier allowlist, e.g. "gemini-3.5-flash-lite". */
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

/**
 * Client-generated id of one AI request (UUID). A retry with the same id is never counted twice
 * against any quota. Optional for Basic Mode; AI requests must send it.
 */
export const RequestId = z.uuid();
/**
 * Client-generated id of one prompt workflow (UUID): the clarify call and the generate call for the
 * same idea share it, so they count as one workflow against the daily limit.
 */
export const WorkflowId = z.uuid();

export const GenerationInput = z.object({
  idea: z.string().trim().min(1).max(4000),
  target: TargetPlatform,
  length: Length,
  answers: z.array(Answer).max(4),
  requestId: RequestId.optional(),
  workflowId: WorkflowId.optional(),
  /** v1.4, see `EngineRequest`. */
  engine: EngineRequest.optional(),
  /** v1.4: true when this generate call is a Regenerate (counted as a refinement, not a workflow). */
  regenerate: z.boolean().optional(),
});

export const ClarifyRequest = GenerationInput.omit({ answers: true, regenerate: true });
export const GenerateRequest = GenerationInput;

export const TransformRequest = z
  .object({
    action: TransformAction,
    text: z.string().min(1).max(20000),
    target: TargetPlatform,
    length: Length,
    tone: Tone.optional(),
    idea: z.string().max(4000).optional(),
    requestId: RequestId.optional(),
  })
  .refine((r) => (r.action === "tone") === (r.tone !== undefined), {
    message: "tone is required when action is 'tone', and only then",
    path: ["tone"],
  });

/**
 * Why AI is or isn't available to this visitor:
 * - `unavailable`: this build has no AI generation yet (Phase 3);
 * - `not-configured`: the server's Gemini key, model, or quota store is missing or invalid;
 * - `sign-in-required`: AI is available but the visitor isn't signed in;
 * - `ready`: signed in and AI can run;
 * - `quota-exhausted`: the app-wide free-tier budget is used up until `resetsAt`.
 */
export const AiStatus = z.enum(["unavailable", "not-configured", "sign-in-required", "ready", "quota-exhausted"]);

/**
 * v1.4: where the app-wide request ceilings come from.
 * - `project-ratio`: AI_GLOBAL_SAFETY_RATIO × the supplied GEMINI_PROJECT_RPM/TPM/RPD;
 * - `conservative-defaults`: project limits not supplied, so AI_GLOBAL_RPM/TPM/RPD (defaults 5/100000/100);
 * - `mixed`: some project limits supplied, the rest from the conservative defaults.
 */
export const AiLimitsBasis = z.enum(["project-ratio", "conservative-defaults", "mixed"]);

/** v1.4: one daily allowance for the signed-in user. */
export const UsageCount = z.object({
  used: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  remaining: z.number().int().nonnegative(),
});

/** GET /api/providers */
export const AiStatusResponse = z.object({
  /** 'basic' unless `ai.status` is 'ready'. */
  mode: z.enum(["basic", "ai"]),
  ai: z.object({
    provider: AiProvider,
    tier: AiTier,
    /** The configured Gemini model id when it is on the free-tier allowlist, else null. Never the key. */
    model: z.string().nullable(),
    status: AiStatus,
    /** User-facing explanation of `status`. */
    message: z.string(),
    /** ISO time of the next quota reset (midnight America/Los_Angeles), when relevant. */
    resetsAt: z.string().optional(),
    /** v1.4: which app-wide ceilings apply. Present when AI is configured. */
    limits: z.object({ basis: AiLimitsBasis, description: z.string() }).optional(),
  }),
  /**
   * v1.4: the signed-in user's AI allowance today, read through the user's own RLS-protected
   * session (never the secret key). Absent when signed out, AI isn't ready, or it can't be read.
   */
  usage: z.object({ workflows: UsageCount, refinements: UsageCount, resetsAt: z.string() }).optional(),
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
  /** v1.4: the detected task kind (AI clarify sets it; Basic Mode omits it). */
  taskType: TaskType.optional(),
});

export const ApiErrorCode = z.enum([
  "invalid_request",
  "auth_required",
  "ai_required",
  "rate_limited",
  "too_many_concurrent",
  "quota_exhausted",
  "user_daily_limit",
  "daily_budget_exhausted",
  "duplicate_request",
  "provider_unavailable",
  "invalid_output",
  "internal",
]);

export const ApiError = z.object({
  code: ApiErrorCode,
  message: z.string(),
  retryAfterSec: z.number().int().nonnegative().optional(),
  /** ISO time when a quota or budget resets (quota_exhausted, daily limits). */
  resetsAt: z.string().optional(),
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
    /** v1.4: true when Gemini hit its output-token limit, so `text` is incomplete (a partial result). */
    truncated: z.boolean().optional(),
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
