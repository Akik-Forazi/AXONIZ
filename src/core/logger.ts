/**
 * AXONIZ-ZERO Comprehensive Logger
 * Logs every detail of system operation to files and console.
 *
 * Features:
 *   - Session-scoped log files (one per session)
 *   - Structured JSON logs for programmatic analysis
 *   - Human-readable logs for debugging
 *   - Captures: agent steps, tool calls, backend interactions, memory ops, errors
 *   - Configurable via ~/.axoniz/config.json under "logging"
 */
import fs from "node:fs";
import path from "node:path";
import { AXONIZ_HOME } from "./config.js";

/* ── Configuration ────────────────────────────────────────────────────────── */

export const LOG_DIR = path.join(AXONIZ_HOME, "logs");
export const SESSION_DIR = path.join(LOG_DIR, "sessions");
export const STRUCTURED_DIR = path.join(LOG_DIR, "structured");

for (const d of [LOG_DIR, SESSION_DIR, STRUCTURED_DIR]) {
  try {
    fs.mkdirSync(d, { recursive: true });
  } catch {
    /* ignore */
  }
}

export type LogLevel = "DEBUG" | "INFO" | "WARNING" | "ERROR" | "CRITICAL";

const LEVEL_ORDER: Record<LogLevel, number> = {
  DEBUG: 10,
  INFO: 20,
  WARNING: 30,
  ERROR: 40,
  CRITICAL: 50,
};

export interface LogConfigShape {
  level: string;
  console: boolean;
  file: boolean;
  structured: boolean;
  max_bytes: number;
  backup_count: number;
  capture_llm_prompts: boolean;
  capture_tool_args: boolean;
  capture_tool_results: boolean;
  capture_backend_health: boolean;
  session_id: string;
}

/** Runtime logging configuration. */
export class LogConfig implements LogConfigShape {
  level = "INFO";
  console = true;
  file = true;
  structured = true; // JSON logs
  max_bytes = 10 * 1024 * 1024; // 10 MB
  backup_count = 10;
  capture_llm_prompts = false; // Off by default — can be huge
  capture_tool_args = true;
  capture_tool_results = true;
  capture_backend_health = true;
  session_id = "";

  static fromConfig(cfg: Record<string, unknown>): LogConfig {
    const lc = (cfg.logging ?? {}) as Record<string, unknown>;
    const inst = new LogConfig();
    inst.level = String(lc.level ?? "INFO");
    inst.console = Boolean(lc.console ?? true);
    inst.file = Boolean(lc.file ?? true);
    inst.structured = Boolean(lc.structured ?? true);
    inst.max_bytes = Number(lc.max_bytes ?? 10 * 1024 * 1024);
    inst.backup_count = Number(lc.backup_count ?? 10);
    inst.capture_llm_prompts = Boolean(lc.capture_llm_prompts ?? false);
    inst.capture_tool_args = Boolean(lc.capture_tool_args ?? true);
    inst.capture_tool_results = Boolean(lc.capture_tool_results ?? true);
    inst.capture_backend_health = Boolean(lc.capture_backend_health ?? true);
    return inst;
  }
}

/* ── Session tracking ─────────────────────────────────────────────────────── */

let sessionCounter = 0;

function pad(n: number, w: number): string {
  return String(n).padStart(w, "0");
}

function newSessionId(): string {
  sessionCounter += 1;
  const d = new Date();
  const ts =
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1, 2)}${pad(d.getUTCDate(), 2)}` +
    `_${pad(d.getUTCHours(), 2)}${pad(d.getUTCMinutes(), 2)}${pad(d.getUTCSeconds(), 2)}`;
  return `${ts}_${pad(sessionCounter, 4)}`;
}

/* ── Formatting ───────────────────────────────────────────────────────────── */

const COLORS: Record<string, string> = {
  DEBUG: "\u001b[36m", // cyan
  INFO: "\u001b[90m", // gray
  WARNING: "\u001b[93m", // yellow
  ERROR: "\u001b[91m", // red
  CRITICAL: "\u001b[95m", // magenta
};
const RESET = "\u001b[0m";
const GRAY = "\u001b[38;5;240m";

const NO_COLOR = Boolean(process.env.NO_COLOR);

function colorize(code: string, s: string): string {
  return NO_COLOR ? s : `${code}${s}${RESET}`;
}

function fmtConsoleTs(d: Date): string {
  const p = (n: number, w = 2) => pad(n, w);
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

function fmtIsoTs(d: Date): string {
  const p = (n: number, w = 2) => pad(n, w);
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`
  );
}

