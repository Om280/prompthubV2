import type { PromptRecord, TargetPlatform, VersionRecord } from "@/lib/contracts";

/**
 * Storage boundary for saved prompts (API_CONTRACTS §6). Implementations: `createMemoryStore`
 * (preview data, tests, and the fallback when IndexedDB is unavailable) and `openIdbStore`
 * (IndexedDB `prompthub` v1). The app uses `createBrowserStore`, which picks one at runtime.
 */
export interface HistoryStore {
  /** False when history only lives for this tab (IndexedDB unavailable). Drives the rail notice. */
  readonly persistent: boolean;
  list(opts: { deleted: boolean }): Promise<PromptRecord[]>;
  get(id: string): Promise<PromptRecord | undefined>;
  /** Oldest first. */
  getVersions(promptId: string): Promise<VersionRecord[]>;
  /** Creates or replaces the prompt record. */
  putPrompt(record: PromptRecord): Promise<void>;
  addVersion(version: VersionRecord): Promise<void>;
  /** Writes a version and its prompt record together (one transaction where supported). */
  commit(record: PromptRecord, version: VersionRecord): Promise<void>;
  /** Trims the title; an empty title is ignored. */
  rename(id: string, title: string): Promise<void>;
  softDelete(id: string, now: number): Promise<void>;
  restore(id: string): Promise<void>;
  /** Deletes the prompt and its versions for good. */
  purge(id: string): Promise<void>;
  /** Deletes for good everything soft-deleted more than 30 days before `now`. Returns the count. */
  purgeExpired(now: number): Promise<number>;
  /** Called after every write, here or in another tab. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Releases the connection and the cross-tab channel. */
  close(): void;
}

export interface HistoryQuery {
  query: string;
  target: TargetPlatform | "all";
}

export const DELETED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** Cross-tab change notifications (ARCHITECTURE §4). */
export const HISTORY_CHANNEL = "prompthub";
