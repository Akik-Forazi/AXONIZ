/**
 * Auth guard — shared helper for all API routes.
 * Verifies the Bearer token and returns the authenticated username.
 * Returns null if unauthorized (no token, invalid token, or auth module unavailable).
 * 
 * Usage in any route:
 *   const user = await requireAuth(req);
 *   if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
 */
import type { NextRequest } from "next/server";
import { extractBearerToken, verifyAuthToken } from "./cli-bridge";

export async function requireAuth(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  const token = extractBearerToken(authHeader);
  if (!token) return null;
  return verifyAuthToken(token);
}
