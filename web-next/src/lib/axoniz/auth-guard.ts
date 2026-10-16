/**
 * Auth guard — shared helper for all API routes.
 * Verifies the Bearer token and returns the authenticated username.
 * Returns null if unauthorized (no token, invalid token, or auth module
 * unavailable).
 *
 * EventSource / SSE caveat: the browser's EventSource API cannot set
 * custom headers. For SSE endpoints (e.g. /api/axoniz/models/logs/stream),
 * the client passes the token as a ?token=<jwt> query param — this
 * function checks BOTH the Authorization header AND the query param.
 *
 * Usage in any route:
 *   const user = await requireAuth(req);
 *   if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
 */
import type { NextRequest } from "next/server";
import { extractBearerToken, verifyAuthToken } from "./cli-bridge";

export async function requireAuth(req: NextRequest): Promise<string | null> {
  // Try Authorization: Bearer <token> first.
  const authHeader = req.headers.get("authorization");
  const headerToken = extractBearerToken(authHeader);
  if (headerToken) {
    return verifyAuthToken(headerToken);
  }

  // Fall back to ?token=<jwt> query param — needed for EventSource (SSE)
  // which can't set custom headers. The token still goes through the same
  // verifyAuthToken() check, so this is just as secure as the header path.
  const queryToken = req.nextUrl.searchParams.get("token");
  if (queryToken) {
    return verifyAuthToken(queryToken);
  }

  return null;
}
