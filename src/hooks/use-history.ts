"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { PromptRecord } from "@/lib/contracts";
import type { HistoryStore } from "@/lib/history/types";

export interface HistoryLists {
  active: PromptRecord[];
  deleted: PromptRecord[];
  /** Versions per prompt id. */
  counts: Record<string, number>;
  loaded: boolean;
}

/** Live view of the history store; reloads after every write. */
export function useHistoryLists(store: HistoryStore): HistoryLists {
  const [lists, setLists] = useState<HistoryLists>({ active: [], deleted: [], counts: {}, loaded: false });
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [active, deleted, counts] = await Promise.all([
        store.list({ deleted: false }),
        store.list({ deleted: true }),
        store.versionCounts(),
      ]);
      if (!cancelled) setLists({ active, deleted, counts, loaded: true });
    };
    void load();
    const unsub = store.subscribe(() => void load());
    return () => {
      cancelled = true;
      unsub();
    };
  }, [store]);
  return lists;
}

let clock = 0;
const clockListeners = new Set<() => void>();
let clockTimer: ReturnType<typeof setInterval> | null = null;

function subscribeClock(cb: () => void) {
  clockListeners.add(cb);
  if (!clockTimer) {
    clockTimer = setInterval(() => {
      clock = Date.now();
      clockListeners.forEach((l) => l());
    }, 30_000);
  }
  return () => {
    clockListeners.delete(cb);
    if (clockListeners.size === 0 && clockTimer) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  };
}

/** A shared clock that ticks every 30 s, for relative times. 0 during server render. */
export function useNow(): number {
  return useSyncExternalStore(
    subscribeClock,
    () => {
      if (!clock) clock = Date.now();
      return clock;
    },
    () => 0,
  );
}
