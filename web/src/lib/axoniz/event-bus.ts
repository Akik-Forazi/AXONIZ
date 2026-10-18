/**
 * In-memory event bus for INSTANT token streaming.
 *
 * The execution runner publishes events here (sub-millisecond),
 * and the SSE stream endpoint subscribes instead of polling SQLite.
 *
 * SQLite still gets batched writes (every 50ms) for durability
 * and reconnect support, but the LIVE stream goes through memory.
 *
 * This is how Claude Code / Codex / ChatGPT achieve instant streaming:
 * model output → event bus → SSE → browser = ~1ms latency.
 */

type SSEEvent = { type: string; data: unknown };

const channels = new Map<string, Set<(event: SSEEvent) => void>>();

/** Subscribe to live events for an execution. Returns an unsubscribe function. */
export function subscribe(executionId: string, callback: (event: SSEEvent) => void): () => void {
  if (!channels.has(executionId)) channels.set(executionId, new Set());
  channels.get(executionId)!.add(callback);
  return () => {
    channels.get(executionId)?.delete(callback);
  };
}

/** Publish an event to all subscribers of an execution. Instant, synchronous. */
export function publish(executionId: string, event: SSEEvent): void {
  const subs = channels.get(executionId);
  if (subs) {
    for (const cb of subs) {
      try { cb(event); } catch { /* subscriber errored — skip */ }
    }
  }
}

/** Clean up the channel for an execution (free memory). */
export function closeChannel(executionId: string): void {
  channels.delete(executionId);
}
