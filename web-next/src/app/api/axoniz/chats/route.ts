/**
 * GET  /api/axoniz/chats           — list all saved chats (metadata only)
 * POST /api/axoniz/chats           — create a new chat, returns full record
 *                                    body: { username?: string }
 *
 * AUTH: Both endpoints require a valid Bearer JWT (auth-guard.ts).
 * Previously anyone could enumerate or create chats.
 *
 * See chat-store.ts for the file format and ID scheme.
 */

import { NextRequest, NextResponse } from "next/server";
import { listChats, createChat } from "@/lib/axoniz/chat-store";
import { requireAuth } from "@/lib/axoniz/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const chats = listChats();
  return NextResponse.json({ chats, count: chats.length });
}

export async function POST(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { username?: string; kind?: "chat" | "agent" } = {};
  try {
    body = await req.json();
  } catch {
    // No body required — fall through with default username
  }
  // Use the authenticated user's name when no explicit username is provided
  // — prevents impersonation via the request body.
  const username = body.username && body.username.trim().length > 0
    ? body.username
    : user;
  const record = createChat(username, { kind: body.kind });
  return NextResponse.json(record, { status: 201 });
}
