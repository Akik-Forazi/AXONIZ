/**
 * POST /api/axoniz/auth/device — verify a 9-digit device code
 *
 * Body: { code: "123456789" }
 *
 * The code persists for 24 hours (sliding window). If nobody views or
 * uses the code for 24 hours, it auto-rotates on next access.
 * Multiple devices can use the same code within the 24h window.
 *
 * If valid → sets the axoniz_device cookie → device is authorized forever.
 * If invalid/expired/rotated → 403.
 */

import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ROTATE_AFTER_MS = 24 * 60 * 60 * 1000; // 24 hours
const CODE_PATH = path.join(os.homedir(), ".axoniz", "temp-code.json");

interface TempCode {
  code: string;
  created_at: number;
  last_activity: number;
  rotate_after_ms: number;
}

function readCode(): TempCode | null {
  try {
    if (!existsSync(CODE_PATH)) return null;
    return JSON.parse(readFileSync(CODE_PATH, "utf-8")) as TempCode;
  } catch {
    return null;
  }
}

function writeCode(code: TempCode): void {
  try {
    mkdirSync(path.dirname(CODE_PATH), { recursive: true });
    writeFileSync(CODE_PATH, JSON.stringify(code, null, 2), { mode: 0o600 });
  } catch { /* ignore */ }
}

function isCodeAlive(code: TempCode): boolean {
  return (Date.now() - code.last_activity) < (code.rotate_after_ms ?? ROTATE_AFTER_MS);
}

function getSecret(): string {
  const secretPath = path.join(os.homedir(), ".axoniz", "web-secret");
  try {
    if (existsSync(secretPath)) return readFileSync(secretPath, "utf-8").trim();
  } catch {}
  return "fallback";
}

export async function POST(req: NextRequest) {
  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const code = body.code?.trim();
  if (!code || !/^\d{9}$/.test(code)) {
    return NextResponse.json({ error: "Code must be 9 digits" }, { status: 400 });
  }

  const tempCode = readCode();

  // No code file → code has never been generated
  if (!tempCode) {
    return NextResponse.json({
      error: "No active code. Generate one from the main device at http://localhost:7860/api/axoniz/auth/generate-code"
    }, { status: 403 });
  }

  // Check if the code has rotated (24h of inactivity)
  if (!isCodeAlive(tempCode)) {
    return NextResponse.json({
      error: "Code has expired. It rotates after 24 hours of no activity. Generate a new one from the main device."
    }, { status: 403 });
  }

  // Verify the code
  if (code !== tempCode.code) {
    return NextResponse.json({ error: "Invalid code" }, { status: 403 });
  }

  // Code is valid → update last_activity (sliding window — using the code counts as activity)
  tempCode.last_activity = Date.now();
  writeCode(tempCode);

  // Set the device cookie → this device is now authorized forever
  const secret = getSecret();
  const response = NextResponse.json({ ok: true, message: "Device authorized" });
  response.cookies.set("axoniz_device", secret, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
  return response;
}
