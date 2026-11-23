import "fake-indexeddb/auto";
import { openDB } from "idb";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PromptRecord, VersionRecord } from "@/lib/contracts";
import { createBrowserStore } from "@/lib/history/browser-store";
import { filterPrompts } from "@/lib/history/group";
import { DB_VERSION, openIdbStore } from "@/lib/history/idb-store";
import { DELETED_RETENTION_MS, type HistoryStore } from "@/lib/history/types";

const NOW = new Date(2026, 10, 23, 15, 0).getTime();
const DAY = 24 * 3_600_000;

let n = 0;
const freshName = () => `prompthub-test-${++n}-${Math.random().toString(36).slice(2)}`;
const open: HistoryStore[] = [];
async function openStore(name: string, now = NOW, channel = false) {
  const s = await openIdbStore({ name, now: () => now, channel });
  open.push(s);
  return s;
}
afterEach(() => {
  while (open.length) open.pop()!.close();
});

function prompt(id: string, extra: Partial<PromptRecord> = {}): PromptRecord {
  return {
    id,
    title: `Title ${id}`,
    idea: `idea ${id}`,
    target: "chatgpt",
    length: "balanced",
    answers: [],
    currentVersionId: `${id}-v1`,
    createdAt: NOW - 1000,
    updatedAt: NOW - 1000,
    deletedAt: null,
    ...extra,
  };
}

function version(id: string, promptId: string, createdAt: number, extra: Partial<VersionRecord> = {}): VersionRecord {
  return { id, promptId, content: `content ${id}`, source: "generated", engine: { kind: "basic" }, createdAt, ...extra };
}

