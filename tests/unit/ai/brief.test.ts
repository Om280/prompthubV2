import { describe, expect, it } from "vitest";
import type { Answer } from "@/lib/contracts";
import { buildBasicBrief, DEFAULT_OUTPUT_FORMAT, toImperative } from "@/lib/ai/basic/brief";
import { basicTitle } from "@/lib/ai/basic/title";

const brief = (idea: string, answers: Answer[] = []) =>
  buildBasicBrief({ idea, answers, target: "claude", length: "balanced" });

const ans = (questionId: string, answer: string, question = "Question?"): Answer => ({ questionId, question, answer });

describe("task extraction keeps the user's words as an imperative", () => {
  it.each([
    ["help me write a cover letter for a barista job", "Write a cover letter for a barista job"],
    ["can you please summarize my meeting notes", "Summarize my meeting notes"],
    ["I want to write a toast for my brother's wedding", "Write a toast for my brother's wedding"],
    ["Please refactor the checkout component", "Refactor the checkout component"],
    ["Could you draft a reply to the client, please", "Draft a reply to the client"],
    ["how do I make sourdough bread", "Explain how to make sourdough bread"],
    ["email to my landlord about the broken boiler", "Write an email to my landlord about the broken boiler"],
    ["names for my bakery", "Brainstorm names for my bakery"],
  ])("%s → %s", (idea, task) => {
    expect(brief(idea).task).toBe(task);
  });

  it("turns self-directed goals into a request for help, by category", () => {
    expect(toImperative("I want to learn Spanish in 3 months", "planning")).toBe("Make a plan to learn Spanish in 3 months");
    expect(toImperative("I want to learn Spanish in 3 months", "general")).toBe("Explain how to learn Spanish in 3 months");
  });

  it("keeps a question intact instead of rewriting it", () => {
    expect(brief("what are the current options for heat pumps in a cold climate?").task).toBe(
      "Answer this question: what are the current options for heat pumps in a cold climate",
    );
  });

  it("moves background statements to context and keeps the following instruction as the task", () => {
    const b = brief("I have a CSV of monthly sales, find the top regions");
    expect(b.task).toBe("Find the top regions");
    expect(b.context).toEqual(["I have a CSV of monthly sales"]);
  });

  it("keeps later sentences as requirements, constraints or context, in the user's words", () => {
    const b = brief("Write a bedtime story about a brave snail. It should rhyme. Don't make it scary. My son is four.");
    expect(b.task).toBe("Write a bedtime story about a brave snail");
    expect(b.requirements).toEqual([{ text: "It should rhyme" }]);
    expect(b.constraints).toEqual([{ text: "Don't make it scary" }]);
    expect(b.context).toEqual(["My son is four"]);
  });
});

describe("answers map to brief fields by question id", () => {
  it("maps known ids to their fields", () => {
    const b = brief("write an email", [
      ans("audience", "My manager"),
      ans("goal", "They approve my request"),
      ans("tone", "Professional"),
      ans("constraints", "Under 120 words"),
    ]);
    expect(b.audience).toBe("My manager");
    expect(b.goal).toBe("They approve my request");
    expect(b.tone).toBe("professional");
    expect(b.constraints).toEqual([{ text: "Under 120 words" }]);
  });

  it("keeps free-text tone in the user's words as a requirement", () => {
    expect(brief("write an email", [ans("tone", "Firm but polite")]).requirements).toEqual([{ text: "Tone or mood: Firm but polite" }]);
  });

  it("format answers set the output format; unknown ids become 'Q: A' context lines", () => {
    const b = brief("research electric cars", [ans("format", "Comparison table"), ans("zzz", "Mostly in Norway", "Which country?")]);
    expect(b.outputFormat).toBe("Comparison table");
    expect(b.context).toContain("Which country: Mostly in Norway");
  });

  it("ignores declined answers", () => {
    const b = brief("write an email", [ans("audience", "no"), ans("constraints", "None")]);
    expect(b.audience).toBeUndefined();
    expect(b.constraints).toEqual([]);
  });

  it("goal answers that don't read as a clause go to context instead of a broken 'so that'", () => {
    expect(brief("research solar panels", [ans("goal", "Work")]).context).toContain("Purpose: Work");
    expect(brief("research solar panels", [ans("goal", "to decide on a roof")]).goal).toBe("I can decide on a roof");
  });
});

