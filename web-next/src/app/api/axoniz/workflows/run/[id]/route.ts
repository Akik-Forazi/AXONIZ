/** POST /api/axoniz/workflows/run/[id] — trigger a workflow by ID */
import { NextRequest, NextResponse } from "next/server";
import { runWorkflow } from "@/lib/axoniz/cli-bridge";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const result = await runWorkflow(id);
  return NextResponse.json(result);
}
