-- PromptHub: persistent, atomic AI quota (Gemini free tier).
--
-- Apply once in the Supabase SQL editor (or with `supabase db push`). See docs/AUTH_SETUP.md §7.
-- Only the server, using SUPABASE_SECRET_KEY (the service role), can touch these tables and
-- functions: RLS is on with no policies, and execute is revoked from anon/authenticated.
-- No prompt text is ever stored: only counters, idempotency keys, hashes and usage metadata.
--
-- Buckets used by src/lib/server/guard.ts:
--   user:<id>:min                 minute   AI_USER_PER_MINUTE (3)
--   ip:<ip>:min                   minute   AI_IP_PER_MINUTE (10)
--   user:<id>:workflows:day       day      AI_USER_DAILY_WORKFLOWS (5), key = workflowId
--   user:<id>:refinements:day     day      AI_USER_DAILY_REFINEMENTS (5)
--   global:rpm / global:tpm       minute   AI_GLOBAL_SAFETY_RATIO × GEMINI_PROJECT_RPM / _TPM
--   global:rpd                    day      AI_GLOBAL_SAFETY_RATIO × GEMINI_PROJECT_RPD
--   inflight:user:<id>            in-flight leases (AI_MAX_CONCURRENT_PER_USER, TTL)
-- "day" windows start at midnight America/Los_Angeles (when Gemini's daily free quota resets).

begin;

-- ---------------------------------------------------------------- tables

create table if not exists public.ai_rate_counters (
  bucket        text        not null,
  window_start  timestamptz not null,
  count         integer     not null default 0 check (count >= 0),
  primary key (bucket, window_start)
);

-- Idempotency: one row per (bucket, period, key). A key already present is not counted again.
create table if not exists public.ai_consumed (
  bucket        text        not null,
  window_start  timestamptz not null,
  key           text        not null,
  amount        integer     not null,
  created_at    timestamptz not null default now(),
  primary key (bucket, window_start, key)
);

create table if not exists public.ai_inflight (
  bucket        text        not null,
  request_id    uuid        primary key,
  request_hash  text        not null,
  expires_at    timestamptz not null
);
create index if not exists ai_inflight_bucket_idx on public.ai_inflight (bucket, expires_at);

create table if not exists public.ai_usage (
  id             bigserial   primary key,
  user_id        uuid        not null,
  request_id     uuid,
  operation      text        not null,
  model          text,
  input_tokens   integer,
  output_tokens  integer,
  status         text        not null,
  duration_ms    integer,
  request_hash   text,
  created_at     timestamptz not null default now()
);
create index if not exists ai_usage_user_created_idx on public.ai_usage (user_id, created_at);

alter table public.ai_rate_counters enable row level security;
alter table public.ai_consumed      enable row level security;
alter table public.ai_inflight      enable row level security;
alter table public.ai_usage         enable row level security;
-- No policies: anon and authenticated users can't read or write any row.

revoke all on public.ai_rate_counters, public.ai_consumed, public.ai_inflight, public.ai_usage from anon, authenticated;
revoke all on sequence public.ai_usage_id_seq from anon, authenticated;

-- ---------------------------------------------------------------- windows

create or replace function public.ai_window_start(p_window text, p_at timestamptz)
returns timestamptz
language sql stable
set search_path = pg_catalog
as $$
  select case p_window
    when 'minute' then date_trunc('minute', p_at)
    when 'hour'   then date_trunc('hour', p_at)
    when 'day'    then (date_trunc('day', p_at at time zone 'America/Los_Angeles')) at time zone 'America/Los_Angeles'
  end;
$$;

-- The next reset. For 'day' the interval is added in local time, so DST days are 23 or 25 hours.
create or replace function public.ai_window_reset(p_window text, p_at timestamptz)
returns timestamptz
language sql stable
set search_path = pg_catalog
as $$
  select case p_window
    when 'minute' then date_trunc('minute', p_at) + interval '1 minute'
    when 'hour'   then date_trunc('hour', p_at) + interval '1 hour'
    when 'day'    then (date_trunc('day', p_at at time zone 'America/Los_Angeles') + interval '1 day') at time zone 'America/Los_Angeles'
  end;
$$;

-- ---------------------------------------------------------------- ai_consume

-- Atomically checks every window and increments all of them, or none.
-- Windows whose (bucket, period, key) was already consumed are skipped (idempotent retries,
-- one count per workflow). Rows are locked in bucket order to avoid deadlocks.
-- Returns one row: ok, replay (every window was already consumed), failed_bucket, resets_at,
-- reserved_at (the database time used for the windows; pass it back to ai_adjust).
create or replace function public.ai_consume(
  p_buckets text[],
  p_windows text[],
  p_limits  integer[],
  p_amounts integer[],
  p_keys    text[]
)
returns table (ok boolean, replay boolean, failed_bucket text, resets_at timestamptz, reserved_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n        integer := coalesce(array_length(p_buckets, 1), 0);
  v_now    timestamptz := now();
  v_start  timestamptz;
  v_count  integer;
  v_todo   integer[] := '{}';
  i        integer;
begin
  if n = 0
     or n <> coalesce(array_length(p_windows, 1), 0)
     or n <> coalesce(array_length(p_limits, 1), 0)
     or n <> coalesce(array_length(p_amounts, 1), 0)
     or n <> coalesce(array_length(p_keys, 1), 0) then
    raise exception 'ai_consume: arrays must be non-empty and of equal length';
  end if;

  -- Check phase (with row locks), in a stable order.
  for i in select t.ord from unnest(p_buckets) with ordinality as t(b, ord) order by t.b, t.ord loop
    if p_windows[i] not in ('minute', 'hour', 'day') or p_amounts[i] < 0 or p_limits[i] < 1 then
      raise exception 'ai_consume: invalid window, amount or limit';
    end if;
    v_start := public.ai_window_start(p_windows[i], v_now);

    perform 1 from public.ai_consumed c
      where c.bucket = p_buckets[i] and c.window_start = v_start and c.key = p_keys[i];
    if found then
      continue; -- already counted for this key in this period
    end if;

    insert into public.ai_rate_counters as rc (bucket, window_start, count)
      values (p_buckets[i], v_start, 0)
      on conflict (bucket, window_start) do nothing;
    select rc.count into v_count from public.ai_rate_counters rc
      where rc.bucket = p_buckets[i] and rc.window_start = v_start
      for update;

    if v_count + p_amounts[i] > p_limits[i] then
      return query select false, false, p_buckets[i], public.ai_window_reset(p_windows[i], v_now), v_now;
      return; -- nothing was incremented
    end if;
    v_todo := v_todo || i;
  end loop;

  -- Apply phase: every check passed.
  foreach i in array v_todo loop
    v_start := public.ai_window_start(p_windows[i], v_now);
    update public.ai_rate_counters rc set count = rc.count + p_amounts[i]
      where rc.bucket = p_buckets[i] and rc.window_start = v_start;
    insert into public.ai_consumed (bucket, window_start, key, amount)
      values (p_buckets[i], v_start, p_keys[i], p_amounts[i]);
  end loop;

  return query select true, coalesce(array_length(v_todo, 1), 0) = 0, null::text, null::timestamptz, v_now;
end;
$$;

-- Reconciles a window after the call (e.g. TPM estimate → actual tokens). Never below zero.
create or replace function public.ai_adjust(p_bucket text, p_window text, p_at timestamptz, p_delta integer)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.ai_rate_counters
     set count = greatest(0, count + p_delta)
   where bucket = p_bucket and window_start = public.ai_window_start(p_window, p_at);
$$;

-- ---------------------------------------------------------------- in-flight leases

-- 'ok' (lease taken), 'duplicate' (this request_id or an identical request is running),
-- 'busy' (p_max leases already held). Expired leases are cleared first, so a crash can't lock a
-- user out for longer than the TTL.
create or replace function public.ai_acquire_inflight(
  p_bucket text, p_request_id uuid, p_hash text, p_max integer, p_ttl_seconds integer
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_held integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_bucket, 0));
  delete from public.ai_inflight where bucket = p_bucket and expires_at <= now();

  if exists (select 1 from public.ai_inflight where request_id = p_request_id and expires_at > now())
     or exists (select 1 from public.ai_inflight where bucket = p_bucket and request_hash = p_hash) then
    return 'duplicate';
  end if;

  select count(*) into v_held from public.ai_inflight where bucket = p_bucket;
  if v_held >= p_max then
    return 'busy';
  end if;

  insert into public.ai_inflight (bucket, request_id, request_hash, expires_at)
    values (p_bucket, p_request_id, p_hash, now() + make_interval(secs => p_ttl_seconds));
  return 'ok';
end;
$$;

create or replace function public.ai_release_inflight(p_request_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.ai_inflight where request_id = p_request_id;
$$;

-- ---------------------------------------------------------------- usage

create or replace function public.ai_record_usage(
  p_user_id uuid, p_request_id uuid, p_operation text, p_model text,
  p_input_tokens integer, p_output_tokens integer, p_status text, p_duration_ms integer, p_request_hash text
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.ai_usage (user_id, request_id, operation, model, input_tokens, output_tokens, status, duration_ms, request_hash)
  values (p_user_id, p_request_id, p_operation, p_model, p_input_tokens, p_output_tokens, p_status, p_duration_ms, p_request_hash);
$$;

-- ---------------------------------------------------------------- housekeeping

-- Deletes counters and keys older than two days and expired leases. Run daily (e.g. pg_cron:
-- select cron.schedule('ai-prune', '15 9 * * *', 'select public.ai_prune()');).
create or replace function public.ai_prune()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.ai_rate_counters where window_start < now() - interval '2 days';
  delete from public.ai_consumed      where window_start < now() - interval '2 days';
  delete from public.ai_inflight      where expires_at < now();
$$;

-- ---------------------------------------------------------------- privileges

revoke all on function
  public.ai_window_start(text, timestamptz),
  public.ai_window_reset(text, timestamptz),
  public.ai_consume(text[], text[], integer[], integer[], text[]),
  public.ai_adjust(text, text, timestamptz, integer),
  public.ai_acquire_inflight(text, uuid, text, integer, integer),
  public.ai_release_inflight(uuid),
  public.ai_record_usage(uuid, uuid, text, text, integer, integer, text, integer, text),
  public.ai_prune()
from public, anon, authenticated;

grant execute on function
  public.ai_consume(text[], text[], integer[], integer[], text[]),
  public.ai_adjust(text, text, timestamptz, integer),
  public.ai_acquire_inflight(text, uuid, text, integer, integer),
  public.ai_release_inflight(uuid),
  public.ai_record_usage(uuid, uuid, text, text, integer, integer, text, integer, text),
  public.ai_prune()
to service_role;

commit;
