import type { z } from "zod";
import type * as S from "./schemas";

export type TargetPlatform = z.infer<typeof S.TargetPlatform>;
export type ProviderId = z.infer<typeof S.ProviderId>;
export type Length = z.infer<typeof S.Length>;
export type Tone = z.infer<typeof S.Tone>;
export type TransformAction = z.infer<typeof S.TransformAction>;
export type Engine = z.infer<typeof S.Engine>;
export type ClarifyingQuestion = z.infer<typeof S.ClarifyingQuestion>;
export type Answer = z.infer<typeof S.Answer>;
export type GenerationInput = z.infer<typeof S.GenerationInput>;
export type ClarifyRequest = z.infer<typeof S.ClarifyRequest>;
export type GenerateRequest = z.infer<typeof S.GenerateRequest>;
export type TransformRequest = z.infer<typeof S.TransformRequest>;
export type ProvidersResponse = z.infer<typeof S.ProvidersResponse>;
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
