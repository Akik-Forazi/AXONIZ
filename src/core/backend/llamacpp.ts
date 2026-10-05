/**
 * LlamaCpp in-process GGUF backend via node-llama-cpp.
 * Port of `LlamaCppBackend` from axoniz/core/backend.py
 * (llama-cpp-python -> node-llama-cpp).
 *
 * Prompt/KV-cache reuse maps onto a persistent LlamaContext + sequence, which is
 * created once and reused across calls (the JS equivalent of the Python
 * `Llama(...)` instance holding the KV cache).
 */
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { AsyncQueue } from "./async_queue.js";
import {
  Backend,
  errMsg,
  textResponse,
  type BackendHealth,
  type ChatMessage,
  type CompletionResult,
} from "./types.js";

/** Structural types for node-llama-cpp, kept local so the dep stays optional. */
interface LlamaInstance {
  loadModel(opts: { modelPath: string; gpuLayers?: number | string }): Promise<LlamaModel>;
  dispose?(): Promise<void>;
}
interface LlamaModel {
  createContext(opts: Record<string, unknown>): Promise<LlamaContext>;
  dispose?(): Promise<void>;
}
interface LlamaContext {
  getSequence(): unknown;
  dispose?(): Promise<void>;
}
interface LlamaChatSession {
  prompt(
    text: string,
    opts?: {
      maxTokens?: number;
      temperature?: number;
      signal?: AbortSignal;
      onTextChunk?: (chunk: string) => void;
      grammar?: unknown;
    },
  ): Promise<string>;
}
interface ChatSessionCtor {
  new (opts: { contextSequence: unknown; systemPrompt?: string }): LlamaChatSession;
}

export interface LlamaCppOptions {
  modelPath: string;
  temperature?: number;
  maxTokens?: number;
  nCtx?: number;
  nGpuLayers?: number;
  tools?: unknown[];
}

export class LlamaCppBackend extends Backend {
  readonly modelPath: string;
  readonly temperature: number;
  readonly maxTokens: number;
  readonly nCtx: number;
  readonly nGpuLayers: number;

  private llama: LlamaInstance | null = null;
  private model: LlamaModel | null = null;
  private context: LlamaContext | null = null;
  private session: LlamaChatSession | null = null;
  private loadError: string | null = null;

  constructor(opts: LlamaCppOptions) {
    super();
    this.modelPath = opts.modelPath;
    this.temperature = opts.temperature ?? 0.2;
    this.maxTokens = opts.maxTokens ?? 4096;
    this.nCtx = opts.nCtx ?? 32768;
    this.nGpuLayers = opts.nGpuLayers ?? -1;
    this.tools = opts.tools ?? [];
  }

  get name(): string {
    return "llamacpp";
  }

  override async load(): Promise<string> {
    if (this.session) return "ok";
    if (!this.modelPath || !fs.existsSync(this.modelPath)) {
      this.loadError = `[ERROR] GGUF not found: ${this.modelPath}`;
      return this.loadError;
    }

    try {
      // Dynamic import keeps node-llama-cpp optional: providers that do not need
      // in-process inference must keep working when it is unavailable.
      const mod = (await import("node-llama-cpp")) as unknown as {
        getLlama: (opts?: Record<string, unknown>) => Promise<LlamaInstance>;
        LlamaChatSession: ChatSessionCtor;
      };

      this.llama = await mod.getLlama();
      this.model = await this.llama.loadModel({
        modelPath: this.modelPath,
        gpuLayers: this.nGpuLayers,
      });
      this.context = await this.model.createContext({
        contextSize: this.nCtx,
        flashAttention: true,
        batchSize: 512,
        threads: Math.max(1, os.cpus().length - 1),
      });
      this.session = new mod.LlamaChatSession({ contextSequence: this.context.getSequence() });
      this.loadError = null;
      return "ok";
    } catch (e) {
      const msg = errMsg(e);
      // Distinguish a missing optional dependency from a genuine load failure.
      this.loadError = msg.includes("Cannot find package") || msg.includes("ERR_MODULE_NOT_FOUND")
        ? "[ERROR] node-llama-cpp not installed. Run: pnpm add node-llama-cpp"
        : `[ERROR] LlamaCpp load failed: ${msg}`;
      return this.loadError;
    }
  }

