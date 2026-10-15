/** GET /api/axoniz/executions/[id] — get execution status + partial output */
import { NextRequest, NextResponse } from "next/server";
import { getExecution } from "@/lib/axoniz/execution-manager";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const exec = getExecution(id);
  if (!exec) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(exec);
}
