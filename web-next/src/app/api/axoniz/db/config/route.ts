/**
 * GET  /api/axoniz/db/config    — read the full config DB
 * POST /api/axoniz/db/config    — merge-patch the config DB
 *
 * The config DB lives at ~/.axoniz/db/config.json and stores:
 *   - Provider API keys + baseUrls + models
 *   - llamacpp-specific settings (modelPath, nCtx, nGpuLayers, nThreads)
 *   - Active provider + model selection
 *
 * This replaces the old approach of storing API keys in browser
 * localStorage (which is lost on cache clear + not shared across
 * browsers). Now keys persist on disk at ~/.axoniz/db/.
 */

import { NextRequest, NextResponse } from "next/server";
import { readConfig, writeConfig, type DbConfig } from "@/lib/axoniz/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const cfg = readConfig();
  return NextResponse.json(cfg);
}

export async function POST(req: NextRequest) {
  let patch: Partial<DbConfig>;
  try {
    patch = (await req.json()) as Partial<DbConfig>;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const current = readConfig();
  // Merge: shallow-merge top-level keys, deep-merge providers + llamacpp.
  const merged: DbConfig = {
    ...current,
    ...patch,
    providers: { ...current.providers, ...(patch.providers ?? {}) },
    llamacpp: { ...current.llamacpp, ...(patch.llamacpp ?? {}) },
  };
  writeConfig(merged);
  return NextResponse.json(merged);
}
