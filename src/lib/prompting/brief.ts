import type { Length, TargetPlatform, Tone } from "@/lib/contracts";

/**
 * The structured, target-neutral description of what the user wants.
 * Every target profile renders the same brief; none may drop or alter a field's meaning.
 * In AI mode the model fills this in from the rough idea and answers; in Basic Mode a
 * heuristic does. Profiles never invent content that isn't in the brief.
 */
export type TaskCategory =
  | "coding"
  | "research"
  | "creative"
  | "brainstorm"
  | "analysis"
  | "planning"
  | "productivity"
  | "general";

/**
 * How the model may use supplied material relative to its own knowledge.
 * - material-only:  restrict to the material (only when the user asks for it)
 * - material-first: base the answer on the material; flag anything from outside it
 * - material-plus:  combine the material with the model's own knowledge and research
 * - open:           the material is a starting point; free exploration is welcome
 * Without material, no source rule is emitted at all.
 */
export type SourcePolicy = "material-only" | "material-first" | "material-plus" | "open";

export interface BriefItem {
  text: string;
  /** Why it matters, in the user's terms. Rendered by profiles that document motivation (Claude). */
  reason?: string;
}

export interface TermDefinition {
  term: string;
  meaning: string;
}

export interface PromptBrief {
  category: TaskCategory;
  /** Imperative task in the user's words, without trailing period: "Write a cold email to my landlord…" */
  task: string;
  /** What the result is for, as a clause that reads after "so that": "I can shortlist systems". */
  goal?: string;
  /** Specific expertise or voice that changes the answer. Never a generic "helpful assistant". */
  role?: string;
  audience?: string;
  /** Background facts the model needs. */
  context: string[];
  /** Things the output must do or contain. */
  requirements: BriefItem[];
  /** Whether requirement order matters (renders as numbered steps). */
  ordered?: boolean;
  /** Limits: what to stay within or avoid. */
  constraints: BriefItem[];
  /** Ambiguous terms and what the user means by them. */
  definitions?: TermDefinition[];
  /** Deliverable shape: "a single email with a subject line", "a Markdown table". */
  outputFormat: string;
  /** True when the user wants flowing prose rather than lists. */
  prose?: boolean;
  /** User-supplied examples only. Never generated. */
  examples?: string[];
  /** Long pasted source material (documents, data, code). */
  material?: { label: string; content: string }[];
  /** Explicit source rule from the user. When absent, derived from the category (see shared.sourcePolicy). */
  sourcePolicy?: SourcePolicy;
  /** The task depends on current information (prices, news, availability, schedules). */
  recencySensitive?: boolean;
  /** The user explicitly asked to see reasoning or working. */
  wantsVisibleReasoning?: boolean;
  tone: Tone;
  length: Length;
}

export interface RenderOptions {
  /** ISO date (YYYY-MM-DD) for profiles that state today's date on recency-sensitive tasks. */
  today: string;
}

export interface TargetProfile {
  id: TargetPlatform;
  label: string;
  /** One delimiter family per prompt (Google: "use it consistently"). */
  delimiter: "markdown" | "xml";
  /** Order used when long material is present. */
  longMaterialOrder: "instructions-first" | "material-first";
  /** Short guidance passed to the AI writer in Phase 3 so model output follows the same profile. */
  guidance: string[];
  render(brief: PromptBrief, options: RenderOptions): string;
}
