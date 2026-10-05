/**
 * Shared response types and the universal backend interface.
 * Port of the response types and `Backend` ABC from axoniz/core/backend.py.
 */
import { debug } from "../debug.js";

export interface TextResponse {
  kind: "text";
  text: string;
  /** Native tool calls, when the backend could produce them. */
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface ToolCallResponse {
  kind: "tool_calls";
  calls: ToolCall[];
}

export type CompletionResult = TextResponse | ToolCallResponse;

export function textResponse(text: string): TextResponse {
  return { kind: "text", text };
}

export function toolCallResponse(calls: ToolCall[]): ToolCallResponse {
  return { kind: "tool_calls", calls };
}

export function isToolCallResponse(r: CompletionResult): r is ToolCallResponse {
  return r.kind === "tool_calls";
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
}

export interface BackendHealth {
  status: string;
  backend?: string;
  model?: string;
  url?: string;
  loaded?: boolean;
  error?: string;
  [key: string]: unknown;
}

/** Universal interface every backend must implement. */
export abstract class Backend {
  /** Tool schemas offered to the backend (JSON-schema function definitions). */
  tools: unknown[] = [];

  /** Blocking completion. Returns a TextResponse or ToolCallResponse. */
  abstract complete(messages: ChatMessage[], maxTokens?: number): Promise<CompletionResult>;

  /** Token-streaming completion. Yields string tokens. */
  abstract streamText(
    messages: ChatMessage[],
    signal?: AbortSignal,
    maxTokens?: number,
  ): AsyncGenerator<string>;

  /** Load/warm the model. Returns 'ok' or an error string. */
  load(): Promise<string> {
    return Promise.resolve("ok");
  }

  isLoaded(): boolean {
    return true;
  }

  unload(): void {
    /* no-op */
  }

  abstract healthCheck(): Promise<BackendHealth>;

  /** Human-readable identifier for logs. */
  abstract get name(): string;
}

/* ── Shared HTTP helpers (replacing urllib) ───────────────────────────────── */

export class HttpStatusError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`HTTP ${status}: ${body.slice(0, 400)}`);
    this.name = "HttpStatusError";
  }
}

export async function httpPost(
  url: string,
  payload: unknown,
  headers: Record<string, string> = {},
  timeoutMs = 600_000,
): Promise<Record<string, unknown>> {
  const h: Record<string, string> = { "Content-Type": "application/json", ...headers };
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: h,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new ConnectionError(`Cannot connect to ${url}: ${errMsg(e)}`);
  }
  const body = await res.text();
  if (!res.ok) throw new HttpStatusError(res.status, body);
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`Invalid JSON from ${url}: ${errMsg(e)}`);
  }
}

/** Stream an HTTP POST body as decoded text lines (SSE / NDJSON friendly). */
export async function* httpStreamLines(
  url: string,
  payload: unknown,
  headers: Record<string, string> = {},
  timeoutMs = 300_000,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    ...headers,
  };

  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: h,
      body: JSON.stringify(payload),
      signal: combined,
    });
  } catch (e) {
    throw new ConnectionError(`Stream failed: ${errMsg(e)}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new HttpStatusError(res.status, body);
  }
  if (!res.body) throw new ConnectionError("Stream failed: empty response body");

  const decoder = new TextDecoder("utf-8", { fatal: false });
  let buffer = "";

  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).replace(/\r$/, "");
      buffer = buffer.slice(idx + 1);
      if (line.trim()) yield line;
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) yield buffer.trim();
}

export class ConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectionError";
  }
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Parse an OpenAI-style SSE `data:` line into a token delta.
 * Returns null for non-data lines, `[DONE]`, or unparseable chunks.
 */
export function parseSseDelta(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data: ")) return null;
  const payload = trimmed.slice(6).trim();
  if (payload === "[DONE]") return null;
  try {
    const chunk = JSON.parse(payload) as {
      choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
    };
    return chunk.choices?.[0]?.delta?.content ?? chunk.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}

export { debug };
