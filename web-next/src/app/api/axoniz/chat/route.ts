/**
 * POST /api/axoniz/chat — UNIFIED chat route using the durable execution system.
 *
 * This route does NOT stream directly from the LLM. Instead it:
 * 1. Submits a durable execution to the execution manager (persisted to SQLite)
 * 2. The execution runner starts in the background (survives browser disconnect)
 * 3. Returns the execution ID so the frontend can reconnect via SSE
 *
 * The frontend then calls GET /api/axoniz/executions/[id]/stream to get
 * live events. If the browser disconnects, the execution continues.
 * On reconnect, the frontend sends the last seq it received and gets
 * all missed events.
 *
 * Body: { message, session_id, mode? }
 * Returns: { execution_id, state: "queued" }
 *
 * This is the ChatGPT-style durable generation model:
 * - Generation is NOT tied to the HTTP request
 * - Browser can disconnect, refresh, close — generation continues
 * - Reconnect via execution_id + event cursor
 */

import { NextRequest, NextResponse } from "next/server";
import { submitExecution } from "@/lib/axoniz/execution-manager";
import { runExecution } from "@/lib/axoniz/execution-runner";
import { loadCliConfig } from "@/lib/axoniz/cli-bridge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 600;

interface ChatBody {
  message: string;
  session_id?: string;
  mode?: "chat" | "agent";
  owner?: string;
  idempotency_key?: string;
}

export async function POST(req: NextRequest) {
  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.message?.trim()) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }
  if (!body.session_id) {
    return NextResponse.json({ error: "session_id required — pass the chat/agent ID from the URL" }, { status: 400 });
  }

  // Load the CLI config to record which provider/model was used at submission time
  const cliConfig = loadCliConfig();
  const llm = (cliConfig as Record<string, unknown>)?.llm as { active_provider?: string; providers?: Record<string, { model_name?: string; model_path?: string }> } | undefined;
  const provider = llm?.active_provider ?? "llamacpp";
  const providerCfg = llm?.providers?.[provider];
  const model = providerCfg?.model_name ?? providerCfg?.model_path ?? undefined;

  // 1. Persist the execution BEFORE starting generation.
  //    If the server crashes here, the execution is in "queued" state
  //    and recovery will find it on restart.
  const exec = submitExecution({
    session_id: body.session_id,
    mode: body.mode ?? "chat",
    prompt: body.message,
    provider,
    model,
    owner: body.owner,
    idempotency_key: body.idempotency_key,
  });

  // 2. Start the execution runner in the background.
  //    This call does NOT block — the HTTP response returns immediately
  //    with the execution ID. The runner calls the CLI's Agent.chatStream()
  //    and persists tokens to SQLite as they arrive.
  runExecution(exec.id).catch((e) => {
    console.error(`[chat] runner error for ${exec.id}:`, e);
  });

  // 3. Return the execution ID — the frontend uses this to:
  //    - GET /api/axoniz/executions/[id]/stream (live SSE)
  //    - GET /api/axoniz/executions/[id]/events?since=N (reconnect after disconnect)
  //    - POST /api/axoniz/executions/[id]/cancel (cancel)
  return NextResponse.json({
    execution_id: exec.id,
    state: exec.state,
    session_id: exec.session_id,
    mode: exec.mode,
  }, { status: 201 });
}
