/** GET /api/axoniz/daemon/status — daemon heartbeat + last audit */
import { NextResponse } from "next/server";
import { getDaemonStatus } from "@/lib/axoniz/cli-bridge";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET() {
  const status = await getDaemonStatus();
  return NextResponse.json(status);
}
