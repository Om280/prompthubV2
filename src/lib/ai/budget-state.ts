/**
 * App-wide "free capacity used up" marker. Server-only, in-memory, per instance.
 *
 * Set when the app-wide daily ceiling (`global:rpd`) refuses a request, or when Google answers a
 * per-day `429 RESOURCE_EXHAUSTED`. `/api/providers` reads it to report `quota-exhausted` with
 * `resetsAt` until then. It is a hint for the UI only: enforcement stays in the persistent quota
 * store and Google.
 */
import "server-only";

let exhaustedUntil: string | null = null;

export function noteBudgetExhausted(resetsAt: string): void {
  if (!Number.isNaN(Date.parse(resetsAt))) exhaustedUntil = resetsAt;
}

/** The reset time while the budget is exhausted, else undefined. */
export function budgetExhaustedUntil(now: Date = new Date()): string | undefined {
  if (exhaustedUntil && Date.parse(exhaustedUntil) > now.getTime()) return exhaustedUntil;
  exhaustedUntil = null;
  return undefined;
}

export function resetBudgetState(): void {
  exhaustedUntil = null;
}
