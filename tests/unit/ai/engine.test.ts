import { describe, expect, it } from "vitest";
import { schemas, type Answer, type GenerateRequest, type Length, type StreamEvent, type TargetPlatform } from "@/lib/contracts";
import { buildBasicBrief } from "@/lib/ai/basic/brief";
import { createEngine } from "@/lib/ai/engine";
import { AppError } from "@/lib/ai/errors";
import { PROFILES } from "@/lib/prompting";
import { evaluatePrompt } from "@/lib/prompting/evaluate";

const TARGETS: TargetPlatform[] = ["chatgpt", "claude", "gemini"];
const LENGTHS: Length[] = ["concise", "balanced", "detailed"];
const TODAY = "2026-11-23";

const engine = () =>
  createEngine({ registry: { providers: [], detected: [] }, today: () => TODAY, requestId: () => "req-test" });

async function collect(it: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const out: StreamEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
}

const salesCsv = [
  "month,region,units,revenue_usd",
  ...Array.from({ length: 50 }, (_, i) => `2026-${String((i % 12) + 1).padStart(2, "0")},${["North", "South", "East", "West"][i % 4]},${100 + i},${(100 + i) * 49}`),
].join("\n");

const a = (questionId: string, question: string, answer: string): Answer => ({ questionId, question, answer });

const CASES: { category: string; idea: string; answers: Answer[]; mustContain: string[] }[] = [
  {
    category: "coding",
    idea: "help me write a python function that dedupes a list of user dicts by email",
    answers: [a("runtime", "Where will this code run?", "Nightly cron job")],
    mustContain: ["python function", "user dicts", "email", "cron job"],
  },
  {
    category: "research",
    idea: "what are the current options for heat pumps in a cold climate?",
    answers: [a("goal", "What will you use this research for?", "I can make a decision")],
    mustContain: ["heat pumps", "cold climate", "make a decision"],
  },
  {
    category: "creative",
    idea: "short story about a lighthouse keeper who finds a radio that talks back",
    answers: [a("tone", "What tone or mood are you after?", "Dark and eerie")],
    mustContain: ["lighthouse keeper", "radio", "Dark and eerie"],
  },
  {
    category: "brainstorm",
    idea: "I need ideas for my sister's 30th birthday party",
    answers: [a("constraints", "Any limits the ideas must fit?", "Low budget")],
    mustContain: ["sister's 30th birthday party", "Low budget"],
  },
  {
    category: "analysis",
    idea: `Analyze this sales data and tell me which region is growing fastest:\n${salesCsv}`,
    answers: [a("sources", "Should the answer stick strictly to the material you pasted?", "Only the pasted material")],
    mustContain: ["sales data", "region", "growing fastest", "North,100"],
  },
  {
    category: "planning",
    idea: "plan a 3-day trip to Lisbon",
    answers: [a("budget", "What budget should the plan fit?", "Moderate"), a("people", "Who is involved?", "Me and a partner")],
    mustContain: ["3-day trip", "Lisbon", "Moderate", "Me and a partner"],
  },
  {
    category: "productivity",
    idea: "can you write an email to my landlord asking him to fix the heating",
    answers: [a("tone", "What tone should it have?", "Firm but polite")],
    mustContain: ["email", "landlord", "heating", "Firm but polite"],
  },
  {
    category: "general",
    idea: "tell me something interesting about octopuses",
    answers: [a("audience", "Who is it for?", "My curious nine-year-old")],
    mustContain: ["octopuses", "nine-year-old"],
  },
];

describe.each(CASES)("Basic Mode end to end: $category", (c) => {
  it("is classified as intended", () => {
    expect(buildBasicBrief({ idea: c.idea, answers: c.answers, target: "chatgpt", length: "balanced" }).category).toBe(c.category);
  });

  for (const length of LENGTHS) {
    it.each(TARGETS)(`%s (${length}) passes every rubric criterion and keeps the user's nouns`, async (target) => {
      const req: GenerateRequest = { idea: c.idea, target, length, answers: c.answers };
      const events = await collect(engine().generate(req));
      const done = events.at(-1);
      expect(done?.type).toBe("done");
      const text = (done as Extract<StreamEvent, { type: "done" }>).text;
      const brief = buildBasicBrief({ idea: c.idea, answers: c.answers, target, length });
      const ev = evaluatePrompt(PROFILES[target], brief, text, c.mustContain);
      const failed = Object.entries(ev.results)
        .filter(([, r]) => !r.pass)
        .map(([k, r]) => `${k}: ${r.notes.join("; ")}`);
      expect(failed, `\n--- ${target}/${length} ---\n${text}\n`).toEqual([]);
    });
  }

  it("differs by target", async () => {
    const texts = await Promise.all(
      TARGETS.map(async (target) => {
        const events = await collect(engine().generate({ idea: c.idea, target, length: "balanced", answers: c.answers }));
        return (events.at(-1) as Extract<StreamEvent, { type: "done" }>).text;
      }),
    );
    expect(new Set(texts).size).toBe(3);
  });
});

describe("engine.generate stream shape", () => {
  const req: GenerateRequest = { idea: "plan a 3-day trip to Lisbon", target: "gemini", length: "balanced", answers: [] };

  it("emits meta (basic), exactly one delta with the whole text, then done with text and title", async () => {
    const events = await collect(engine().generate(req));
    expect(events.map((e) => e.type)).toEqual(["meta", "delta", "done"]);
    for (const e of events) expect(schemas.StreamEvent.safeParse(e).success).toBe(true);
    expect(events[0]).toEqual({ type: "meta", engine: { kind: "basic" }, requestId: "req-test" });
    const delta = events[1] as Extract<StreamEvent, { type: "delta" }>;
    const done = events[2] as Extract<StreamEvent, { type: "done" }>;
    expect(done.text).toBe(delta.text);
    expect(done.title).toBe("3-day trip to Lisbon");
    // Recency-sensitive planning on Gemini states today's date.
    expect(done.text.startsWith(`Today is ${TODAY}.`)).toBe(true);
  });

  it("is deterministic: the same inputs give the same text (Regenerate)", async () => {
    const one = await collect(engine().generate(req));
    const two = await collect(engine().generate(req));
    expect(one.at(-1)).toEqual(two.at(-1));
  });

  it("stops when the signal is already aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(collect(engine().generate(req, { signal: ac.signal }))).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("engine.clarify and transform in Basic Mode", () => {
  it("clarify returns contract-valid questions with engine basic", async () => {
    const res = await engine().clarify({ idea: "write an email", target: "claude", length: "balanced" });
    expect(schemas.ClarifyResponse.safeParse(res).success).toBe(true);
    expect(res.engine).toEqual({ kind: "basic" });
    expect(res.questions.length).toBeGreaterThan(0);
  });

  it("transform throws ai_required with a user-facing message", async () => {
    const err = await engine()
      .transform({ action: "improve", text: "x", target: "claude", length: "balanced" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe("ai_required");
    expect((err as AppError).status).toBe(409);
    expect((err as AppError).message).toMatch(/^Improve, Shorten, Expand and Tone need an AI provider\. This build runs in Basic Mode\./);
  });

  it("transform mentions detected keys without claiming AI is available", async () => {
    const e = createEngine({ registry: { providers: [], detected: ["anthropic"] } });
    const err = (await e.transform({ action: "shorten", text: "x", target: "claude", length: "balanced" }).catch((x: unknown) => x)) as AppError;
    expect(err.message).toContain("API keys were found, but AI providers aren't connected in this build yet.");
  });
});
