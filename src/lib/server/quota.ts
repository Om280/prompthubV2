/**
 * Persistent, atomic AI quota. Server-only.
 *
 * AI routes never use in-memory limits in production: every check goes through a `QuotaStore`
 * backed by Postgres functions in Supabase (supabase/migrations/0001_ai_quota.sql), called with the
 * server-only `SUPABASE_SECRET_KEY`. If Supabase or that key isn't configured, AI is `not-configured`
 * and AI routes refuse. There is no fallback to memory. `createMemoryQuotaStore` exists for tests.
 *
 * Each window carries an idempotency key. A window that already recorded that key in its current
 * period is skipped, so:
 * - a retry with the same `requestId` is never counted twice;
 * - the clarify and generate calls of one workflow (same `workflowId`) count once toward the daily
 *   workflow limit.
 * Consumption is all-or-nothing across windows. Windows can consume more than 1 (the token-per-minute
 * bucket is charged an estimate), and `adjust` reconciles with the actual count afterwards.
 * No prompt text is ever stored: only counters, keys, hashes and usage metadata.
 */
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { windowReset, windowStart, type QuotaWindow } from "./quota-windows";

export interface QuotaWindowSpec {
  bucket: string;
  window: QuotaWindow;
  limit: number;
  /** How much this request consumes (default 1; the TPM bucket uses a token estimate). */
  amount?: number;
  /** Idempotency key: a repeat with the same key in the same period is not counted again. */
  key: string;
}

export type ConsumeResult =
  | { ok: true; replay: boolean; reservedAt: Date }
  | { ok: false; bucket: string; resetsAt: Date };

export type InflightResult = "ok" | "duplicate" | "busy";

export interface UsageRecord {
  userId: string;
  requestId: string;
  operation: string;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  status: string;
  durationMs: number | null;
  requestHash: string;
}

export interface QuotaStore {
  /** Checks every window and increments all of them, or none (when any would go over its limit). */
  consume(windows: QuotaWindowSpec[]): Promise<ConsumeResult>;
  /** Adds `delta` (may be negative; never below 0) to the window that was current at `reservedAt`. */
  adjust(bucket: string, window: QuotaWindow, reservedAt: Date, delta: number): Promise<void>;
  /** Takes a concurrency slot for `bucket` (TTL'd), unless this request or an identical one is running. */
  acquireInflight(bucket: string, requestId: string, hash: string, max: number, ttlSeconds: number): Promise<InflightResult>;
  releaseInflight(requestId: string): Promise<void>;
  recordUsage(record: UsageRecord): Promise<void>;
}

/**
 * Why the store failed: `migration-missing` when PostgREST can't find the functions/tables
 * (HTTP 404, PGRST202 function not found, PGRST205 table not found, 42883/42P01 from Postgres);
 * `not-configured` when Supabase or the secret key is missing; otherwise `unreachable`.
 */
export type QuotaFailure = "migration-missing" | "not-configured" | "unreachable";

export class QuotaStoreError extends Error {
  readonly reason: QuotaFailure;
  constructor(message: string, reason: QuotaFailure = "unreachable") {
    super(message);
    this.name = "QuotaStoreError";
    this.reason = reason;
  }
}

const MISSING_CODES = new Set(["PGRST202", "PGRST205", "42883", "42P01"]);

/** Classifies a PostgREST error without ever reading or forwarding its message. */
export function quotaFailureOf(error: unknown, status?: number): QuotaFailure {
  const code = (error as { code?: unknown } | null)?.code;
  if (status === 404 || (typeof code === "string" && MISSING_CODES.has(code))) return "migration-missing";
  return "unreachable";
}

/* ---------------------------------------------------------------- Supabase */

/** The quota store can run: Supabase URL configured and the server-only secret key present. */
export function isQuotaStoreConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return getSupabaseConfig() !== null && Boolean(env.SUPABASE_SECRET_KEY?.trim());
}

/** The subset of the Supabase client used here, so tests can pass a mocked `rpc`. */
export type RpcClient = Pick<SupabaseClient, "rpc">;

