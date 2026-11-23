/**
 * Basic Mode clarifying questions (ARCHITECTURE §6, API_CONTRACTS "Basic Mode behaviour").
 * Fixed question banks per task kind. Each question fills one brief field (see `brief.ts`), and is
 * skipped when the idea already answers it. Returns 0–3 questions; 0 when the idea is already specific.
 * Question ids are stable and ≤16 chars so answers map back to fields deterministically.
 */
import type { ClarifyingQuestion, TargetPlatform } from "@/lib/contracts";
import type { TaskCategory } from "@/lib/prompting";
import { classifySplit, splitMaterial, type SplitIdea } from "./classify";
import {
  AUDIENCE_RE,
  BUDGET_RE,
  CONSTRAINT_RE,
  EXAMPLE_RE,
  FORMAT_RE,
  GOAL_RE,
  LANGUAGE_RE,
  MATERIAL_ONLY_RE,
  NUMBER_RE,
  RUNTIME_RE,
  TIMEFRAME_RE,
  TONE_RE,
  wordCount,
} from "./signals";

/** Every question id the banks use, with the brief field it fills. */
export const QUESTION_FIELDS = {
  audience: "audience",
  goal: "goal",
  format: "outputFormat",
  form: "outputFormat",
  constraints: "constraints",
  tone: "tone",
  sources: "sourcePolicy",
  example: "examples",
  language: "requirements",
  runtime: "context",
  level: "context",
  scope: "requirements",
  details: "requirements",
  style: "requirements",
  data: "context",
  decision: "context",
  timeframe: "constraints",
  budget: "constraints",
  people: "context",
  priorities: "requirements",
} as const;

export type QuestionId = keyof typeof QUESTION_FIELDS;

interface Ctx {
  split: SplitIdea;
  text: string;
  category: TaskCategory;
  target: TargetPlatform;
  hasMaterial: boolean;
}

interface QuestionDef {
  id: QuestionId;
  question: string;
  why?: string;
  suggestions: string[];
  /** Skip when any of these match the instruction (the idea already answers it). */
  answeredBy?: RegExp[];
  /** Only ask when this holds. */
  when?: (ctx: Ctx) => boolean;
}

const q = (d: QuestionDef) => d;

const SOURCES = q({
  id: "sources",
  question: "Should the answer stick strictly to the material you pasted?",
  why: "Decides whether the model may add outside knowledge.",
  suggestions: ["Only the pasted material", "Mostly the material, flag extras", "Add your own knowledge too"],
  answeredBy: [MATERIAL_ONLY_RE, /\b(also use|plus your own|outside knowledge|any sources)\b/i],
  when: (c) => c.hasMaterial,
});

const EXAMPLE = q({
  id: "example",
  question: "Do you have an example of the output you like? Paste it here.",
  why: "A real sample is the clearest way to show the format and style you want.",
  // No chips: suggesting sample text would put words in the user's mouth.
  suggestions: [],
  answeredBy: [EXAMPLE_RE],
});

/** Writing-style tasks where an example of the output helps (Gemini guidance, PROMPTING_RESEARCH §4). */
const STYLE_MATTERS: Partial<Record<TaskCategory, boolean>> = { creative: true, productivity: true };
const WRITING_RE = /\b(write|draft|rewrite|post|caption|bio|description|blurb|copy|tagline|announcement|speech|toast)\b/i;

