/** POST /api/axoniz/models/stop — kills the running local model server. */
import { NextRequest, NextResponse } from "next/server";
import { getServerMgr } from "@/lib/axoniz/server-mgr";
import { requireAuth } from "@/lib/axoniz/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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
