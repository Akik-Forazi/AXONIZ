/** GET /api/axoniz/memory/query?q=... — semantic search via UnifiedMemory */
import { NextRequest, NextResponse } from "next/server";
import { queryMemory } from "@/lib/axoniz/cli-bridge";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  if (!q.trim()) return NextResponse.json({ error: "q required" }, { status: 400 });
  const result = await queryMemory(q);
  return NextResponse.json({ query: q, result });
}
