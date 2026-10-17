/** GET /api/axoniz/memory/status — palace drawers + KG facts count */
import { NextResponse } from "next/server";
import { getMemoryStatus } from "@/lib/axoniz/cli-bridge";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET() {
  const status = await getMemoryStatus();
  return NextResponse.json(status);
}
