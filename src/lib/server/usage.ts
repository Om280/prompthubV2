/**
 * The signed-in user's AI allowance today, read through the user's own session. Server-only.
 *
 * This uses the ordinary cookie-session Supabase client (publishable key + the user's JWT), never
 * `SUPABASE_SECRET_KEY`. The database decides whose rows are visible: `ai_my_usage_today()` is a
 * `security invoker` function keyed on `auth.uid()`, and RLS policies on `ai_rate_counters` and
 * `ai_usage` only expose the caller's own rows (supabase/migrations/0002_usage_read.sql). No user
 * id is sent from here, so a caller can't ask for someone else's usage.
 *
 * Callers must only call this after `getVerifiedUser()` returned a user; signed out → no call.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiStatusResponse } from "@/lib/contracts";
import { createClient } from "@/lib/supabase/server";
import type { ServerEnv } from "./env";
import { logServerError } from "./log";
import { nextPacificMidnight } from "./quota-windows";

export type UsageSummary = NonNullable<AiStatusResponse["usage"]>;

export type UsageRpcClient = Pick<SupabaseClient, "rpc">;

interface UsageRow {
  workflows_used: number | null;
  refinements_used: number | null;
}

const count = (used: number, limit: number) => ({ used, limit, remaining: Math.max(0, limit - used) });

export async function readMyUsage(
  env: ServerEnv,
  options: { client?: UsageRpcClient | null; now?: Date } = {},
): Promise<UsageSummary | null> {
  try {
    const client = options.client !== undefined ? options.client : await createClient();
    if (!client) return null;
    const { data, error } = await client.rpc("ai_my_usage_today");
    if (error) {
      // Typically the 0002 migration hasn't been run. Never forward the database message.
      logServerError("reading AI usage failed", (error as { code?: string }).code ?? "error");
      return null;
    }
    const row = (Array.isArray(data) ? data[0] : data) as UsageRow | undefined;
    const used = (n: number | null | undefined) => (typeof n === "number" && n >= 0 ? Math.floor(n) : 0);
    return {
      workflows: count(used(row?.workflows_used), env.ai.userDailyWorkflows),
      refinements: count(used(row?.refinements_used), env.ai.userDailyRefinements),
      resetsAt: nextPacificMidnight(options.now ?? new Date()),
    };
  } catch (err) {
    logServerError("reading AI usage failed", err);
    return null;
  }
}
