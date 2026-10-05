/**
 * LlamaCppServer backend — connects to a running `llama-server` (or auto-starts one).
 * Port of `LlamaCppServerBackend` from axoniz/core/backend.py.
 *
 * NOTE: node-llama-cpp does NOT ship a `serve` command, so auto-start spawns the
 * real llama.cpp `llama-server` binary (config `llama_bin`, or `llama-server` on PATH).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { whichSync } from "../which.js";
import {
  Backend,
  ConnectionError,
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

export interface LlamaCppServerOptions {
  baseUrl?: string;
  modelPath?: string;
  temperature?: number;
  maxTokens?: number;
  nCtx?: number;
  llamaBin?: string;
  autoStart?: boolean;
  nGpuLayers?: number;
  tools?: unknown[];
}

export class LlamaCppServerBackend extends Backend {
  readonly baseUrl: string;
  readonly modelPath: string;
  readonly temperature: number;
  readonly maxTokens: number;
  readonly nCtx: number;
  readonly llamaBin: string;
  readonly autoStart: boolean;
  readonly nGpuLayers: number;

  private proc: ChildProcess | null = null;
  private starting = false;

  constructor(opts: LlamaCppServerOptions = {}) {
    super();
    this.baseUrl = (opts.baseUrl ?? "http://localhost:8080").replace(/\/+$/, "");
    this.modelPath = opts.modelPath ?? "";
    this.temperature = opts.temperature ?? 0.2;
    this.maxTokens = opts.maxTokens ?? 4096;
    this.nCtx = opts.nCtx ?? 8192;
    this.llamaBin = opts.llamaBin ?? "";
    this.autoStart = opts.autoStart ?? false;
    this.nGpuLayers = opts.nGpuLayers ?? -1;
    this.tools = opts.tools ?? [];
  }

  get name(): string {
    return "llamacpp_server";
  }

  private headers(): Record<string, string> {
    return { "Content-Type": "application/json" };
  }

  private port(): string {
    try {
      const u = new URL(this.baseUrl);
      return u.port || "8080";
    } catch {
      const m = this.baseUrl.split(":").pop() ?? "8080";
      return m.split("/")[0] || "8080";
    }
  }

  /** Resolve the llama-server executable path. */
  private resolveBinary(): string | null {
    if (this.llamaBin && fs.existsSync(this.llamaBin)) return this.llamaBin;
    const name = this.llamaBin || "llama-server";
    return whichSync(name);
  }

  /** Ensure a llama-server is reachable, starting one when configured to. */
  async ensureServer(): Promise<void> {
    const health = await this.healthCheck();
    if (health.status === "ok") return;
    if (this.starting) return;
    if (!this.autoStart || !this.modelPath) return;

    const binPath = this.resolveBinary();
    if (!binPath) {
      warn(`[LlamaCppServer] binary not found: ${this.llamaBin || "llama-server"}`);
      return;
    }

    this.starting = true;
    try {
      const args = [
        "-m",
        this.modelPath,
        "--port",
        this.port(),
        "--ctx-size",
        String(this.nCtx),
        "-ngl",
        String(this.nGpuLayers),
        "--threads",
        String(Math.max(1, os.cpus().length - 1)),
      ];
      this.proc = spawn(binPath, args, {
        stdio: "ignore",
        detached: false,
        windowsHide: true,
      });
      this.proc.on("error", (e) => {
        warn(`[LlamaCppServer] spawn failed: ${e.message}`);
      });

      for (let i = 0; i < 120; i++) {
        await sleep(500);
        if ((await this.healthCheck()).status === "ok") {
          debug(`[LlamaCppServer] started at ${this.baseUrl}`);
          return;
        }
        if (this.proc.exitCode !== null) break;
      }
      warn("[LlamaCppServer] server did not start in time");
    } finally {
      this.starting = false;
    }
  }

  override async load(): Promise<string> {
    await this.ensureServer();
    const h = await this.healthCheck();
    return h.status === "ok" ? "ok" : `[ERROR] LlamaCppServer not reachable at ${this.baseUrl}`;
  }

  async complete(messages: ChatMessage[], maxTokens?: number): Promise<CompletionResult> {
    const payload = {
      model: "local",
      messages,
      temperature: this.temperature,
      max_tokens: maxTokens ?? this.maxTokens,
      stream: false,
    };
    try {
      const resp = (await httpPost(
        `${this.baseUrl}/v1/chat/completions`,
        payload,
        this.headers(),
      )) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return textResponse(resp.choices?.[0]?.message?.content ?? "");
    } catch (e) {
      return textResponse(`[ERROR] LlamaCppServer: ${errMsg(e)}`);
    }
  }

  async *streamText(
    messages: ChatMessage[],
    signal?: AbortSignal,
    maxTokens?: number,
  ): AsyncGenerator<string> {
    const payload = {
      model: "local",
      messages,
      temperature: this.temperature,
      max_tokens: maxTokens ?? this.maxTokens,
      stream: true,
    };
    try {
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
      yield `[ERROR] LlamaCppServer stream: ${errMsg(e)}`;
    }
  }

  async healthCheck(): Promise<BackendHealth> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) throw new HttpStatusError(res.status, await res.text().catch(() => ""));
      return { status: "ok", backend: "llamacpp_server", url: this.baseUrl };
    } catch (e) {
      return {
        status: "error",
        error: e instanceof HttpStatusError ? e.message : errMsg(e),
        backend: "llamacpp_server",
      };
    }
  }

  override unload(): void {
    if (this.proc && this.proc.exitCode === null) {
      try {
        this.proc.kill();
      } catch {
        /* ignore */
      }
    }
    this.proc = null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export { ConnectionError };
