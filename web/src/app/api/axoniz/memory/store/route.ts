/** POST /api/axoniz/memory/store — store a memory entry */
import { NextRequest, NextResponse } from "next/server";
import { storeMemory } from "@/lib/axoniz/cli-bridge";
import { requireAuth } from "@/lib/axoniz/auth-guard";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { key: string; value: string };
  try { body = (await req.json()) as typeof body; } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.key || !body.value) return NextResponse.json({ error: "key + value required" }, { status: 400 });
  const result = await storeMemory(body.key, body.value);
  return NextResponse.json(result);
}
