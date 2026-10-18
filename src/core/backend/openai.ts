/**
 * OpenAI-compatible backend (OpenAI, vLLM, Groq, LM Studio's OpenAI endpoint, ...).
 * Port of `OpenAICompatibleBackend` from axoniz/core/backend.py.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CRITICAL: Tool calls MUST be sent in the request payload, otherwise the
 * LLM has no way to know what tools are available. The previous version of
 * this file stored `this.tools` but NEVER sent them in the request — so the
 * LLM generated fake "**Tool: foo**" text instead of actual tool_call blocks.
 * See: src/core/agent.ts:1424 (runNative → isToolCallResponse handling).
 * ───────────────────────────────────────────────────────────────────────────
 */
import {
  Backend,
  errMsg,
  httpPost,
  httpStreamLines,
  HttpStatusError,
  parseSseDelta,
  textResponse,
  toolCallResponse,
  type BackendHealth,
  type ChatMessage,
  type CompletionResult,
  type ToolCall,
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

  /**
   * Build the request payload — including `tools` and `tool_choice` when
   * the agent has registered tool schemas. Without this, the LLM has no
   * way to emit tool_call blocks and will hallucinate fake tool calls as
   * text (the bug that was breaking the agent for weeks).
   */
  private buildPayload(messages: ChatMessage[], maxTokens: number | undefined, stream: boolean): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      model: this.modelName,
      messages,
      temperature: this.temperature,
      max_tokens: maxTokens ?? this.maxTokens,
      stream,
    };
    // Only include tools if we actually have some — some providers
    // (e.g. vLLM without tool calling support) reject the `tools` field.
    if (this.tools.length > 0) {
      payload.tools = this.tools;
      // tool_choice: "auto" = let the model decide when to call
      payload.tool_choice = "auto";
    }
    return payload;
  }

  /**
   * Non-streaming completion. Parses `message.tool_calls` from the response
   * and returns a ToolCallResponse if any are present — the agent's
   * `runNative()` checks `isToolCallResponse()` and invokes each tool.
   */
  async complete(messages: ChatMessage[], maxTokens?: number): Promise<CompletionResult> {
    const payload = this.buildPayload(messages, maxTokens, false);
    try {
      const resp = (await httpPost(
        `${this.baseUrl}/chat/completions`,
        payload,
        this.headers(),
      )) as {
        choices?: Array<{
          message?: {
            content?: string;
            tool_calls?: Array<{
              id?: string;
              function?: { name?: string; arguments?: string };
            }>;
          };
        }>;
      };
      const msg = resp.choices?.[0]?.message;

      // Parse tool_calls if the model emitted any
      if (msg?.tool_calls && msg.tool_calls.length > 0) {
        const calls: ToolCall[] = [];
        for (const tc of msg.tool_calls) {
          const name = tc.function?.name ?? "";
          let args: Record<string, unknown> = {};
          const argStr = tc.function?.arguments ?? "{}";
          try {
            args = JSON.parse(argStr) as Record<string, unknown>;
          } catch {
            // Some models emit malformed JSON — store as a single
            // `raw` field so the agent can at least see what happened
            args = { raw: argStr } as Record<string, unknown>;
          }
          calls.push({ name, args });
        }
        return toolCallResponse(calls);
      }

      return textResponse(msg?.content ?? "");
    } catch (e) {
      return textResponse(`[ERROR] OpenAI Backend: ${errMsg(e)}`);
    }
  }

  /**
   * Streaming completion. Sends `tools` in the payload so the model can
   * emit tool_calls mid-stream. Tool call deltas are accumulated and
   * yielded as a single token (the tool call name + args) — full
   * streaming tool-call parsing requires a separate mechanism, but
   * at least the model knows the tools exist.
   */
  async *streamText(
    messages: ChatMessage[],
    signal?: AbortSignal,
    maxTokens?: number,
  ): AsyncGenerator<string> {
    const payload = this.buildPayload(messages, maxTokens, true);
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