function consoleLine(level: LogLevel, domain: string, msg: string): string {
  const lvl = colorize(COLORS[level] ?? "", level.padEnd(5));
  const src = domain !== "axoniz" ? colorize(GRAY, `[${domain}]`) + " " : "";
  return `  ${colorize(GRAY, fmtConsoleTs(new Date()))}  ${lvl}  ${src}${msg}`;
}

function fileLine(level: LogLevel, domain: string, msg: string): string {
  return `${fmtIsoTs(new Date())} ${level.padEnd(8)} [${domain}] ${msg}`;
}

/* ── JSON serializer ──────────────────────────────────────────────────────── */

function jsonDefault(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack };
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "object" && v !== null) {
    const entries = Object.entries(v as Record<string, unknown>).filter(([k]) => !k.startsWith("_"));
    if (entries.length > 0) return Object.fromEntries(entries);
  }
  return String(v);
}

export function safeJson(v: unknown, indent?: number): string {
  try {
    return JSON.stringify(v, (_k, val) => jsonDefault(val), indent);
  } catch {
    return String(v);
  }
}

/* ── Rotating file writer ─────────────────────────────────────────────────── */

class RotatingWriter {
  private stream: fs.WriteStream | null = null;

  constructor(
    private readonly filePath: string,
    private readonly maxBytes: number,
    private readonly backupCount: number,
  ) {
    this.open();
  }

  private open(): void {
    try {
      this.stream = fs.createWriteStream(this.filePath, { flags: "a", encoding: "utf-8" });
      this.stream.on("error", () => {
        this.stream = null;
      });
    } catch {
      this.stream = null;
    }
  }

  write(line: string): void {
    if (!this.stream) return;
    try {
      this.stream.write(line + "\n");
      this.maybeRotate();
    } catch {
      /* ignore */
    }
  }

  private maybeRotate(): void {
    try {
      const st = fs.statSync(this.filePath);
      if (st.size <= this.maxBytes) return;
      this.stream?.end();
      this.stream = null;
      for (let i = this.backupCount - 1; i >= 1; i--) {
        const src = `${this.filePath}.${i}`;
        const dst = `${this.filePath}.${i + 1}`;
        if (fs.existsSync(src)) {
          try {
            fs.renameSync(src, dst);
          } catch {
            /* ignore */
          }
        }
      }
      try {
        fs.renameSync(this.filePath, `${this.filePath}.1`);
      } catch {
        /* ignore */
      }
      this.open();
    } catch {
      /* ignore */
    }
  }

  close(): void {
    try {
      this.stream?.end();
    } catch {
      /* ignore */
    }
    this.stream = null;
  }
}

/* ── Structured JSON logger ───────────────────────────────────────────────── */

/** Writes JSON events to a dedicated structured log file (one JSON object per line). */
export class StructuredLogger {
  readonly path: string;
  private stream: fs.WriteStream | null = null;

  constructor(readonly sessionId: string) {
    this.path = path.join(STRUCTURED_DIR, `${sessionId}.jsonl`);
    try {
      this.stream = fs.createWriteStream(this.path, { flags: "a", encoding: "utf-8" });
      this.stream.on("error", () => {
        this.stream = null;
      });
    } catch (e) {
      process.stderr.write(`[Logger] Failed to open structured log: ${String(e)}\n`);
      this.stream = null;
    }
  }

  emit(eventType: string, data: Record<string, unknown>): void {
    if (!this.stream) return;
    const entry = {
      ts: new Date().toISOString(),
      session: this.sessionId,
      type: eventType,
      data,
    };
    try {
      this.stream.write(safeJson(entry) + "\n");
    } catch {
      /* ignore */
    }
  }

  close(): void {
    try {
      this.stream?.end();
    } catch {
      /* ignore */
    }
    this.stream = null;
  }
}

