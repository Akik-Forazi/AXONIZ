/**
 * AXONIZ SSE stream — minimal keepalive, no Express backend needed.
 * The EventRail polls this for live events. When the agent is running
 * (via `axoniz --web`), the CLI's daemon events would be written here.
 * For now, returns keepalive comments so the SSE connection stays open.
 */

import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const enqueue = (s: string) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(s)); } catch { closed = true; }
      };

      // Send initial keepalive
      enqueue(": keepalive\n\n");

      // Heartbeat every 30s
      const interval = setInterval(() => enqueue(": keepalive\n\n"), 30000);
      (interval as any).unref?.();

      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(interval);
        try { controller.close(); } catch {}
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
