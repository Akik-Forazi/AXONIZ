/**
 * GET  /api/axoniz/db/providers/[id]  — read one provider's config from DB
 * PUT  /api/axoniz/db/providers/[id]  — merge-patch one provider's config
 * DELETE /api/axoniz/db/providers/[id] — remove a provider's config
 *
 * Provider config shape: { enabled, baseUrl, apiKey, model }
 * Keys are stored on disk at ~/.axoniz/db/config.json (0600 perms).
 */

import { NextRequest, NextResponse } from "next/server";
import { readConfig, writeConfig, type ProviderDbConfig } from "@/lib/axoniz/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const cfg = readConfig();
  const provider = cfg.providers[id];
  if (!provider) {
    return NextResponse.json({ error: "provider not configured", id }, { status: 404 });
  }
  return NextResponse.json(provider);
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  let patch: Partial<ProviderDbConfig>;
  try {
    patch = (await req.json()) as Partial<ProviderDbConfig>;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
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
  return NextResponse.json(cfg.providers[id]);
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const cfg = readConfig();
  if (!cfg.providers[id]) {
    return NextResponse.json({ error: "provider not configured" }, { status: 404 });
  }
  delete cfg.providers[id];
  writeConfig(cfg);
  return NextResponse.json({ ok: true, id });
}
