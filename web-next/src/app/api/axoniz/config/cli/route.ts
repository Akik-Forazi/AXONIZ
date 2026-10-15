import { NextRequest, NextResponse } from "next/server";
import { loadCliConfig, saveCliConfig } from "@/lib/axoniz/cli-bridge";
import { requireAuth } from "@/lib/axoniz/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const cfg = loadCliConfig();
  const redacted = JSON.parse(JSON.stringify(cfg));
  try {
    const providers = redacted?.llm?.providers;
    if (providers) for (const key of Object.keys(providers)) {
      if (providers[key]?.api_key) providers[key].api_key = "[REDACTED]";
    }
  } catch { /* ignore */ }
  return NextResponse.json(redacted);
}

export async function POST(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let patch: Record<string, unknown>;
  try { patch = (await req.json()) as Record<string, unknown>; } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const current = loadCliConfig();
  const merged = { ...current, ...patch };
  if (patch.llm && current.llm) {
    const curLlm = current.llm as Record<string, unknown>;
    const patchLlm = patch.llm as Record<string, unknown>;
    if (curLlm.providers && patchLlm.providers) {
      merged.llm = { ...curLlm, ...patchLlm, providers: { ...curLlm.providers, ...patchLlm.providers } };
    }
  }
  saveCliConfig(merged);
  return NextResponse.json({ ok: true });
}
