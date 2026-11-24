/**
 * Quota windows. Server-only, pure functions (the SQL in supabase/migrations/0001_ai_quota.sql
 * computes the same windows with `date_trunc`).
 *
 * - `minute`, `hour`: aligned to UTC minute/hour boundaries.
 * - `day`: aligned to midnight America/Los_Angeles, which is when Gemini's free-tier daily quotas
 *   reset. That is 08:00 UTC in winter (PST) and 07:00 UTC in summer (PDT); a Pacific "day" is
 *   23 or 25 hours long on DST change days.
 */

export type QuotaWindow = "minute" | "hour" | "day";

export const QUOTA_TIME_ZONE = "America/Los_Angeles";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: QUOTA_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function zonedParts(ms: number): ZonedParts {
  const out: Record<string, number> = {};
  for (const p of partsFormatter.formatToParts(new Date(ms))) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return out as unknown as ZonedParts;
}

/** Offset of Pacific time from UTC at instant `ms`, in ms (e.g. -8 h in winter). */
function zoneOffset(ms: number): number {
  const p = zonedParts(ms);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** The UTC instant of Pacific midnight on the given Pacific calendar date (month 1-12). */
function pacificMidnight(year: number, month: number, day: number): number {
  const guess = Date.UTC(year, month - 1, day);
  let t = guess - zoneOffset(guess);
  // Re-check once at the candidate instant (the offset can differ across a DST change).
  t = guess - zoneOffset(t);
  return t;
}

export function windowStart(kind: QuotaWindow, now: Date): Date {
  const ms = now.getTime();
  if (kind === "minute") return new Date(ms - (ms % MINUTE));
  if (kind === "hour") return new Date(ms - (ms % HOUR));
  const p = zonedParts(ms);
  return new Date(pacificMidnight(p.year, p.month, p.day));
}

/** When the window containing `now` ends (the next reset). */
export function windowReset(kind: QuotaWindow, now: Date): Date {
  const ms = now.getTime();
  if (kind === "minute") return new Date(windowStart(kind, now).getTime() + MINUTE);
  if (kind === "hour") return new Date(windowStart(kind, now).getTime() + HOUR);
  const p = zonedParts(ms);
  // Date.UTC normalises day overflow (e.g. 31 Dec + 1 → 1 Jan).
  const next = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  return new Date(pacificMidnight(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate()));
}

/** Next midnight America/Los_Angeles after `now`, as an ISO string. */
export function nextPacificMidnight(now: Date = new Date()): string {
  return windowReset("day", now).toISOString();
}

export function secondsUntil(target: Date, now: Date): number {
  return Math.max(1, Math.ceil((target.getTime() - now.getTime()) / 1000));
}
