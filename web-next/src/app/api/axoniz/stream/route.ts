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
import { mockSseEventStream } from "@/lib/axoniz/mock-data";
import type { AxonizSseEvent } from "@/lib/axoniz/api-types";

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

  // Mock stream — emit scripted events with realistic pacing.
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const enqueue = (s: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(s));
        } catch {
          closed = true;
        }
      };
      const enqueueEvent = (ev: AxonizSseEvent) => {
        const data = JSON.stringify(ev);
        enqueue(`event: ${ev.type}\n`);
        enqueue(`data: ${data}\n\n`);
      };

      const heartbeat = setInterval(() => enqueue(": keepalive\n\n"), 15_000);
      heartbeat.unref?.();

      _req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });

      const events = [...mockSseEventStream()];
      let i = 0;
      const next = () => {
        if (closed) return;
        if (i >= events.length) {
          // Loop after a long pause so the live feed keeps moving.
          setTimeout(() => {
            i = 0;
            next();
          }, 12_000);
          return;
        }
        enqueueEvent(events[i]);
        i += 1;
        // Pace events: tokens are quick, swarm events spaced out.
        const ev = events[i - 1];
        const delay =
          ev.type === "token" ? 90 : ev.type === "tool_result" ? 600 : 380;
        setTimeout(next, delay);
      };
      next();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "x-axoniz-source": "mock",
    },
  });
}
