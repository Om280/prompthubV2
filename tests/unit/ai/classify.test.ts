import { describe, expect, it } from "vitest";
import { classify, splitMaterial } from "@/lib/ai/basic/classify";
import type { TaskCategory } from "@/lib/prompting";

describe("classify: idea → task category", () => {
  const cases: [TaskCategory, string][] = [
    ["coding", "write a python function that dedupes a list of user dicts by email"],
    ["research", "what are the current options for heat pumps in a cold climate?"],
    ["creative", "short story about a lighthouse keeper who finds a radio that talks back"],
    ["brainstorm", "I need ideas for my sister's 30th birthday party"],
    ["analysis", "analyze the survey results and find the main complaints"],
    ["planning", "plan a 3-day trip to Lisbon"],
    ["productivity", "can you write an email to my landlord asking him to fix the heating"],
    ["general", "tell me something interesting"],
  ];

  it.each(cases)("%s: %s", (expected, idea) => {
    expect(classify(idea)).toBe(expected);
  });

  it("falls back to general for ambiguous or very short ideas", () => {
    expect(classify("hmm")).toBe("general");
    expect(classify("my printer keeps disconnecting from wifi")).toBe("general");
  });

  it("uses pasted material as a signal: data → analysis, code → coding", () => {
    expect(classify("what stands out here?\n\nregion,units\nNorth,10\nSouth,12\nEast,9\nWest,14")).toBe("analysis");
    expect(classify("why does this fail?\n\n```js\nconst x = await fetch(url);\nconsole.log(x.json().name);\n```")).toBe("coding");
  });
});

describe("splitMaterial: pasted material is separated from the instruction", () => {
  it("extracts code fences with their language label", () => {
    const s = splitMaterial("Explain what this does:\n```python\ndef f(x):\n    return x * 2\n```");
    expect(s.instruction).toBe("Explain what this does:");
    expect(s.material).toEqual([{ kind: "code", label: "Pasted python code", content: "def f(x):\n    return x * 2" }]);
  });

  it("extracts CSV-like lines after a colon-terminated instruction", () => {
    const s = splitMaterial("Summarize these results:\nname,score\nAna,3\nBo,5\nCy,4");
    expect(s.instruction).toBe("Summarize these results:");
    expect(s.material[0]).toMatchObject({ kind: "data", label: "Pasted data" });
    expect(s.material[0].content).toBe("name,score\nAna,3\nBo,5\nCy,4");
  });

  it("treats a long prose block as material only when there's a separate instruction", () => {
    const essay = "The council met on Tuesday to discuss the new parking rules. ".repeat(15).trim();
    const withInstr = splitMaterial(`Summarize the key decisions for my team.\n\n${essay}`);
    expect(withInstr.instruction).toBe("Summarize the key decisions for my team.");
    expect(withInstr.material).toEqual([{ kind: "text", label: "Pasted text", content: essay }]);

    const alone = splitMaterial(essay);
    expect(alone.instruction).toBe(essay);
    expect(alone.material).toEqual([]);
  });

  it("numbers repeated labels so several pastes stay distinct", () => {
    const s = splitMaterial("Compare these:\n\na,b\n1,2\n3,4\n5,6\n\nc,d\n7,8\n9,0\n1,1");
    expect(s.material.map((m) => m.label)).toEqual(["Pasted data", "Pasted data 2"]);
  });

  it("leaves a plain idea untouched", () => {
    expect(splitMaterial("plan a 3-day trip to Lisbon")).toEqual({ instruction: "plan a 3-day trip to Lisbon", material: [] });
  });
});
