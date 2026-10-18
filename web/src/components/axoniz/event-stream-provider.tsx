"use client";

/**
 * EventStreamProvider — singleton EventSource for the global event stream.
 *
 * Mounted ONCE in the (auth) layout. Opens an EventSource against
 * /api/axoniz/stream and pushes every event into the Zustand store
 * (railEvents). The connection survives page navigation — the previous
 * EventRail side panel re-created the EventSource on every mount/unmount,
 * causing flicker and lost events when the user navigated.
 *
 * Renders null — visible rendering of the stream now lives on the
 * dedicated /event-stream page (EventStreamPage component).
 */
import { useEffect } from "react";
import type { AxonizSseEvent } from "@/lib/axoniz/api-types";
import { axonizClient } from "@/lib/axoniz/client";
import { useAxonizStore } from "@/stores/axoniz-store";

const SSE_TYPES = [
  "token", "tool_call", "tool_result", "thought", "swarm",
  "memory", "error", "done", "health",
] as const;

export function EventStreamProvider() {
  const pushRailEvent = useAxonizStore((s) => s.pushRailEvent);
  const setRailConnected = useAxonizStore((s) => s.setRailConnected);

  useEffect(() => {
    let cancelled = false;
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function open() {
      if (cancelled) return;
      try {
        const url = axonizClient.streamUrl();
        es = new EventSource(url);

        const handle = (type: string) => (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            pushRailEvent({ type, ...data, ts: data.ts ?? Date.now() / 1000 } as AxonizSseEvent);
          } catch {
            /* ignore malformed */
          }
        };

        for (const t of SSE_TYPES) {
          es.addEventListener(t, handle(t));
        }
        es.addEventListener("message", handle("message"));

        es.onopen = () => setRailConnected(true);
        es.onerror = () => {
          setRailConnected(false);
          // EventSource auto-reconnects natively, but if it gives up
          // (e.g. server gone for good), we restart after 5s — the
          // previous EventRail implementation just silently dropped
          // the connection forever after a single failure.
          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => {
            try { es?.close(); } catch { /* ignore */ }
            open();
          }, 5000);
        };
      } catch {
        setRailConnected(false);
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(open, 5000);
      }
    }

    open();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try { es?.close(); } catch { /* ignore */ }
      setRailConnected(false);
    };
  }, [pushRailEvent, setRailConnected]);

  return null;
}
