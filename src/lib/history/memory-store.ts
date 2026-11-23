import type { PromptRecord, VersionRecord } from "@/lib/contracts";
import { DELETED_RETENTION_MS, type HistoryStore } from "./types";

type Seed = { prompts?: PromptRecord[]; versions?: VersionRecord[] };

/**
 * In-memory history for preview data, tests, and browsers where IndexedDB is unavailable.
 * `seed` may be a function; it then runs on first access (never during server render).
 */
export function createMemoryStore(seed: Seed | (() => Seed) = {}, opts: { persistent?: boolean } = {}): HistoryStore {
  const prompts = new Map<string, PromptRecord>();
  const versions = new Map<string, VersionRecord[]>();
  let pending: (() => Seed) | null = typeof seed === "function" ? seed : () => seed;
  const ensure = () => {
    if (!pending) return;
    const data = pending();
    pending = null;
    for (const p of data.prompts ?? []) prompts.set(p.id, { ...p });
    for (const v of data.versions ?? []) {
      const list = versions.get(v.promptId) ?? [];
      list.push(v);
      versions.set(v.promptId, list);
    }
  };
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  function update(id: string, patch: Partial<PromptRecord>) {
    ensure();
    const p = prompts.get(id);
    if (!p) return;
    prompts.set(id, { ...p, ...patch });
    emit();
  }

  return {
    persistent: opts.persistent ?? true,

    async list({ deleted }) {
      ensure();
      return [...prompts.values()]
        .filter((p) => (deleted ? p.deletedAt !== null : p.deletedAt === null))
        .sort((a, b) => (deleted ? (b.deletedAt ?? 0) - (a.deletedAt ?? 0) : b.updatedAt - a.updatedAt));
    },
    async get(id) {
      ensure();
      return prompts.get(id);
    },
    async getVersions(promptId) {
      ensure();
      return [...(versions.get(promptId) ?? [])].sort((a, b) => a.createdAt - b.createdAt);
    },
    async putPrompt(record) {
      ensure();
      prompts.set(record.id, { ...record });
      emit();
    },
    async addVersion(version) {
      ensure();
      const list = versions.get(version.promptId) ?? [];
      if (!list.some((v) => v.id === version.id)) list.push(version);
      versions.set(version.promptId, list);
      emit();
    },
    async commit(record, version) {
      ensure();
      const list = versions.get(version.promptId) ?? [];
      if (!list.some((v) => v.id === version.id)) list.push(version);
      versions.set(version.promptId, list);
      prompts.set(record.id, { ...record });
      emit();
    },
    async rename(id, title) {
      const t = title.trim();
      if (t) update(id, { title: t });
    },
    async softDelete(id, now) {
      update(id, { deletedAt: now });
    },
    async restore(id) {
      update(id, { deletedAt: null });
    },
    async purge(id) {
      ensure();
      prompts.delete(id);
      versions.delete(id);
      emit();
    },
    async purgeExpired(now) {
      ensure();
      let n = 0;
      for (const p of [...prompts.values()]) {
        if (p.deletedAt !== null && p.deletedAt < now - DELETED_RETENTION_MS) {
          prompts.delete(p.id);
          versions.delete(p.id);
          n++;
        }
      }
      if (n) emit();
      return n;
    },
    close() {
      listeners.clear();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
