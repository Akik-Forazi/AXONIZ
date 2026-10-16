/**
 * AXONIZ Security Middleware — "gold inside the sun" + invisible device auth
 *
 * NO LOGIN. NO PASSWORD. NO BIOMETRICS. NO USER ACTION.
 *
 * The machine IS the authentication. Just like your face is always
 * available to Face ID (you don't "do" anything), the machine's
 * filesystem access to ~/.axoniz/web-secret IS the proof of identity.
 *
 * How it works:
 * 1. First run: server generates a 256-bit secret at ~/.axoniz/web-secret
 * 2. User opens http://localhost:7860 → middleware sees no cookie,
 *    checks if request is from localhost → YES → sets HTTP-only cookie
 *    with the secret → continues to the page. User sees nothing.
 * 3. Every future request: cookie matches secret → allowed. Invisible.
 * 4. Attacker from network: no cookie → not localhost → 403 Forbidden.
 *
 * To authorize another device (family member on WiFi):
 *   echo "192.168.0.50" >> ~/.axoniz/authorized-devices
 * Then that device gets the cookie on first visit.
 *
 * To revoke all devices (rotate the secret):
 *   rm ~/.axoniz/web-secret  (new secret generated on next server start)
 */

import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

// ── Cache the secret in memory (read once, use forever) ──────────
let cachedSecret: string | null = null;
let cachedAuthorizedIPs: Set<string> | null = null;

function getAxonizHome(): string {
  return path.join(os.homedir(), ".axoniz");
}

function getSecret(): string {
  if (cachedSecret) return cachedSecret;

  const home = getAxonizHome();
  const secretPath = path.join(home, "web-secret");

  try {
    if (existsSync(secretPath)) {
      cachedSecret = readFileSync(secretPath, "utf-8").trim();
      return cachedSecret;
    }
  } catch {
    // fall through to generate
  }

  // Generate new secret
  cachedSecret = crypto.randomBytes(32).toString("hex");
  try {
    mkdirSync(home, { recursive: true });
    writeFileSync(secretPath, cachedSecret, { mode: 0o600 });
  } catch {
    // Can't persist — use in-memory only (resets on restart)
  }
  return cachedSecret;
}

function getAuthorizedIPs(): Set<string> {
  if (cachedAuthorizedIPs) return cachedAuthorizedIPs;

  const authPath = path.join(getAxonizHome(), "authorized-devices");
  const ips = new Set<string>();

  try {
    if (existsSync(authPath)) {
      const content = readFileSync(authPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          ips.add(trimmed);
        }
      }
    }
  } catch {
    // no authorized devices file — only localhost gets access
  }

  cachedAuthorizedIPs = ips;
  return ips;
}

/** Check if an IP is from a private network range. */
function isPrivateIP(ip: string): boolean {
  if (ip.startsWith("127.")) return true;
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("192.168.")) return true;
  if (ip.startsWith("172.")) {
    const second = parseInt(ip.split(".")[1] ?? "0");
    if (second >= 16 && second <= 31) return true;
  }
  if (ip === "::1" || ip === "::ffff:127.0.0.1") return true;
  if (ip.startsWith("fc") || ip.startsWith("fd")) return true;
  if (ip.startsWith("fe80")) return true;
  if (ip.startsWith("169.254.")) return true;
  if (!ip || ip === "unknown") return true;
  return false;
}

/** Check if an IP is localhost. */
function isLocalhost(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1" || ip === "unknown";
}

/** Extract the client IP from request headers. */
function getClientIP(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xri = req.headers.get("x-real-ip");
  if (xri) return xri;
  return "127.0.0.1";
}

export function middleware(req: NextRequest) {
  const secret = getSecret();
  const clientIP = getClientIP(req);

  // ── Layer 1: Public IP gate (burns internet attackers) ──────────
  if (!isPrivateIP(clientIP)) {
    return NextResponse.json(
      { error: "Access denied — AXONIZ is a local-first system." },
      { status: 403 },
    );
  }

  // ── Layer 2: Device cookie (the invisible biometric) ─────────────
  const deviceCookie = req.cookies.get("axoniz_device")?.value;

  if (deviceCookie === secret) {
    // Cookie matches — this is the user's device. Let them through.
    // Also check CSRF on write methods (Layer 3).
    return checkCSRF(req);
  }

  // No cookie (or wrong cookie) — is this the user's machine?
  if (isLocalhost(clientIP)) {
    // localhost → automatically set the cookie (invisible to user)
    const response = checkCSRF(req) ?? NextResponse.next();
    response.cookies.set("axoniz_device", secret, {
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });
    return response;
  }

  // Not localhost — check if this IP is in the authorized devices list
  const authorizedIPs = getAuthorizedIPs();
  if (authorizedIPs.has(clientIP)) {
    // Authorized device — set the cookie
    const response = checkCSRF(req) ?? NextResponse.next();
    response.cookies.set("axoniz_device", secret, {
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  }

  // Not localhost, not authorized → blocked
  return NextResponse.json(
    {
      error: "This device is not authorized.",
      hint: "If you are the owner, access from localhost (http://localhost:7860). To authorize this device, run: echo \"" + clientIP + "\" >> ~/.axoniz/authorized-devices",
    },
    { status: 403 },
  );
}

/** Layer 3: Same-origin CSRF protection on write methods. */
function checkCSRF(req: NextRequest): NextResponse | null {
  const method = req.method.toUpperCase();
  if (!["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
    return null; // only check write methods
  }

  const origin = req.headers.get("origin");
  if (origin) {
    const host = req.headers.get("host") ?? "";
    if (origin !== `http://${host}` && origin !== `https://${host}`) {
      return NextResponse.json(
        { error: "Cross-origin request blocked — CSRF protection." },
        { status: 403 },
      );
    }
  }

  return null; // no Origin header = curl/CLI = allowed
}

export const config = {
  matcher: ["/api/:path*"],
};
