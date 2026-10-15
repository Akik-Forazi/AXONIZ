/**
 * GET  /api/axoniz/config/cli — read ~/.axoniz/config.json (the CLI's canonical config)
 * POST /api/axoniz/config/cli — merge-patch ~/.axoniz/config.json
 *
 * This is the SINGLE source of truth for provider config. No more
 * ~/.axoniz/db/config.json — the web reads/writes the SAME file
 * the CLI uses.
 */

import { NextRequest, NextResponse } from "next/server";
import { loadCliConfig, saveCliConfig } from "@/lib/axoniz/cli-bridge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const cfg = loadCliConfig();
  // Redact API keys before sending to the browser
  const redacted = JSON.parse(JSON.stringify(cfg));
  try {
    const providers = redacted?.llm?.providers;
    if (providers) {
      for (const key of Object.keys(providers)) {
        if (providers[key]?.api_key) providers[key].api_key = "[REDACTED]";
      }
    }
  } catch { /* ignore */ }
  return NextResponse.json(redacted);
}

export async function POST(req: NextRequest) {
  let patch: Record<string, unknown>;
  try {
    patch = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  // Load current config, merge the patch, save
  const current = loadCliConfig();
  const merged = { ...current, ...patch };
  // Deep-merge llm.providers if both have it
  if (patch.llm && current.llm) {
    const curLlm = current.llm as Record<string, unknown>;
    const patchLlm = patch.llm as Record<string, unknown>;
    if (curLlm.providers && patchLlm.providers) {
      merged.llm = {
        ...curLlm,
        ...patchLlm,
        providers: {
          ...curLlm.providers,
          ...patchLlm.providers,
        },
      };
    }
  }
  saveCliConfig(merged);
  return NextResponse.json({ ok: true });
}
