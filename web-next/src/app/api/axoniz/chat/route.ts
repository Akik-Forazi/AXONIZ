/**
 * POST /api/axoniz/chat — UNIFIED chat route using the CLI's Agent.
 *
 * This is the CANONICAL chat route. It does NOT construct OpenAI HTTP
 * requests directly — it calls the CLI's Agent.chatStream() which
 * internally uses get_backend() to pick the right backend class
 * (LlamaCppBackend, OpenAICompatibleBackend, etc.) based on
 * ~/.axoniz/config.json's llm.active_provider.
 *
 * Execution path:
 *   Web UI → this route → cli-bridge.ts → dist/core/agent.js →
 *   Agent.chatStream() → get_backend() → configured backend class →
 *   actual LLM provider → streaming tokens back as SSE.
 *
 * Body: { message, history?, mode? }
 *   mode: "chat" (default) → streaming chat via Agent.chatStream()
 *         "agent" → full agent loop via Agent.run() (with tools)
 *
 * SSE events:
 *   event: thinking  — status updates
 *   event: token     — streamed tokens { value: "..." }
 *   event: done      — completion { summary: "..." }
 *   event: error      — failure { error: "..." }
 */

import type { NextRequest } from "next/server";
import { streamAgentChat, execAgent, loadCliConfig } from "@/lib/axoniz/cli-bridge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 600;

interface ChatBody {
  message: string;
  history?: Array<{ role: string; content: string }>;
  mode?: "chat" | "agent";
}

export async function POST(req: NextRequest) {
  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  if (!body.message?.trim()) {
    return new Response("Missing message", { status: 400 });
  }

  const mode = body.mode ?? "chat";
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const enqueue = (eventType: string, data: Record<string, unknown>) => {
        if (closed) return;
        try {
          const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch { closed = true; }
      };

      (async () => {
        // Heartbeat — tell the user we're working
        enqueue("thinking", { type: "thinking", value: "loading CLI agent + backend…", ts: Date.now() / 1000 });
        const heartbeat = setInterval(() => {
          enqueue("thinking", { type: "thinking", value: `still working…`, ts: Date.now() / 1000 });
        }, 5_000);
        (heartbeat as unknown as { unref?: () => void }).unref?.();

        try {
          if (mode === "agent") {
            // Full agent loop — tools, memory, swarm
            enqueue("thinking", { type: "thinking", value: "running agent loop…", ts: Date.now() / 1000 });
            const result = await execAgent(body.message);
            // Stream the result as one big token (agent.run() is not a generator)
            enqueue("token", { type: "token", value: result.result, ts: Date.now() / 1000 });
          } else {
            // Streaming chat — tokens from Agent.chatStream()
            enqueue("thinking", { type: "thinking", value: "streaming from backend…", ts: Date.now() / 1000 });
            for await (const tok of streamAgentChat(body.message, body.history)) {
              enqueue("token", { type: "token", value: tok, ts: Date.now() / 1000 });
            }
          }
          enqueue("done", { type: "done", summary: "Response complete", ts: Date.now() / 1000 });
        } catch (err) {
          const e = err as Error;
          const name = e.name;
          const msg = e.message ?? "";
          let friendly: string;
          if (name === "TimeoutError" || name === "AbortError") {
            friendly = `Upstream timed out. Check the Servers page for live logs.`;
          } else if (msg.includes("fetch failed") || msg.includes("ECONNREFUSED") || name === "TypeError") {
            friendly = `Could not reach the model server. Is it running? Check Servers page.`;
          } else {
            friendly = `${name}: ${msg}`;
          }
          enqueue("error", { type: "error", error: friendly, ts: Date.now() / 1000 });
          enqueue("done", { type: "done", summary: "Failed", ts: Date.now() / 1000 });
        } finally {
          clearInterval(heartbeat);
          try { controller.close(); } catch { /* already closed */ }
        }
      })();
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