interface ConsumeRow {
  ok: boolean;
  replay: boolean | null;
  failed_bucket: string | null;
  resets_at: string | null;
  reserved_at: string | null;
}

/**
 * Store backed by the Postgres functions. `client` is injectable for tests; by default it is a
 * service client built with `SUPABASE_SECRET_KEY` (read here, at the point of use, never logged).
 */
export function createSupabaseQuotaStore(client?: RpcClient): QuotaStore {
  const rpcClient = client ?? serviceClient();

  async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error, status } = (await rpcClient.rpc(fn, args)) as { data: unknown; error: unknown; status?: number };
    // Never forward the database's message: it can name tables or values.
    if (error) throw new QuotaStoreError(`quota function ${fn} failed`, quotaFailureOf(error, status));
    return data as T;
  }

  return {
    async consume(windows) {
      const data = await call<ConsumeRow[] | ConsumeRow>("ai_consume", {
        p_buckets: windows.map((w) => w.bucket),
        p_windows: windows.map((w) => w.window),
        p_limits: windows.map((w) => w.limit),
        p_amounts: windows.map((w) => w.amount ?? 1),
        p_keys: windows.map((w) => w.key),
      });
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new QuotaStoreError("quota function ai_consume returned nothing");
      if (row.ok) {
        return { ok: true, replay: Boolean(row.replay), reservedAt: row.reserved_at ? new Date(row.reserved_at) : new Date() };
      }
      return {
        ok: false,
        bucket: row.failed_bucket ?? "unknown",
        resetsAt: row.resets_at ? new Date(row.resets_at) : new Date(Date.now() + 60_000),
      };
    },
    async adjust(bucket, window, reservedAt, delta) {
      if (delta === 0) return;
      await call("ai_adjust", { p_bucket: bucket, p_window: window, p_at: reservedAt.toISOString(), p_delta: delta });
    },
    async acquireInflight(bucket, requestId, hash, max, ttlSeconds) {
      const r = await call<string>("ai_acquire_inflight", {
        p_bucket: bucket,
        p_request_id: requestId,
        p_hash: hash,
        p_max: max,
        p_ttl_seconds: ttlSeconds,
      });
      if (r === "ok" || r === "duplicate" || r === "busy") return r;
      throw new QuotaStoreError("quota function ai_acquire_inflight returned an unknown result");
    },
    async releaseInflight(requestId) {
      await call("ai_release_inflight", { p_request_id: requestId });
    },
    async recordUsage(u) {
      await call("ai_record_usage", {
        p_user_id: u.userId,
        p_request_id: u.requestId,
        p_operation: u.operation,
        p_model: u.model,
        p_input_tokens: u.inputTokens,
        p_output_tokens: u.outputTokens,
        p_status: u.status,
        p_duration_ms: u.durationMs,
        p_request_hash: u.requestHash,
      });
    },
  };
}

