/**
 * Route guards: identity, rate limits and concurrency in one call. Server-only.
 *
 * Every AI route MUST start with `guardAiRoute(request)`; every public (Basic Mode) route starts with
 * `guardPublicRoute(request)`. Both return a lease that must be released when the request finishes:
 * pass `lease.release` to `ndjsonResponse` for streams (it releases on done, error and client
 * cancel), release in `finally` for JSON routes, and release in the error path when anything throws
 * before the response exists. Release is idempotent and also runs when the request is aborted.
 *
 * Order (cheapest rejection first, and identity before anything keyed by it):
 *   AI routes:     auth (401) → per-user limit (429) → per-IP limit (429) → concurrency (429)
 *   public routes: per-IP limit (429) → per-user limit when signed in (429) → concurrency (429)
 *
 * Identity only ever comes from `getVerifiedUser()` (verified JWT claims). Headers such as
 * `x-user-id` and ids in the body are ignored.
 */
import { AppError, AUTH_NOT_CONFIGURED_MESSAGE, AUTH_REQUIRED_MESSAGE } from "@/lib/ai/errors";
import { isAuthConfigured } from "@/lib/supabase/config";
import { getVerifiedUser, type VerifiedUser } from "./auth";
import { requestConcurrency, type ConcurrencyLimiter } from "./concurrency";
import { MAX_CONCURRENT_REQUESTS } from "./env";
import { clientKey, ipRateLimiter, userRateLimiter, type RateLimiter } from "./rate-limit";

export interface GuardDeps {
  getUser?: () => Promise<VerifiedUser | null>;
  authConfigured?: () => boolean;
  ipLimiter?: RateLimiter;
  userLimiter?: RateLimiter;
  concurrency?: ConcurrencyLimiter;
}

export interface RouteLease {
  /** The verified user, or null on public routes when signed out. */
  user: VerifiedUser | null;
  /** Frees this request's concurrency slot. Idempotent. */
  release(): void;
}

export interface AiRouteLease extends RouteLease {
  user: VerifiedUser;
}

export const TOO_MANY_CONCURRENT_MESSAGE = `You already have ${MAX_CONCURRENT_REQUESTS} requests running. Wait for one to finish.`;

const seconds = (n: number) => `${n} second${n === 1 ? "" : "s"}`;

function ipLimited(retryAfterSec: number): AppError {
  return new AppError("rate_limited", `Too many requests in a short time. Wait ${seconds(retryAfterSec)} and try again.`, {
    retryAfterSec,
  });
}

function userLimited(retryAfterSec: number): AppError {
  return new AppError(
    "rate_limited",
    `You've sent a lot of requests in the last minute. Wait ${seconds(retryAfterSec)} and try again.`,
    { retryAfterSec },
  );
}

const userKeyOf = (user: VerifiedUser) => `user:${user.id}`;
const ipKeyOf = (request: Request) => `ip:${clientKey(request)}`;

function checkUser(limiter: RateLimiter, user: VerifiedUser) {
  const r = limiter.check(userKeyOf(user));
  if (!r.ok) throw userLimited(r.retryAfterSec);
}

function checkIp(limiter: RateLimiter, request: Request) {
  const r = limiter.check(ipKeyOf(request));
  if (!r.ok) throw ipLimited(r.retryAfterSec);
}

function acquire(limiter: ConcurrencyLimiter, key: string, request: Request): () => void {
  const lease = limiter.acquire(key);
  if (!lease) throw new AppError("too_many_concurrent", TOO_MANY_CONCURRENT_MESSAGE);
  const release = () => {
    request.signal?.removeEventListener("abort", release);
    lease.release();
  };
  if (request.signal?.aborted) release();
  else request.signal?.addEventListener("abort", release, { once: true });
  return release;
}

/**
 * Guard for AI routes. Throws `AppError`: 401 `auth_required` (signed out, expired, forged or auth
 * not configured), 429 `rate_limited` (per user, then per IP), 429 `too_many_concurrent`.
 */
export async function guardAiRoute(request: Request, deps: GuardDeps = {}): Promise<AiRouteLease> {
  const user = await (deps.getUser ?? (() => getVerifiedUser()))();
  if (!user) {
    const configured = (deps.authConfigured ?? isAuthConfigured)();
    throw new AppError("auth_required", configured ? AUTH_REQUIRED_MESSAGE : AUTH_NOT_CONFIGURED_MESSAGE);
  }
  checkUser(deps.userLimiter ?? userRateLimiter, user);
  checkIp(deps.ipLimiter ?? ipRateLimiter, request);
  const release = acquire(deps.concurrency ?? requestConcurrency, userKeyOf(user), request);
  return { user, release };
}

/**
 * Guard for public Basic Mode routes (clarify, generate). Throws 429 `rate_limited` (per IP, then per
 * user when signed in) or 429 `too_many_concurrent` (per user when signed in, else per IP).
 */
export async function guardPublicRoute(request: Request, deps: GuardDeps = {}): Promise<RouteLease> {
  checkIp(deps.ipLimiter ?? ipRateLimiter, request);
  const user = await (deps.getUser ?? (() => getVerifiedUser()))();
  if (user) checkUser(deps.userLimiter ?? userRateLimiter, user);
  const key = user ? userKeyOf(user) : ipKeyOf(request);
  const release = acquire(deps.concurrency ?? requestConcurrency, key, request);
  return { user, release };
}

/** Test helper: clears every shared limiter. */
export function resetGuards(): void {
  ipRateLimiter.reset();
  userRateLimiter.reset();
  requestConcurrency.reset();
}
