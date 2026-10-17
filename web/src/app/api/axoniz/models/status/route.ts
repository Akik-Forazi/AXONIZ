/** GET /api/axoniz/models/status — see server-mgr.ts for shape. */
import { NextRequest, NextResponse } from "next/server";
import { getServerMgr } from "@/lib/axoniz/server-mgr";
import { requireAuth } from "@/lib/axoniz/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(getServerMgr().status);
}
