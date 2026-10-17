/** GET /api/axoniz/workflows — list all workflows from ~/.axoniz/workflows.db */
import { NextResponse } from "next/server";
import { listWorkflows } from "@/lib/axoniz/cli-bridge";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET() {
  const workflows = await listWorkflows();
  return NextResponse.json({ workflows });
}
