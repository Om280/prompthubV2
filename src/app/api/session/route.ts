/**
 * GET /api/session (API_CONTRACTS §2a). The verified user for this request (`getClaims()`), or null.
 * Never returns tokens. Signed out, expired and forged sessions all read as `user: null`.
 */
import type { SessionResponse } from "@/lib/contracts";
import { errorResponse } from "@/lib/ai/errors";
import { getVerifiedUser } from "@/lib/server/auth";
import { isAuthConfigured } from "@/lib/supabase/config";

export async function GET(request: Request): Promise<Response> {
  // Request-time only (see /api/providers); keep outside try/catch.
  void request.headers.get("accept");
  try {
    const configured = isAuthConfigured();
    const body: SessionResponse = { configured, user: configured ? await getVerifiedUser() : null };
    return Response.json(body, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
