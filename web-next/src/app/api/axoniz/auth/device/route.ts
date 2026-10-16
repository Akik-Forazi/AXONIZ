/**
 * POST /api/axoniz/auth/device — verify a 9-digit device code
 *
 * Body: { code: "123456789" }
 *
 * The code is stored at ~/.axoniz/temp-code.json with a 5-minute expiry.
 * Only ONE code is valid at a time. New codes invalidate old ones.
 *
 * If valid → sets the axoniz_device cookie → device is authorized forever.
 * If invalid/expired → 403.
 */

import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface TempCode {
  code: string;
  created_at: number;
  expires_at: number;
}

function getTempCode(): TempCode | null {
  const codePath = path.join(os.homedir(), ".axoniz", "temp-code.json");
  try {
    if (!existsSync(codePath)) return null;
    const data = JSON.parse(readFileSync(codePath, "utf-8")) as TempCode;
    if (Date.now() > data.expires_at) return null; // expired
    return data;
  } catch {
    return null;
  }
}

function getSecret(): string {
  const secretPath = path.join(os.homedir(), ".axoniz", "web-secret");
  try {
    if (existsSync(secretPath)) {
      return readFileSync(secretPath, "utf-8").trim();
    }
  } catch {}
  return "fallback-" + Date.now();
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

  const tempCode = getTempCode();
  if (!tempCode) {
    return NextResponse.json({
      error: "No active code. Generate one with: axoniz auth --temp-device-code"
    }, { status: 403 });
  }

  if (code !== tempCode.code) {
    return NextResponse.json({ error: "Invalid code" }, { status: 403 });
  }

  // Code is valid → set the device cookie
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
