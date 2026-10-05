/**
 * OpenAI-compatible backend (OpenAI, vLLM, Groq, LM Studio's OpenAI endpoint, ...).
 * Port of `OpenAICompatibleBackend` from axoniz/core/backend.py.
 */
import {
  Backend,
  errMsg,
  httpPost,
  httpStreamLines,
  HttpStatusError,
  parseSseDelta,
  textResponse,
  type BackendHealth,
  type ChatMessage,
  type CompletionResult,
} from "./types.js";

export interface OpenAICompatibleOptions {
  baseUrl: string;
  apiKey?: string;
  modelName?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: unknown[];
}

export class OpenAICompatibleBackend extends Backend {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly modelName: string;
  readonly temperature: number;
  readonly maxTokens: number;

  constructor(opts: OpenAICompatibleOptions) {
    super();
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.apiKey = opts.apiKey || "sk-no-key";
    this.modelName = opts.modelName ?? "local-model";
    this.temperature = opts.temperature ?? 0.2;
    this.maxTokens = opts.maxTokens ?? 4096;
    this.tools = opts.tools ?? [];
  }

  get name(): string {
    return "openai_compatible";
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  async complete(messages: ChatMessage[], maxTokens?: number): Promise<CompletionResult> {
    const payload = {
      model: this.modelName,
      messages,
      temperature: this.temperature,
      max_tokens: maxTokens ?? this.maxTokens,
      stream: false,
    };
    try {
      const resp = (await httpPost(
        `${this.baseUrl}/chat/completions`,
        payload,
        this.headers(),
      )) as { choices?: Array<{ message?: { content?: string } }> };
      return textResponse(resp.choices?.[0]?.message?.content ?? "");
    } catch (e) {
      return textResponse(`[ERROR] OpenAI Backend: ${errMsg(e)}`);
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
      temperature: this.temperature,
      max_tokens: maxTokens ?? this.maxTokens,
      stream: true,
    };
    try {
      for await (const line of httpStreamLines(
        `${this.baseUrl}/chat/completions`,
        payload,
        this.headers(),
        undefined,
        signal,
      )) {
        const token = parseSseDelta(line);
        if (token) yield token;
      }
    } catch (e) {
      yield `[ERROR] OpenAI Backend stream: ${errMsg(e)}`;
    }
  }

  async healthCheck(): Promise<BackendHealth> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) throw new HttpStatusError(res.status, await res.text().catch(() => ""));
      return { status: "ok", backend: "openai_compatible", url: this.baseUrl };
    } catch (e) {
      return {
        status: "error",
        error: e instanceof HttpStatusError ? e.message : errMsg(e),
        backend: "openai_compatible",
      };
    }
  }
}
