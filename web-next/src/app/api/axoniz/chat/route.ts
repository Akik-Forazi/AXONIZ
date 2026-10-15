/**
 * POST /api/axoniz/chat — Durable chat submission using the execution system.
 *
 * Auth: Bearer token required. Owner derived from token.
 *
 * Body: { message, session_id, mode?, idempotency_key? }
 * Returns: { execution_id, state, session_id, mode }
 */

import { NextRequest, NextResponse } from "next/server";
import { submitExecution } from "@/lib/axoniz/execution-manager";
import { runExecution } from "@/lib/axoniz/execution-runner";
import { loadCliConfig, extractBearerToken, verifyAuthToken } from "@/lib/axoniz/cli-bridge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 600;

interface ChatBody {
  message: string;
  session_id?: string;
  mode?: "chat" | "agent";
  idempotency_key?: string;
}

export async function POST(req: NextRequest) {
  // Verify auth — owner is derived from the token
  const authHeader = req.headers.get("authorization");
  const token = extractBearerToken(authHeader);
  if (!token) {
    return NextResponse.json({ error: "unauthorized — Bearer token required" }, { status: 401 });
  }
  const user = await verifyAuthToken(token);
  if (!user) {
    return NextResponse.json({ error: "unauthorized — invalid token" }, { status: 401 });
  }

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
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }

  // Validate idempotency key format
  if (body.idempotency_key) {
    if (body.idempotency_key.length > 128 || !/^[a-zA-Z0-9._-]+$/.test(body.idempotency_key)) {
      return NextResponse.json({ error: "invalid idempotency_key format" }, { status: 400 });
    }
  }

  // Load CLI config to record provider/model at submission time
  const cliConfig = loadCliConfig();
  const llm = (cliConfig as Record<string, unknown>)?.llm as { active_provider?: string; providers?: Record<string, { model_name?: string; model_path?: string }> } | undefined;
  const provider = llm?.active_provider ?? "llamacpp";
  const providerCfg = llm?.providers?.[provider];
  const model = providerCfg?.model_name ?? providerCfg?.model_path ?? undefined;

  // Persist execution — owner from token, NOT from body
  const exec = submitExecution({
    session_id: body.session_id,
    mode: body.mode ?? "chat",
    prompt: body.message,
    provider,
    model,
    owner: user,
    idempotency_key: body.idempotency_key,
  });

  // Start runner in background
  runExecution(exec.id).catch((e) => {
    console.error(`[chat] runner error for ${exec.id}:`, e);
  });

  return NextResponse.json({
    execution_id: exec.id,
    state: exec.state,
    session_id: exec.session_id,
    mode: exec.mode,
  }, { status: 201 });
}
