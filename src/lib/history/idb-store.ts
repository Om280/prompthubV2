import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { PromptRecord, VersionRecord } from "@/lib/contracts";
import { DELETED_RETENTION_MS, HISTORY_CHANNEL, type HistoryStore } from "./types";

/**
 * IndexedDB history (API_CONTRACTS §6, ARCHITECTURE §4): database `prompthub` v1 with
 *   prompts  (key id)  indexes by-updated → updatedAt, by-deleted → deletedAt
 *   versions (key id)  index   by-prompt  → [promptId, createdAt]
 * `deletedAt` is null for live prompts; null is not a valid IndexedDB key, so `by-deleted` holds only
 * soft-deleted prompts, which is exactly the "Recently deleted" list and the purge scan.
 */

export const DB_NAME = "prompthub";
export const DB_VERSION = 1;

export interface PromptHubDB extends DBSchema {
  prompts: {
    key: string;
    value: PromptRecord;
    indexes: { "by-updated": number; "by-deleted": number };
  };
  versions: {
    key: string;
    value: VersionRecord;
    indexes: { "by-prompt": [string, number] };
  };
}

export interface IdbStoreOptions {
  name?: string;
  /** Clock for the startup purge. */
  now?: () => number;
  /** Set false to skip the BroadcastChannel (tests). Default true where supported. */
  channel?: boolean;
}

export function upgradePromptHubDB(db: IDBPDatabase<PromptHubDB>, oldVersion: number): void {
  if (oldVersion < 1) {
    const prompts = db.createObjectStore("prompts", { keyPath: "id" });
    prompts.createIndex("by-updated", "updatedAt");
    prompts.createIndex("by-deleted", "deletedAt");
    const versions = db.createObjectStore("versions", { keyPath: "id" });
    versions.createIndex("by-prompt", ["promptId", "createdAt"]);
  }
}

const promptRange = (promptId: string) => IDBKeyRange.bound([promptId, -Infinity], [promptId, Infinity]);

/**
 * Opens (creating or upgrading) the database, purges prompts deleted more than 30 days ago, and
 * returns a store. Rejects when IndexedDB is missing or refuses to open (some private modes);
 * callers fall back to the memory store.
 */
export async function openIdbStore(options: IdbStoreOptions = {}): Promise<HistoryStore> {
  if (typeof indexedDB === "undefined") throw new Error("IndexedDB is not available");
  const now = options.now ?? Date.now;
  const name = options.name ?? DB_NAME;

  const db: IDBPDatabase<PromptHubDB> = await openDB<PromptHubDB>(name, DB_VERSION, {
    upgrade: (database, oldVersion) => upgradePromptHubDB(database, oldVersion),
    // A newer schema opened in another tab: let it upgrade. This tab keeps working until reload.
    blocking: (_current, _next, event) => (event.target as IDBDatabase | null)?.close(),
  });

  const listeners = new Set<() => void>();
  const notifyLocal = () => listeners.forEach((l) => l());
  const useChannel = options.channel !== false && typeof BroadcastChannel !== "undefined";
  const channel = useChannel ? new BroadcastChannel(HISTORY_CHANNEL) : null;
  if (channel) channel.onmessage = (e: MessageEvent) => (e.data?.type === "history-changed" ? notifyLocal() : undefined);

  const changed = () => {
    notifyLocal();
    channel?.postMessage({ type: "history-changed" });
  };

  async function patch(id: string, fn: (p: PromptRecord) => PromptRecord | null): Promise<void> {
    const tx = db.transaction("prompts", "readwrite");
    const p = await tx.store.get(id);
    const next = p ? fn(p) : null;
    if (next) await tx.store.put(next);
    await tx.done;
    if (next) changed();
  }

  async function purgeIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const tx = db.transaction(["prompts", "versions"], "readwrite");
    const prompts = tx.objectStore("prompts");
    const versions = tx.objectStore("versions").index("by-prompt");
    for (const id of ids) {
      await prompts.delete(id);
      let cursor = await versions.openKeyCursor(promptRange(id));
      while (cursor) {
        await tx.objectStore("versions").delete(cursor.primaryKey);
        cursor = await cursor.continue();
      }
    }
    await tx.done;
  }

  const store: HistoryStore = {
    persistent: true,

    async list({ deleted }) {
      if (deleted) {
        const items = await db.getAllFromIndex("prompts", "by-deleted");
        return items.sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
      }
      const items = await db.getAllFromIndex("prompts", "by-updated");
      return items.filter((p) => p.deletedAt === null).reverse();
    },
    get: (id) => db.get("prompts", id),
    async getVersions(promptId) {
      return db.getAllFromIndex("versions", "by-prompt", promptRange(promptId));
    },
    async versionCounts() {
      // Key-only cursor over [promptId, createdAt]: no version bodies are read.
      const counts: Record<string, number> = {};
      let cursor = await db.transaction("versions").store.index("by-prompt").openKeyCursor();
      while (cursor) {
        const id = cursor.key[0];
        counts[id] = (counts[id] ?? 0) + 1;
        cursor = await cursor.continue();
      }
      return counts;
    },
    async putPrompt(record) {
      await db.put("prompts", record);
      changed();
    },
    async addVersion(version) {
      await db.put("versions", version);
      changed();
    },
    async commit(record, version) {
      const tx = db.transaction(["prompts", "versions"], "readwrite");
      await Promise.all([tx.objectStore("versions").put(version), tx.objectStore("prompts").put(record), tx.done]);
      changed();
    },
    async rename(id, title) {
      const t = title.trim();
      if (!t) return;
      await patch(id, (p) => (p.title === t ? null : { ...p, title: t }));
    },
    async softDelete(id, at) {
      await patch(id, (p) => (p.deletedAt !== null ? null : { ...p, deletedAt: at }));
    },
    async restore(id) {
      await patch(id, (p) => (p.deletedAt === null ? null : { ...p, deletedAt: null }));
    },
    async purge(id) {
      await purgeIds([id]);
      changed();
    },
    async purgeExpired(at) {
      const ids = await db.getAllKeysFromIndex("prompts", "by-deleted", IDBKeyRange.upperBound(at - DELETED_RETENTION_MS, true));
      await purgeIds(ids);
      if (ids.length) changed();
      return ids.length;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      listeners.clear();
      channel?.close();
      db.close();
    },
  };

  await store.purgeExpired(now());
  return store;
}
