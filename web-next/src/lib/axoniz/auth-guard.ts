/**
 * Auth guard — LOCAL-FIRST mode by default.
 *
 * AXONIZ runs on localhost. No login, no tokens, no headache.
 * The user is already on their own machine — that IS the auth.
 *
 * To enable auth (for network exposure), set AXONIZ_REQUIRE_AUTH=true
 * in .env. Then all routes require a valid Bearer JWT.
 */
import type { NextRequest } from "next/server";
import { extractBearerToken, verifyAuthToken } from "./cli-bridge";

export async function requireAuth(req: NextRequest): Promise<string | null> {
  // Local-first: no auth required on localhost
  const requireAuthFlag = process.env.AXONIZ_REQUIRE_AUTH === "true";
  if (!requireAuthFlag) {
    // Auto-authenticate — the user is on their own machine
    return "axoniz";
  }

  // Network mode: require real Bearer JWT auth
  const authHeader = req.headers.get("authorization");
  const headerToken = extractBearerToken(authHeader);
  if (headerToken) {
    return verifyAuthToken(headerToken);
  }

  // SSE fallback: ?token=<jwt> (EventSource can't set headers)
  const queryToken = req.nextUrl.searchParams.get("token");
  if (queryToken) {
    return verifyAuthToken(queryToken);
  }

  return null;
}
