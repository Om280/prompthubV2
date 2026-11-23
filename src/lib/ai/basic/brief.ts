/**
 * Basic Mode brief builder: (idea, answers, target, length, tone) → `PromptBrief`.
 * Deterministic. Uses only what the user wrote: the task keeps their words, answers fill the field
 * their question belongs to, pasted material is carried verbatim. Nothing is invented: unknown fields
 * stay empty, and the output format falls back to a neutral default per task kind.
 */
import type { Answer, Length, TargetPlatform, Tone } from "@/lib/contracts";
import type { BriefItem, PromptBrief, TaskCategory } from "@/lib/prompting";
import { classifySplit, splitMaterial } from "./classify";
import { QUESTION_FIELDS, type QuestionId } from "./questions";
import { DECLINE_RE, explicitFormat, MATERIAL_ONLY_RE, RECENCY_RE, VISIBLE_REASONING_RE } from "./signals";

export interface BasicBriefInput {
  idea: string;
  answers: Answer[];
  target: TargetPlatform;
  length: Length;
  tone?: Tone;
}

/** Neutral deliverable shape when the user didn't name one. */
export const DEFAULT_OUTPUT_FORMAT: Record<TaskCategory, string> = {
  coding: "working code with a brief explanation",
  research: "a clear, well-organized answer",
  creative: "a complete piece of writing",
  brainstorm: "a list of ideas",
  analysis: "the key findings followed by a short conclusion",
  planning: "a plan with clear, ordered steps",
  productivity: "a ready-to-use draft",
  general: "a clear answer",
};

const CREATIVE_FORM_RE =
  /\b(short story|flash fiction|bedtime story|story|poem|haiku|limerick|sonnet|song lyrics|lyrics|song|screenplay|monologue|fable|fairy tale|rap verse|scene)\b/i;
const PRODUCTIVITY_FORM_RE =
  /\b(cover letter|email|e-mail|letter|memo|slack message|message|reply|linkedin post|announcement|proposal|resume|cv|job description|meeting agenda|agenda|status update|follow-up|invitation|checklist|template|to-do list)\b/i;

/** The deliverable the user named ("a short story", "an email, ready to send"), else null. */
function namedDeliverable(text: string, category: TaskCategory): string | null {
  if (category === "creative") {
    const m = text.match(CREATIVE_FORM_RE);
    return m ? withArticle(m[1].toLowerCase()) : null;
  }
  if (category === "productivity") {
    const m = text.match(PRODUCTIVITY_FORM_RE);
    if (!m) return null;
    const noun = m[1].toLowerCase() === "cv" ? "CV" : m[1].toLowerCase();
    return /^(email|e-mail|letter|cover letter|message|slack message|reply|memo|invitation|follow-up)$/.test(noun)
      ? `${withArticle(noun)}, ready to send`
      : `${withArticle(noun)}, ready to use`;
  }
  return null;
}

/** Verb used when the idea is a bare noun phrase ("email to my landlord about the boiler"). */
const NOUN_PHRASE_VERB: Record<TaskCategory, string> = {
  coding: "Write",
  research: "Research",
  creative: "Write",
  brainstorm: "Brainstorm",
  analysis: "Analyze",
  planning: "Plan",
  productivity: "Write",
  general: "Explain",
};

/** Imperative verbs a model can act on directly. */
const ACTION_VERBS = new Set(
  (
    "write create make build draft explain summarize summarise analyze analyse compare list plan design generate give " +
    "find research brainstorm come suggest fix debug refactor convert translate review rewrite improve edit outline " +
    "describe tell show teach prepare organize organise schedule calculate estimate implement code develop set add turn " +
    "check evaluate identify recommend propose name think figure decide optimize optimise test update clean extract sort " +
    "format compose reply respond answer proofread simplify shorten expand critique assess map break walk guide quiz solve " +
    "predict forecast classify categorize categorise rank rate choose pick select invent imagine act pretend roleplay simulate " +
    "sketch structure document parse scrape automate deploy migrate port benchmark validate verify transcribe paraphrase " +
    "polish reword rephrase condense define interpret investigate explore draw plot visualize visualise chart track " +
    "prioritize prioritise split merge combine filter count look search gather collect compile craft run setup put " +
    "write-up help get draft"
  ).split(" "),
);

