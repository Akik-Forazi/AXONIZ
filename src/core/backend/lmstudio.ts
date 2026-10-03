/**
 * LM Studio (LMS) backend.
 * Port of `LMStudioBackend` from axoniz/core/backend.py.
 *
 * Uses LM Studio's native REST API for model discovery/loading and chat, and
 * falls back to its OpenAI-compatible endpoints. Auto-start uses the `lms` CLI.
 */
import { spawn } from "node:child_process";
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
import { debug, warn } from "../debug.js";
import { whichSync } from "../which.js";

interface LMModel {
  id?: string;
  model_id?: string;
  state?: string;
  is_loaded?: boolean;
  [key: string]: unknown;
}

export interface LMStudioOptions {
  baseUrl?: string;
  modelName?: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  autoLoad?: boolean;
  autoStart?: boolean;
  lmsBin?: string;
  tools?: unknown[];
}

export class LMStudioBackend extends Backend {
  readonly baseUrl: string;
  modelName: string;
  readonly apiKey: string;
  readonly temperature: number;
  readonly maxTokens: number;
  readonly autoLoad: boolean;
  readonly autoStart: boolean;
  readonly lmsBin: string;

  private loadedModel: LMModel | null = null;
  private proc: ReturnType<typeof spawn> | null = null;

  constructor(opts: LMStudioOptions = {}) {
    super();
    this.baseUrl = (opts.baseUrl ?? "http://localhost:1234").replace(/\/+$/, "");
    this.modelName = opts.modelName ?? "";
    this.apiKey = opts.apiKey ?? "lm-studio";
    this.temperature = opts.temperature ?? 0.2;
    this.maxTokens = opts.maxTokens ?? 4096;
    this.autoLoad = opts.autoLoad ?? true;
    this.autoStart = opts.autoStart ?? false;
    this.lmsBin = opts.lmsBin || "lms";
    this.tools = opts.tools ?? [];
  }