  override isLoaded(): boolean {
    return this.session !== null;
  }

  override unload(): void {
    void this.disposeAll();
  }

  private async disposeAll(): Promise<void> {
    try {
      await this.session?.constructor;
    } catch {
      /* ignore */
    }
    this.session = null;
    try {
      await this.context?.dispose?.();
    } catch {
      /* ignore */
    }
    this.context = null;
    try {
      await this.model?.dispose?.();
    } catch {
      /* ignore */
    }
    this.model = null;
    try {
      await this.llama?.dispose?.();
    } catch {
      /* ignore */
    }
    this.llama = null;
  }

  /** Split conversation history into a system prompt and chat turns. */
  private splitMessages(messages: ChatMessage[]): { system: string; turns: ChatMessage[] } {
    const systems: string[] = [];
    const turns: ChatMessage[] = [];
    for (const m of messages) {
      if (m.role === "system") systems.push(m.content);
      else turns.push(m);
    }
    return { system: systems.join("\n\n"), turns };
  }

  /**
   * node-llama-cpp chat sessions hold the KV cache across prompts, so replaying
   * history each turn would double-apply it. We therefore prime a fresh session
   * with the system prompt and send only the latest user turn, mirroring how
   * llama-cpp-python reuses its cache while still receiving full history.
   */
  private buildPrompt(messages: ChatMessage[]): string {
    const { system, turns } = this.splitMessages(messages);
    const lastUser = [...turns].reverse().find((t) => t.role === "user");
    const priorContext = turns
      .slice(0, -1)
      .map((t) => `${t.role}: ${t.content}`)
      .join("\n");

    const parts: string[] = [];
    if (system) parts.push(system);
    if (priorContext) parts.push(`### CONVERSATION SO FAR\n${priorContext}`);
    parts.push(lastUser?.content ?? "");
    return parts.join("\n\n");
  }

  async complete(messages: ChatMessage[], maxTokens?: number): Promise<CompletionResult> {
    if (!this.session) {
      const res = await this.load();
      if (res !== "ok") return textResponse(res);
    }
    try {
      const limit = maxTokens ?? this.maxTokens;
      const prompt = this.buildPrompt(messages);
      const content = await this.session!.prompt(prompt, {
        maxTokens: limit,
        temperature: this.temperature,
      });
      return textResponse(content);
    } catch (e) {
      return textResponse(`[ERROR] LlamaCpp: ${errMsg(e)}`);
    }
  }

  async *streamText(
    messages: ChatMessage[],
    signal?: AbortSignal,
    maxTokens?: number,
  ): AsyncGenerator<string> {
    if (!this.session) {
      const res = await this.load();
      if (res !== "ok") {
        yield res;
        return;
      }
    }

    const queue = new AsyncQueue<string>();
    const prompt = this.buildPrompt(messages);

    void (async () => {
      try {
        await this.session!.prompt(prompt, {
          maxTokens: maxTokens ?? this.maxTokens,
          temperature: this.temperature,
          signal,
          onTextChunk: (chunk: string) => queue.push(chunk),
        });
        queue.close();
      } catch (e) {
        queue.fail(new Error(`[ERROR] LlamaCpp stream: ${errMsg(e)}`));
      }
    })();

    for await (const token of queue) {
      yield token;
    }
  }

  async healthCheck(): Promise<BackendHealth> {
    const loaded = this.isLoaded();
    return {
      status: loaded ? "ok" : "not_loaded",
      backend: "llamacpp",
      model: this.modelPath ? path.basename(this.modelPath) : "none",
      loaded,
      ...(this.loadError ? { error: this.loadError } : {}),
    };
  }
}
