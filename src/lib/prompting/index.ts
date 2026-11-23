import type { TargetPlatform } from "@/lib/contracts";
import type { PromptBrief, RenderOptions, TargetProfile } from "./brief";
import { chatgptProfile } from "./profiles/chatgpt";
import { claudeProfile } from "./profiles/claude";
import { geminiProfile } from "./profiles/gemini";

export type { PromptBrief, RenderOptions, TargetProfile, TaskCategory, BriefItem } from "./brief";

export const PROFILES: Record<TargetPlatform, TargetProfile> = {
  chatgpt: chatgptProfile,
  claude: claudeProfile,
  gemini: geminiProfile,
};

export function renderPrompt(target: TargetPlatform, brief: PromptBrief, options: RenderOptions): string {
  return PROFILES[target].render(brief, options);
}
