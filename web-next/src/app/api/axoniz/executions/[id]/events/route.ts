/**
 * GET /api/axoniz/executions/[id]/events — get events since a cursor.
 *
 * Query params: since=<seq> — only events with seq > since
 *
 * Returns: { events: [...], latest_seq: N }
 *
 * Used by the frontend to reconnect after a disconnect. The frontend
 * sends the last seq it received, and gets back all events it missed.
 */
import { NextRequest, NextResponse } from "next/server";
import { getEvents, getExecution } from "@/lib/axoniz/execution-manager";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const exec = getExecution(id);
  if (!exec) return NextResponse.json({ error: "not found" }, { status: 404 });
  const sinceSeq = Number(new URL(req.url).searchParams.get("since") ?? "0");
  const events = getEvents(id, sinceSeq);
  const latestSeq = events.length > 0 ? events[events.length - 1].seq : sinceSeq;
  return NextResponse.json({
    events,
    latest_seq: latestSeq,
    state: exec.state,
    output: exec.output,
    is_terminal: ["completed", "failed", "cancelled"].includes(exec.state),
  });
}
