/**
 * POST /api/axoniz/executions — submit a new durable execution.
 * GET  /api/axoniz/executions?session_id=<id> — list executions for a session.
 *
 * Body: { session_id, mode, prompt, provider?, model? }
 * Returns: { id, state: "queued", ... }
 *
 * The execution is persisted BEFORE the HTTP response returns. The
 * caller gets an execution ID they can use to reconnect. Generation
 * starts in the background — it does NOT block this HTTP request.
 */
import { NextRequest, NextResponse } from "next/server";
import { submitExecution, listExecutions, type ExecutionMode } from "@/lib/axoniz/execution-manager";
import { runExecution } from "@/lib/axoniz/execution-runner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sessionId = new URL(req.url).searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }
  const executions = listExecutions(sessionId);
  return NextResponse.json({ executions });
}

export async function POST(req: NextRequest) {
  let body: { session_id: string; mode?: ExecutionMode; prompt: string; provider?: string; model?: string; owner?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.prompt?.trim() || !body.session_id) {
    return NextResponse.json({ error: "prompt and session_id required" }, { status: 400 });
  }
  // Persist the execution BEFORE starting it.
  const exec = submitExecution({
    session_id: body.session_id,
    mode: body.mode ?? "chat",
    prompt: body.prompt,
    provider: body.provider,
    model: body.model,
    owner: body.owner,
  });
  // Start execution in the background — does NOT block this HTTP response.
  // The runner uses the CLI's Agent via cli-bridge.ts.
  runExecution(exec.id).catch((e) => {
    // If the runner throws before transitioning state, mark as failed.
    console.error(`[executions] runner error for ${exec.id}:`, e);
  });
  return NextResponse.json(exec, { status: 201 });
}
