/**
 * Shared API contracts (docs/API_CONTRACTS.md). Lead-owned and frozen:
 * change this file and the doc together, with lead sign-off.
 */
import { z } from "zod";

export const TargetPlatform = z.enum(["chatgpt", "claude", "gemini"]);
export const ProviderId = z.enum(["openai", "anthropic", "google"]);
export const Length = z.enum(["concise", "balanced", "detailed"]);
export const Tone = z.enum(["neutral", "friendly", "professional", "direct", "playful"]);
export const TransformAction = z.enum(["improve", "shorten", "expand", "tone"]);

export const Engine = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ai"),
    provider: ProviderId,
    model: z.string(),
    fellBackFrom: z.array(ProviderId).optional(),
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
  preferredProvider: ProviderId.optional(),
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
    preferredProvider: ProviderId.optional(),
  })
  .refine((r) => (r.action === "tone") === (r.tone !== undefined), {
    message: "tone is required when action is 'tone', and only then",
    path: ["tone"],
  });

export const ProvidersResponse = z.object({
  mode: z.enum(["ai", "basic"]),
  providers: z.array(z.object({ id: ProviderId, label: z.string(), model: z.string() })),
  default: ProviderId.nullable(),
  /**
   * Providers whose API key is present in the server environment but which this build cannot use
   * (no adapter yet, Phase 2). Lets the UI say "keys found, AI not connected yet" instead of
   * "no provider set up". Never contains key values.
   */
  detected: z.array(ProviderId).default([]),
});

export const ClarifyResponse = z.object({
  questions: z.array(ClarifyingQuestion).max(4),
  engine: Engine,
});

export const ApiErrorCode = z.enum([
  "invalid_request",
  "ai_required",
  "rate_limited",
  "provider_unavailable",
  "invalid_output",
  "internal",
]);

export const ApiError = z.object({
  code: ApiErrorCode,
  message: z.string(),
  retryAfterSec: z.number().int().nonnegative().optional(),
  attempted: z.array(ProviderId).optional(),
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