/* ── Main Logger ──────────────────────────────────────────────────────────── */

/**
 * Central logging hub for AXONIZ-ZERO.
 * One logger per session with console, file, and structured outputs.
 */
export class AxonizLogger {
  config: LogConfig;
  sessionId: string;
  startedAt: Date;

  private mainWriter: RotatingWriter | null = null;
  private sessionWriter: RotatingWriter | null = null;
  private structured: StructuredLogger | null = null;
  private minLevel: LogLevel = "INFO";

  constructor(config?: LogConfig) {
    this.config = config ?? new LogConfig();
    this.sessionId = this.config.session_id || newSessionId();
    this.startedAt = new Date();
    this.minLevel = normalizeLevel(this.config.level);

    if (this.config.file) {
      try {
        this.mainWriter = new RotatingWriter(
          path.join(LOG_DIR, "axoniz.log"),
          this.config.max_bytes,
          this.config.backup_count,
        );
      } catch (e) {
        this.warning(`Could not open main log file: ${String(e)}`);
      }
      try {
        this.sessionWriter = new RotatingWriter(
          path.join(SESSION_DIR, `${this.sessionId}.log`),
          Number.MAX_SAFE_INTEGER,
          0,
        );
      } catch (e) {
        this.warning(`Could not open session log file: ${String(e)}`);
      }
    }

    this.structured = this.config.structured ? new StructuredLogger(this.sessionId) : null;
    this.logSessionStart();
  }

  private logSessionStart(): void {
    const bar = "=".repeat(60);
    this.info(bar);
    this.info("AXONIZ-ZERO Session Started");
    this.info(`  Session ID : ${this.sessionId}`);
    this.info(`  Started at : ${this.startedAt.toISOString()}`);
    this.info(`  Log level  : ${this.config.level}`);
    this.info(`  Console    : ${this.config.console}`);
    this.info(`  File log   : ${this.config.file}`);
    this.info(`  Structured : ${this.config.structured}`);
    this.info(bar);
    this.structuredEmit("session_start", {
      session_id: this.sessionId,
      started_at: this.startedAt.toISOString(),
      config: { ...this.config },
    });
  }

  private structuredEmit(eventType: string, data: Record<string, unknown>): void {
    this.structured?.emit(eventType, data);
  }

  /* ── Core logging API ──────────────────────────────────────────────────── */

