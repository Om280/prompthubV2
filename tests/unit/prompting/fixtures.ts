import type { PromptBrief } from "@/lib/prompting";

export interface PromptingFixture {
  name: string;
  /** The rough idea a user would type. */
  idea: string;
  brief: PromptBrief;
  /** User terms that must survive in every target's prompt. */
  mustContain: string[];
}

const salesCsv = [
  "month,region,units,revenue_usd,returns",
  ...Array.from({ length: 60 }, (_, i) => {
    const m = `2026-${String((i % 12) + 1).padStart(2, "0")}`;
    const region = ["North", "South", "East", "West", "Central"][i % 5];
    return `${m},${region},${120 + ((i * 37) % 90)},${(120 + ((i * 37) % 90)) * 49},${(i * 7) % 11}`;
  }),
].join("\n");

export const FIXTURES: PromptingFixture[] = [
  {
    name: "coding",
    idea: "write a python function that dedupes a list of user dicts by email, keep the newest",
    mustContain: ["Python", "email", "updated_at"],
    brief: {
      category: "coding",
      task: "Write a Python function that removes duplicate user records by email address",
      goal: "the cleaned list can feed a nightly import job",
      context: ["Each record is a dict with keys id, email, name and updated_at (an ISO 8601 string)."],
      requirements: [
        { text: "Treat emails case-insensitively and ignore surrounding whitespace" },
        { text: "When duplicates exist, keep the record with the latest updated_at", reason: "newer records hold the current name" },
        { text: "Preserve the original order of the records that are kept" },
      ],
      constraints: [{ text: "Use only the Python standard library", reason: "the job runs in a locked-down environment" }],
      outputFormat: "a single Python function with type hints and a docstring",
      tone: "neutral",
      length: "balanced",
    },
  },
  {
    name: "research",
    idea: "what are the current options for heat pumps in a cold climate, for my 1950s house",
    mustContain: ["heat pump", "1950s", "-20"],
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
  },
  {
    name: "creative",
    idea: "short story about a lighthouse keeper who finds a radio that talks back",
    mustContain: ["lighthouse keeper", "radio", "second person"],
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
  },
  {
    name: "analysis",
    idea: "analyse this sales csv and tell me which regions are slipping and why",
    mustContain: ["region", "returns"],
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
      sourcePolicy: "material-only",
      definitions: [{ term: "declining", meaning: "revenue in the last three months is below the first three months" }],
      outputFormat: "a ranked list of regions with a one-line finding each, then a short summary",
      material: [{ label: "Sales data (CSV)", content: salesCsv }],
      tone: "neutral",
      length: "balanced",
    },
  },
  {
    name: "planning",
    idea: "plan a 3 day trip to lisbon on a budget in march, i like food and walking",
    mustContain: ["Lisbon", "March", "€400"],
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
  },
  {
    name: "productivity",
    idea: "turn my messy meeting notes into a follow up email with action items",
    mustContain: ["action items", "owner", "Friday"],
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
      examples: [
        "Subject: Sync recap, 12 Nov\n\nDecisions: we ship the beta on the 20th.\n\nAction items\n- Priya: update the release notes (Thu)\n- Sam: confirm QA sign-off (Fri)",
      ],
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
  },
];
