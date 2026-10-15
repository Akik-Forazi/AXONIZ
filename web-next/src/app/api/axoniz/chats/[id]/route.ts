/**
 * GET    /api/axoniz/chats/[id]   — read a chat (full message history)
 * PUT    /api/axoniz/chats/[id]   — update title/messages/provider/model
 * DELETE /api/axoniz/chats/[id]   — delete a chat
 *
 * Path traversal defense: isValidChatId() in chat-store.ts enforces
 * a strict [a-zA-Z0-9._-]+ charset and forbids "..".
 */

import { NextRequest, NextResponse } from "next/server";
import { getChat, updateChat, deleteChat, deriveTitle, type ChatMessage } from "@/lib/axoniz/chat-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface PutBody {
  title?: string;
  messages?: ChatMessage[];
  provider?: string;
  model?: string;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const record = getChat(id);
  if (!record) {
    return NextResponse.json({ error: "chat not found", id }, { status: 404 });
  }
  return NextResponse.json(record);
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  let body: PutBody;
  try {
    body = (await req.json()) as PutBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const updated = updateChat(id, body);
  if (!updated) {
    return NextResponse.json({ error: "chat not found" }, { status: 404 });
  }
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const ok = deleteChat(id);
  if (!ok) {
    return NextResponse.json({ error: "chat not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, id });
}

// Re-export deriveTitle for callers that import from this route's module.
export { deriveTitle };
