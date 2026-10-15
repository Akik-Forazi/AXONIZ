/**
 * Real streaming chat route — ACTUALLY proxies to the user's configured
 * provider endpoint with provider-specific protocol handling.
 *
 * Supported providers:
 *  - OpenAI-compatible: lmstudio, openai, openrouter, groq, together,
 *    mistral, deepseek, fireworks, perplexity, custom
 *    → POST {baseUrl}/chat/completions, stream OpenAI deltas
 *  - ollama  → POST {baseUrl}/api/chat, stream Ollama message.content
 *  - anthropic → POST {baseUrl}/v1/messages with x-api-key + anthropic-version,
 *    stream SSE content_block_delta events
 *  - gemini → POST {baseUrl}/v1beta/models/{model}:streamGenerateContent?key=…,
 *    stream candidates[0].content.parts[0].text
 *  - llamacpp → OpenAI-compatible /v1/chat/completions (llama-server mode)
 *
 * All responses re-emitted as AXONIZ SSE events so the client parser
 * stays uniform across providers.
 *
 * Request body: {
 *   message, history?, provider, baseUrl?, apiKey?, model?, systemPrompt?,
 *   temperature?, maxTokens?
 * }
 */

import type { NextRequest } from "next/server";
// mock-data.ts was removed — no more mock fallback
import type { AxonizSseEvent } from "@/lib/axoniz/api-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 10-minute handler timeout — local models on CPU are SLOW. A 4B model at
// 10 tok/s generates 600 tokens in 60s; a 7B at 5 tok/s generates only 300.
// Long answers (code, explanations) easily blow past 60s. Cloud providers
// are much faster, so this only adds headroom for the slow case.
//
// NOTE: maxDuration MUST be a static literal — Next.js evaluates it at
// build time, not runtime. If you need a different value, change it here
// and rebuild. The upstream fetch timeout (TIMEOUT_MS below) is runtime-
// configurable via AXONIZ_CHAT_TIMEOUT_MS env var.
export const maxDuration = 600;

