/**
 * A small fake of Supabase Auth (GoTrue) for end-to-end tests. Test-only; never used by the app.
 *
 * It implements just what `@supabase/ssr` + `@supabase/supabase-js` use for Google sign-in with PKCE:
 *   GET  /auth/v1/authorize                 auto-approves as the chosen test user, redirects to
 *                                           `redirect_to` with `?code=…` (stores the PKCE challenge)
 *   POST /auth/v1/token?grant_type=pkce     checks `code_verifier` against the stored challenge,
 *                                           returns a session with an ES256-signed access token
 *   POST /auth/v1/token?grant_type=refresh_token
 *   GET  /auth/v1/.well-known/jwks.json     the public signing key
 *   GET  /auth/v1/user                      verifies the bearer token, returns the user
 *   POST /auth/v1/logout                    revokes the session's refresh tokens
 * Test controls (not part of Supabase):
 *   POST /__test/next-sign-in   { user: "ada" | "bob", accessTtlSec?: number }
 *   POST /__test/revoke         { user }   revoke every refresh token of a user
 *   POST /__test/reset          also clears the quota store
 *   POST /__test/daily          { user, kind: "workflows" | "refinements", used }  set today's count
 *   GET  /__test/usage?user=ada today's counts (what ai_my_usage_today returns for that user)
 *   GET  /__test/health
 *
 * Quota functions (quota.mjs, same signatures as migrations 0001/0002):
 *   POST /rest/v1/rpc/ai_consume | ai_adjust | ai_acquire_inflight | ai_release_inflight |
 *        ai_record_usage | ai_prune      service key only (anon and users are refused)
 *   POST /rest/v1/rpc/ai_my_usage_today  a signed-in user's own JWT only; answers for that user
 *
 * Start: `node tests/e2e/fake-supabase/server.mjs` (port from FAKE_SUPABASE_PORT, default 54399).
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import http from "node:http";
import { exportJWK, generateKeyPair, jwtVerify, SignJWT, createLocalJWKSet } from "jose";
import { createQuota } from "./quota.mjs";
import { USERS } from "./users.mjs";

const PORT = Number(process.env.FAKE_SUPABASE_PORT ?? 54399);
const HOST = "127.0.0.1";
const BASE = `http://${HOST}:${PORT}`;
const ISSUER = `${BASE}/auth/v1`;
const KID = "fake-es256-key-1";

const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
const publicJwk = { ...(await exportJWK(publicKey)), kid: KID, alg: "ES256", use: "sig" };
const JWKS = createLocalJWKSet({ keys: [publicJwk] });

const DEFAULT_TTL = 3600;
let nextSignIn = { user: "ada", accessTtlSec: DEFAULT_TTL };
/** code → { challenge, method, userKey, ttl } */
const codes = new Map();
/** refresh token → { userKey, sessionId, ttl, revoked } */
const refreshTokens = new Map();

const quota = createQuota();
/** The fake service key (SUPABASE_SECRET_KEY in the e2e env). Privileged quota RPCs require it. */
const SECRET_PREFIX = "sb_secret_";

function reset() {
  quota.reset();
  nextSignIn = { user: "ada", accessTtlSec: DEFAULT_TTL };
  codes.clear();
  refreshTokens.clear();
}

const b64url = (buf) => Buffer.from(buf).toString("base64url");

function userObject(userKey) {
  const u = USERS[userKey];
  const now = new Date().toISOString();
  return {
    id: u.id,
    aud: "authenticated",
    role: "authenticated",
    email: u.email,
    email_confirmed_at: now,
    app_metadata: { provider: "google", providers: ["google"] },
    user_metadata: { email: u.email, full_name: u.name, name: u.name, ...(u.avatarUrl ? { avatar_url: u.avatarUrl } : {}) },
    identities: [],
    created_at: now,
    updated_at: now,
    is_anonymous: false,
  };
}

async function issueSession(userKey, ttl, sessionId = randomUUID()) {
  const u = userObject(userKey);
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + ttl;
  const access_token = await new SignJWT({
    aud: "authenticated",
    role: "authenticated",
    email: u.email,
    phone: "",
    app_metadata: u.app_metadata,
    user_metadata: u.user_metadata,
    aal: "aal1",
    amr: [{ method: "oauth", timestamp: iat }],
    session_id: sessionId,
    is_anonymous: false,
  })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject(u.id)
    .setIssuer(ISSUER)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(privateKey);
  const refresh_token = b64url(randomBytes(24));
  refreshTokens.set(refresh_token, { userKey, sessionId, ttl, revoked: false });
  return { access_token, token_type: "bearer", expires_in: ttl, expires_at: exp, refresh_token, user: u };
}

async function verifyBearer(req) {
  const h = req.headers.authorization ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWKS, { issuer: ISSUER, audience: "authenticated" });
    return payload;
  } catch {
    return null;
  }
}

function send(res, status, body, headers = {}) {
  const origin = res.req.headers.origin;
  const cors = origin
    ? {
        "access-control-allow-origin": origin,
        "access-control-allow-credentials": "true",
        "access-control-allow-headers": "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
        "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
      }
    : {};
  if (body === undefined) {
    res.writeHead(status, { ...cors, ...headers });
    res.end();
    return;
  }
  res.writeHead(status, { "content-type": "application/json", ...cors, ...headers });
  res.end(JSON.stringify(body));
}

