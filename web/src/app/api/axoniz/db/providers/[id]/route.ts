/**
 * GET  /api/axoniz/db/providers/[id]  — read one provider's config from DB
 * PUT  /api/axoniz/db/providers/[id]  — merge-patch one provider's config
 * DELETE /api/axoniz/db/providers/[id] — remove a provider's config
 *
 * Provider config shape: { enabled, baseUrl, apiKey, model }
 * Keys are stored on disk at ~/.axoniz/db/config.json (0600 perms).
 *
 * AUTH: All three endpoints require a valid Bearer JWT (auth-guard.ts).
 * Previously they were completely unauthenticated — anyone could read
 * or delete another user's API keys via this route.
 */

import { NextRequest, NextResponse } from "next/server";
import { readConfig, writeConfig, type ProviderDbConfig } from "@/lib/axoniz/db";
import { requireAuth } from "@/lib/axoniz/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const cfg = readConfig();
  const provider = cfg.providers[id];
  if (!provider) {
    return NextResponse.json({ error: "provider not configured", id }, { status: 404 });
  }
  // Redact API key on read — the canonical read path is /config/cli which
  // also redacts, so this route follows the same policy.
  const redacted = { ...provider };
  if (redacted.apiKey) redacted.apiKey = "[REDACTED]";
  return NextResponse.json(redacted);
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  let patch: Partial<ProviderDbConfig>;
  try {
    patch = (await req.json()) as Partial<ProviderDbConfig>;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  // Don't let a stale client overwrite the real key with "[REDACTED]" or
  // an empty string — preserve the existing key in that case.
  if (patch.apiKey !== undefined
      && (typeof patch.apiKey !== "string" || patch.apiKey.trim() === "" || patch.apiKey === "[REDACTED]")) {
    delete patch.apiKey;
  }
  const cfg = readConfig();
  const existing = cfg.providers[id] ?? {
    enabled: false,
    baseUrl: "",
    apiKey: "",
    model: "",
  };
  cfg.providers[id] = { ...existing, ...patch };
  writeConfig(cfg);
  // Return the redacted form so the API never echoes the real key back.
  const redacted = { ...cfg.providers[id] };
  if (redacted.apiKey) redacted.apiKey = "[REDACTED]";
  return NextResponse.json(redacted);
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const cfg = readConfig();
  if (!cfg.providers[id]) {
    return NextResponse.json({ error: "provider not configured" }, { status: 404 });
  }
  delete cfg.providers[id];
  writeConfig(cfg);
  return NextResponse.json({ ok: true, id });
}
