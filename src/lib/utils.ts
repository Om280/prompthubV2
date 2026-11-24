import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Engine } from "@/lib/contracts";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function wordCount(text: string): number {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Compact relative time for history rows: "now", "2m", "1h", "3d", "12 Nov". */
export function relativeShort(ts: number, now: number): string {
  const d = Math.max(0, now - ts);
  if (d < MIN) return "now";
  if (d < HOUR) return `${Math.floor(d / MIN)}m`;
  if (d < DAY) return `${Math.floor(d / HOUR)}h`;
  if (d < 7 * DAY) return `${Math.floor(d / DAY)}d`;
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Sentence relative time for meta lines: "just now", "2 min ago", "3 h ago", "yesterday". */
export function relativeLong(ts: number, now: number): string {
  const d = Math.max(0, now - ts);
  if (d < MIN) return "just now";
  if (d < HOUR) return `${Math.floor(d / MIN)} min ago`;
  if (d < DAY) return `${Math.floor(d / HOUR)} h ago`;
  if (d < 2 * DAY) return "yesterday";
  return `${Math.floor(d / DAY)} days ago`;
}

/** "Gemini 3.5 Flash Lite" for "gemini-3.5-flash-lite": the model id, capitalised, nothing invented. */
export function modelLabel(model: string): string {
  const words = model
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => (/^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)));
  return words.join(" ") || model;
}

export function engineLabel(engine: Engine | { kind: "manual" } | null | undefined): string {
  if (!engine) return "";
  if (engine.kind === "basic") return "Basic Mode, no AI";
  if (engine.kind === "manual") return "you";
  return `${modelLabel(engine.model)} (free tier)`;
}

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const p = nav.userAgentData?.platform ?? navigator.platform ?? "";
  return /mac|iphone|ipad|ipod/i.test(p);
}
