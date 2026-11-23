import { describe, expect, it } from "vitest";
import { schemas } from "@/lib/contracts";
import { basicQuestions, QUESTION_FIELDS } from "@/lib/ai/basic/questions";

const ids = (idea: string, target: "chatgpt" | "claude" | "gemini" = "chatgpt") =>
  basicQuestions(idea, target).map((q) => q.id);

describe("basicQuestions: relevant per category", () => {
  it("coding asks about language and runtime, not audience", () => {
    const q = ids("write a function that dedupes a list of users");
    expect(q).toContain("language");
    expect(q).not.toContain("audience");
  });

  it("research asks what it's for and how familiar the user is", () => {
    expect(ids("what are the options for heat pumps in a cold climate?")).toEqual(["goal", "level", "scope"]);
  });

  it("creative asks about form/tone/audience", () => {
    expect(ids("a creative piece about a dragon character who is afraid of fire")).toContain("form");
  });

  it("planning asks about timeframe and budget for trips", () => {
    const q = ids("plan a trip to Lisbon");
    expect(q[0]).toBe("timeframe");
    expect(q).toContain("budget");
  });

  it("analysis with pasted material asks the source question first", () => {
    const qs = basicQuestions("Analyze this:\nregion,units\nNorth,10\nSouth,12\nEast,9", "claude");
    expect(qs[0].id).toBe("sources");
    expect(qs[0].question).toBe("Should the answer stick strictly to the material you pasted?");
    expect(qs[0].suggestions.length).toBeGreaterThanOrEqual(2);
  });

  it("never asks the source question without material", () => {
    for (const idea of ["analyze churn", "brainstorm names for a bakery", "research solar panels"]) {
      expect(ids(idea)).not.toContain("sources");
    }
  });
});

describe("basicQuestions: skips what the idea already answers", () => {
  it("audience phrases ('for my manager', 'to my landlord')", () => {
    expect(ids("write an email for my manager")).not.toContain("audience");
    expect(ids("write an email to my landlord")).not.toContain("audience");
    expect(ids("write an email")).toContain("audience");
  });

  it("explicit formats ('as a table')", () => {
    expect(ids("research electric cars as a table")).not.toContain("format");
  });

  it("numbers for timeframe and budget", () => {
    const q = ids("plan a 3-day trip to Lisbon for $800");
    expect(q).not.toContain("timeframe");
    expect(q).not.toContain("budget");
  });

  it("a named language for coding", () => {
    expect(ids("write a TypeScript function that dedupes users")).not.toContain("language");
  });

  it("an explicit material-only request skips the source question", () => {
    const q = ids("Summarize using only the text below:\n\n" + "Minutes of the meeting. ".repeat(40));
    expect(q).not.toContain("sources");
  });
});

describe("basicQuestions: limits and ids", () => {
  const ideas = [
    "help",
    "write code",
    "research",
    "story",
    "ideas",
    "analyze data",
    "plan my week",
    "email",
    "write a poem for my mom",
  ];

  it("returns at most 3 valid contract questions with stable known ids", () => {
    for (const idea of ideas) {
      for (const target of ["chatgpt", "claude", "gemini"] as const) {
        const qs = basicQuestions(idea, target);
        expect(qs.length).toBeLessThanOrEqual(3);
        for (const q of qs) {
          expect(schemas.ClarifyingQuestion.safeParse(q).success).toBe(true);
          expect(q.id.length).toBeLessThanOrEqual(16);
          expect(Object.keys(QUESTION_FIELDS)).toContain(q.id);
        }
        expect(new Set(qs.map((q) => q.id)).size).toBe(qs.length);
        // Deterministic.
        expect(basicQuestions(idea, target)).toEqual(qs);
      }
    }
  });

  it("returns 0 questions for an already specific idea", () => {
    expect(
      basicQuestions(
        "Write a Python function for my data team that removes duplicate user dicts by email, keeping the newest by updated_at, using only the standard library, returned as one function with type hints",
        "chatgpt",
      ),
    ).toEqual([]);
    expect(
      basicQuestions("Write a friendly email to my manager asking for Friday off so I can attend my sister's graduation", "claude"),
    ).toEqual([]);
  });

  it("Gemini asks for an example of the output early when style matters", () => {
    const g = ids("write a poem about autumn", "gemini");
    const c = ids("write a poem about autumn", "chatgpt");
    expect(g.indexOf("example")).toBe(1);
    expect(c).not.toContain("example");
    const ex = basicQuestions("write a poem about autumn", "gemini").find((q) => q.id === "example")!;
    // No invented sample text offered as chips.
    expect(ex.suggestions).toEqual([]);
  });
});
