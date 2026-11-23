import { describe, expect, it } from "vitest";
import { StreamEvent as StreamEventSchema, ClarifyResponse, AiStatusResponse } from "@/lib/contracts/schemas";
import type { StreamEvent } from "@/lib/contracts";
import { chunkText, createMockClient, PROVIDER_UNAVAILABLE_ERROR } from "@/lib/mock/adapter";
import { pickBrief } from "@/lib/mock/briefs";

async function collect(it: AsyncIterable<StreamEvent>) {
  const out: StreamEvent[] = [];
  for await (const ev of it) out.push(ev);
  return out;
}

describe("mock client", () => {
  const client = createMockClient({ speed: 0 });

  it("identifies itself as a mock so the UI can label it", () => {
    expect(client.kind).toBe("mock");
  });

  it("returns contract-valid AI status and clarify responses", async () => {
    expect(AiStatusResponse.safeParse(await client.getAiStatus()).success).toBe(true);
    const res = await client.clarify({ idea: "email my landlord about the heater", target: "claude", length: "balanced" });
    expect(ClarifyResponse.safeParse(res).success).toBe(true);
    expect(res.questions.length).toBeGreaterThan(0);
  });

  it("streams meta, deltas, then exactly one done whose text equals the deltas", async () => {
    const events = await collect(
      client.generate({ idea: "Plan a 3-day trip to Lisbon", target: "gemini", length: "concise", answers: [] }),
    );
    for (const ev of events) expect(StreamEventSchema.safeParse(ev).success).toBe(true);
    expect(events[0].type).toBe("meta");
    const terminal = events.filter((e) => e.type === "done" || e.type === "error");
    expect(terminal).toHaveLength(1);
    expect(events[events.length - 1].type).toBe("done");
    const deltas = events.flatMap((e) => (e.type === "delta" ? [e.text] : [])).join("");
    const done = events[events.length - 1];
    expect(done.type === "done" && done.text).toBe(deltas);
    expect(deltas).toContain("Lisbon");
  });

  it("ends with an error event when told to fail", async () => {
    const failing = createMockClient({ speed: 0, failNext: PROVIDER_UNAVAILABLE_ERROR });
    const events = await collect(
      failing.transform({ action: "shorten", text: "x", target: "chatgpt", length: "balanced", idea: "sql query" }),
    );
    expect(events[events.length - 1]).toEqual({ type: "error", error: PROVIDER_UNAVAILABLE_ERROR });
  });

  it("stops without a terminal event when aborted", async () => {
    const slow = createMockClient({ speed: 1 });
    const ctrl = new AbortController();
    const it = slow.generate({ idea: "sql", target: "claude", length: "balanced", answers: [] }, ctrl.signal);
    ctrl.abort();
    expect(await collect(it)).toEqual([]);
  });

  it("chunks text without losing characters", () => {
    const text = "One two three four five six seven eight nine ten. ".repeat(20);
    expect(chunkText(text).join("")).toBe(text);
  });

  it("picks the brief that matches the idea, else a general one", () => {
    expect(pickBrief("Explain a SQL query to a new analyst").key).toBe("sql");
    expect(pickBrief("zzz").key).toBe("productivity");
  });
});