/** Things the user does themselves; "I want to learn X" becomes a request for help doing it. */
const SELF_VERBS = new Set(
  "learn become start stop quit lose gain save move travel visit go understand train study practice practise buy sell get improve manage throw host celebrate".split(
    " ",
  ),
);

const GERUNDS: Record<string, string> = {
  writing: "write",
  making: "make",
  creating: "create",
  planning: "plan",
  building: "build",
  finding: "find",
  choosing: "choose",
  drafting: "draft",
  fixing: "fix",
  debugging: "debug",
  organizing: "organize",
  organising: "organise",
  preparing: "prepare",
  understanding: "understand",
  learning: "learn",
  getting: "get",
  figuring: "figure",
  coming: "come",
  thinking: "think",
  designing: "design",
  picking: "pick",
  deciding: "decide",
  naming: "name",
  analyzing: "analyze",
  analysing: "analyse",
  summarizing: "summarize",
  summarising: "summarise",
  rewriting: "rewrite",
  improving: "improve",
  editing: "edit",
};

const DETERMINER_RE =
  /^(a|an|the|my|our|your|his|her|their|some|this|that|these|those|any|each|every|several|few|many|more|\d+|one|two|three|four|five|six|seven|eight|nine|ten|twenty|ideas?|tips|ways)\b/i;

