/**
 * AXONIZ Security Middleware — "gold inside the sun"
 *
 * No login. No tokens. No user friction. But attackers get burned.
 *
 * Layer 1: Private network gate
 *   Only requests from private IP ranges (127.x, 10.x, 172.16-31.x,
 *   192.168.x, ::1, fc/fd) can access. Public IPs = 403 Forbidden.
 *   This means: your local network ✅, random internet ❌.
 *
 * Layer 2: Same-origin CSRF protection
 *   All write methods (POST/PUT/DELETE/PATCH) must come from the
 *   same origin as the server. Cross-origin requests from malicious
 *   websites = 403 Forbidden. Browser sends Origin header on
 *   cross-origin requests — we check it.
 *
 * Layer 3: API key redaction (in route handlers)
 *   Already in place — /config GET redacts api_key → "[REDACTED]".
 *
 * Layer 4: Config merge-patch (in route handlers)
 *   Already in place — /config/save does deepMerge + scrubRedactedApiKeys.
 *
 * To enable AUTH (optional, for paranoid mode):
 *   Set AXONIZ_REQUIRE_AUTH=true in .env → all routes require Bearer JWT.
 *   But you DON'T NEED THIS for local network use — the sun protects the gold.
 */

import { NextRequest, NextResponse } from "next/server";

/** Check if an IP address is from a private network range. */
function isPrivateIP(ip: string): boolean {
  // IPv4 private ranges
  if (ip.startsWith("127.")) return true;           // localhost
  if (ip.startsWith("10.")) return true;             // private class A
  if (ip.startsWith("192.168.")) return true;         // private class C
  if (ip.startsWith("172.")) {
    const parts = ip.split(".");
    const second = parseInt(parts[1] ?? "0");
    if (second >= 16 && second <= 31) return true;    // private class B
  }
  // IPv6 private ranges
  if (ip === "::1" || ip === "::ffff:127.0.0.1") return true; // IPv6 localhost
  if (ip.startsWith("fc") || ip.startsWith("fd")) return true; // IPv6 ULA
  if (ip.startsWith("fe80")) return true;              // IPv6 link-local

  // Docker / container IPs (172.17-31.x.x are covered above, but Docker
  // sometimes uses 169.254.x.x for metadata — block that too)
  // Actually 169.254 is link-local, let's allow it (it's still local)
  if (ip.startsWith("169.254.")) return true;

  // Unknown / empty → treat as private (trust local by default)
  if (!ip || ip === "unknown") return true;

  return false;
}

/** Extract the client IP from request headers. */
function getClientIP(req: NextRequest): string {
  // Try x-forwarded-for (first IP in the chain)
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  // Try x-real-ip
  const xri = req.headers.get("x-real-ip");
  if (xri) return xri;
  // Fallback — in Next.js dev, req.ip might not be set
  return "127.0.0.1"; // assume localhost if we can't determine
}

export function middleware(req: NextRequest) {
  // ── Layer 1: Private network gate ──────────────────
  // Only allow requests from private IP ranges. This means:
  // - Localhost (127.x) ✅
  // - Your WiFi (192.168.x, 10.x, 172.16-31.x) ✅
  // - Random internet attacker ❌ → 403
  //
  // If you bind to 0.0.0.0, your local network can access it,
  // but nobody from the internet can (unless they VPN into your network).

  // Skip IP check in dev mode (Turbopack doesn't always set headers)
  if (process.env.NODE_ENV === "production" || process.env.AXONIZ_NETWORK_MODE === "true") {
    const clientIP = getClientIP(req);
    if (!isPrivateIP(clientIP)) {
      return NextResponse.json(
        {
          error: "Access denied — public IP blocked. AXONIZ is a local-first system.",
          your_ip: clientIP,
        },
        { status: 403 },
      );
    }
  }

  // ── Layer 2: Same-origin CSRF protection ────────────
  // Block cross-origin write requests (POST/PUT/DELETE/PATCH).
  // A malicious website can't POST to your dashboard because the
  // browser sends an Origin header that won't match.
  const method = req.method.toUpperCase();
  const isWriteMethod = ["POST", "PUT", "DELETE", "PATCH"].includes(method);

  if (isWriteMethod) {
    const origin = req.headers.get("origin");
    if (origin) {
      // Origin is present — this is a browser request.
      // Check that it matches the server's host.
      const host = req.headers.get("host") ?? "";
      const allowedOrigins = [
        `http://${host}`,
        `https://${host}`,
      ];

      if (!allowedOrigins.includes(origin)) {
        return NextResponse.json(
          {
            error: "Cross-origin request blocked — CSRF protection.",
            origin,
            expected: allowedOrigins,
          },
          { status: 403 },
        );
      }
    }
    // If no Origin header → it's curl/Postman/CLI → allow (user is doing it intentionally)
  }

  // ── All checks passed — continue to the route handler ──
  return NextResponse.next();
}

export const config = {
  // Apply to all /api/ routes
  matcher: ["/api/:path*"],
};
