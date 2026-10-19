/**
 * GET  /api/axoniz/db/config    — read the full config DB
 * POST /api/axoniz/db/config    — merge-patch the config DB
 *
 * The config DB lives at ~/.fraziym/axoniz/db/config.json and stores:
 *   - Provider API keys + baseUrls + models
 *   - llamacpp-specific settings (modelPath, nCtx, nGpuLayers, nThreads)
 *   - Active provider + model selection
 *
 * This replaces the old approach of storing API keys in browser
 * localStorage (which is lost on cache clear + not shared across
 * browsers). Now keys persist on disk at ~/.fraziym/axoniz/db/.
 *
 * AUTH: Both endpoints require a valid Bearer JWT. Previously they were
 * completely unauthenticated — anyone could read or write provider
 * API keys. See auth-guard.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import { readConfig, writeConfig, type DbConfig } from "@/lib/axoniz/db";
import { requireAuth } from "@/lib/axoniz/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Redact API keys before exposing them — defense in depth even though
  // the canonical read path is /api/axoniz/config/cli (which also redacts).
  const cfg = readConfig();
  const redacted = JSON.parse(JSON.stringify(cfg));
  try {
    if (redacted?.providers) {
      for (const key of Object.keys(redacted.providers)) {
        const p = redacted.providers[key];
        if (p && typeof p === "object" && p.apiKey) p.apiKey = "[REDACTED]";
      }
    }
  } catch { /* ignore */ }
  return NextResponse.json(redacted);
}

export async function POST(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let patch: Partial<DbConfig>;
  try {
    patch = (await req.json()) as Partial<DbConfig>;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  // Scrub redacted/empty api keys — same defense as /config/cli POST.
  scrubRedactedApiKeys(patch);
  const current = readConfig();
  // Merge: shallow-merge top-level keys, deep-merge providers + llamacpp.
  const merged: DbConfig = {
    ...current,
    ...patch,
    providers: { ...current.providers, ...(patch.providers ?? {}) },
    llamacpp: { ...current.llamacpp, ...(patch.llamacpp ?? {}) },
  };
  writeConfig(merged);
  return NextResponse.json({ status: "saved" });
}

/** Walk the patch and strip api_key/apiKey fields whose value is empty/redacted. */
function scrubRedactedApiKeys(node: unknown): void {
  if (!node || typeof node !== "object") return;
  const rec = node as Record<string, unknown>;
  for (const [k, v] of Object.entries(rec)) {
    if (k === "apiKey" || k === "api_key") {
      if (typeof v !== "string" || v.trim() === "" || v === "[REDACTED]") {
        delete rec[k];
      }
    } else if (v && typeof v === "object") {
      scrubRedactedApiKeys(v);
    }
  }
}
