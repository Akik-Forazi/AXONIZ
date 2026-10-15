/**
 * GET  /api/axoniz/chats/[id]/events   — read all JSONL events (full history)
 * POST /api/axoniz/chats/[id]/events   — append one or more events (real-time)
 *
 * The POST endpoint is called by the frontend as tokens stream in.
 * Each call appends one event to the JSONL file — crash-safe,
 * navigation-safe (state survives component unmount).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  appendChatEvent,
  appendChatEvents,
  readChatEvents,
  reconstructMessages,
  type ChatEvent,
} from "@/lib/axoniz/chat-jsonl";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const events = readChatEvents(id);
  if (events.length === 0) {
    return NextResponse.json({ events: [], messages: [], count: 0 });
  }
  const messages = reconstructMessages(id);
  return NextResponse.json({ events, messages, count: events.length });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  let body: ChatEvent | ChatEvent[];
  try {
    body = (await req.json()) as ChatEvent | ChatEvent[];
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (Array.isArray(body)) {
    const ok = appendChatEvents(id, body);
    return NextResponse.json({ ok, appended: body.length });
  } else {
    const ok = appendChatEvent(id, body);
    return NextResponse.json({ ok, appended: 1 });
  }
}
