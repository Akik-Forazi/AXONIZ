/**
 * Server process manager — shared state across API routes.
 *
 * Tracks the currently-running local model server (llama-server, ollama,
 * lmstudio) and exposes:
 *   - ring buffer of last N stdout/stderr lines
 *   - SSE broadcast to live subscribers
 *   - persistence to ~/.axoniz/logs/servers/<provider>-<timestamp>.log
 *
 * Used by:
 *   - /api/axoniz/models/launch  (spawn + attach pipes)
 *   - /api/axoniz/models/status   (read state)
 *   - /api/axoniz/models/stop     (kill)
 *   - /api/axoniz/models/logs     (fetch buffered logs)
 *   - /api/axoniz/models/logs/stream (live SSE tail)
 */

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { EventEmitter } from "node:events";

export interface ServerStatus {
  running: boolean;
  provider: string | null;
  modelPath: string | null;
  modelName: string | null;
  pid: number | null;
  baseUrl: string | null;
  port: number | null;
  startedAt: number | null;
  lastExitCode: number | null;
  args: string[];
}

export interface LogLine {
  ts: number;
  stream: "stdout" | "stderr";
  text: string;
}

const RING_BUFFER_MAX = 5000;
const LOG_FILE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB per provider log

class ServerProcessManager extends EventEmitter {
  private proc: ChildProcess | null = null;
  private provider: string | null = null;
  private modelPath: string | null = null;
  private modelName: string | null = null;
  private baseUrl: string | null = null;
  private port: number | null = null;
  private startedAt: number | null = null;
  private lastExitCode: number | null = null;
  private args: string[] = [];
  private ring: LogLine[] = [];
  private logFilePath: string | null = null;
  private logFileSize = 0;

  get status(): ServerStatus {
    return {
      running: this.proc !== null && !this.proc.killed,
      provider: this.provider,
      modelPath: this.modelPath,
      modelName: this.modelName,
      pid: this.proc?.pid ?? null,
      baseUrl: this.baseUrl,
      port: this.port,
      startedAt: this.startedAt,
      lastExitCode: this.lastExitCode,
      args: this.args,
    };
  }

  get logs(): LogLine[] {
    return [...this.ring];
  }

  get logFile(): string | null {
    return this.logFilePath;
  }

