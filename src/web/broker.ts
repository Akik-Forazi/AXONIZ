/**
 * Server-Sent Events broker.
 * Port of `SSEBroker` from axoniz/web/server.py.
 *
 * Each connected client gets an async queue; `broadcast` fans an event out to
 * every subscriber. The broker is a singleton (`broker`) because the agent,
 * swarm and daemon all publish to it.
 */
import { AsyncQueue } from "../core/backend/async_queue.js";

export interface SseEvent {
  type: string;
  data: unknown;
  ts: number;
}

export class SSEBroker {
  private clients = new Set<AsyncQueue<SseEvent>>();
  /** Ring buffer of recent events, useful for late subscribers and the UI. */
  private recent: SseEvent[] = [];
  private readonly maxRecent = 200;

  addClient(): AsyncQueue<SseEvent> {
    const q = new AsyncQueue<SseEvent>();
    this.clients.add(q);
    return q;
  }

  removeClient(q: AsyncQueue<SseEvent>): void {
    this.clients.delete(q);
    q.close();
  }

  broadcast(eventType: string, data: unknown): number {
    const ev: SseEvent = { type: eventType, data, ts: Date.now() / 1000 };
    this.recent.push(ev);
    if (this.recent.length > this.maxRecent) {
      this.recent.splice(0, this.recent.length - this.maxRecent);
    }
    let delivered = 0;
    for (const q of this.clients) {
      q.push(ev);
      delivered += 1;
    }
    return delivered;
  }

  /** Alias compatible with the Python `_broker.broadcast(...)` call sites. */
  get clientCount(): number {
    return this.clients.size;
  }

  getRecent(n = 50): SseEvent[] {
    return this.recent.slice(-n);
  }

  closeAll(): void {
    for (const q of this.clients) q.close();
    this.clients.clear();
  }
}

/* Module-level singleton (mirrors the Python `_broker`) */
export const broker = new SSEBroker();

/** Named export matching the Python import site `from ... import _broker`. */
export const _broker = broker;

/** Format an event as an SSE wire frame. */
export function formatSse(ev: SseEvent): string {
  return `event: ${ev.type}\ndata: ${JSON.stringify(ev.data)}\n\n`;
}