const authError = (res, status, code, msg) => send(res, status, { code: status, error_code: code, msg });

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", BASE);
  const path = url.pathname;
  try {
    if (req.method === "OPTIONS") return send(res, 204);

    if (path === "/__test/health") return send(res, 200, { ok: true });
    if (path === "/__test/reset" && req.method === "POST") {
      reset();
      return send(res, 200, { ok: true });
    }
    if (path === "/__test/next-sign-in" && req.method === "POST") {
      const body = await readJson(req);
      if (!USERS[body.user]) return send(res, 400, { error: "unknown user" });
      nextSignIn = { user: body.user, accessTtlSec: Number(body.accessTtlSec) || DEFAULT_TTL };
      return send(res, 200, { ok: true });
    }
    if (path === "/__test/revoke" && req.method === "POST") {
      const body = await readJson(req);
      for (const r of refreshTokens.values()) if (r.userKey === body.user) r.revoked = true;
      if (process.env.FAKE_SUPABASE_DEBUG) console.log("revoke", body.user, refreshTokens.size);
      return send(res, 200, { ok: true });
    }

    if (path === "/__test/daily" && req.method === "POST") {
      const body = await readJson(req);
      const u = USERS[body.user];
      if (!u || !["workflows", "refinements"].includes(body.kind)) return send(res, 400, { error: "bad request" });
      quota.setDaily(u.id, body.kind, body.used);
      return send(res, 200, { ok: true });
    }
    if (path === "/__test/usage" && req.method === "GET") {
      const u = USERS[url.searchParams.get("user") ?? ""];
      if (!u) return send(res, 400, { error: "unknown user" });
      return send(res, 200, quota.myUsageToday(u.id)[0]);
    }

    const rpc = /^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(path);
    if (rpc && req.method === "POST") {
      const fn = rpc[1];
      const args = await readJson(req);
      const pgError = (status, code, message) => send(res, status, { code, message, details: null, hint: null });
      if (fn === "ai_my_usage_today") {
        // security invoker + RLS: only an authenticated user, and only their own rows.
        const claims = await verifyBearer(req);
        if (!claims?.sub) return pgError(401, "42501", "permission denied for function ai_my_usage_today");
        return send(res, 200, quota.myUsageToday(claims.sub));
      }
      if (!Object.hasOwn(quota.fns, fn)) return pgError(404, "PGRST202", `Could not find the function public.${fn}`);
      const apikey = String(req.headers.apikey ?? "");
      if (!apikey.startsWith(SECRET_PREFIX)) return pgError(401, "42501", `permission denied for function ${fn}`);
      const result = quota.fns[fn](args);
      return result === null ? send(res, 204) : send(res, 200, result);
    }

    if (path === "/auth/v1/.well-known/jwks.json") return send(res, 200, { keys: [publicJwk] });

    if (path === "/auth/v1/authorize" && req.method === "GET") {
      const redirectTo = url.searchParams.get("redirect_to");
      const challenge = url.searchParams.get("code_challenge");
      const method = url.searchParams.get("code_challenge_method") ?? "plain";
      if (url.searchParams.get("provider") !== "google" || !redirectTo || !challenge) {
        return authError(res, 400, "validation_failed", "provider, redirect_to and code_challenge are required");
      }
      const code = randomUUID();
      codes.set(code, { challenge, method: method.toLowerCase(), userKey: nextSignIn.user, ttl: nextSignIn.accessTtlSec });
      const target = new URL(redirectTo);
      target.searchParams.set("code", code);
      res.writeHead(302, { location: target.toString() });
      return res.end();
    }

    if (path === "/auth/v1/token" && req.method === "POST") {
      const grant = url.searchParams.get("grant_type");
      const body = await readJson(req);
      if (grant === "pkce") {
        const entry = codes.get(body.auth_code);
        codes.delete(body.auth_code); // single use
        if (!entry || typeof body.code_verifier !== "string") {
          return authError(res, 404, "flow_state_not_found", "invalid flow state, no valid flow state found");
        }
        const computed =
          entry.method === "s256" ? createHash("sha256").update(body.code_verifier).digest("base64url") : body.code_verifier;
        if (computed !== entry.challenge) {
          return authError(res, 403, "bad_code_verifier", "code challenge does not match previously saved code verifier");
        }
        return send(res, 200, await issueSession(entry.userKey, entry.ttl));
      }
      if (grant === "refresh_token") {
        if (process.env.FAKE_SUPABASE_DEBUG) console.log("refresh", body.refresh_token?.slice(0, 6), refreshTokens.get(body.refresh_token)?.revoked);
        const r = refreshTokens.get(body.refresh_token);
        if (!r || r.revoked) return authError(res, 400, "refresh_token_not_found", "Invalid Refresh Token: Refresh Token Not Found");
        return send(res, 200, await issueSession(r.userKey, r.ttl, r.sessionId));
      }
      return authError(res, 400, "unsupported_grant_type", "unsupported grant type");
    }

    if (path === "/auth/v1/user" && req.method === "GET") {
      const claims = await verifyBearer(req);
      if (!claims) return authError(res, 403, "bad_jwt", "invalid JWT: unable to parse or verify signature");
      const userKey = Object.keys(USERS).find((k) => USERS[k].id === claims.sub);
      if (!userKey) return authError(res, 404, "user_not_found", "User not found");
      return send(res, 200, userObject(userKey));
    }

    if (path === "/auth/v1/logout" && req.method === "POST") {
      const claims = await verifyBearer(req);
      if (!claims) return authError(res, 403, "bad_jwt", "invalid JWT");
      for (const r of refreshTokens.values()) if (r.sessionId === claims.session_id) r.revoked = true;
      return send(res, 204);
    }

    return authError(res, 404, "not_found", `No fake for ${req.method} ${path}`);
  } catch (err) {
    return authError(res, 500, "unexpected_failure", String(err instanceof Error ? err.message : err));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`fake supabase auth listening on ${BASE}`);
});
