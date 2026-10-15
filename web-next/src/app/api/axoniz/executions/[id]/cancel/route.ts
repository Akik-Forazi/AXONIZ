/** POST /api/axoniz/executions/[id]/cancel — request cancellation (owner-verified) */
import { NextRequest, NextResponse } from "next/server";
import { requestCancellation, getExecution } from "@/lib/axoniz/execution-manager";
import { extractBearerToken, verifyAuthToken } from "@/lib/axoniz/cli-bridge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authHeader = req.headers.get("authorization");
  const token = extractBearerToken(authHeader);
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const user = await verifyAuthToken(token);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const exec = getExecution(id);
  if (!exec) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (exec.owner !== user) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (["completed", "failed", "cancelled", "interrupted"].includes(exec.state)) {
    return NextResponse.json({ ok: true, message: `already ${exec.state}` });
  }
  requestCancellation(id);
  return NextResponse.json({ ok: true, state: "cancel_requested" });
}
