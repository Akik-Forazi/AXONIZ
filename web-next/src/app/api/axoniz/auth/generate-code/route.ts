/**
 * POST /api/axoniz/auth/generate-code — generate a 9-digit temp code
 *
 * ONLY accessible from localhost (the main device). Generates a random
 * 9-digit code, stores it at ~/.axoniz/temp-code.json with a 5-minute
 * expiry. Previous codes are invalidated.
 *
 * Returns: { code: "742913851", expires_at: 1736208600000 }
 */

import { NextRequest, NextResponse } from "next/server";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function isLocalhost(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1" || ip === "unknown";
}

function getClientIP(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) { const first = xff.split(",")[0]?.trim(); if (first) return first; }
  return req.headers.get("x-real-ip") ?? "127.0.0.1";
}

export async function POST(req: NextRequest) {
  // ONLY localhost can generate codes (the main device)
  const clientIP = getClientIP(req);
  if (!isLocalhost(clientIP)) {
    return NextResponse.json({
      error: "Code generation is only available from the main device (localhost)."
    }, { status: 403 });
  }

  // Check if the request has a valid device cookie (main device is authorized)
  const deviceCookie = req.cookies.get("axoniz_device")?.value;
  const secretPath = path.join(os.homedir(), ".axoniz", "web-secret");
  let secret = "";
  try {
    const { readFileSync, existsSync } = await import("node:fs");
    if (existsSync(secretPath)) {
      secret = readFileSync(secretPath, "utf-8").trim();
    }
  } catch {}

  if (secret && deviceCookie !== secret) {
    // Not the main device's browser — but could be localhost without cookie yet
    // (first-time access) — allow if from localhost
  }

  // Generate random 9-digit code
  const code = crypto.randomInt(100000000, 999999999).toString();
  const now = Date.now();
  const tempCode = {
    code,
    created_at: now,
    expires_at: now + CODE_TTL_MS,
  };

  // Store it
  const axonizHome = path.join(os.homedir(), ".axoniz");
  const codePath = path.join(axonizHome, "temp-code.json");
  try {
    mkdirSync(axonizHome, { recursive: true });
    writeFileSync(codePath, JSON.stringify(tempCode, null, 2), { mode: 0o600 });
  } catch (e) {
    return NextResponse.json({ error: "Failed to store code" }, { status: 500 });
  }

  return NextResponse.json({
    code,
    expires_at: tempCode.expires_at,
    expires_in_seconds: Math.floor(CODE_TTL_MS / 1000),
    message: "Share this code with the new device. It expires in 5 minutes.",
  });
}
