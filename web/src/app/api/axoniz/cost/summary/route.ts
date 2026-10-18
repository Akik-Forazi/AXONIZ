/** GET /api/axoniz/cost/summary — aggregated token/$ cost per task */
import { NextResponse } from "next/server";
import { getCostSummary } from "@/lib/axoniz/cli-bridge";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET() {
  const summary = await getCostSummary();
  return NextResponse.json(summary);
}
