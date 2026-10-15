/**
 * GET /api/axoniz/executions/[id]/stream — SSE stream of live events.
 *
 * 1. Sends all events since `since` query param (replay missed events).
 * 2. Polls for new events every 200ms and streams them live.
 * 3. Closes when the execution reaches a terminal state.
 *
 * This does NOT start a new generation — the execution is already
 * running (or completed) on the backend. This route is just a
 * read-only observer that delivers events to the browser.
 */
import type { NextRequest } from "next/server";
import { getEvents, getExecution } from "@/lib/axoniz/execution-manager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const encoder = new TextEncoder();
  const sinceSeq = Number(new URL(req.url).searchParams.get("since") ?? "0");

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let lastSeq = sinceSeq;
      const enqueue = (eventType: string, data: unknown) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`)); }
        catch { closed = true; }
      };

      (async () => {
        try {
          // 1. Send initial status
          const exec = getExecution(id);
          if (!exec) { enqueue("error", { error: "execution not found" }); controller.close(); return; }
          enqueue("status", { id, state: exec.state, output: exec.output });

          // 2. Send replay events (missed during disconnect)
          const replayEvents = getEvents(id, lastSeq);
          for (const ev of replayEvents) {
            enqueue(ev.type, ev.data);
            lastSeq = ev.seq;
          }

          // 3. Check if already terminal
          const terminalStates = ["completed", "failed", "cancelled"];
          if (terminalStates.includes(exec.state)) {
            enqueue("done", { state: exec.state, summary: exec.state === "completed" ? "Response complete" : exec.state });
            controller.close();
            return;
          }

          // 4. Poll for new events every 200ms
          while (!closed) {
            await new Promise(r => setTimeout(r, 200));
            const currentExec = getExecution(id);
            if (!currentExec) { enqueue("error", { error: "execution vanished" }); break; }

            const newEvents = getEvents(id, lastSeq);
            for (const ev of newEvents) {
              enqueue(ev.type, ev.data);
              lastSeq = ev.seq;
            }

            // Check if execution reached terminal state
            if (terminalStates.includes(currentExec.state)) {
              enqueue("done", { state: currentExec.state, summary: currentExec.state === "completed" ? "Response complete" : currentExec.state, error: currentExec.error });
              break;
            }

            // Check for client disconnect
            if (req.signal.aborted) break;
          }
        } catch (e) {
          enqueue("error", { error: e instanceof Error ? e.message : String(e) });
        } finally {
          try { controller.close(); } catch { /* already closed */ }
        }
      })();

      req.signal.addEventListener("abort", () => { closed = true; });
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
