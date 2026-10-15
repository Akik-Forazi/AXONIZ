/** GET /api/axoniz/executions/[id] — get status (owner-verified) */
import { NextRequest, NextResponse } from "next/server";
import { getExecution } from "@/lib/axoniz/execution-manager";
import { extractBearerToken, verifyAuthToken } from "@/lib/axoniz/cli-bridge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // Auth check
  const authHeader = req.headers.get("authorization");
  const token = extractBearerToken(authHeader);
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const user = await verifyAuthToken(token);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const exec = getExecution(id);
  if (!exec) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Ownership check — don't leak another user's execution
  if (exec.owner !== user) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json(exec);
}