function serviceClient(): RpcClient {
  const config = getSupabaseConfig();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!config || !secret) throw new QuotaStoreError("quota store isn't configured", "not-configured");
  return createClient(config.url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

let shared: QuotaStore | null = null;

/** The production store (lazily created). Throws `QuotaStoreError` when not configured. */
export function getQuotaStore(): QuotaStore {
  if (!isQuotaStoreConfigured()) throw new QuotaStoreError("quota store isn't configured", "not-configured");
  shared ??= createSupabaseQuotaStore();
  return shared;
}

/* ---------------------------------------------------------------- health */

export type QuotaHealth = "ok" | QuotaFailure;

/** A no-op call that proves the migration's functions exist and the store answers. */
const HEALTH_PROBE_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Probes the quota store with a harmless call (`ai_release_inflight` on the nil UUID, which deletes
 * nothing). Uses the secret key: this is a privileged server-side check, never user data.
 */
export async function probeQuotaStore(client?: RpcClient): Promise<QuotaHealth> {
  try {
    const c = client ?? serviceClient();
    const { error, status } = (await c.rpc("ai_release_inflight", { p_request_id: HEALTH_PROBE_ID })) as {
      error: unknown;
      status?: number;
    };
    return error ? quotaFailureOf(error, status) : "ok";
  } catch (err) {
    return err instanceof QuotaStoreError ? err.reason : "unreachable";
  }
}

const HEALTH_OK_TTL_MS = 60_000;
const HEALTH_FAIL_TTL_MS = 15_000;
let healthCache: { value: QuotaHealth; at: number } | null = null;

/**
 * Cached quota-store health (60 s when healthy, 15 s after a failure), so status requests don't
 * hit the database each time. `invalidateQuotaHealth` forces the next call to probe again.
 */
export async function quotaHealth(probe: () => Promise<QuotaHealth> = () => probeQuotaStore(), now = Date.now()): Promise<QuotaHealth> {
  if (healthCache) {
    const ttl = healthCache.value === "ok" ? HEALTH_OK_TTL_MS : HEALTH_FAIL_TTL_MS;
    if (now - healthCache.at < ttl) return healthCache.value;
  }
  const value = await probe();
  healthCache = { value, at: now };
  return value;
}

export function noteQuotaFailure(reason: QuotaFailure, now = Date.now()): void {
  healthCache = { value: reason, at: now };
}

export function invalidateQuotaHealth(): void {
  healthCache = null;
}

/* ---------------------------------------------------------------- memory (tests only) */

export type MemoryQuotaStore = QuotaStore & {
  /** `${bucket}@${windowStartISO}` → count. */
  counts(): Map<string, number>;
  usage: UsageRecord[];
};

/** Same semantics as the SQL functions, in memory. For tests; never used for AI in production. */
export function createMemoryQuotaStore(now: () => Date = () => new Date()): MemoryQuotaStore {
  const counters = new Map<string, number>();
  const consumed = new Set<string>();
  const inflight = new Map<string, { bucket: string; hash: string; expiresAt: number }>();
  const usage: UsageRecord[] = [];
  const counterKey = (bucket: string, window: QuotaWindow, t: Date) => `${bucket}@${windowStart(window, t).toISOString()}`;

  return {
    usage,
    counts: () => counters,
    async consume(windows) {
      const t = now();
      const pending = windows.filter((w) => !consumed.has(`${counterKey(w.bucket, w.window, t)}#${w.key}`));
      for (const w of [...pending].sort((a, b) => a.bucket.localeCompare(b.bucket))) {
        if ((counters.get(counterKey(w.bucket, w.window, t)) ?? 0) + (w.amount ?? 1) > w.limit) {
          return { ok: false, bucket: w.bucket, resetsAt: windowReset(w.window, t) };
        }
      }
      for (const w of pending) {
        const k = counterKey(w.bucket, w.window, t);
        counters.set(k, (counters.get(k) ?? 0) + (w.amount ?? 1));
        consumed.add(`${k}#${w.key}`);
      }
      return { ok: true, replay: pending.length === 0, reservedAt: t };
    },
    async adjust(bucket, window, reservedAt, delta) {
      const k = counterKey(bucket, window, reservedAt);
      if (counters.has(k)) counters.set(k, Math.max(0, (counters.get(k) ?? 0) + delta));
    },
    async acquireInflight(bucket, requestId, hash, max, ttlSeconds) {
      const t = now().getTime();
      for (const [id, r] of inflight) if (r.expiresAt <= t) inflight.delete(id);
      if (inflight.has(requestId)) return "duplicate";
      const mine = [...inflight.values()].filter((r) => r.bucket === bucket);
      if (mine.some((r) => r.hash === hash)) return "duplicate";
      if (mine.length >= max) return "busy";
      inflight.set(requestId, { bucket, hash, expiresAt: t + ttlSeconds * 1000 });
      return "ok";
    },
    async releaseInflight(requestId) {
      inflight.delete(requestId);
    },
    async recordUsage(u) {
      usage.push(u);
    },
  };
}
