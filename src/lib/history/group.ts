import type { PromptRecord } from "@/lib/contracts";
import type { HistoryQuery } from "./types";

export type GroupLabel = "Today" | "Yesterday" | "Previous 7 days" | "Earlier";

export interface HistoryGroup {
  label: GroupLabel;
  items: PromptRecord[];
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function groupLabel(ts: number, now: number): GroupLabel {
  const today = startOfDay(now);
  const day = 24 * 60 * 60 * 1000;
  if (ts >= today) return "Today";
  if (ts >= today - day) return "Yesterday";
  if (ts >= today - 7 * day) return "Previous 7 days";
  return "Earlier";
}

/** Filters by target and a case-insensitive match on title or idea. */
export function filterPrompts(items: PromptRecord[], q: HistoryQuery): PromptRecord[] {
  const needle = q.query.trim().toLowerCase();
  return items.filter(
    (p) =>
      (q.target === "all" || p.target === q.target) &&
      (!needle || p.title.toLowerCase().includes(needle) || p.idea.toLowerCase().includes(needle)),
  );
}

/** Groups items (already sorted newest first) into date buckets, keeping order. */
export function groupByDate(items: PromptRecord[], now: number): HistoryGroup[] {
  const order: GroupLabel[] = ["Today", "Yesterday", "Previous 7 days", "Earlier"];
  const map = new Map<GroupLabel, PromptRecord[]>();
  for (const p of items) {
    const label = groupLabel(p.updatedAt, now);
    const list = map.get(label) ?? [];
    list.push(p);
    map.set(label, list);
  }
  return order.filter((l) => map.has(l)).map((label) => ({ label, items: map.get(label)! }));
}
