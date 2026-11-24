/**
 * The user's usage is read through their own RLS session client, with no user id from the app.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { readFileSync } from "node:fs";
import { readServerEnv } from "@/lib/server/env";
import { readMyUsage, type UsageRpcClient } from "@/lib/server/usage";

const env = readServerEnv({});
const now = new Date("2026-11-24T12:00:00Z");

describe("readMyUsage (RLS session client)", () => {
  it("calls ai_my_usage_today with no arguments: the database uses auth.uid() from the session JWT", async () => {
    const rpc = vi.fn(async () => ({ data: [{ workflows_used: 2, refinements_used: 5 }], error: null }));
    const out = await readMyUsage(env, { client: { rpc } as unknown as UsageRpcClient, now });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]).toEqual(["ai_my_usage_today"]);
    expect(out).toEqual({
      workflows: { used: 2, limit: 5, remaining: 3 },
      refinements: { used: 5, limit: 5, remaining: 0 },
      resetsAt: "2026-11-25T08:00:00.000Z",
    });
  });

  it("no session client (auth not configured) → null, no call; database errors → null, message not logged", async () => {
    expect(await readMyUsage(env, { client: null })).toBeNull();
    const logs: string[] = [];
    vi.spyOn(console, "error").mockImplementation((m: unknown) => void logs.push(String(m)));
    const rpc = vi.fn(async () => ({ data: null, error: { code: "PGRST202", message: "function public.ai_my_usage_today secret detail" } }));
    expect(await readMyUsage(env, { client: { rpc } as unknown as UsageRpcClient })).toBeNull();
    expect(logs.join()).not.toContain("secret detail");
  });

  it("the 0002 migration grants only select/execute to authenticated and keys every policy on auth.uid()", () => {
    const sql = readFileSync("supabase/migrations/0002_usage_read.sql", "utf8");
    expect(sql).toMatch(/using \(user_id = \(select auth\.uid\(\)\)\)/);
    expect(sql).toMatch(/security invoker/);
    expect(sql).not.toMatch(/security definer/);
    expect(sql).not.toMatch(/grant (insert|update|delete|all)/i);
    expect(sql).toMatch(/revoke all on function public\.ai_my_usage_today\(\) from public, anon;/);
    expect(sql).not.toMatch(/to anon/);
    // The function takes no user id parameter.
    expect(sql).toMatch(/function public\.ai_my_usage_today\(\)/);
  });
});
