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
import { mockSseEventStream } from "@/lib/axoniz/mock-data";
import type { AxonizSseEvent } from "@/lib/axoniz/api-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

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

const TIMEOUT_MS = 60_000;

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

  // No provider configured → mock fallback
  if (!body.baseUrl || (body.provider !== "llamacpp" && !body.baseUrl)) {
    return mockFallback(encoder);
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
  return mockFallback(encoder);
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
  const url = `${body.baseUrl!.replace(/\/$/, "")}/chat/completions`;
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
        try {
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
          safeEnqueue({
            type: "error",
            error: e.name === "TimeoutError" || e.name === "AbortError"
              ? "Upstream timed out (60s). Is the model loaded?"
              : e.message,
            ts: Date.now() / 1000,
          });
          safeEnqueue({ type: "done", summary: "Failed", ts: Date.now() / 1000 });
        } finally {
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
function mockFallback(encoder: TextEncoder): Response {
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const safeEnqueue = (ev: AxonizSseEvent) => {
        if (closed) return;
        try { enqueue(controller, encoder, ev); } catch { closed = true; }
      };

      const events = [...mockSseEventStream()];
      let i = 0;
      const next = () => {
        if (closed) return;
        if (i >= events.length) {
          try { controller.close(); } catch { /* ignore */ }
          return;
        }
        safeEnqueue(events[i]);
        i += 1;
        const ev = events[i - 1];
        const delay = ev.type === "token" ? 80 : ev.type === "tool_result" ? 500 : 320;
        setTimeout(next, delay);
      };

      safeEnqueue({
        type: "thought",
        value:
          "No provider configured — using the scripted demo stream. Configure one in Settings → Providers to chat against your real LM Studio / Ollama / OpenAI / OpenRouter / Gemini / Anthropic / Groq / etc.",
        ts: Date.now() / 1000,
      });
      setTimeout(next, 200);
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
