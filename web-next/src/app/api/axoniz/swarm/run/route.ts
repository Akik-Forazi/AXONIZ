/** POST /api/axoniz/swarm/run — run swarm orchestrator (decompose→workers→critic→merger) */
import { NextRequest, NextResponse } from "next/server";
import { runSwarm, type AgentConfig } from "@/lib/axoniz/cli-bridge";
import { requireAuth } from "@/lib/axoniz/auth-guard";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 600;
export async function POST(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { task: string; provider?: string; baseUrl?: string; apiKey?: string; model?: string };
  try { body = (await req.json()) as typeof body; } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.task?.trim()) return NextResponse.json({ error: "task required" }, { status: 400 });
  const config: AgentConfig = {
    provider: body.provider ?? "llamacpp",
    workspace: ".",
    baseUrl: body.baseUrl,
    apiKey: body.apiKey,
    model: body.model,
  };
  const result = await runSwarm(body.task, config);
  return NextResponse.json(result);
}