  private emit(level: LogLevel, msg: string, domain = "axoniz"): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return;
    if (this.config.console) {
      const line = consoleLine(level, domain, msg);
      process.stderr.write(line + "\n");
    }
    if (this.config.file) {
      const line = fileLine(level, domain, msg);
      this.mainWriter?.write(line);
      this.sessionWriter?.write(line);
    }
  }

  debug(msg: string, domain = "axoniz"): void {
    this.emit("DEBUG", msg, domain);
  }

  info(msg: string, domain = "axoniz"): void {
    this.emit("INFO", msg, domain);
  }

  warning(msg: string, domain = "axoniz"): void {
    this.emit("WARNING", msg, domain);
  }

  /** Python-compatible alias for warning(). */
  warn(msg: string, domain = "axoniz"): void {
    this.warning(msg, domain);
  }

  error(msg: string, domain = "axoniz"): void {
    this.emit("ERROR", msg, domain);
  }

  critical(msg: string, domain = "axoniz"): void {
    this.emit("CRITICAL", msg, domain);
  }

  /* ── Structured event logging ──────────────────────────────────────────── */

  logEvent(eventType: string, data: Record<string, unknown>): void {
    this.structuredEmit(eventType, data);
    this.debug(`[${eventType}] ${safeJson(data).slice(0, 200)}`);
  }

  /* ── Agent lifecycle ───────────────────────────────────────────────────── */

  logAgentInit(config: Record<string, unknown>): void {
    const safe: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(config)) {
      if (!["api_key", "token", "password"].includes(k)) safe[k] = v;
    }
    this.info(`Agent initialized | config=${safeJson(safe)}`, "axoniz.agent");
    this.logEvent("agent_init", { config: safe });
  }

  logAgentRun(task: string, mode = "agent"): void {
    this.info(`Agent run | mode=${mode} | task=${task.slice(0, 200)}`, "axoniz.agent");
    this.logEvent("agent_run", { mode, task: task.slice(0, 2000) });
  }

  logAgentStep(step: number, total: number, thoughtPreview = ""): void {
    this.debug(`Step ${step}/${total} | thought=${thoughtPreview.slice(0, 100)}`, "axoniz.agent");
    this.logEvent("agent_step", { step, total, thought_preview: thoughtPreview.slice(0, 500) });
  }

  logAgentDone(resultPreview = "", stepsTaken = 0, tokensOut = 0): void {
    this.info(`Agent done | steps=${stepsTaken} | tokens=${tokensOut}`, "axoniz.agent");
    this.logEvent("agent_done", {
      result_preview: resultPreview.slice(0, 500),
      steps_taken: stepsTaken,
      tokens_out: tokensOut,
    });
  }

  logAgentError(exc: unknown, context = ""): void {
    const err = exc instanceof Error ? exc : new Error(String(exc));
    const tb = err.stack ?? String(exc);
    this.error(`Agent error | context=${context} | ${err.message}\n${tb}`, "axoniz.agent");
    this.logEvent("agent_error", { context, error: err.message, traceback: tb });
  }

  logAgentChat(message: string, responsePreview = ""): void {
    this.info(`Chat | msg=${message.slice(0, 200)}`, "axoniz.agent");
    this.logEvent("agent_chat", {
      message: message.slice(0, 2000),
      response_preview: responsePreview.slice(0, 500),
    });
  }

  /* ── Backend interactions ──────────────────────────────────────────────── */

  logBackendHealth(backend: string, result: Record<string, unknown>): void {
    if (!this.config.capture_backend_health) return;
    const status = String(result.status ?? "unknown");
    this.info(`Backend health | ${backend} | ${status}`, "axoniz.backend");
    this.logEvent("backend_health", { backend, result });
  }

  logBackendComplete(
    backend: string,
    model: string,
    promptTokens: number,
    outputTokens: number,
    durationMs: number,
    error?: string,
  ): void {
    if (error) {
      this.error(`Backend complete failed | ${backend} | ${model} | ${error}`, "axoniz.backend");
      this.logEvent("backend_complete_error", { backend, model, error });
    } else {
      this.debug(
        `Backend complete | ${backend} | ${model} | ${promptTokens} \u2192 ${outputTokens} tok | ${durationMs}ms`,
        "axoniz.backend",
      );
      this.logEvent("backend_complete", {
        backend,
        model,
        prompt_tokens: promptTokens,
        output_tokens: outputTokens,
        duration_ms: durationMs,
      });
    }
  }

  logBackendLoad(backend: string, model: string, result: string): void {
    this.info(`Backend load | ${backend} | ${model} | ${result}`, "axoniz.backend");
    this.logEvent("backend_load", { backend, model, result });
  }

  /* ── Tool execution ────────────────────────────────────────────────────── */

  logToolCall(name: string, args: Record<string, unknown>, step = 0): void {
    if (!this.config.capture_tool_args) return;
    const safe: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(args)) {
      if (!["api_key", "token", "password", "secret"].includes(k)) safe[k] = v;
    }
    this.info(`Tool call | ${name} | step=${step} | args=${safeJson(safe)}`, "axoniz.tools");
    this.logEvent("tool_call", { name, args: safe, step });
  }

  logToolResult(name: string, result: unknown, durationMs = 0, error?: string): void {
    if (!this.config.capture_tool_results) return;
    const preview = result ? String(result).slice(0, 500) : "";
    if (error) {
      this.error(`Tool error | ${name} | ${error}`, "axoniz.tools");
      this.logEvent("tool_error", { name, error, duration_ms: durationMs });
    } else {
      this.debug(`Tool result | ${name} | ${preview.slice(0, 100)}... | ${durationMs}ms`, "axoniz.tools");
      this.logEvent("tool_result", { name, result_preview: preview, duration_ms: durationMs });
    }
  }

  /* ── Memory operations ─────────────────────────────────────────────────── */

  logMemoryQuery(query: string, resultsCount: number, domain = "axoniz.memory"): void {
    this.debug(`Memory query | ${query.slice(0, 100)} | ${resultsCount} results`, domain);
    this.logEvent("memory_query", { query: query.slice(0, 500), results_count: resultsCount });
  }

  logMemoryStore(key: string, size: number, domain = "axoniz.memory"): void {
    this.debug(`Memory store | ${key} | ${size} bytes`, domain);
    this.logEvent("memory_store", { key, size });
  }

  /* ── Swarm / Loop ──────────────────────────────────────────────────────── */

  logSwarmRun(task: string, workers: number, subTasks: number): void {
    this.info(`Swarm run | ${subTasks} sub-tasks | ${workers} workers`, "axoniz.swarm");
    this.logEvent("swarm_run", { task: task.slice(0, 500), workers, sub_tasks: subTasks });
  }

  logSwarmWorkerDone(
    workerId: number,
    taskId: number,
    status: string,
    durationMs: number,
    score = 0.0,
  ): void {
    this.debug(
      `Swarm worker ${workerId} done | task=${taskId} | ${status} | ${durationMs}ms | score=${score}`,
      "axoniz.swarm",
    );
    this.logEvent("swarm_worker_done", {
      worker_id: workerId,
      task_id: taskId,
      status,
      duration_ms: durationMs,
      score,
    });
  }

  logLoopCycle(cycle: number, maxCycles: number, tasksCompleted: number, tasksFailed: number): void {
    this.info(
      `Loop cycle ${cycle}/${maxCycles} | done=${tasksCompleted} | failed=${tasksFailed}`,
      "axoniz.loop",
    );
    this.logEvent("loop_cycle", {
      cycle,
      max_cycles: maxCycles,
      tasks_completed: tasksCompleted,
      tasks_failed: tasksFailed,
    });
  }

  /* ── Config changes ────────────────────────────────────────────────────── */

  logConfigChange(key: string, oldVal: unknown, newVal: unknown): void {
    this.info(`Config change | ${key}: ${String(oldVal)} \u2192 ${String(newVal)}`, "axoniz.config");
    this.logEvent("config_change", { key, old: String(oldVal), new: String(newVal) });
  }

  /* ── Session end ───────────────────────────────────────────────────────── */

  logSessionEnd(reason = "normal"): void {
    const elapsed = (Date.now() - this.startedAt.getTime()) / 1000;
    const bar = "=".repeat(60);
    this.info(bar);
    this.info(`Session Ended | ${this.sessionId} | reason=${reason} | elapsed=${elapsed.toFixed(1)}s`);
    this.info(bar);
    this.logEvent("session_end", {
      session_id: this.sessionId,
      reason,
      elapsed_seconds: elapsed,
    });
    this.structured?.close();
    this.structured = null;
  }

  close(): void {
    this.mainWriter?.close();
    this.sessionWriter?.close();
    this.structured?.close();
    this.mainWriter = null;
    this.sessionWriter = null;
    this.structured = null;
  }

  /* ── Utility ───────────────────────────────────────────────────────────── */

  getSessionLogPath(): string {
    return path.join(SESSION_DIR, `${this.sessionId}.log`);
  }

  getStructuredLogPath(): string {
    return path.join(STRUCTURED_DIR, `${this.sessionId}.jsonl`);
  }

  /** Return info about recent session log files. */
  getRecentSessions(n = 10): Array<Record<string, string>> {
    let files: string[];
    try {
      files = fs
        .readdirSync(SESSION_DIR)
        .filter((f) => f.endsWith(".log"))
        .sort((a, b) => b.localeCompare(a));
    } catch {
      return [];
    }
    const sessions: Array<Record<string, string>> = [];
    for (const f of files.slice(0, n)) {
      const p = path.join(SESSION_DIR, f);
      try {
        const st = fs.statSync(p);
        sessions.push({
          session_id: f.replace(/\.log$/, ""),
          size_kb: (st.size / 1024).toFixed(1),
          modified: st.mtime.toISOString(),
          path: p,
        });
      } catch {
        /* ignore */
      }
    }
    return sessions;
  }

  /** Time an async operation, logging entry/exit/failure. */
  async timed<T>(label: string, fn: () => Promise<T>, domain = "axoniz"): Promise<T> {
    const t0 = Date.now();
    this.debug(`${label} started`, domain);
    try {
      const result = await fn();
      this.debug(`${label} completed in ${Date.now() - t0}ms`, domain);
      return result;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      this.error(`${label} failed after ${Date.now() - t0}ms | ${err.message}`, domain);
      throw e;
    }
  }
}

