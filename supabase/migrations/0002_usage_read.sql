-- PromptHub: let a signed-in user read their own AI usage, through RLS.
--
-- Apply after 0001_ai_quota.sql (Supabase SQL editor or `supabase db push`).
--
-- Ordinary user reads go through the user's own session (publishable key + the user's JWT), so the
-- database, not the app, decides whose rows are visible. The server-side secret key stays reserved
-- for the privileged quota operations in 0001 (counters, leases, usage writes).
--
-- What `authenticated` gets, and nothing more:
--   select on ai_usage          rows where user_id = auth.uid()
--   select on ai_rate_counters  only the caller's own daily buckets
--                               (user:<uid>:workflows:day, user:<uid>:refinements:day)
--   execute ai_my_usage_today() security invoker, so the policies above still apply
-- anon gets nothing. No insert, update or delete for anyone but service_role (via 0001's functions).

begin;

-- ---------------------------------------------------------------- ai_usage: own rows only

grant select on public.ai_usage to authenticated;

drop policy if exists ai_usage_select_own on public.ai_usage;
create policy ai_usage_select_own on public.ai_usage
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- ai_rate_counters: own daily buckets only

grant select on public.ai_rate_counters to authenticated;

drop policy if exists ai_rate_counters_select_own on public.ai_rate_counters;
create policy ai_rate_counters_select_own on public.ai_rate_counters
  for select to authenticated
  using (
    bucket = 'user:' || (select auth.uid())::text || ':workflows:day'
    or bucket = 'user:' || (select auth.uid())::text || ':refinements:day'
  );

-- ---------------------------------------------------------------- today's counts for the caller

-- Today's workflows and refinements for the calling user (auth.uid()), in the current Pacific day
-- (the same window as 0001's ai_window_start('day', now())). Takes no user id: it can only ever
-- answer for the caller. Returns zeros when nothing was used yet (or when called without a user).
create or replace function public.ai_my_usage_today()
returns table (workflows_used integer, refinements_used integer, window_start timestamptz)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with w as (
    select (date_trunc('day', now() at time zone 'America/Los_Angeles')) at time zone 'America/Los_Angeles' as ws
  )
  select
    coalesce((select rc.count from public.ai_rate_counters rc, w
               where rc.bucket = 'user:' || (select auth.uid())::text || ':workflows:day'
                 and rc.window_start = w.ws), 0) as workflows_used,
    coalesce((select rc.count from public.ai_rate_counters rc, w
               where rc.bucket = 'user:' || (select auth.uid())::text || ':refinements:day'
                 and rc.window_start = w.ws), 0) as refinements_used,
    (select ws from w) as window_start;
$$;

revoke all on function public.ai_my_usage_today() from public, anon;
grant execute on function public.ai_my_usage_today() to authenticated;

commit;
