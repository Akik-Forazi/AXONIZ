/** GET /api/axoniz/goals — list goals from ~/.axoniz/goals.db */
import { NextResponse } from "next/server";
import { listGoals } from "@/lib/axoniz/cli-bridge";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET() {
  const goals = await listGoals();
  return NextResponse.json({ goals });
}