interface ChatBody {
  message: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  provider: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

const AXONIZ_SYSTEM =
  "You are AXONIZ — an autonomous local agentic system operating 100% offline via small local models when possible. You reason with precision, propose concrete next actions, and write production-quality code. Reply in Markdown.";

// Upstream fetch timeout — same value as maxDuration above, but in ms.
// Set via AXONIZ_CHAT_TIMEOUT_MS env (default 600_000 = 10 min).
// Long because local models on CPU can take 30-60s just for prompt
// processing before the first token streams out.
const TIMEOUT_MS = Number(process.env.AXONIZ_CHAT_TIMEOUT_MS ?? 600_000);

function enqueue(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  ev: AxonizSseEvent,
) {
  const data = JSON.stringify(ev);
  controller.enqueue(encoder.encode(`event: ${ev.type}\ndata: ${data}\n\n`));
}

const OPENAI_COMPATIBLE = new Set([
  "lmstudio", "openai", "openrouter", "groq", "together",
  "mistral", "deepseek", "fireworks", "perplexity", "custom", "llamacpp",
]);

export async function POST(req: NextRequest) {
  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  if (!body.message?.trim()) return new Response("Missing message", { status: 400 });

  const encoder = new TextEncoder();
  const system = body.systemPrompt ?? AXONIZ_SYSTEM;
  const history = body.history ?? [];

  // Helper: build messages array for OpenAI-style requests
  const openAIMessages = [
    { role: "system", content: system },
    ...history,
    { role: "user" as const, content: body.message },
  ];

  // Auto-default the baseUrl for llamacpp — the user's llama-server runs at
  // http://localhost:8080 by convention. If the frontend didn't send one
  // (e.g. store hydration race, or user never opened Settings), use the
  // default rather than 400'ing. This was a common crash: the user picked
  // a model in the Vault but the chat then bailed with "No provider configured".
  if (!body.baseUrl && body.provider === "llamacpp") {
    body.baseUrl = "http://localhost:8080";
  }

  if (!body.baseUrl) {
    return noProviderError();
  }

  // Pick handler by provider
  if (OPENAI_COMPATIBLE.has(body.provider)) {
    return openAIStream(body, openAIMessages, encoder);
  }
  if (body.provider === "ollama") {
    return ollamaStream(body, openAIMessages, encoder);
  }
  if (body.provider === "anthropic") {
    return anthropicStream(body, history, system, encoder);
  }
  if (body.provider === "gemini") {
    return geminiStream(body, history, system, encoder);
  }
  return noProviderError();
}

/* ============================================================
   OpenAI-compatible streaming (LM Studio, OpenAI, OpenRouter,
   Groq, Together, Mistral, DeepSeek, Fireworks, Perplexity,
   Custom, llama.cpp server)
   ============================================================ */
async function openAIStream(
  body: ChatBody,
  messages: Array<{ role: string; content: string }>,
  encoder: TextEncoder,
) {
  // llama-server (llama.cpp) serves OpenAI-compatible routes under /v1/.
  // Cloud providers' baseUrls already include /v1 (e.g. https://api.openai.com/v1).
  // The previous code did ${baseUrl}/chat/completions — which worked for cloud
  // providers but 404'd for llama-server (which only serves /v1/chat/completions).
  const pathPrefix = body.provider === "llamacpp" ? "/v1" : "";
  const url = `${body.baseUrl!.replace(/\/+$/, "")}${pathPrefix}/chat/completions`;
  const payload = {
    model: body.model || "gpt-4o-mini",
    messages,
    stream: true,
    temperature: body.temperature ?? 0.7,
    max_tokens: body.maxTokens,
  };

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const safeEnqueue = (ev: AxonizSseEvent) => {
        if (closed) return;
        try { enqueue(controller, encoder, ev); } catch { closed = true; }
      };

      (async () => {
        // Heartbeat: emit a 'thinking' SSE event every 5s while we wait
        // for the upstream fetch to resolve OR while the model is
        // generating tokens. This tells the client the connection is
        // still alive — without this, a 30-60s time-to-first-token
        // window on CPU inference looks like a hung request.
        let lastHeartbeat = Date.now();
        const heartbeat = setInterval(() => {
          const elapsed = Math.round((Date.now() - lastHeartbeat) / 1000);
          safeEnqueue({
            type: "thinking",
            value: `still working… ${elapsed}s elapsed`,
            ts: Date.now() / 1000,
          });
          // Don't update lastHeartbeat — we want the cumulative elapsed
          // time since the request started, not since the last heartbeat.
        }, 5_000);
        (heartbeat as unknown as { unref?: () => void }).unref?.();

        try {
          // Tell the client we've started the upstream fetch — they'll
          // see this immediately so they know the request is in flight
          // even before TTFT.
          safeEnqueue({
            type: "thinking",
            value: "sending request to model server…",
            ts: Date.now() / 1000,
          });
          const upstream = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(body.apiKey ? { Authorization: `Bearer ${body.apiKey}` } : {}),
              ...(body.provider === "openrouter"
                ? { "HTTP-Referer": "https://axoniz.local", "X-Title": "AXONIZ" }
                : {}),
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
          if (!upstream.ok || !upstream.body) {
            const errText = await upstream.text().catch(() => "");
            safeEnqueue({
              type: "error",
              error: `Upstream ${upstream.status} ${upstream.statusText}${errText ? ` — ${errText.slice(0, 300)}` : ""}`,
              ts: Date.now() / 1000,
            });
            safeEnqueue({ type: "done", summary: "Failed", ts: Date.now() / 1000 });
            clearInterval(heartbeat);
            controller.close();
            return;
          }
          // Tell the client the upstream responded — they'll see this
          // right before the first token streams.
          safeEnqueue({
            type: "thinking",
            value: "model is generating tokens…",
            ts: Date.now() / 1000,
          });
          const reader = upstream.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const chunks = buffer.split("\n\n");
            buffer = chunks.pop() ?? "";
            for (const chunk of chunks) {
              const dataLine = chunk.split("\n").find((l) => l.startsWith("data:"));
              if (!dataLine) continue;
              const payloadStr = dataLine.slice(5).trim();
              if (payloadStr === "[DONE]") continue;
              try {
                const json = JSON.parse(payloadStr);
                const delta = json?.choices?.[0]?.delta?.content;
                if (typeof delta === "string" && delta.length > 0) {
                  safeEnqueue({ type: "token", value: delta, ts: Date.now() / 1000 });
                }
              } catch { /* skip malformed */ }
            }
          }
          safeEnqueue({ type: "done", summary: "Response complete", ts: Date.now() / 1000 });
        } catch (err) {
          const e = err as Error;
          // Translate opaque fetch errors into actionable messages.
          const name = e.name;
          const msg = e.message ?? "";
          let friendly: string;
          if (name === "TimeoutError" || name === "AbortError") {
            friendly = `Upstream timed out after ${Math.round(TIMEOUT_MS / 1000)}s. The model may have hung or is generating a very long response. Check the Servers page for live logs from ${body.baseUrl}.`;
          } else if (msg.includes("fetch failed") || msg.includes("ECONNREFUSED") || msg.includes("Failed to fetch") || name === "TypeError") {
            friendly = `Could not reach ${body.provider} server at ${url}. The model server is not running — go to the Servers page and click "Start server", or verify the baseUrl in Settings.`;
          } else {
            friendly = `${name}: ${msg}`;
          }
          safeEnqueue({
            type: "error",
            error: friendly,
            ts: Date.now() / 1000,
          });
          safeEnqueue({ type: "done", summary: "Failed", ts: Date.now() / 1000 });
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

/* ============================================================
   Ollama streaming — POST {baseUrl}/api/chat
   Each SSE chunk: { message: { content: "..." }, done: bool }
   ============================================================ */
async function ollamaStream(
  body: ChatBody,
  messages: Array<{ role: string; content: string }>,
  encoder: TextEncoder,
) {
  const url = `${body.baseUrl!.replace(/\/$/, "")}/api/chat`;
  const payload = {
    model: body.model || "llama3.2:3b",
    messages,
    stream: true,
  };

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const safeEnqueue = (ev: AxonizSseEvent) => {
        if (closed) return;
        try { enqueue(controller, encoder, ev); } catch { closed = true; }
      };
      (async () => {
        try {
          const upstream = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
          if (!upstream.ok || !upstream.body) {
            safeEnqueue({
              type: "error",
              error: `Ollama ${upstream.status} ${upstream.statusText}`,
              ts: Date.now() / 1000,
            });
            safeEnqueue({ type: "done", summary: "Failed", ts: Date.now() / 1000 });
            controller.close();
            return;
          }
          // Ollama streams newline-delimited JSON objects
          const reader = upstream.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              try {
                const json = JSON.parse(trimmed);
                const token = json?.message?.content;
                if (typeof token === "string" && token.length > 0) {
                  safeEnqueue({ type: "token", value: token, ts: Date.now() / 1000 });
                }
                if (json.done) {
                  safeEnqueue({ type: "done", summary: "Response complete", ts: Date.now() / 1000 });
                }
              } catch { /* skip */ }
            }
          }
          safeEnqueue({ type: "done", summary: "Response complete", ts: Date.now() / 1000 });
        } catch (err) {
          const e = err as Error;
          safeEnqueue({
            type: "error",
            error: e.name === "TimeoutError" || e.name === "AbortError"
              ? "Ollama timed out (60s). Is the model pulled?"
              : e.message,
            ts: Date.now() / 1000,
          });
          safeEnqueue({ type: "done", summary: "Failed", ts: Date.now() / 1000 });
        } finally {
          try { controller.close(); } catch { /* ignore */ }
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

/* ============================================================
   Anthropic Messages API — POST {baseUrl}/v1/messages
   SSE events: message_start, content_block_delta, message_stop
   ============================================================ */
async function anthropicStream(
  body: ChatBody,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  system: string,
  encoder: TextEncoder,
) {
  const url = `${body.baseUrl!.replace(/\/$/, "")}/messages`;
  const payload = {
    model: body.model || "claude-3-5-sonnet-20241022",
    max_tokens: body.maxTokens ?? 4096,
    system,
    messages: [...history, { role: "user", content: body.message }],
    stream: true,
  };

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const safeEnqueue = (ev: AxonizSseEvent) => {
        if (closed) return;
        try { enqueue(controller, encoder, ev); } catch { closed = true; }
      };
      (async () => {
        try {
          const upstream = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": body.apiKey ?? "",
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
          if (!upstream.ok || !upstream.body) {
            const errText = await upstream.text().catch(() => "");
            safeEnqueue({
              type: "error",
              error: `Anthropic ${upstream.status} ${upstream.statusText}${errText ? ` — ${errText.slice(0, 300)}` : ""}`,
              ts: Date.now() / 1000,
            });
            safeEnqueue({ type: "done", summary: "Failed", ts: Date.now() / 1000 });
            controller.close();
            return;
          }
          const reader = upstream.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split("\n\n");
            buffer = events.pop() ?? "";
            for (const evt of events) {
              const eventLine = evt.split("\n").find((l) => l.startsWith("event:"));
              const dataLine = evt.split("\n").find((l) => l.startsWith("data:"));
              if (!eventLine || !dataLine) continue;
              const eventType = eventLine.slice(6).trim();
              const dataStr = dataLine.slice(5).trim();
              try {
                const json = JSON.parse(dataStr);
                if (eventType === "content_block_delta") {
                  const text = json?.delta?.text;
                  if (typeof text === "string" && text.length > 0) {
                    safeEnqueue({ type: "token", value: text, ts: Date.now() / 1000 });
                  }
                } else if (eventType === "message_stop") {
                  safeEnqueue({ type: "done", summary: "Response complete", ts: Date.now() / 1000 });
                }
              } catch { /* skip */ }
            }
          }
          safeEnqueue({ type: "done", summary: "Response complete", ts: Date.now() / 1000 });
        } catch (err) {
          const e = err as Error;
          safeEnqueue({
            type: "error",
            error: e.name === "TimeoutError" || e.name === "AbortError"
              ? "Anthropic timed out (60s)."
              : e.message,
            ts: Date.now() / 1000,
          });
          safeEnqueue({ type: "done", summary: "Failed", ts: Date.now() / 1000 });
        } finally {
          try { controller.close(); } catch { /* ignore */ }
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

/* ============================================================
   Google Gemini — POST {baseUrl}/v1beta/models/{model}:streamGenerateContent
   Each chunk: { candidates: [{ content: { parts: [{ text: "..." }] } }] }
   ============================================================ */
async function geminiStream(
  body: ChatBody,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  system: string,
  encoder: TextEncoder,
) {
  const model = body.model || "gemini-2.0-flash";
  const url = `${body.baseUrl!.replace(/\/$/, "")}/models/${model}:streamGenerateContent?alt=sse&key=${body.apiKey ?? ""}`;

  // Gemini wants contents: [{ role: "user"|"model", parts: [{ text: "..." }] }]
  const contents = [
    ...history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    { role: "user", parts: [{ text: body.message }] },
  ];
  const payload = {
    contents,
    systemInstruction: { parts: [{ text: system }] },
    generationConfig: {
      temperature: body.temperature ?? 0.7,
      maxOutputTokens: body.maxTokens,
    },
  };

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const safeEnqueue = (ev: AxonizSseEvent) => {
        if (closed) return;
        try { enqueue(controller, encoder, ev); } catch { closed = true; }
      };
      (async () => {
        try {
          const upstream = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
          if (!upstream.ok || !upstream.body) {
            const errText = await upstream.text().catch(() => "");
            safeEnqueue({
              type: "error",
              error: `Gemini ${upstream.status} ${upstream.statusText}${errText ? ` — ${errText.slice(0, 300)}` : ""}`,
              ts: Date.now() / 1000,
            });
            safeEnqueue({ type: "done", summary: "Failed", ts: Date.now() / 1000 });
            controller.close();
            return;
          }
          const reader = upstream.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split("\n\n");
            buffer = events.pop() ?? "";
            for (const evt of events) {
              const dataLine = evt.split("\n").find((l) => l.startsWith("data:"));
              if (!dataLine) continue;
              const dataStr = dataLine.slice(5).trim();
              try {
                const json = JSON.parse(dataStr);
                const text = json?.candidates?.[0]?.content?.parts
                  ?.map((p: { text?: string }) => p.text)
                  .join("");
                if (typeof text === "string" && text.length > 0) {
                  safeEnqueue({ type: "token", value: text, ts: Date.now() / 1000 });
                }
              } catch { /* skip */ }
            }
          }
          safeEnqueue({ type: "done", summary: "Response complete", ts: Date.now() / 1000 });
        } catch (err) {
          const e = err as Error;
          safeEnqueue({
            type: "error",
            error: e.name === "TimeoutError" || e.name === "AbortError"
              ? "Gemini timed out (60s)."
              : e.message,
            ts: Date.now() / 1000,
          });
          safeEnqueue({ type: "done", summary: "Failed", ts: Date.now() / 1000 });
        } finally {
          try { controller.close(); } catch { /* ignore */ }
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

/* ============================================================
   Mock fallback — scripted demo stream when no provider configured
   ============================================================ */
function noProviderError(): Response {
  // No mock data — return a clear error telling the user to configure a provider.
  // This replaces the old mockFallback that streamed scripted demo events.
  return new Response(
    JSON.stringify({
      type: "error",
      error: "No provider configured. Go to Settings → Providers to configure your llama-server, LM Studio, Ollama, or cloud API.",
    }),
    {
      status: 503,
      headers: { "Content-Type": "application/json" },
    },
  );
}