  get name(): string {
    return "lmstudio";
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  /** Start the LM Studio server via the `lms` CLI when it is not running. */
  async ensureServer(): Promise<void> {
    if (this.autoStart) {
      const h = await this.healthCheck();
      if (h.status !== "ok") await this.tryStartServer();
    }
  }

  private async tryStartServer(): Promise<void> {
    if (!whichSync(this.lmsBin)) {
      warn(`[LMStudio] lms CLI not found on PATH: ${this.lmsBin}`);
      return;
    }
    try {
      const child = spawn(this.lmsBin, ["server", "start"], {
        stdio: "ignore",
        windowsHide: true,
      });
      this.proc = child;
      for (let i = 0; i < 120; i++) {
        await sleep(500);
        if ((await this.healthCheck()).status === "ok") {
          debug(`[LMStudio] server started at ${this.baseUrl}`);
          return;
        }
        if (child.exitCode !== null) break;
      }
      warn("[LMStudio] server did not start in time");
    } catch (e) {
      warn(`[LMStudio] auto-start failed: ${errMsg(e)}`);
    }
  }

  private async nativeRequest(
    endpoint: string,
    payload?: unknown,
    method: "GET" | "POST" = "POST",
    timeoutMs = 60_000,
  ): Promise<Record<string, unknown>> {
    const url = `${this.baseUrl}/api/v1${endpoint}`;
    const res = await fetch(url, {
      method,
      headers: this.headers(),
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await res.text();
    if (!res.ok) throw new HttpStatusError(res.status, body);
    return JSON.parse(body) as Record<string, unknown>;
  }

  /** List available models from LM Studio (native, then OpenAI-compatible). */
  async discoverModels(): Promise<LMModel[]> {
    try {
      const data = await this.nativeRequest("/models", undefined, "GET");
      const list = (data.data as LMModel[] | undefined) ?? (Array.isArray(data) ? (data as LMModel[]) : []);
      return list ?? [];
    } catch {
      try {
        const res = await fetch(`${this.baseUrl}/v1/models`, {
          headers: this.headers(),
          signal: AbortSignal.timeout(3000),
        });
        const data = (await res.json()) as { data?: LMModel[] };
        return data.data ?? [];
      } catch {
        return [];
      }
    }
  }

  /** Return the currently loaded model, or null. */
  async getLoadedModel(): Promise<LMModel | null> {
    const models = await this.discoverModels();
    return models.find((m) => m.state === "loaded" || m.is_loaded) ?? null;
  }

  override async load(): Promise<string> {
    if (this.loadedModel) {
      if (!this.modelName) {
        this.modelName = String(this.loadedModel.id ?? this.loadedModel.model_id ?? "");
      }
      return "ok";
    }

    const loaded = await this.getLoadedModel();
    if (loaded) {
      this.loadedModel = loaded;
      if (!this.modelName) {
        this.modelName = String(loaded.id ?? loaded.model_id ?? "");
      }
      return "ok";
    }

    if (this.modelName && this.autoLoad) {
      try {
        await this.nativeRequest("/models/load", { model: this.modelName });
        for (let i = 0; i < 30; i++) {
          const m = await this.getLoadedModel();
          if (m) {
            this.loadedModel = m;
            return "ok";
          }
          await sleep(500);
        }
        return "[ERROR] LMStudio: model load timed out";
      } catch (e) {
        return `[ERROR] LMStudio: failed to load model: ${errMsg(e)}`;
      }
    }
    return "ok";
  }

  override isLoaded(): boolean {
    return this.loadedModel !== null;
  }

  override unload(): void {
    void this.nativeRequest("/models/unload", {}, "POST").catch(() => undefined);
    this.loadedModel = null;
    if (whichSync(this.lmsBin)) {
      try {
        spawn(this.lmsBin, ["unload"], { stdio: "ignore", windowsHide: true }).unref();
      } catch {
        /* ignore */
      }
    }
  }

  private async resolveModel(): Promise<string> {
    if (this.modelName) return this.modelName;
    if (this.loadedModel) {
      return String(this.loadedModel.id ?? this.loadedModel.model_id ?? "local");
    }
    const loaded = await this.getLoadedModel();
    if (loaded) return String(loaded.id ?? loaded.model_id ?? "local");
    return "local";
  }

  private async nativeComplete(
    messages: ChatMessage[],
    maxTokens?: number,
  ): Promise<CompletionResult> {
    const resp = await this.nativeRequest("/chat", {
      model: await this.resolveModel(),
      messages,
      temperature: this.temperature,
      max_tokens: maxTokens ?? this.maxTokens,
    });
    // Native responses may be either { content } or OpenAI-shaped.
    let content = String(resp.content ?? "");
    if (!content && Array.isArray(resp.choices)) {
      const choices = resp.choices as Array<{ message?: { content?: string } }>;
      content = choices[0]?.message?.content ?? "";
    }
    return textResponse(content);
  }

  private async openaiComplete(
    messages: ChatMessage[],
    maxTokens?: number,
  ): Promise<CompletionResult> {
    const resp = (await httpPost(
      `${this.baseUrl}/v1/chat/completions`,
      {
        model: await this.resolveModel(),
        messages,
        temperature: this.temperature,
        max_tokens: maxTokens ?? this.maxTokens,
        stream: false,
      },
      this.headers(),
    )) as { choices?: Array<{ message?: { content?: string } }> };
    return textResponse(resp.choices?.[0]?.message?.content ?? "");
  }

  async complete(messages: ChatMessage[], maxTokens?: number): Promise<CompletionResult> {
    try {
      return await this.nativeComplete(messages, maxTokens);
    } catch (e) {
      debug(`[LMStudio] native chat failed (${errMsg(e)}), falling back to OpenAI-compatible`);
    }
    try {
      return await this.openaiComplete(messages, maxTokens);
    } catch (e) {
      return textResponse(`[ERROR] LMStudio: ${errMsg(e)}`);
    }
  }

  async *streamText(
    messages: ChatMessage[],
    signal?: AbortSignal,
    maxTokens?: number,
  ): AsyncGenerator<string> {
    // Native streaming is not universally supported; use the OpenAI-compatible path.
    try {
      const payload = {
        model: await this.resolveModel(),
        messages,
        temperature: this.temperature,
        max_tokens: maxTokens ?? this.maxTokens,
        stream: true,
      };
      for await (const line of httpStreamLines(
        `${this.baseUrl}/v1/chat/completions`,
        payload,
        this.headers(),
        undefined,
        signal,
      )) {
        const token = parseSseDelta(line);
        if (token) yield token;
      }
    } catch (e) {
      yield `[ERROR] LMStudio stream: ${errMsg(e)}`;
    }
  }

  async healthCheck(): Promise<BackendHealth> {
    try {
      const loaded = await this.getLoadedModel();
      if (loaded) {
        return {
          status: "ok",
          backend: "lmstudio",
          url: this.baseUrl,
          model: String(loaded.id ?? loaded.model_id ?? ""),
        };
      }
      const res = await fetch(`${this.baseUrl}/api/v1/models`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) throw new HttpStatusError(res.status, "");
      return { status: "no_model", backend: "lmstudio", url: this.baseUrl };
    } catch {
      try {
        const res = await fetch(`${this.baseUrl}/v1/models`, {
          headers: this.headers(),
          signal: AbortSignal.timeout(3000),
        });
        if (!res.ok) throw new HttpStatusError(res.status, "");
        return { status: "no_model", backend: "lmstudio", url: this.baseUrl };
      } catch (e) {
        return { status: "error", error: errMsg(e), backend: "lmstudio" };
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
