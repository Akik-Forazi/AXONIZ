/** POST /api/axoniz/models/stop — kills the running local model server. */
import { NextRequest, NextResponse } from "next/server";
import { getServerMgr } from "@/lib/axoniz/server-mgr";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_req: NextRequest) {
  const mgr = getServerMgr();
  const before = mgr.status;
  if (!before.running) {
    return NextResponse.json({ ok: true, message: "no server running", was_running: false });
  }
  const killed = mgr.stop();
  return NextResponse.json({
    ok: killed,
    was_running: true,
    pid: before.pid,
    provider: before.provider,
    modelPath: before.modelPath,
  });
}