describe("IndexedDB history store", () => {
  it("creates the documented schema (prompthub v1)", async () => {
    const name = freshName();
    (await openStore(name)).close();
    open.pop();
    const db = await openDB(name, DB_VERSION);
    expect([...db.objectStoreNames].sort()).toEqual(["prompts", "versions"]);
    const tx = db.transaction(["prompts", "versions"]);
    expect([...tx.objectStore("prompts").indexNames].sort()).toEqual(["by-deleted", "by-updated"]);
    expect(tx.objectStore("versions").index("by-prompt").keyPath).toEqual(["promptId", "createdAt"]);
    db.close();
  });

  it("creates a prompt with versions, restores a version, renames, and keeps it after re-opening", async () => {
    const name = freshName();
    const store = await openStore(name);
    const listener = vi.fn();
    store.subscribe(listener);

    const v1 = version("v1", "p1", NOW - 3000);
    await store.commit(prompt("p1", { currentVersionId: "v1" }), v1);
    const v2 = version("v2", "p1", NOW - 2000, { source: "edited", engine: { kind: "manual" }, content: "edited" });
    await store.commit(prompt("p1", { currentVersionId: "v2", updatedAt: v2.createdAt }), v2);
    const v3 = version("v3", "p1", NOW - 1000, { source: "restored", restoredFrom: "v1", content: v1.content });
    await store.commit(prompt("p1", { currentVersionId: "v3", updatedAt: v3.createdAt }), v3);
    // Versions of another prompt never leak in.
    await store.commit(prompt("p2"), version("other", "p2", NOW - 1500));

    await store.rename("p1", "  Landlord email  ");
    await store.rename("p1", "   ");
    expect(listener).toHaveBeenCalled();

    store.close();
    open.pop();
    const reopened = await openStore(name);
    const p1 = await reopened.get("p1");
    expect(p1).toMatchObject({ title: "Landlord email", currentVersionId: "v3" });
    const versions = await reopened.getVersions("p1");
    expect(versions.map((v) => [v.id, v.source])).toEqual([
      ["v1", "generated"],
      ["v2", "edited"],
      ["v3", "restored"],
    ]);
    expect(versions[2]).toMatchObject({ restoredFrom: "v1", content: "content v1" });
  });

  it("lists newest first, soft-deletes, restores and deletes for good", async () => {
    const store = await openStore(freshName());
    await store.putPrompt(prompt("old", { updatedAt: NOW - 3 * DAY }));
    await store.putPrompt(prompt("new", { updatedAt: NOW - 1000 }));
    await store.addVersion(version("old-v1", "old", NOW - 3 * DAY));
    expect((await store.list({ deleted: false })).map((p) => p.id)).toEqual(["new", "old"]);

    await store.softDelete("old", NOW);
    expect((await store.list({ deleted: false })).map((p) => p.id)).toEqual(["new"]);
    expect((await store.list({ deleted: true })).map((p) => [p.id, p.deletedAt])).toEqual([["old", NOW]]);

    await store.restore("old");
    expect(await store.list({ deleted: true })).toEqual([]);
    expect((await store.get("old"))?.deletedAt).toBeNull();

    await store.softDelete("old", NOW);
    await store.purge("old");
    expect(await store.get("old")).toBeUndefined();
    expect(await store.getVersions("old")).toEqual([]);
    expect(await store.list({ deleted: true })).toEqual([]);
  });

  it("purges prompts deleted more than 30 days ago on startup, keeping newer ones", async () => {
    const name = freshName();
    const first = await openStore(name, NOW - 40 * DAY);
    await first.commit(prompt("expired", { deletedAt: NOW - DELETED_RETENTION_MS - 1 }), version("e1", "expired", 1));
    await first.commit(prompt("recent", { deletedAt: NOW - 2 * DAY }), version("r1", "recent", 1));
    await first.commit(prompt("live"), version("l1", "live", 1));
    first.close();
    open.pop();

    const store = await openStore(name, NOW);
    expect((await store.list({ deleted: true })).map((p) => p.id)).toEqual(["recent"]);
    expect(await store.get("expired")).toBeUndefined();
    expect(await store.getVersions("expired")).toEqual([]);
    expect(await store.get("live")).toBeDefined();
    expect(await store.purgeExpired(NOW)).toBe(0);
  });

  it("supports search over the listed prompts", async () => {
    const store = await openStore(freshName());
    await store.putPrompt(prompt("a", { title: "Lisbon trip on a budget", target: "gemini" }));
    await store.putPrompt(prompt("b", { title: "SQL for an analyst", idea: "explain a join" }));
    const items = await store.list({ deleted: false });
    expect(filterPrompts(items, { query: "lisbon", target: "all" }).map((p) => p.id)).toEqual(["a"]);
    expect(filterPrompts(items, { query: "JOIN", target: "all" }).map((p) => p.id)).toEqual(["b"]);
    expect(filterPrompts(items, { query: "", target: "gemini" }).map((p) => p.id)).toEqual(["a"]);
  });

  it("tells other tabs to refresh through BroadcastChannel", async () => {
    if (typeof BroadcastChannel === "undefined") return;
    const name = freshName();
    const a = await openStore(name, NOW, true);
    const b = await openStore(name, NOW, true);
    const heard = new Promise<void>((resolve) => b.subscribe(resolve));
    await a.putPrompt(prompt("x"));
    await expect(heard).resolves.toBeUndefined();
    expect(await b.get("x")).toBeDefined();
  });
});

describe("browser store", () => {
  it("uses IndexedDB when it opens", async () => {
    const store = createBrowserStore({ name: freshName(), channel: false });
    await store.putPrompt(prompt("p"));
    expect(store.persistent).toBe(true);
    expect((await store.list({ deleted: false })).map((p) => p.id)).toEqual(["p"]);
    store.close();
  });

  it("falls back to memory and reports it when IndexedDB refuses to open", async () => {
    const store = createBrowserStore({ open: () => Promise.reject(new Error("private mode")) });
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.persistent).toBe(true);
    await store.putPrompt(prompt("p"));
    expect(store.persistent).toBe(false);
    expect(listener).toHaveBeenCalled();
    expect(await store.get("p")).toBeDefined();
    store.close();
  });
});