const BANKS: Record<TaskCategory, QuestionDef[]> = {
  coding: [
    q({
      id: "language",
      question: "Which language, framework or version should it use?",
      why: "Avoids code in the wrong language or an outdated API.",
      suggestions: ["Python", "TypeScript", "JavaScript"],
      answeredBy: [LANGUAGE_RE],
    }),
    q({
      id: "runtime",
      question: "Where will this code run?",
      why: "Decides which libraries and system calls are available.",
      suggestions: ["Command-line script", "Web backend", "In the browser"],
      answeredBy: [RUNTIME_RE],
      when: (c) => !c.split.material.some((m) => m.kind === "code"),
    }),
    q({
      id: "format",
      question: "What should you get back?",
      suggestions: ["Just the code", "Code with tests", "Code with a walkthrough"],
      answeredBy: [/\b(with tests|unit tests|test cases|one function|single function|a class|snippet|type hints|walkthrough|step by step|line by line)\b/i],
    }),
    q({
      id: "constraints",
      question: "Any limits it must respect?",
      why: "For example, allowed libraries or performance needs.",
      suggestions: ["Standard library only", "No new dependencies", "Must be fast on large inputs"],
      answeredBy: [CONSTRAINT_RE],
    }),
  ],
  research: [
    q({
      id: "goal",
      question: "What will you use this research for?",
      why: "Shapes what the answer compares and recommends.",
      suggestions: ["I can make a decision", "I can write about it", "I understand the topic"],
      answeredBy: [GOAL_RE],
    }),
    q({
      id: "level",
      question: "How familiar are you with this topic?",
      why: "Sets the depth and how much jargon to explain.",
      suggestions: ["New to it", "Some background", "Expert"],
      answeredBy: [AUDIENCE_RE, /\b(beginner|expert|eli5|in simple terms|simply|technical)\b/i],
    }),
    q({
      id: "scope",
      question: "Any region, time period or angle to focus on?",
      suggestions: ["My country only", "The last five years", "Costs and trade-offs"],
      answeredBy: [/\b(in|for) (the )?(us|uk|usa|eu|europe|india|canada|australia|[A-Z][a-z]+)\b/, TIMEFRAME_RE],
    }),
    q({
      id: "format",
      question: "How should the findings be presented?",
      suggestions: ["Comparison table", "Short summary", "Detailed report"],
      answeredBy: [FORMAT_RE],
    }),
    SOURCES,
  ],
  creative: [
    q({
      id: "form",
      question: "What form should it take?",
      suggestions: ["Short story", "Poem", "Song lyrics"],
      answeredBy: [/\b(story|stories|poem|poetry|haiku|limerick|sonnet|lyrics|song|novel|screenplay|script|fable|fairy tale|monologue|verse|rap|essay|scene)\b/i],
    }),
    q({
      id: "tone",
      question: "What tone or mood are you after?",
      suggestions: ["Funny", "Dark and eerie", "Heartwarming"],
      answeredBy: [TONE_RE, /\b(sad|happy|scary|spooky|eerie|romantic|melancholy|hopeful|tense|cozy|silly|epic)\b/i],
    }),
    q({
      id: "audience",
      question: "Who will read it?",
      why: "Sets vocabulary, themes and length.",
      suggestions: ["Young children", "Teenagers", "Adults"],
      answeredBy: [AUDIENCE_RE, /\b(bedtime|for kids|children'?s|young adult|ya)\b/i],
    }),
    q({
      id: "details",
      question: "Any characters, setting or details it must include?",
      suggestions: ["A twist ending", "Set in the present day", "A named main character"],
      answeredBy: [/\b(named|called|set in|takes place|featuring|starring)\b/i],
    }),
    EXAMPLE,
    SOURCES,
  ],
  brainstorm: [
    q({
      id: "audience",
      question: "Who are the ideas for?",
      suggestions: ["Just me", "My team", "Customers"],
      answeredBy: [AUDIENCE_RE],
    }),
    q({
      id: "constraints",
      question: "Any limits the ideas must fit?",
      why: "Budget, time or resources rule out whole categories of ideas.",
      suggestions: ["Low budget", "Doable in a weekend", "No special equipment"],
      answeredBy: [CONSTRAINT_RE, BUDGET_RE, TIMEFRAME_RE],
    }),
    q({
      id: "style",
      question: "Do you want safe bets or unexpected ideas?",
      suggestions: ["Practical and proven", "Bold and unusual", "A mix of both"],
      answeredBy: [/\b(unusual|creative|wild|crazy|out of the box|unexpected|practical|realistic|safe|proven)\b/i],
    }),
    EXAMPLE,
    SOURCES,
  ],
  analysis: [
    SOURCES,
    q({
      id: "data",
      question: "What data or material are you analysing?",
      why: "Basic Mode can't see files; describe or paste the data so the prompt includes it.",
      suggestions: ["Sales figures", "Survey responses", "Website analytics"],
      answeredBy: [/\b(csv|spreadsheet|dataset|survey|sales|responses|analytics|logs?|figures|transcript|report|results)\b/i],
      when: (c) => !c.hasMaterial,
    }),
    q({
      id: "decision",
      question: "What question should the analysis answer?",
      why: "Focuses the findings on the decision you face.",
      suggestions: ["What is driving the trend", "Where to cut costs", "Which option is best"],
      answeredBy: [GOAL_RE, /\b(why|which|whether|what (is|are) (driving|causing))\b/i],
    }),
    q({
      id: "audience",
      question: "Who will read the analysis?",
      suggestions: ["My manager", "My team", "Just me"],
      answeredBy: [AUDIENCE_RE],
    }),
    q({
      id: "format",
      question: "How should the results be laid out?",
      suggestions: ["Bullet-point findings", "Short report", "Table of results"],
      answeredBy: [FORMAT_RE],
    }),
  ],
  planning: [
    q({
      id: "timeframe",
      question: "What's the timeframe?",
      suggestions: ["One weekend", "One week", "Three months"],
      answeredBy: [TIMEFRAME_RE],
    }),
    q({
      id: "budget",
      question: "What budget should the plan fit?",
      suggestions: ["As cheap as possible", "Moderate", "Flexible"],
      answeredBy: [BUDGET_RE],
      when: (c) =>
        /\b(trip|travel|vacation|holiday|party|event|wedding|renovat\w*|move|moving|launch|meal|conference|offsite|birthday|garden|kitchen|budget)\b/i.test(
          c.text,
        ),
    }),
    q({
      id: "priorities",
      question: "What matters most in this plan?",
      suggestions: ["Keeping costs down", "Saving time", "Making it enjoyable"],
      answeredBy: [/\b(priorit\w*|most important|matters most|focus on|main goal)\b/i, GOAL_RE],
    }),
    q({
      id: "people",
      question: "Who is involved?",
      suggestions: ["Just me", "Me and a partner", "A small team"],
      answeredBy: [AUDIENCE_RE, /\b(with my|with our|for us|we|our family|solo|alone|by myself)\b/i],
    }),
  ],
  productivity: [
    q({
      id: "audience",
      question: "Who will receive or read it?",
      why: "Sets the level of formality and how much background to give.",
      suggestions: ["My manager", "A client", "My team"],
      answeredBy: [AUDIENCE_RE],
    }),
    q({
      id: "goal",
      question: "What outcome do you want from it?",
      suggestions: ["They agree to a meeting", "They reply with an answer", "They approve my request"],
      answeredBy: [GOAL_RE, /\b(asking (for|them|him|her)|ask (for|them|him|her)|request(ing)?|to (get|schedule|cancel|confirm|decline|accept|follow up|apologi[sz]e|thank))\b/i],
    }),
    q({
      id: "tone",
      question: "What tone should it have?",
      suggestions: ["Friendly", "Professional", "Firm but polite"],
      answeredBy: [TONE_RE],
    }),
    EXAMPLE,
    SOURCES,
  ],
  general: [
    q({
      id: "goal",
      question: "What will you use the answer for?",
      why: "Lets the answer focus on what you'll actually do with it.",
      suggestions: ["I can decide what to do", "I can explain it to others", "I learn the basics"],
      answeredBy: [GOAL_RE],
    }),
    q({
      id: "format",
      question: "What format would help most?",
      suggestions: ["Short answer", "Bullet points", "Step-by-step guide"],
      answeredBy: [FORMAT_RE],
    }),
    q({
      id: "audience",
      question: "Who is it for?",
      suggestions: ["Just me", "A beginner", "A professional audience"],
      answeredBy: [AUDIENCE_RE],
    }),
    q({ ...EXAMPLE, when: (c) => WRITING_RE.test(c.text) }),
    SOURCES,
  ],
};

/** How many of the usual gaps the idea already fills. */
function filledSignals(ctx: Ctx): number {
  const t = ctx.text;
  return [
    AUDIENCE_RE.test(t),
    FORMAT_RE.test(t),
    GOAL_RE.test(t),
    CONSTRAINT_RE.test(t),
    TONE_RE.test(t),
    TIMEFRAME_RE.test(t) || NUMBER_RE.test(t),
    ctx.category === "coding" && LANGUAGE_RE.test(t),
    ctx.hasMaterial,
  ].filter(Boolean).length;
}

/** Specific enough to generate directly: long and detailed, or several gaps already filled. */
export function isSpecific(ctx: Ctx): boolean {
  const words = wordCount(ctx.text);
  const filled = filledSignals(ctx);
  return words >= 40 || (words >= 12 && filled >= 3) || (words >= 25 && filled >= 2);
}

export const MAX_BASIC_QUESTIONS = 3;

export function basicQuestions(idea: string, target: TargetPlatform): ClarifyingQuestion[] {
  const split = splitMaterial(idea);
  const category = classifySplit(split);
  const ctx: Ctx = { split, text: split.instruction, category, target, hasMaterial: split.material.length > 0 };
  if (isSpecific(ctx)) return [];

  let bank = BANKS[category].filter(
    (d) => (d.when ? d.when(ctx) : true) && !(d.answeredBy ?? []).some((re) => re.test(ctx.text)),
  );

  // Gemini: its vendor recommends examples most strongly, so ask for one early when style matters.
  const exampleIdx = bank.findIndex((d) => d.id === "example");
  if (target === "gemini" && exampleIdx > 1 && (STYLE_MATTERS[category] || WRITING_RE.test(ctx.text))) {
    const [ex] = bank.splice(exampleIdx, 1);
    bank = [...bank.slice(0, 1), ex, ...bank.slice(1)];
  }

  return bank.slice(0, MAX_BASIC_QUESTIONS).map((d) => ({
    id: d.id,
    question: d.question,
    ...(d.why ? { why: d.why } : {}),
    suggestions: [...d.suggestions],
  }));
}
