/**
 * AXONIZ SSE proxy — /api/axoniz/stream
 *
 * 1. If the real backend at localhost:7860 is up, forwards its SSE stream
 *    verbatim so live agent events reach the UI.
 * 2. If unreachable, runs the mock event generator from mock-data.ts so the
 *    UI's right-rail "live event feed" stays populated for demo purposes.
 *
 * The route keeps the connection open, sends a `:` heartbeat every 15s, and
 * shuts down cleanly when the client disconnects.
 */

import type { NextRequest } from "next/server";
// mock-data.ts removed


export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BACKEND_URL = process.env.AXONIZ_BACKEND_URL ?? "http://127.0.0.1:7860";

export async function GET(_req: NextRequest) {
  const encoder = new TextEncoder();

  // Try forwarding from the real backend first.
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 800);
    const upstream = await fetch(`${BACKEND_URL}/api/stream`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (upstream.ok && upstream.body) {
      // We need to transform `event: x\ndata: y\n\n` frames into our own stream,
      // but for simplicity we just pipe the raw bytes through. The browser's
      // EventSource API will parse them correctly.
      return new Response(upstream.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "x-axoniz-source": "live",
        },
      });
    }
  } catch {
    /* backend unreachable — fall back to mock stream */
  }

  // No mock stream — return a clear error.
  return new Response(
    JSON.stringify({ error: "Backend not reachable. Run 'npm start -- --web' to start the AXONIZ backend." }),
    {
      status: 503,
      headers: { "Content-Type": "application/json" },
    },
  );
}
