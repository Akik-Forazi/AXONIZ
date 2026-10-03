/**
 * Ollama backend. Port of `OllamaBackend` from axoniz/core/backend.py.
 * Ollama streams NDJSON (one JSON object per line), not SSE.
 */
import {
  Backend,
  errMsg,
  httpPost,
  httpStreamLines,
  HttpStatusError,
  textResponse,
  type BackendHealth,
  type ChatMessage,
  type CompletionResult,
} from "./types.js";

export interface OllamaOptions {
  baseUrl?: string;
  modelName?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: unknown[];
}

export class OllamaBackend extends Backend {
  readonly baseUrl: string;
  readonly modelName: string;
  readonly temperature: number;
  readonly maxTokens: number;

  constructor(opts: OllamaOptions = {}) {
    super();
    this.baseUrl = (opts.baseUrl ?? "http://localhost:11434").replace(/\/+$/, "");
    this.modelName = opts.modelName ?? "llama3";
    this.temperature = opts.temperature ?? 0.2;
    this.maxTokens = opts.maxTokens ?? 4096;
    this.tools = opts.tools ?? [];
  }

  get name(): string {
    return "ollama";
  }

  private headers(): Record<string, string> {
    return { "Content-Type": "application/json" };
  }

  async complete(messages: ChatMessage[], maxTokens?: number): Promise<CompletionResult> {
    const payload = {
      model: this.modelName,
      messages,
      stream: false,
      options: {
        temperature: this.temperature,
        num_predict: maxTokens ?? this.maxTokens,
      },
    };
    try {
      const resp = (await httpPost(`${this.baseUrl}/api/chat`, payload, this.headers())) as {
        message?: { content?: string };
      };
      return textResponse(resp.message?.content ?? "");
    } catch (e) {
      return textResponse(`[ERROR] Ollama Backend: ${errMsg(e)}`);
    }
  }

  async *streamText(
    messages: ChatMessage[],
    signal?: AbortSignal,
    maxTokens?: number,
  ): AsyncGenerator<string> {
    const payload = {
      model: this.modelName,
      messages,
      stream: true,
      options: {
        temperature: this.temperature,
        num_predict: maxTokens ?? this.maxTokens,
      },
    };
    try {
      for await (const line of httpStreamLines(
        `${this.baseUrl}/api/chat`,
        payload,
        this.headers(),
        undefined,
        signal,
      )) {
        try {
          const chunk = JSON.parse(line) as { message?: { content?: string } };
          const token = chunk.message?.content;
          if (token) yield token;
        } catch {
          continue;
        }
      }
    } catch (e) {
      yield `[ERROR] Ollama Backend stream: ${errMsg(e)}`;
    }
  }

  async healthCheck(): Promise<BackendHealth> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) throw new HttpStatusError(res.status, await res.text().catch(() => ""));
      return { status: "ok", backend: "ollama", url: this.baseUrl };
    } catch (e) {
      return {
        status: "error",
        error: e instanceof HttpStatusError ? e.message : errMsg(e),
        backend: "ollama",
      };
    }
  }
}
