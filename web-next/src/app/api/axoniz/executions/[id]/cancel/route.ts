/** POST /api/axoniz/executions/[id]/cancel — request cancellation */
import { NextRequest, NextResponse } from "next/server";
import { requestCancellation, getExecution } from "@/lib/axoniz/execution-manager";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const exec = getExecution(id);
  if (!exec) return NextResponse.json({ error: "not found" }, { status: 404 });
  // Only allow cancellation of non-terminal executions
  if (["completed", "failed", "cancelled", "interrupted"].includes(exec.state)) {
    return NextResponse.json({ ok: true, message: `already ${exec.state}` });
  }
  requestCancellation(id);
  return NextResponse.json({ ok: true, state: "cancel_requested" });
}
