import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
import type { Engine, ProviderId } from "@/lib/contracts";

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        "type-display",
        "type-display-md",
        "type-display-sm",
        "type-title",
        "type-question",
        "type-input",
        "type-body",
        "type-ui",
        "type-meta",
        "type-kbd",
        "type-wordmark",
      ],
    },
  },
});

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

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Gemini",
};

const PROVIDER_SHORT: Record<ProviderId, string> = {
  anthropic: "Claude",
  openai: "OpenAI",
  google: "Gemini",
};

/** "Claude Sonnet", "OpenAI GPT", "Gemini Flash" (DESIGN §8). */
export function engineLabel(engine: Engine | { kind: "manual" } | null | undefined): string {
  if (!engine) return "";
  if (engine.kind === "basic") return "Basic Mode, no AI";
  if (engine.kind === "manual") return "you";
  const model = engine.model.toLowerCase();
  const family =
    engine.provider === "anthropic"
      ? /opus/.test(model)
        ? "Opus"
        : /haiku/.test(model)
          ? "Haiku"
          : "Sonnet"
      : engine.provider === "google"
        ? /pro/.test(model)
          ? "Pro"
          : "Flash"
        : "GPT";
  return `${PROVIDER_SHORT[engine.provider]} ${family}`;
}

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const p = nav.userAgentData?.platform ?? navigator.platform ?? "";
  return /mac|iphone|ipad|ipod/i.test(p);
}
