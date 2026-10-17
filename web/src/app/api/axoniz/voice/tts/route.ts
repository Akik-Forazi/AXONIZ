/** POST /api/axoniz/voice/tts — synthesize text to speech */
import { NextRequest, NextResponse } from "next/server";
import { synthesizeVoice } from "@/lib/axoniz/cli-bridge";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(req: NextRequest) {
  let body: { text: string };
  try { body = (await req.json()) as typeof body; } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.text?.trim()) return NextResponse.json({ error: "text required" }, { status: 400 });
  const result = await synthesizeVoice(body.text);
  return NextResponse.json(result);
}