describe("material, source policy and recency", () => {
  const csv = "region,units\nNorth,10\nSouth,12\nEast,9\nWest,14";

  it("carries pasted material verbatim, split from the task", () => {
    const b = brief(`Which region sold the most?\n\n${csv}`);
    expect(b.task).toBe("Answer this question: which region sold the most");
    expect(b.material).toEqual([{ label: "Pasted data", content: csv }]);
    expect(b.task).not.toContain("North");
  });

  it("sets sourcePolicy only when the user asks for it", () => {
    expect(brief(`Summarize this:\n${csv}`).sourcePolicy).toBeUndefined();
    expect(brief(`Summarize this using only the data below:\n\n${csv}`).sourcePolicy).toBe("material-only");
    expect(brief(`Summarize this:\n${csv}`, [ans("sources", "Only the pasted material")]).sourcePolicy).toBe("material-only");
    expect(brief(`Summarize this:\n${csv}`, [ans("sources", "Add your own knowledge too")]).sourcePolicy).toBe("material-plus");
  });

  it("never sets a source policy without material, even if the idea says 'only use'", () => {
    expect(brief("write a script, only use the standard library").sourcePolicy).toBeUndefined();
  });

  it("marks research and planning about current things as recency-sensitive", () => {
    expect(brief("what are the latest phones under $500?").recencySensitive).toBe(true);
    expect(brief("plan a trip to Lisbon").recencySensitive).toBe(true);
    expect(brief("write a poem about the latest snowfall").recencySensitive).toBeUndefined();
  });
});

describe("nothing invented", () => {
  it("leaves unknown fields empty and uses a neutral default format", () => {
    const b = brief("tell me something interesting");
    expect(b).toEqual({
      category: "general",
      task: "Tell me something interesting",
      context: [],
      requirements: [],
      constraints: [],
      outputFormat: DEFAULT_OUTPUT_FORMAT.general,
      tone: "neutral",
      length: "balanced",
    });
  });

  it("includes examples only when the user gives one", () => {
    expect(brief("write a poem about autumn").examples).toBeUndefined();
    expect(brief("write a poem about autumn", [ans("example", "no")]).examples).toBeUndefined();
    expect(brief("write a poem about autumn", [ans("example", "Leaves fall\nquietly")]).examples).toEqual(["Leaves fall\nquietly"]);
  });

  it("uses the deliverable the user named as the output format", () => {
    expect(brief("short story about a robot").outputFormat).toBe("a short story");
    expect(brief("write an email to my landlord").outputFormat).toBe("an email, ready to send");
    expect(brief("research heat pumps as a table").outputFormat).toBe("a table");
  });
});

describe("basicTitle", () => {
  it.each([
    ["help me write a python function that dedupes a list of user dicts by email", "Python function that dedupes a list of user dicts"],
    ["plan a 3-day trip to Lisbon", "3-day trip to Lisbon"],
    ["Analyze this survey data and tell me the main complaints", "Survey data"],
    ["I have a CSV of monthly sales, find the top regions", "CSV of monthly sales"],
    ["   ", "Untitled prompt"],
  ])("%s → %s", (idea, title) => {
    expect(basicTitle(idea)).toBe(title);
  });

  it("has at most 6 meaningful words", () => {
    const t = basicTitle("write a long detailed comparison of every electric car model sold in Europe since 2015");
    const meaningful = t.split(" ").filter((w) => !/^(a|an|the|of|in|for|to|since)$/i.test(w));
    expect(meaningful.length).toBeLessThanOrEqual(6);
  });
});
