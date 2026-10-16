/**
 * GET /api/axoniz/models/logs/stream
 *
 * Server-Sent Events endpoint — pushes each new log line as it arrives
 * from the running server process. Used by the /servers page for the
 * live terminal view.
 *
 * The endpoint:
 *   1. Sends the current ring buffer as a backlog (one event per line).
 *   2. Subscribes to the ServerProcessManager's "line" emitter.
 *   3. Pushes new lines as they arrive.
 *   4. Sends a keepalive comment every 15s.
 *   5. Closes when the client disconnects.
 *
 * Event format (text/event-stream):
 *   event: log
 *   data: {"ts":1739...,"stream":"stdout","text":"..."}
 */
import type { NextRequest } from "next/server";
import { getServerMgr, type LogLine } from "@/lib/axoniz/server-mgr";
import { requireAuth } from "@/lib/axoniz/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  // Auth required — the live log stream may contain command-line args
  // (including API keys / model paths) from the spawn.
  // EventSource can't set headers; requireAuth checks ?token=<jwt> too.
  const user = await requireAuth(req);
  if (!user) return new Response("unauthorized", { status: 401 });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const enqueue = (s: string) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(s)); } catch { closed = true; }
      };

      // 1. Send backlog.
      const mgr = getServerMgr();
      for (const line of mgr.logs) {
        enqueue(`event: log\ndata: ${JSON.stringify(line)}\n\n`);
      }
      // Also send current status so the client knows what we're tailing.
      enqueue(`event: status\ndata: ${JSON.stringify(mgr.status)}\n\n`);

      // 2. Subscribe to live lines.
      const unsubscribe = mgr.subscribe((line: LogLine) => {
        enqueue(`event: log\ndata: ${JSON.stringify(line)}\n\n`);
      });

      // 3. Keepalive every 15s.
      const interval = setInterval(() => enqueue(": keepalive\n\n"), 15_000);
      (interval as unknown as { unref?: () => void }).unref?.();

      // 4. Cleanup on client disconnect.
      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(interval);
        unsubscribe();
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "x-axoniz-source": "live",
    },
  });
}
