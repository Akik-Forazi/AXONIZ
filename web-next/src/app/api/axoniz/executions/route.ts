/**
 * POST /api/axoniz/executions — submit a new durable execution.
 * GET  /api/axoniz/executions?session_id=<id> — list executions for a session.
 *
 * Auth: Bearer token required. Owner derived from token, NOT from body.
 */
import { NextRequest, NextResponse } from "next/server";
import { submitExecution, listExecutions, type ExecutionMode } from "@/lib/axoniz/execution-manager";
import { runExecution } from "@/lib/axoniz/execution-runner";
import { extractBearerToken, verifyAuthToken } from "@/lib/axoniz/cli-bridge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Verify the bearer token and return the authenticated username. */
async function getAuthUser(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  const token = extractBearerToken(authHeader);
  if (!token) return null;
  return verifyAuthToken(token);
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sessionId = new URL(req.url).searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }
  const executions = listExecutions(sessionId);
  // Filter to only show the authenticated user's executions
  const userExecs = executions.filter(e => e.owner === user);
  return NextResponse.json({ executions: userExecs });
}

export async function POST(req: NextRequest) {
  // Verify auth — owner is derived from the token, not the body
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { session_id: string; mode?: ExecutionMode; prompt: string; provider?: string; model?: string; idempotency_key?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.prompt?.trim() || !body.session_id) {
    return NextResponse.json({ error: "prompt and session_id required" }, { status: 400 });
  }

  // Validate idempotency key format if provided
  if (body.idempotency_key) {
    if (body.idempotency_key.length > 128 || !/^[a-zA-Z0-9._-]+$/.test(body.idempotency_key)) {
      return NextResponse.json({ error: "invalid idempotency_key format" }, { status: 400 });
    }
  }

  // Submit — owner is from the token, NOT from the body
  const exec = submitExecution({
    session_id: body.session_id,
    mode: body.mode ?? "chat",
    prompt: body.prompt,
    provider: body.provider,
    model: body.model,
    owner: user,  // Authenticated owner, not body.owner
    idempotency_key: body.idempotency_key,
  });

  // Start execution in the background
  runExecution(exec.id).catch((e) => {
    console.error(`[executions] runner error for ${exec.id}:`, e);
  });

  return NextResponse.json(exec, { status: 201 });
}
