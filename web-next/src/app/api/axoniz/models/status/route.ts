/** GET /api/axoniz/models/status — see server-mgr.ts for shape. */
import { NextResponse } from "next/server";
import { getServerMgr } from "@/lib/axoniz/server-mgr";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getServerMgr().status);
}
