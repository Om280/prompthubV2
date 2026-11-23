import { openIdbStore, type IdbStoreOptions } from "./idb-store";
import { createMemoryStore } from "./memory-store";
import type { HistoryStore } from "./types";

/**
 * The app's history store. Returns immediately and opens IndexedDB on first use (never during
 * server render); every call waits for it. If it
 * cannot open (missing, or refused in some private modes), it switches to the in-memory store,
 * `persistent` becomes false (the rail shows the "can't be saved" notice) and listeners are told.
 */
export function createBrowserStore(
  options: IdbStoreOptions & { open?: (o: IdbStoreOptions) => Promise<HistoryStore> } = {},
): HistoryStore {
  const { open = openIdbStore, ...idbOptions } = options;
  const listeners = new Set<() => void>();
  let persistent = true;
  let unsubscribeInner: (() => void) | null = null;
  let closed = false;

  let opening: Promise<HistoryStore> | null = null;
  const ready = (): Promise<HistoryStore> =>
    (opening ??= open(idbOptions)
      .catch(() => {
        persistent = false;
        return createMemoryStore({}, { persistent: false });
      })
      .then((inner) => {
        if (closed) inner.close();
        else unsubscribeInner = inner.subscribe(() => listeners.forEach((l) => l()));
        if (!persistent) listeners.forEach((l) => l());
        return inner;
      }));

  const via =
    <K extends keyof HistoryStore>(key: K) =>
    async (...args: unknown[]) => {
      const inner = await ready();
      return (inner[key] as (...a: unknown[]) => unknown)(...args);
    };

  return {
    get persistent() {
      return persistent;
    },
    list: via("list") as HistoryStore["list"],
    get: via("get") as HistoryStore["get"],
    getVersions: via("getVersions") as HistoryStore["getVersions"],
    putPrompt: via("putPrompt") as HistoryStore["putPrompt"],
    addVersion: via("addVersion") as HistoryStore["addVersion"],
    commit: via("commit") as HistoryStore["commit"],
    rename: via("rename") as HistoryStore["rename"],
    softDelete: via("softDelete") as HistoryStore["softDelete"],
    restore: via("restore") as HistoryStore["restore"],
    purge: via("purge") as HistoryStore["purge"],
    purgeExpired: via("purgeExpired") as HistoryStore["purgeExpired"],
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      closed = true;
      listeners.clear();
      unsubscribeInner?.();
      void opening?.then((inner) => inner.close());
    },
  };
}
