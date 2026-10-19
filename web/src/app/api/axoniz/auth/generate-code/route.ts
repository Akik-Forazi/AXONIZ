/**
 * POST /api/axoniz/auth/generate-code — generate or refresh a 9-digit code
 *
 * The code persists for 24 hours. If nobody views or uses the code for
 * 24 hours, it auto-rotates to a new one on next access (sliding window).
 *
 * Multiple devices can use the same code within the 24h window.
 * Manual generation always creates a new code (invalidates old one).
 *
 * ONLY accessible from localhost (the main device).
 *
 * Returns: { code: "742913851", expires_in_hours: 24, last_activity: ... }
 */

import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { axonizHome } from "@/lib/axoniz/paths";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ROTATE_AFTER_MS = 24 * 60 * 60 * 1000; // 24 hours
const CODE_PATH = path.join(axonizHome(), "temp-code.json");

interface TempCode {
  code: string;
  created_at: number;
  last_activity: number;
  rotate_after_ms: number;
}

function isLocalhost(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1" || ip === "unknown";
}

function getClientIP(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) { const first = xff.split(",")[0]?.trim(); if (first) return first; }
  return req.headers.get("x-real-ip") ?? "127.0.0.1";
}

function readCode(): TempCode | null {
  try {
    if (!existsSync(CODE_PATH)) return null;
    const data = JSON.parse(readFileSync(CODE_PATH, "utf-8")) as TempCode;
    return data;
  } catch {
    return null;
  }
}

function writeCode(code: TempCode): void {
  try {
    mkdirSync(path.dirname(CODE_PATH), { recursive: true });
    writeFileSync(CODE_PATH, JSON.stringify(code, null, 2), { mode: 0o600 });
  } catch { /* in-memory only */ }
}

/** Check if the current code is still alive (within the 24h sliding window). */
function isCodeAlive(code: TempCode): boolean {
  return (Date.now() - code.last_activity) < (code.rotate_after_ms ?? ROTATE_AFTER_MS);
}

/** Generate a fresh code, invalidating any previous one. */
function generateFreshCode(): TempCode {
  const now = Date.now();
  return {
    code: crypto.randomInt(100000000, 999999999).toString(),
    created_at: now,
    last_activity: now,
    rotate_after_ms: ROTATE_AFTER_MS,
  };
}

export async function POST(req: NextRequest) {
  const clientIP = getClientIP(req);
  if (!isLocalhost(clientIP)) {
    return NextResponse.json({
      error: "Code generation is only available from the main device (localhost)."
    }, { status: 403 });
  }

  // Check for ?refresh=true to force a new code, otherwise return existing if alive
  const forceRefresh = req.nextUrl.searchParams.get("refresh") === "true";

  const existing = readCode();
  if (existing && !forceRefresh && isCodeAlive(existing)) {
    // Code is still alive — update last_activity (sliding window)
    existing.last_activity = Date.now();
    writeCode(existing);
    return NextResponse.json({
      code: existing.code,
      created_at: existing.created_at,
      last_activity: existing.last_activity,
      expires_in_hours: Math.floor((existing.rotate_after_ms ?? ROTATE_AFTER_MS) / (60 * 60 * 1000)),
      message: "Code is active. Share with new devices.",
    });
  }

  // Generate a new code (either forced, or old one expired/rotated)
  const fresh = generateFreshCode();
  writeCode(fresh);
  return NextResponse.json({
    code: fresh.code,
    created_at: fresh.created_at,
    last_activity: fresh.last_activity,
    expires_in_hours: 24,
    message: "New code generated. Rotates after 24h of no activity.",
  });
}

/** GET — view the current code without generating a new one. */
export async function GET(req: NextRequest) {
  const clientIP = getClientIP(req);
  if (!isLocalhost(clientIP)) {
    return NextResponse.json({ error: "Only available from localhost." }, { status: 403 });
  }

  const existing = readCode();
  if (existing && isCodeAlive(existing)) {
    // Update last_activity (sliding window — viewing the code counts as activity)
    existing.last_activity = Date.now();
    writeCode(existing);
    return NextResponse.json({
      code: existing.code,
      created_at: existing.created_at,
      last_activity: existing.last_activity,
      expires_in_hours: 24,
    });
  }

  // No code or expired — generate one automatically
  const fresh = generateFreshCode();
  writeCode(fresh);
  return NextResponse.json({
    code: fresh.code,
    created_at: fresh.created_at,
    last_activity: fresh.last_activity,
    expires_in_hours: 24,
    message: "Auto-generated (previous code rotated after 24h of inactivity).",
  });
}
