import type { ClarifyingQuestion } from "@/lib/contracts";
import type { PromptBrief } from "@/lib/prompting";

/**
 * Sample briefs for the Phase 1 preview. Six are copied from tests/unit/prompting/fixtures.ts
 * (the analysis CSV is trimmed); "landlord" and "sql" match the composer's "Try one" examples.
 * Each carries the follow-up questions the preview asks and keywords used to pick it.
 */
export interface MockBrief {
  key: string;
  /** Short history title, as the AI would return in `done.title`. */
  title: string;
  idea: string;
  keywords: RegExp;
  brief: PromptBrief;
  questions: ClarifyingQuestion[];
}

const salesCsv = [
  "month,region,units,revenue_usd,returns",
  ...Array.from({ length: 12 }, (_, i) => {
    const m = `2026-${String((i % 12) + 1).padStart(2, "0")}`;
    const region = ["North", "South", "East", "West", "Central"][i % 5];
    return `${m},${region},${120 + ((i * 37) % 90)},${(120 + ((i * 37) % 90)) * 49},${(i * 7) % 11}`;
  }),
].join("\n");

export const MOCK_BRIEFS: MockBrief[] = [
  {
    key: "landlord",
    title: "Cold email to landlord",
    idea: "Write a cold email to my landlord about a broken heater",
    keywords: /landlord|heater|tenant|rent|repair/i,
    brief: {
      category: "productivity",
      task: "Write an email to my landlord asking for the broken heater to be repaired",
      goal: "the heater is fixed before the weekend cold snap",
      role: "tenant who knows their rights but wants to stay on good terms",
      audience: "a landlord I rarely hear from",
      context: [
        "The heater stopped working on Monday and the flat is at 14 °C.",
        "I reported it by phone last week and nobody came.",
      ],
      requirements: [
        { text: "Ask for a repair within 48 hours", reason: "temperatures drop below freezing on Friday" },
        { text: "Mention the earlier phone report with its date as [date of call]" },
        { text: "Offer two times when someone can let the engineer in" },
      ],
      constraints: [{ text: "Stay courteous and avoid threats", reason: "I want to renew the lease in spring" }],
      outputFormat: "a single email with a subject line, signed as [your name]",
      tone: "neutral",
      length: "balanced",
    },
    questions: [
      {
        id: "q1",
        question: "What outcome do you want from the landlord?",
        suggestions: ["Repair within 48 hours", "Rent reduction", "Written reply"],
      },
      {
        id: "q2",
        question: "How firm should it sound?",
        suggestions: ["Polite but firm", "Friendly", "Formal, cites rights"],
      },
      {
        id: "q3",
        question: "Anything they already know?",
        suggestions: ["I called last week", "Nothing yet"],
      },
    ],
  },
  {
    key: "sql",
    title: "SQL query for a new analyst",
    idea: "Explain a SQL query to a new analyst",
    keywords: /sql|query|analyst|database|join/i,
    brief: {
      category: "coding",
      task: "Explain what a SQL query does, clause by clause, to a new analyst",
      goal: "they can modify it on their own next time",
      audience: "an analyst in their first month who knows SELECT and WHERE but not window functions",
      context: ["The query runs on PostgreSQL against our orders and customers tables."],
      requirements: [
        { text: "Walk through each clause in the order the database runs it" },
        { text: "Explain the window function with a three-row example" },
        { text: "Point out one common mistake when editing it" },
      ],
      constraints: [{ text: "Avoid jargon unless you define it first" }],
      outputFormat: "a short explanation followed by an annotated copy of the query",
      material: [
        {
          label: "Query",
          content:
            "SELECT c.region, o.customer_id, SUM(o.total) AS spend,\n       RANK() OVER (PARTITION BY c.region ORDER BY SUM(o.total) DESC) AS rank_in_region\nFROM orders o\nJOIN customers c ON c.id = o.customer_id\nWHERE o.created_at >= {start_date}\nGROUP BY c.region, o.customer_id;",
        },
      ],
      tone: "friendly",
      length: "balanced",
    },
    questions: [
      {
        id: "q1",
        question: "Which database does the query run on?",
        suggestions: ["PostgreSQL", "BigQuery", "SQL Server"],
      },
      {
        id: "q2",
        question: "How much SQL does the analyst already know?",
        suggestions: ["Basics only", "Comfortable with joins", "Never used it"],
      },
    ],
  },
  {
    key: "planning",
    title: "Lisbon trip on a budget",
    idea: "Plan a 3-day trip to Lisbon on a budget",
    keywords: /lisbon|trip|travel|itinerary|holiday|vacation/i,
    brief: {
      category: "planning",
      task: "Plan a three-day trip to Lisbon in March",
      audience: "a solo traveller",
      context: ["I enjoy local food and long walks, and I'm not interested in nightlife."],
      requirements: [
        { text: "Give a day-by-day itinerary with morning, afternoon and evening" },
        { text: "Group sights by neighbourhood to keep walking efficient" },
        { text: "Suggest one affordable local place to eat each day" },
      ],
      ordered: true,
      constraints: [{ text: "Keep the total budget under €400 excluding flights and accommodation" }],
      outputFormat: "a day-by-day itinerary",
      recencySensitive: true,
      tone: "friendly",
      length: "balanced",
    },
    questions: [
      { id: "q1", question: "When are you going?", suggestions: ["March", "Next month", "Not sure yet"] },
      {
        id: "q2",
        question: "What do you enjoy most when travelling?",
        suggestions: ["Food and walking", "Museums", "Nightlife"],
      },
      { id: "q3", question: "What's your spending budget?", suggestions: ["Under €400", "Under €800"] },
    ],
  },
  {
    key: "coding",
    title: "Dedupe users by email",
    idea: "write a python function that dedupes a list of user dicts by email, keep the newest",
    keywords: /python|function|dedupe|code|script|bug/i,
    brief: {
      category: "coding",
      task: "Write a Python function that removes duplicate user records by email address",
      goal: "the cleaned list can feed a nightly import job",
      context: ["Each record is a dict with keys id, email, name and updated_at (an ISO 8601 string)."],
      requirements: [
        { text: "Treat emails case-insensitively and ignore surrounding whitespace" },
        {
          text: "When duplicates exist, keep the record with the latest updated_at",
          reason: "newer records hold the current name",
        },
        { text: "Preserve the original order of the records that are kept" },
      ],
      constraints: [{ text: "Use only the Python standard library", reason: "the job runs in a locked-down environment" }],
      outputFormat: "a single Python function with type hints and a docstring",
      tone: "neutral",
      length: "balanced",
    },
    questions: [
      {
        id: "q1",
        question: "Which record should win when emails match?",
        suggestions: ["Newest updated_at", "First seen", "Most complete"],
      },
    ],
  },
  {
    key: "research",
    title: "Cold-climate heat pumps",
    idea: "what are the current options for heat pumps in a cold climate, for my 1950s house",
    keywords: /heat pump|research|compare|options|climate/i,
    brief: {
      category: "research",
      task: "Research the current options for heating a 1950s house with a heat pump in a cold climate",
      goal: "I can shortlist systems before talking to installers",
      audience: "a homeowner with no HVAC background",
      context: [
        "Winter lows regularly reach -20 °C.",
        "The house has original single-pipe radiators and partial attic insulation.",
      ],
      requirements: [
        { text: "Compare air-source, ground-source and hybrid systems" },
        { text: "Note which options work with existing radiators" },
        { text: "Flag where available incentives depend on location" },
      ],
      constraints: [{ text: "Separate established facts from claims that need checking with an installer" }],
      outputFormat: "a comparison table followed by a short recommendation",
      recencySensitive: true,
      tone: "neutral",
      length: "balanced",
    },
    questions: [
      { id: "q1", question: "How cold do winters get?", suggestions: ["Below -20 °C", "Around -10 °C"] },
      {
        id: "q2",
        question: "What heating does the house have now?",
        suggestions: ["Radiators", "Forced air", "Electric baseboard"],
      },
    ],
  },
  {
    key: "creative",
    title: "Lighthouse keeper story",
    idea: "short story about a lighthouse keeper who finds a radio that talks back",
    keywords: /story|poem|fiction|lighthouse|novel|write a scene/i,
    brief: {
      category: "creative",
      task: "Write a short story about a lighthouse keeper who finds an old radio that answers back",
      context: ["It's set on a remote northern island in the 1970s."],
      requirements: [
        { text: "Tell it in second person" },
        { text: "Leave it ambiguous whether the voice is real", reason: "I want readers to argue about it" },
      ],
      constraints: [{ text: "Keep it suitable for a general adult audience" }],
      outputFormat: "a complete short story with a title",
      prose: true,
      tone: "neutral",
      length: "balanced",
    },
    questions: [
      {
        id: "q1",
        question: "Whose point of view should it use?",
        suggestions: ["Second person", "First person", "Third person"],
      },
      { id: "q2", question: "How should it end?", suggestions: ["Ambiguous", "Hopeful", "Unsettling"] },
    ],
  },
  {
    key: "analysis",
    title: "Regions slipping in sales data",
    idea: "analyse this sales csv and tell me which regions are slipping and why",
    keywords: /analy[sz]e|csv|data|sales|spreadsheet|metrics/i,
    brief: {
      category: "analysis",
      task: "Analyse the sales data and identify which regions are declining and the likely reasons",
      goal: "I can decide where to focus next quarter's sales support",
      role: "commercial analyst",
      context: ["Revenue is in US dollars; units are individual devices."],
      requirements: [
        { text: "Rank regions by trend in revenue over the period" },
        { text: "Check whether returns explain any decline" },
      ],
      constraints: [{ text: "Base every claim on the data provided and show the figures you used" }],
      definitions: [{ term: "declining", meaning: "revenue in the last three months is below the first three months" }],
      outputFormat: "a ranked list of regions with a one-line finding each, then a short summary",
      material: [{ label: "Sales data (CSV)", content: salesCsv }],
      tone: "neutral",
      length: "balanced",
    },
    questions: [
      {
        id: "q1",
        question: "What counts as slipping for you?",
        suggestions: ["Last 3 months below first 3", "Down year on year"],
      },
    ],
  },
  {
    key: "productivity",
    title: "Meeting notes to follow-up",
    idea: "turn my messy meeting notes into a follow up email with action items",
    keywords: /meeting|notes|follow[- ]?up|action items|summar/i,
    brief: {
      category: "productivity",
      task: "Turn my meeting notes into a follow-up email for the attendees",
      context: ["The meeting was a weekly project sync with five people."],
      requirements: [
        { text: "List action items with an owner and a due date for each" },
        { text: "Summarise decisions in two or three sentences" },
      ],
      constraints: [{ text: "Use only what's in the notes; mark anything unclear as needing confirmation by Friday" }],
      outputFormat: "an email with a subject line",
      material: [
        {
          label: "Meeting notes",
          content:
            "beta date?? -> 20th agreed. priya release notes. sam QA - check w/ dana. budget q not resolved, revisit. jo to send vendor quote maybe next wk",
        },
      ],
      tone: "professional",
      length: "balanced",
    },
    questions: [],
  },
];

export const GENERAL_BRIEF_KEY = "productivity";

/** Picks the brief whose keywords best match the idea; falls back to a general one. */
export function pickBrief(idea: string): MockBrief {
  let best: MockBrief | undefined;
  let bestScore = 0;
  for (const b of MOCK_BRIEFS) {
    const flags = b.keywords.flags.includes("g") ? b.keywords.flags : `${b.keywords.flags}g`;
    const score = (idea.match(new RegExp(b.keywords.source, flags)) ?? []).length;
    if (score > bestScore) {
      best = b;
      bestScore = score;
    }
  }
  return best ?? MOCK_BRIEFS.find((b) => b.key === GENERAL_BRIEF_KEY)!;
}

export function briefByKey(key: string): MockBrief {
  return MOCK_BRIEFS.find((b) => b.key === key) ?? MOCK_BRIEFS[0];
}