const STATEMENT_START_RE = /^(i|i'm|i've|we|we're|my|our|it|it's|this|that|there|there's|he|she|they|you)\b/i;
const FINITE_VERB_RE = /\b(is|are|was|were|won'?t|can'?t|doesn'?t|don'?t|isn'?t|aren'?t|keeps|has|have|had|seems|broke|stopped)\b/i;

const CONTEXT_STATEMENT_RE =
  /^(i have|i've got|i've|i got|we have|we've got|i'm|i am|we're|we are|my |our |here is|here's|this is|below is|attached is|context:|background:|fyi)/i;

const REQUIREMENT_RE = /\b(should|must|needs? to|has to|have to|make sure|ensure|include|including)\b/i;
const CONSTRAINT_START_RE =
  /^(don'?t|do not|avoid|never|no |without|only |keep it|max(imum)?\b|at most|under \d|less than|not more|nothing )/i;

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function stripTrailing(s: string): string {
  return s.trim().replace(/[\s.!?;:,]+$/, "");
}

function firstWord(s: string): string {
  return (s.match(/^[a-z'-]+/i)?.[0] ?? "").toLowerCase();
}

function withArticle(phrase: string): string {
  if (DETERMINER_RE.test(phrase) && !/^\d+-/.test(phrase)) return phrase;
  const w = firstWord(phrase);
  if (/[^s]s$/.test(w)) return phrase; // plural: "names for my bakery"
  return /^[aeiou]/i.test(phrase) && !/^(uni|use|one|eu)/i.test(phrase) ? `an ${phrase}` : `a ${phrase}`;
}

function stripPoliteness(s: string): { text: string; selfIntent: boolean } {
  let t = s.trim();
  let selfIntent = false;
  for (let i = 0; i < 4; i++) {
    const before = t;
    t = t.replace(/^(hi|hey|hello|yo|ok|okay|so|um+|hmm+)\b[,!.]?\s*/i, "");
    t = t.replace(/^(please|pls|plz|kindly)\b[,]?\s*/i, "");
    t = t.replace(/^(can|could|would|will) (you|u)( please| kindly)?\s+/i, "");
    t = t.replace(/^(i|we) (want|need|would like|wanna|'d like) (you|u) to\s+/i, "");
    t = t.replace(/^(i|we)'d like (you|u) to\s+/i, "");
    if (/^((i|we) (want|need|would like|wanna|have)|(i|we)'d like|i'm (trying|looking|hoping)|i am (trying|looking|hoping)) to\s+/i.test(t)) {
      t = t.replace(/^((i|we) (want|need|would like|wanna|have)|(i|we)'d like|i'm (trying|looking|hoping)|i am (trying|looking|hoping)) to\s+/i, "");
      selfIntent = true;
    }
    if (/^(help|assist) (me|us)( to)?\s+/i.test(t)) {
      t = t.replace(/^(help|assist) (me|us)( to)?\s+/i, "");
      selfIntent = true;
    }
    if (/^(i|we) need (some )?help (with )?/i.test(t)) {
      t = t.replace(/^(i|we) need (some )?help (with )?/i, "");
      selfIntent = true;
    }
    if (t === before) break;
  }
  t = t.replace(/,?\s+(please|pls|plz)(?=[\s.!?]*$)/i, "");
  return { text: t, selfIntent };
}

/** Turns the user's opening sentence into an imperative task, keeping their own words. */
export function toImperative(sentence: string, category: TaskCategory): string {
  const polite = stripPoliteness(sentence);
  const selfIntent = polite.selfIntent;
  let text = stripTrailing(polite.text);
  if (!text) return "";

  // Gerund after "help (with)": "writing a cover letter" → "write a cover letter".
  const g = firstWord(text);
  if (GERUNDS[g]) text = GERUNDS[g] + text.slice(g.length);

  // "I want a …" / "I need some …": the rest is a noun phrase.
  const want = text.match(/^(i|we) (want|need|would like|'d like)\s+(.+)$/i) ?? text.match(/^(i|we)'d like\s+(.+)$/i);
  if (want) text = want[want.length - 1];

  // Questions.
  let m: RegExpMatchArray | null;
  if ((m = text.match(/^how (?:do|can|should|would|could) (?:i|we|you|one)\s+(.+)$/i))) return `Explain how to ${m[1]}`;
  if ((m = text.match(/^how to\s+(.+)$/i))) return `Explain how to ${m[1]}`;
  if ((m = text.match(/^what(?:'s| is) the best way to\s+(.+)$/i))) return `Explain the best way to ${m[1]}`;
  if (
    /\?\s*$/.test(sentence) ||
    /^(what|what's|which|who|whom|where|when|why|how)\b/i.test(text) ||
    /^(is|are|was|were|does|do|did|should|can|could|would|will) (i|we|you|it|there|this|that|my|our|the|a|an)\b/i.test(text)
  ) {
    return `Answer this question: ${lowerFirstWord(text)}`;
  }

  if (/^with\s+/i.test(text)) return `Help ${text}`;

  const verb = firstWord(text);
  if (ACTION_VERBS.has(verb) && !(selfIntent && SELF_VERBS.has(verb))) return capitalize(text);

  if (selfIntent || SELF_VERBS.has(verb)) {
    const rest = lowerFirstWord(text);
    if (category === "planning") return `Make a plan to ${rest}`;
    if (category === "brainstorm") return `Suggest ways to ${rest}`;
    return `Explain how to ${rest}`;
  }

  if (STATEMENT_START_RE.test(text) || FINITE_VERB_RE.test(text.split(/\s+/).slice(0, 6).join(" "))) {
    return `Address this situation: ${lowerFirstWord(text)}`;
  }

  return `${NOUN_PHRASE_VERB[category]} ${withArticle(lowerFirstWord(text))}`;
}

/** Lowercases the first word unless it looks like a name or acronym ("Python", "SQL", "I"). */
function lowerFirstWord(s: string): string {
  const w = s.match(/^\S+/)?.[0] ?? "";
  if (/^[A-Z]{2,}/.test(w) || /^I('|$)/.test(w)) return s;
  // Keep capitalized words that are not ordinary sentence starters (likely proper nouns).
  if (/^[A-Z]/.test(w) && !COMMON_STARTERS.has(w.toLowerCase())) return s;
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}

const COMMON_STARTERS = new Set(
  [
    ...ACTION_VERBS,
    ...SELF_VERBS,
    "what which who where when why how is are was were does do did should can could would will has have",
    "a an the my our your some this that these those any ideas tips ways with it there he she they you we",
  ].flatMap((s) => s.split(" ")),
);

function splitSentences(instruction: string): string[] {
  return instruction
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .flatMap((line) => (/^([-*•]|\d+[.)])\s+/.test(line) ? [line] : line.split(/(?<=[.!?])\s+(?=["'(]?[A-Z0-9])/)))
    .map((s) => s.trim())
    .filter(Boolean);
}

interface Parsed {
  task: string;
  context: string[];
  requirements: BriefItem[];
  constraints: BriefItem[];
}

/** Finds the task sentence; everything else the user wrote is kept as context, requirements or limits. */
function parseInstruction(instruction: string, category: TaskCategory, hasMaterial: boolean): Parsed {
  const sentences = splitSentences(instruction);
  const out: Parsed = { task: "", context: [], requirements: [], constraints: [] };

  for (const raw of sentences) {
    const bullet = raw.match(/^([-*•]|\d+[.)])\s+(.+)$/);
    if (out.task) {
      const s = stripTrailing(bullet ? bullet[2] : raw);
      if (!s) continue;
      if (CONSTRAINT_START_RE.test(s)) out.constraints.push({ text: s });
      else if (bullet || REQUIREMENT_RE.test(s)) out.requirements.push({ text: s });
      else out.context.push(s);
      continue;
    }

    const s = bullet ? bullet[2] : raw;
    if (CONTEXT_STATEMENT_RE.test(s) && !/^(i|we) (want|need|would like)|^i'd like|^i'm (trying|looking|hoping) to|^i am (trying|looking|hoping) to/i.test(s)) {
      // "I have a CSV of sales, find the top regions": split off a trailing imperative clause.
      const parts = s.split(/,\s+|;\s+|\s+-\s+|\s+and\s+(?=(?:please\s+)?[a-z]+\s)/i);
      const idx = parts.findIndex((p, i) => i > 0 && ACTION_VERBS.has(firstWord(stripPoliteness(p).text)));
      if (idx > 0) {
        out.context.push(stripTrailing(parts.slice(0, idx).join(", ")));
        out.task = toImperative(parts.slice(idx).join(", "), category);
      } else {
        out.context.push(stripTrailing(s));
      }
      continue;
    }
    out.task = toImperative(s, category);
  }

  if (!out.task) {
    // Only background was given (or only material). Keep the user's words; don't guess an action.
    if (out.context.length && !hasMaterial) {
      out.task = `Address this situation: ${lowerFirstWord(out.context.shift()!)}`;
    } else {
      out.task = "Work with the material provided";
    }
  }
  return out;
}

const TONE_WORDS: Record<string, Tone> = {
  neutral: "neutral",
  friendly: "friendly",
  warm: "friendly",
  casual: "friendly",
  approachable: "friendly",
  professional: "professional",
  formal: "professional",
  polished: "professional",
  direct: "direct",
  blunt: "direct",
  plain: "direct",
  straightforward: "direct",
  playful: "playful",
  fun: "playful",
  funny: "playful",
  lighthearted: "playful",
  "light-hearted": "playful",
};

function sourcePolicyFromAnswer(a: string): PromptBrief["sourcePolicy"] | null {
  if (/\b(only|strict(ly)?|nothing else|just the)\b/i.test(a)) return "material-only";
  if (/\b(mostly|mainly|flag|first|primarily)\b/i.test(a)) return "material-first";
  if (/\b(own knowledge|outside|research|too|as well|plus|add|combine)\b/i.test(a)) return "material-plus";
  if (/\b(starting point|go beyond|free|open|inspiration)\b/i.test(a)) return "open";
  return null;
}

const label = (question: string) => stripTrailing(question.replace(/\?\s*$/, ""));

export function buildBasicBrief(input: BasicBriefInput): PromptBrief {
  const split = splitMaterial(input.idea);
  const category = classifySplit(split);
  const hasMaterial = split.material.length > 0;
  const parsed = parseInstruction(split.instruction, category, hasMaterial);

  const brief: PromptBrief = {
    category,
    task: parsed.task,
    context: [...parsed.context],
    requirements: [...parsed.requirements],
    constraints: [...parsed.constraints],
    outputFormat:
      explicitFormat(split.instruction) ??
      namedDeliverable(split.instruction, category) ??
      DEFAULT_OUTPUT_FORMAT[category],
    tone: input.tone ?? "neutral",
    length: input.length,
  };

  if (hasMaterial) brief.material = split.material.map((m) => ({ label: m.label, content: m.content }));
  if (hasMaterial && MATERIAL_ONLY_RE.test(split.instruction)) brief.sourcePolicy = "material-only";
  if ((category === "research" || category === "planning") && RECENCY_RE.test(split.instruction)) {
    brief.recencySensitive = true;
  }
  if (VISIBLE_REASONING_RE.test(split.instruction)) brief.wantsVisibleReasoning = true;

  for (const a of input.answers) {
    const answer = stripTrailing(a.answer);
    if (!answer || DECLINE_RE.test(answer)) continue;
    const id = a.questionId as QuestionId;
    if (!(id in QUESTION_FIELDS)) {
      brief.context.push(`${label(a.question)}: ${answer}`);
      continue;
    }
    switch (id) {
      case "audience":
        brief.audience = answer;
        break;
      case "goal":
        if (/^(i|we|they|he|she|it|my|our|the|people|readers|customers|users|everyone|you)\b/i.test(answer)) {
          brief.goal = answer;
        } else if (/^to\s+/i.test(answer)) {
          brief.goal = `I can ${answer.replace(/^to\s+/i, "")}`;
        } else {
          brief.context.push(`Purpose: ${answer}`);
        }
        break;
      case "format":
      case "form":
        brief.outputFormat = answer;
        break;
      case "constraints":
        brief.constraints.push({ text: answer });
        break;
      case "timeframe":
        brief.constraints.push({ text: `Timeframe: ${answer}` });
        break;
      case "budget":
        brief.constraints.push({ text: `Budget: ${answer}` });
        break;
      case "tone": {
        const t = TONE_WORDS[answer.toLowerCase()];
        if (t && input.tone === undefined) brief.tone = t;
        else brief.requirements.push({ text: `Tone or mood: ${answer}` });
        break;
      }
      case "sources": {
        const p = hasMaterial ? sourcePolicyFromAnswer(answer) : null;
        if (p) brief.sourcePolicy = p;
        else brief.context.push(`${label(a.question)}: ${answer}`);
        break;
      }
      case "example":
        brief.examples = [...(brief.examples ?? []), a.answer.trim()];
        break;
      case "language":
        brief.requirements.push({ text: `Use ${answer}` });
        break;
      case "runtime":
        brief.context.push(`Where it will run: ${answer}`);
        break;
      case "level":
        brief.context.push(`My familiarity with the topic: ${answer}`);
        break;
      case "scope":
        brief.requirements.push({ text: `Focus on: ${answer}` });
        break;
      case "details":
        brief.requirements.push({ text: `Include: ${answer}` });
        break;
      case "style":
        brief.requirements.push({ text: `Kind of ideas: ${answer}` });
        break;
      case "data":
        brief.context.push(`The data: ${answer}`);
        break;
      case "decision":
        brief.context.push(`Question to answer: ${answer}`);
        break;
      case "people":
        brief.context.push(`People involved: ${answer}`);
        break;
      case "priorities":
        brief.requirements.push({ text: `Prioritize: ${answer}` });
        break;
    }
  }

  return brief;
}
