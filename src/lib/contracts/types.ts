import type { z } from "zod";
import type * as S from "./schemas";

export type TargetPlatform = z.infer<typeof S.TargetPlatform>;
export type AiProvider = z.infer<typeof S.AiProvider>;
export type AiTier = z.infer<typeof S.AiTier>;
export type Length = z.infer<typeof S.Length>;
export type Tone = z.infer<typeof S.Tone>;
export type TransformAction = z.infer<typeof S.TransformAction>;
export type TaskType = z.infer<typeof S.TaskType>;
export type EngineRequest = z.infer<typeof S.EngineRequest>;
export type AiLimitsBasis = z.infer<typeof S.AiLimitsBasis>;
export type UsageCount = z.infer<typeof S.UsageCount>;
export type Engine = z.infer<typeof S.Engine>;
export type ClarifyingQuestion = z.infer<typeof S.ClarifyingQuestion>;
export type Answer = z.infer<typeof S.Answer>;
export type GenerationInput = z.infer<typeof S.GenerationInput>;
export type ClarifyRequest = z.infer<typeof S.ClarifyRequest>;
export type GenerateRequest = z.infer<typeof S.GenerateRequest>;
export type TransformRequest = z.infer<typeof S.TransformRequest>;
export type AiStatus = z.infer<typeof S.AiStatus>;
export type AiStatusResponse = z.infer<typeof S.AiStatusResponse>;
export type AuthUser = z.infer<typeof S.AuthUser>;
export type SessionResponse = z.infer<typeof S.SessionResponse>;
export type ClarifyResponse = z.infer<typeof S.ClarifyResponse>;
export type ApiErrorCode = z.infer<typeof S.ApiErrorCode>;
export type ApiError = z.infer<typeof S.ApiError>;
export type StreamEvent = z.infer<typeof S.StreamEvent>;
export type VersionSource = z.infer<typeof S.VersionSource>;
export type PromptRecord = z.infer<typeof S.PromptRecord>;
export type VersionRecord = z.infer<typeof S.VersionRecord>;

export const TARGET_LABELS: Record<TargetPlatform, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
};

export const LENGTH_LABELS: Record<Length, string> = {
  concise: "Concise",
  balanced: "Balanced",
  detailed: "Detailed",
};

export const TONE_LABELS: Record<Tone, string> = {
  neutral: "Neutral",
  friendly: "Friendly",
  professional: "Professional",
  direct: "Direct",
  playful: "Playful",
};
