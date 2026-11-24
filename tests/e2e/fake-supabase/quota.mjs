/**
 * In-memory fake of PromptHub's quota functions (supabase/migrations/0001_ai_quota.sql and
 * 0002_usage_read.sql), served at POST /rest/v1/rpc/<name> by the fake Supabase server. Test-only.
 *
 * Same arguments, results and semantics as the SQL:
 *   ai_consume(p_buckets, p_windows, p_limits, p_amounts, p_keys)
 *       → [{ ok, replay, failed_bucket, resets_at, reserved_at }]  all-or-nothing; a key already
 *         counted in its window is a replay (never counted twice)
 *   ai_adjust(p_bucket, p_window, p_at, p_delta)                  → void
 *   ai_acquire_inflight(p_bucket, p_request_id, p_hash, p_max, p_ttl_seconds) → "ok" | "duplicate" | "busy"
 *   ai_release_inflight(p_request_id)                              → void
 *   ai_record_usage(p_user_id, p_request_id, p_operation, p_model,
 *                   p_input_tokens, p_output_tokens, p_status, p_duration_ms, p_request_hash) → void
 *   ai_prune()                                                     → void
 *   ai_my_usage_today()  → [{ workflows_used, refinements_used, window_start }] for the caller (auth.uid())
 *
 * Windows: minute and hour on UTC boundaries; day at midnight America/Los_Angeles.
 */

const TZ = "America/Los_Angeles";
const fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function zoned(ms) {
  const out = {};
  for (const p of fmt.formatToParts(new Date(ms))) if (p.type !== "literal") out[p.type] = Number(p.value);
  return out;
}
const offset = (ms) => {
  const p = zoned(ms);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
};
function pacificMidnight(y, m, d) {
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - offset(guess);
  t = guess - offset(t);
  return t;
}

export function windowStart(window, at) {
  const ms = at.getTime();
  if (window === "minute") return new Date(Math.floor(ms / 60_000) * 60_000);
  if (window === "hour") return new Date(Math.floor(ms / 3_600_000) * 3_600_000);
  const p = zoned(ms);
  return new Date(pacificMidnight(p.year, p.month, p.day));
}

export function windowReset(window, at) {
  const start = windowStart(window, at).getTime();
  if (window === "minute") return new Date(start + 60_000);
  if (window === "hour") return new Date(start + 3_600_000);
  const p = zoned(start + 26 * 3_600_000);
  return new Date(pacificMidnight(p.year, p.month, p.day));
}

export function createQuota() {
  /** `${bucket}|${windowStartISO}` → count */
  const counters = new Map();
  /** counted keys: `${counterKey}#${key}` */
  const counted = new Set();
  /** request id → { bucket, hash, expiresAt } */
  const inflight = new Map();
  const usage = [];

  const ck = (bucket, window, at) => `${bucket}|${windowStart(window, at).toISOString()}`;

  const fns = {
    ai_consume({ p_buckets = [], p_windows = [], p_limits = [], p_amounts = [], p_keys = [] }) {
      const now = new Date();
      const rows = p_buckets.map((bucket, i) => ({
        bucket,
        window: p_windows[i],
        limit: p_limits[i],
        amount: p_amounts[i] ?? 1,
        key: p_keys[i],
      }));
      const pending = rows.filter((r) => !counted.has(`${ck(r.bucket, r.window, now)}#${r.key}`));
      for (const r of [...pending].sort((a, b) => a.bucket.localeCompare(b.bucket))) {
        if ((counters.get(ck(r.bucket, r.window, now)) ?? 0) + r.amount > r.limit) {
          return [
            { ok: false, replay: false, failed_bucket: r.bucket, resets_at: windowReset(r.window, now).toISOString(), reserved_at: null },
          ];
        }
      }
      for (const r of pending) {
        const k = ck(r.bucket, r.window, now);
        counters.set(k, (counters.get(k) ?? 0) + r.amount);
        counted.add(`${k}#${r.key}`);
      }
      return [{ ok: true, replay: pending.length === 0, failed_bucket: null, resets_at: null, reserved_at: now.toISOString() }];
    },
    ai_adjust({ p_bucket, p_window, p_at, p_delta }) {
      const k = ck(p_bucket, p_window, new Date(p_at));
      if (counters.has(k)) counters.set(k, Math.max(0, counters.get(k) + Number(p_delta)));
      return null;
    },
    ai_acquire_inflight({ p_bucket, p_request_id, p_hash, p_max, p_ttl_seconds }) {
      const t = Date.now();
      for (const [id, r] of inflight) if (r.expiresAt <= t) inflight.delete(id);
      if (inflight.has(p_request_id)) return "duplicate";
      const mine = [...inflight.values()].filter((r) => r.bucket === p_bucket);
      if (mine.some((r) => r.hash === p_hash)) return "duplicate";
      if (mine.length >= p_max) return "busy";
      inflight.set(p_request_id, { bucket: p_bucket, hash: p_hash, expiresAt: t + p_ttl_seconds * 1000 });
      return "ok";
    },
    ai_release_inflight({ p_request_id }) {
      inflight.delete(p_request_id);
      return null;
    },
    ai_record_usage(args) {
      usage.push({
        userId: args.p_user_id,
        requestId: args.p_request_id,
        operation: args.p_operation,
        model: args.p_model,
        inputTokens: args.p_input_tokens,
        outputTokens: args.p_output_tokens,
        status: args.p_status,
        durationMs: args.p_duration_ms,
      });
      return null;
    },
    ai_prune() {
      const t = Date.now();
      for (const [id, r] of inflight) if (r.expiresAt <= t) inflight.delete(id);
      return null;
    },
  };

  /** Today's counts for one user (what ai_my_usage_today returns for auth.uid()). */
  function myUsageToday(userId) {
    const now = new Date();
    const day = windowStart("day", now).toISOString();
    return [
      {
        workflows_used: userId ? counters.get(`user:${userId}:workflows:day|${day}`) ?? 0 : 0,
        refinements_used: userId ? counters.get(`user:${userId}:refinements:day|${day}`) ?? 0 : 0,
        window_start: day,
      },
    ];
  }

  /** Test control: set today's count for a user's daily bucket. */
  function setDaily(userId, kind, used) {
    counters.set(`user:${userId}:${kind}:day|${windowStart("day", new Date()).toISOString()}`, Math.max(0, Number(used) || 0));
  }

  function reset() {
    counters.clear();
    counted.clear();
    inflight.clear();
    usage.length = 0;
  }

  return { fns, myUsageToday, setDaily, reset, usage };
}
