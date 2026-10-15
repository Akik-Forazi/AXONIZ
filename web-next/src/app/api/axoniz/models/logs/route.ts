/**
 * GET /api/axoniz/models/logs
 * Returns the buffered server logs (last N lines from stdout/stderr).
 *
 * Query params:
 *   tail  — last N lines (default 1000, max 5000)
 *   since — only lines with ts > since (timestamp in ms)
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerMgr } from "@/lib/axoniz/server-mgr";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const tailN = Math.min(parseInt(url.searchParams.get("tail") ?? "1000", 10) || 1000, 5000);
  const since = url.searchParams.get("since");
  const sinceN = since ? parseInt(since, 10) : 0;
  const logs = getServerMgr().logs.filter(l => l.ts > sinceN).slice(-tailN);
  return NextResponse.json({
    logs,
    count: logs.length,
    status: getServerMgr().status,
    logFile: getServerMgr().logFile,
  });
}
