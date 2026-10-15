/**
 * GET  /api/axoniz/chats           — list all saved chats (metadata only)
 * POST /api/axoniz/chats           — create a new chat, returns full record
 *                                    body: { username?: string }
 *
 * See chat-store.ts for the file format and ID scheme.
 */

import { NextRequest, NextResponse } from "next/server";
import { listChats, createChat } from "@/lib/axoniz/chat-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const chats = listChats();
  return NextResponse.json({ chats, count: chats.length });
}

export async function POST(req: NextRequest) {
  let body: { username?: string; kind?: "chat" | "agent" } = {};
  try {
    body = await req.json();
  } catch {
    // No body required — fall through with default username
  }
  const record = createChat(body.username ?? "anon", { kind: body.kind });
  return NextResponse.json(record, { status: 201 });
}
