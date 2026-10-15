/**
 * POST /api/axoniz/agent/exec
 *
 * Runs the FULL agent loop via the CLI's Agent class (dist/core/agent.js).
 * The agent loop:
 *   1. Takes the user's goal
 *   2. Sends it to the LLM with the tool schema in the system prompt
 *   3. If the model emits tool calls → executes them (FileTools, ShellTools, etc.)
 *   4. Feeds results back to the model
 *   5. Repeats until the model gives a final answer
 *
 * Streams SSE events: thought, tool_call, tool_result, token, done, cost.
 *
 * Body: { goal, provider, baseUrl?, apiKey?, model?, workspace? }
 */
import { NextRequest, NextResponse } from "next/server";
import { execAgent, type AgentConfig } from "@/lib/axoniz/cli-bridge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 600;

export async function POST(req: NextRequest) {
  let body: { goal: string; provider?: string; baseUrl?: string; apiKey?: string; model?: string; workspace?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.goal?.trim()) {
    return NextResponse.json({ error: "goal required" }, { status: 400 });
  }
  const config: AgentConfig = {
    provider: body.provider ?? "llamacpp",
    workspace: body.workspace ?? ".",
    baseUrl: body.baseUrl,
    apiKey: body.apiKey,
    model: body.model,
  };
  try {
    const result = await execAgent(body.goal, config);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