/* ── Global instance ──────────────────────────────────────────────────────── */

let loggerInstance: AxonizLogger | null = null;

function normalizeLevel(level: string): LogLevel {
  const up = level.toUpperCase();
  return (up in LEVEL_ORDER ? up : "INFO") as LogLevel;
}

/** Get or create the global logger instance. */
export function getLogger(config?: LogConfig): AxonizLogger {
  if (loggerInstance === null) {
    loggerInstance = new AxonizLogger(config);
  }
  return loggerInstance;
}

/** Explicitly (re)initialize the logger. Call once at startup. */
export function initLogger(config?: LogConfig): AxonizLogger {
  loggerInstance?.close();
  loggerInstance = new AxonizLogger(config);
  return loggerInstance;
}

/* ── Convenience wrappers (backward-compatible with debug.ts) ─────────────── */

export function debug(msg: string, domain = "axoniz"): void {
  getLogger().debug(msg, domain);
}

export function info(msg: string, domain = "axoniz"): void {
  getLogger().info(msg, domain);
}

export function warn(msg: string, domain = "axoniz"): void {
  getLogger().warning(msg, domain);
}

export function error(msg: string, domain = "axoniz"): void {
  getLogger().error(msg, domain);
}

export function critical(msg: string, domain = "axoniz"): void {
  getLogger().critical(msg, domain);
}