  /**
   * Spawn a server process and capture its stdout/stderr.
   * Returns the ChildProcess (so the caller can await readiness via healthCheck).
   */
  start(opts: {
    bin: string;
    args: string[];
    provider: string;
    modelPath: string;
    modelName: string;
    baseUrl: string;
    port: number;
  }): ChildProcess {
    // Kill any existing process first.
    if (this.proc) {
      try { this.proc.kill("SIGTERM"); } catch { /* ignore */ }
    }

    const proc = spawn(opts.bin, opts.args, {
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
      windowsHide: true,
    });

    this.proc = proc;
    this.provider = opts.provider;
    this.modelPath = opts.modelPath;
    this.modelName = opts.modelName;
    this.baseUrl = opts.baseUrl;
    this.port = opts.port;
    this.startedAt = Date.now();
    this.args = opts.args;
    this.lastExitCode = null;

    // Open a log file for this session: ~/.axoniz/logs/servers/<provider>-<ts>.log
    const logDir = path.join(os.homedir(), ".axoniz", "logs", "servers");
    try { fs.mkdirSync(logDir, { recursive: true }); } catch { /* ignore */ }
    const ts = new Date();
    const pad = (n: number, w = 2) => String(n).padStart(w, "0");
    const stamp =
      `${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}` +
      `-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;
    this.logFilePath = path.join(logDir, `${opts.provider}-${stamp}.log`);
    this.logFileSize = 0;
    try {
      // Create the file with restrictive perms.
      const fd = fs.openSync(this.logFilePath, fs.constants.O_CREAT | fs.constants.O_WRONLY | fs.constants.O_APPEND, 0o600);
      fs.closeSync(fd);
    } catch { /* ignore */ }

    this.emitLine("stdout", `[axoniz] starting ${opts.provider} server (pid ${proc.pid})`);
    this.emitLine("stdout", `[axoniz] command: ${opts.bin} ${opts.args.join(" ")}`);
    this.emitLine("stdout", `[axoniz] baseUrl: ${opts.baseUrl}, model: ${opts.modelName}, port: ${opts.port}`);

    proc.stdout?.on("data", (chunk: Buffer) => {
      this.consumeChunk(chunk, "stdout");
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      this.consumeChunk(chunk, "stderr");
    });
    proc.on("error", (e: Error) => {
      this.emitLine("stderr", `[axoniz] spawn error: ${e.message}`);
    });
    proc.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
      this.lastExitCode = code;
      this.emitLine("stdout", `[axoniz] ${opts.provider} server exited (code=${code} signal=${signal ?? "-"})`);
      this.proc = null;
      // Keep the rest of the state so /status can report the exit code.
    });

    try { proc.unref(); } catch { /* ignore */ }
    return proc;
  }

  /** Stop the running server, if any. Returns true if a kill was issued. */
  stop(): boolean {
    if (!this.proc) return false;
    try {
      const ok = this.proc.kill("SIGTERM");
      if (ok) {
        this.emitLine("stdout", `[axoniz] sent SIGTERM to pid ${this.proc.pid}`);
      }
      // Force-kill after 5s if still running.
      const pid = this.proc.pid;
      const localProc = this.proc;
      setTimeout(() => {
        try {
          if (!localProc.killed && pid !== undefined) {
            process.kill(pid, "SIGKILL");
            this.emitLine("stderr", `[axoniz] force-killed pid ${pid} after SIGTERM timeout`);
          }
        } catch { /* already gone */ }
      }, 5000).unref?.();
      return ok;
    } catch {
      return false;
    }
  }

  private consumeChunk(chunk: Buffer, stream: "stdout" | "stderr") {
    const text = chunk.toString("utf-8");
    // Split into lines (preserve partial trailing line — buffer until next chunk).
    // For simplicity, just push the whole chunk as one log entry; clients split
    // on \n for display.
    this.emitLine(stream, text);
  }

  private emitLine(stream: "stdout" | "stderr", text: string) {
    const line: LogLine = { ts: Date.now(), stream, text };
    this.ring.push(line);
    if (this.ring.length > RING_BUFFER_MAX) {
      this.ring.splice(0, this.ring.length - RING_BUFFER_MAX);
    }
    // Append to file (best-effort, non-blocking on error).
    if (this.logFilePath) {
      try {
        const stamped = `${new Date(line.ts).toISOString()} [${stream}] ${text}`;
        fs.appendFileSync(this.logFilePath, stamped + (text.endsWith("\n") ? "" : "\n"), { encoding: "utf-8" });
        this.logFileSize += stamped.length;
        if (this.logFileSize > LOG_FILE_MAX_BYTES) {
          this.rotateLog();
        }
      } catch { /* disk full / perms — silently drop */ }
    }
    // Notify SSE subscribers.
    this.emit("line", line);
  }

  private rotateLog() {
    if (!this.logFilePath) return;
    try {
      const rotated = `${this.logFilePath}.${Date.now()}.old`;
      fs.renameSync(this.logFilePath, rotated);
      // Truncate the next write target (file gets recreated on next emit).
      this.logFileSize = 0;
      // Remove old rotations beyond 5.
      const dir = path.dirname(this.logFilePath);
      const base = path.basename(this.logFilePath);
      const olds = fs.readdirSync(dir)
        .filter(f => f.startsWith(base) && f.endsWith(".old"))
        .sort();
      while (olds.length > 5) {
        const f = olds.shift()!;
        try { fs.unlinkSync(path.join(dir, f)); } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }

  /** Subscribe to live log lines. Returns an unsubscribe function. */
  subscribe(fn: (line: LogLine) => void): () => void {
    this.on("line", fn);
    return () => { this.off("line", fn); };
  }
}

// Singleton — shared across all API route handlers in the same Node process.
let singleton: ServerProcessManager | null = null;
export function getServerMgr(): ServerProcessManager {
  if (!singleton) singleton = new ServerProcessManager();
  return singleton;
}
