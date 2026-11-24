import { describe, expect, it, vi } from "vitest";
import type { PromptRecord } from "@/lib/contracts";
import { filterPrompts, groupByDate, groupLabel } from "@/lib/history/group";
import { createMemoryStore } from "@/lib/history/memory-store";

const NOW = new Date(2026, 10, 23, 15, 0).getTime();
const HOUR = 3_600_000;

function rec(id: string, updatedAt: number, extra: Partial<PromptRecord> = {}): PromptRecord {
  return {
    id,
    title: `Title ${id}`,
    idea: `idea ${id}`,
    target: "chatgpt",
    length: "balanced",
    answers: [],
    currentVersionId: `${id}-v1`,
    createdAt: updatedAt,
    updatedAt,
    deletedAt: null,
    ...extra,
  };
}

describe("history grouping", () => {
  it("labels Today, Yesterday, Previous 7 days and Earlier", () => {
    expect(groupLabel(NOW - HOUR, NOW)).toBe("Today");
    expect(groupLabel(NOW - 20 * HOUR, NOW)).toBe("Yesterday");
    expect(groupLabel(NOW - 4 * 24 * HOUR, NOW)).toBe("Previous 7 days");
    expect(groupLabel(NOW - 30 * 24 * HOUR, NOW)).toBe("Earlier");
  });

  it("groups in order and filters by target and query", () => {
    const items = [
      rec("a", NOW - HOUR, { title: "Lisbon trip" }),
      rec("b", NOW - 2 * HOUR, { target: "claude" }),
      rec("c", NOW - 40 * 24 * HOUR),
    ];
    expect(groupByDate(items, NOW).map((g) => [g.label, g.items.length])).toEqual([
      ["Today", 2],
      ["Earlier", 1],
    ]);
    expect(filterPrompts(items, { query: "lisbon", target: "all" }).map((p) => p.id)).toEqual(["a"]);
    expect(filterPrompts(items, { query: "", target: "claude" }).map((p) => p.id)).toEqual(["b"]);
  });
});

describe("memory history store", () => {
  it("seeds lazily, soft-deletes, restores and purges", async () => {
    const seed = vi.fn(() => ({ prompts: [rec("a", NOW), rec("b", NOW - HOUR)] }));
    const store = createMemoryStore(seed);
    expect(seed).not.toHaveBeenCalled();
    const listener = vi.fn();
    store.subscribe(listener);

    expect((await store.list({ deleted: false })).map((p) => p.id)).toEqual(["a", "b"]);
    await store.softDelete("a", NOW + 1);
    expect((await store.list({ deleted: false })).map((p) => p.id)).toEqual(["b"]);
    expect((await store.list({ deleted: true })).map((p) => p.id)).toEqual(["a"]);
    await store.restore("a");
    expect((await store.list({ deleted: true })).length).toBe(0);
    await store.rename("b", "  ");
    expect((await store.get("b"))?.title).toBe("Title b");
    await store.rename("b", "Renamed");
    expect((await store.get("b"))?.title).toBe("Renamed");
    await store.purge("b");
    expect(await store.get("b")).toBeUndefined();
    expect(listener).toHaveBeenCalled();
    expect(seed).toHaveBeenCalledTimes(1);
  });

  it("returns versions oldest first", async () => {
    const store = createMemoryStore();
    await store.addVersion({ id: "2", promptId: "p", content: "b", source: "edited", engine: { kind: "manual" }, createdAt: 2 });
    await store.addVersion({ id: "1", promptId: "p", content: "a", source: "generated", engine: { kind: "basic" }, createdAt: 1 });
    expect((await store.getVersions("p")).map((v) => v.id)).toEqual(["1", "2"]);
  });

  it("counts versions per prompt for the history rows", async () => {
    const store = createMemoryStore();
    expect(await store.versionCounts()).toEqual({});
    await store.addVersion({ id: "1", promptId: "p", content: "a", source: "generated", engine: { kind: "basic" }, createdAt: 1 });
    await store.addVersion({ id: "2", promptId: "p", content: "b", source: "edited", engine: { kind: "manual" }, createdAt: 2 });
    await store.addVersion({ id: "3", promptId: "q", content: "c", source: "generated", engine: { kind: "basic" }, createdAt: 3 });
    expect(await store.versionCounts()).toEqual({ p: 2, q: 1 });
    await store.purge("p");
    expect(await store.versionCounts()).toEqual({ q: 1 });
  });
});