export function logJson(data: unknown, label = "JSON"): void {
  try {
    getLogger().debug(`${label}:\n${safeJson(data, 2)}`);
  } catch {
    getLogger().debug(`${label}: ${String(data)}`);
  }
}

/** Dynamically change console log level. */
export function setLevel(level: string): void {
  const lg = getLogger();
  lg.config.level = level.toUpperCase();
  // Re-derive threshold through a public setter path.
  (lg as unknown as { minLevel: LogLevel }).minLevel = normalizeLevel(level);
  lg.info(`Log level set to ${level.toUpperCase()}`);
}

/** Catch-all error handler with actionable fix hints. */
export function robustHandle(e: unknown, context = ""): void {
  const err = e instanceof Error ? e : new Error(String(e));
  const msg = context ? `[CRITICAL] ${context}: ${err.message}` : `[CRITICAL] ${err.message}`;
  getLogger().error(msg);
  const s = err.message.toLowerCase();
  if (s.includes("econnrefused") || s.includes("refused") || s.includes("10061")) {
    console.log("  [FIX] Backend connection refused. Is LM Studio/Ollama running?");
  } else if (s.includes("transformers") || s.includes("onnx") || s.includes("av._core")) {
    console.log("  [FIX] Voice model dependency error. Check your ONNX runtime install.");
  } else if (s.includes("404")) {
    console.log("  [FIX] Check your endpoint URL in settings.");
  }
  if (["1", "true", "yes"].includes(String(process.env.AXONIZ_DEBUG ?? "").toLowerCase())) {
    console.error(err.stack);
  }
}

/** Decorator-style helper to log function entry/exit with timing. */
export function logCalls(level: "debug" | "info" = "info", domain = "axoniz") {
  return function <A extends unknown[], R>(
    fn: (...args: A) => R,
    ctx?: { name?: string },
  ): (...args: A) => R {
    const name = ctx?.name ?? fn.name ?? "<anonymous>";
    return (...args: A): R => {
      const lg = getLogger();
      lg[level](`\u2192 ${name} | args=${args.length}`, domain);
      const t0 = Date.now();
      try {
        const result = fn(...args);
        lg[level](`\u2190 ${name} | ok | ${Date.now() - t0}ms`, domain);
        return result;
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        lg.error(`\u2190 ${name} | FAILED | ${Date.now() - t0}ms | ${err.message}`, domain);
        throw e;
      }
    };
  };
}
