/**
 * AXONIZ Security Middleware — Edge Runtime compatible
 *
 * NO node:fs, node:path, node:os, node:crypto.
 * Uses only Web APIs: crypto.getRandomValues, req.cookies, req.headers.
 *
 * The secret is generated in-memory (Web Crypto API) and persists
 * for the server process lifetime. On restart, localhost users get
 * a new cookie automatically (invisible). Non-localhost devices
 * re-enter the 9-digit code (the code persists in ~/.axoniz/temp-code.json,
 * read by API routes which DO run in Node.js runtime).
 */

import { NextRequest, NextResponse } from "next/server";

// In-memory secret (persists for server process lifetime)
let cachedSecret: string | null = null;

function getSecret(): string {
  if (cachedSecret) return cachedSecret;
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  cachedSecret = Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
  return cachedSecret;
}

function getClientIP(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) { const first = xff.split(",")[0]?.trim(); if (first) return first; }
  return req.headers.get("x-real-ip") ?? "127.0.0.1";
}

function isLocalhost(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1" || ip === "unknown";
}

const PUBLIC_PATHS = [
  "/auth/device",
  "/api/axoniz/auth/device",
  "/api/axoniz/auth/generate-code",
  "/api/axoniz/health",
  "/api/axoniz/stream",
  "/api/axoniz/diagnostics/log",
  "/api/axoniz/v2",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + "/"));
}

function isStaticAsset(pathname: string): boolean {
  return pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    /\.(css|js|woff2?|svg|png|jpg|ico|map)$/.test(pathname);
}

function setDeviceCookie(res: NextResponse, secret: string): NextResponse {
  res.cookies.set("axoniz_device", secret, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}

function checkCSRF(req: NextRequest): NextResponse | null {
  const method = req.method.toUpperCase();
  if (!["POST", "PUT", "DELETE", "PATCH"].includes(method)) return null;
  const origin = req.headers.get("origin");
  if (!origin) return null;
  const host = req.headers.get("host") ?? "";
  if (origin !== `http://${host}` && origin !== `https://${host}`) {
    return NextResponse.json(
      { error: "Cross-origin request blocked — CSRF protection." },
      { status: 403 },
    );
  }
  return null;
}

export function proxy(req: NextRequest) {
  const secret = getSecret();
  const clientIP = getClientIP(req);
  const pathname = req.nextUrl.pathname;

  // Public paths and static assets → always pass
  if (isPublicPath(pathname) || isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  // Check device cookie
  const deviceCookie = req.cookies.get("axoniz_device")?.value;
  if (deviceCookie && deviceCookie === secret) {
    return checkCSRF(req) ?? NextResponse.next();
  }

  // One-time link (?key=SECRET)
  const urlKey = req.nextUrl.searchParams.get("key");
  if (urlKey && urlKey === secret) {
    const params = new URLSearchParams(req.nextUrl.search);
    params.delete("key");
    const cleanSearch = params.toString() ? `?${params.toString()}` : "";
    const cleanUrl = pathname + cleanSearch;
    const res = NextResponse.redirect(new URL(cleanUrl || "/", req.url), 302);
    return setDeviceCookie(res, secret);
  }

  // localhost → auto-trust (invisible to user)
  if (isLocalhost(clientIP)) {
    const res = checkCSRF(req) ?? NextResponse.next();
    return setDeviceCookie(res, secret);
  }

  // Everything else → redirect to device code page
  const isApi = pathname.startsWith("/api/");
  if (isApi) {
    return NextResponse.json(
      { error: "Device not authorized. Enter the 9-digit code at /auth/device" },
      { status: 403 },
    );
  }
  return NextResponse.redirect(new URL("/auth/device", req.url), 302);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
