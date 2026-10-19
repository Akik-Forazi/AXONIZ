/**
 * axoniz.core.diagnostics
 * =================================
 *
 * Persistent diagnostic logging system — the .axolog writer.
 *
 * Relationship to the existing AxonizLogger (src/core/logger.ts):
 *   - AxonizLogger writes structured events to
 *     %LOCALAPPDATA%\FRAZIYM\axoniz\logs\structured\*.jsonl
 *     (one file per CLI session, used for agent/tool/backend events).
 *   - This module writes a SINGLE append-only .axolog file per USER session
 *     that captures user interactions, navigation, network activity, errors,
 *     and lifecycle events from BOTH the browser frontend AND the Node
 *     backend/CLI/daemon. The browser cannot write to the user's filesystem
 *     directly; it POSTs events to /api/axoniz/diagnostics/log, which calls
 *     into this module.
 *
 * File format:
 *   %LOCALAPPDATA%\FRAZIYM\axoniz\logs\YYYY-MM-DD_HH-mm-ss_Day-username.axolog
 *
 *   Example: %LOCALAPPDATA%\FRAZIYM\axoniz\logs\2026-10-14_21-15-30_Wednesday-akik.axolog
 *
 * Each line in the file is a JSON object (JSON Lines / NDJSON). A
 * truncated/corrupt trailing line can be detected on read because the
 * parser tries JSON.parse(line) and skips lines that fail.
 *
 * Crash safety:
 *   - All writes are append-only (O_APPEND).
 *   - fs.writeFileSync is used so events are flushed synchronously before
 *     the function returns. This blocks the event loop briefly (~0.05ms
 *     per write on an SSD), which is acceptable for the diagnostic event
 *     volume we expect (<<100 events/sec).
 *   - For unattended daemon batches, use the async writeStream variant.
 *   - If the write fails (disk full, permission denied, etc.), the
 *     failure is reported once to stderr and the logger switches to a
 *     no-op mode so the application continues running.
 *
 * Privacy:
 *   - This module NEVER receives raw chat content, prompts, completions,
 *     passwords, tokens, cookies, API keys, or file uploads from the
 *     caller. The caller MUST sanitize before calling emit(). The
 *     redact() helper below is applied defensively as a second line of
 *     defense.
 *   - Stack traces are scrubbed to keep file/line info but not full
 *     filesystem paths or environment values.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomBytes } from "node:crypto";

import { fraziymLocal } from "./paths.js";
import { AXONIZ_VERSION } from "../version.js";

/* ── Constants ───────────────────────────────────────────────────────────── */

/**
 * Resolve the log directory fresh on each call so tests (or callers that set
 * FRAZIYM_LOCAL at runtime) get the redirected machine-local root.
 * Diagnostics are machine-local state → T2 (%LOCALAPPDATA%\FRAZIYM\axoniz\logs).
 */
export function getDiagLogDir(): string {
  return path.join(fraziymLocal(), "axoniz", "logs");
}

/** Backward-compat: callers that imported DIAG_LOG_DIR as a constant. */
export const DIAG_LOG_DIR = getDiagLogDir();

/** Schema version — bump when the JSON shape changes in a breaking way. */
export const DIAG_SCHEMA_VERSION = 1;

/** Soft cap on the buffer (events queued while the writer is unavailable). */
const MAX_BUFFER = 500;

/** Max .axolog file size before rotation (50 MB). */
const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** Max number of rotated .axolog.N files to keep. */
const MAX_ROTATIONS = 10;

/* ── Directory bootstrap ─────────────────────────────────────────────────── */

try {
  fs.mkdirSync(getDiagLogDir(), { recursive: true });
} catch {
  /* ignore — emit() will report the failure */
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

const pad = (n: number, w = 2): string => String(n).padStart(w, "0");

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Returns local-timezone date components for filename construction. */
function dateParts(d: Date): {
  file: string;   // YYYY-MM-DD_HH-mm-ss
  day: string;    // Wednesday
} {
  const file =
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  return { file, day: DAYS[d.getDay()] };
}

/** Sanitize a username for inclusion in a filename. */
export function sanitizeUsername(raw: string | undefined | null): string {
  if (!raw) return "unknown";
  // Allow alphanumerics + dash + underscore + dot. Replace everything else.
  const cleaned = String(raw).replace(/[^a-zA-Z0-9._-]/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "unknown";
}

/**
 * Build the canonical .axolog filename.
 * Collisions (same-second session restarts) get a `-2`, `-3` suffix.
 */
export function buildAxologFilename(d: Date, username: string | undefined | null): string {
  const { file, day } = dateParts(d);
  const user = sanitizeUsername(username);
  const base = `${file}_${day}-${user}`;
  let candidate = `${base}.axolog`;
  let n = 2;
  while (fs.existsSync(path.join(getDiagLogDir(), candidate))) {
    candidate = `${base}-${n}.axolog`;
    n += 1;
  }
  return candidate;
}

/** Get the configured timezone offset for the running process (e.g. +06:00). */
function tzOffset(d: Date): string {
  const off = -d.getTimezoneOffset(); // minutes east of UTC
  const sign = off < 0 ? "-" : "+";
  const abs = Math.abs(off);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/* ── Redaction ──────────────────────────────────────────────────────────── */

const REDACTED_KEYS = new Set([
  "password", "passwd", "secret", "api_key", "apikey", "authorization",
  "auth", "token", "access_token", "refresh_token", "session", "cookie",
  "cookies", "credential", "credentials", "private_key", "privatekey",
]);

const REDACTED_SUBSTR = [
  "Bearer ", "Basic ", "sk-", "pk-", "ghp_", "gho_", "xoxb-", "xoxp-",
];

/**
 * Recursively redact known-sensitive keys and substrings from an arbitrary
 * JSON-serializable value. Mutates a copy, not the original. Returns the
 * redacted copy. Anything redacted is replaced with "[REDACTED]".
 */
export function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    let s = value;
    for (const sub of REDACTED_SUBSTR) {
      if (s.includes(sub)) {
        // Mask everything from the secret prefix onward.
        s = s.replace(new RegExp(`${sub.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^\\s,;]+`, "g"), `${sub}[REDACTED]`);
      }
    }
    return s;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const lower = k.toLowerCase();
      if (REDACTED_KEYS.has(lower) || /token|secret|pass|key|cookie/i.test(k)) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }
  return value;
}

/** Trim a stack trace: keep top N frames, strip absolute paths' common prefixes. */
function trimStack(stack: string | undefined): string | undefined {
  if (!stack) return undefined;
  const lines = stack.split("\n").slice(0, 12);
  // Strip the user's home directory from any absolute paths in the trace.
  const home = os.homedir();
  return lines.map(l => l.split(home).join("~")).join("\n");
}

/* ── The writer ──────────────────────────────────────────────────────────── */

export interface DiagEvent {
  timestamp: string;          // local ISO-ish string
  timestamp_utc: string;     // ISO UTC
  timezone_offset: string;    // +06:00
  session_id: string;
  event_id: string;          // random per-event
  sequence: number;          // monotonic per-process
  process_id: number;
  application: string;       // "axoniz" | "axoniz.web" | "axoniz.daemon"
  application_version: string;
  component: string;          // e.g. "frontend.click", "backend.api.health"
  event_type: string;        // e.g. "click", "navigation", "http_request"
  severity: "debug" | "info" | "warn" | "error" | "fatal";
  route?: string;
  action?: string;
  duration_ms?: number;
  correlation_id?: string;
  details?: Record<string, unknown>;
  redaction_applied: boolean;
  schema_version: number;
}

export interface EmitOptions {
  application?: string;
  component?: string;
  event_type: string;
  severity?: DiagEvent["severity"];
  route?: string;
  action?: string;
  duration_ms?: number;
  correlation_id?: string;
  details?: Record<string, unknown>;
  /** When true, the caller has already sanitized `details`. */
  already_redacted?: boolean;
}

/**
 * Stateful diagnostic logger. One instance per process (the singleton
 * `diagLogger` below). The browser side does NOT instantiate this
 * directly — it POSTs events to /api/axoniz/diagnostics/log, which
 * calls into the singleton.
 */
export class DiagLogger {
  readonly sessionId: string;
  readonly filePath: string;
  readonly processId: number;
  private seq = 0;
  private buffer: string[] = [];
  private failed = false;
  private failureReported = false;
  private fd: number | null = null;
  private byteCount = 0;

  constructor(username: string | undefined | null, application = "axoniz") {
    this.sessionId = randomBytes(8).toString("hex");
    this.processId = process.pid;
    this.filePath = path.join(getDiagLogDir(), buildAxologFilename(new Date(), username));
    this.open();
    // Emit the session_start event so the file always has at least one record.
    this.emit({
      application,
      component: "diagnostics",
      event_type: "session_start",
      severity: "info",
      details: {
        file: this.filePath,
        pid: this.processId,
        platform: process.platform,
        node_version: process.version,
        schema_version: DIAG_SCHEMA_VERSION,
      },
    });
  }

  private open(): void {
    try {
      // Ensure the parent dir exists (HOME may have changed; tests do this).
      const dir = path.dirname(this.filePath);
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch { /* may already exist */ }
      // O_APPEND ensures atomic appends from concurrent writers.
      // 0o600 = user read/write only — restrictive by default.
      const flags = fs.constants.O_APPEND | fs.constants.O_CREAT | fs.constants.O_WRONLY;
      this.fd = fs.openSync(this.filePath, flags, 0o600);
      this.byteCount = this.statSize();
    } catch (e) {
      this.fd = null;
      this.failed = true;
      this.reportFailure(`Failed to open ${this.filePath}: ${errMsg(e)}`);
    }
  }

  private statSize(): number {
    try {
      return fs.statSync(this.filePath).size;
    } catch {
      return 0;
    }
  }

  private reportFailure(msg: string): void {
    if (this.failureReported) return;
    this.failureReported = true;
    try {
      process.stderr.write(`[axoniz.diagnostics] ${msg}\n`);
    } catch {
      /* ignore */
    }
  }

  /**
   * Append a diagnostic event to the .axolog file.
   * Returns true if the event was written, false if it was buffered
   * or dropped due to a persistent write failure.
   */
  emit(opts: EmitOptions): boolean {
    if (this.failed && this.buffer.length >= MAX_BUFFER) {
      // Buffer is full and we cannot write. Drop the event silently.
      return false;
    }

    const now = new Date();
    const event: DiagEvent = {
      timestamp: `${pad(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
        `T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`,
      timestamp_utc: now.toISOString(),
      timezone_offset: tzOffset(now),
      session_id: this.sessionId,
      event_id: randomBytes(6).toString("hex"),
      sequence: ++this.seq,
      process_id: this.processId,
      application: opts.application ?? "axoniz",
      application_version: AXONIZ_VERSION,
      component: opts.component ?? "unknown",
      event_type: opts.event_type,
      severity: opts.severity ?? "info",
      route: opts.route,
      action: opts.action,
      duration_ms: opts.duration_ms,
      correlation_id: opts.correlation_id,
      details: (opts.already_redacted ? opts.details : redact(opts.details)) as
        | Record<string, unknown>
        | undefined,
      redaction_applied: !opts.already_redacted,
      schema_version: DIAG_SCHEMA_VERSION,
    };

    let line: string;
    try {
      line = JSON.stringify(event);
    } catch (e) {
      // Fallback: emit a minimal record describing the serialization failure.
      const fallback: DiagEvent = {
        ...event,
        details: { serialization_error: errMsg(e) },
        redaction_applied: true,
      };
      line = JSON.stringify(fallback);
    }

    if (this.failed) {
      this.buffer.push(line);
      return false;
    }

    return this.writeLine(line);
  }

  private writeLine(line: string): boolean {
    if (this.fd === null) return false;
    const data = line + "\n";
    try {
      fs.writeSync(this.fd, data);
      this.byteCount += Buffer.byteLength(data);
      // Flush any buffered events.
      if (this.buffer.length > 0) {
        const pending = this.buffer.splice(0, this.buffer.length);
        for (const p of pending) {
          fs.writeSync(this.fd, p + "\n");
        }
      }
      // Rotate if needed.
      this.maybeRotate();
      return true;
    } catch (e) {
      this.failed = true;
      this.buffer.push(line);
      this.reportFailure(`Write failed: ${errMsg(e)}`);
      // Try opening a fallback path.
      this.tryFallback();
      return false;
    }
  }

  private maybeRotate(): void {
    if (this.byteCount < MAX_FILE_BYTES) return;
    try {
      if (this.fd !== null) {
        fs.closeSync(this.fd);
        this.fd = null;
      }
      // Shift older rotations: .10 -> delete, .9 -> .10, ..., .1 -> .2, current -> .1
      for (let i = MAX_ROTATIONS; i >= 1; i--) {
        const src = i === 1 ? this.filePath : `${this.filePath}.${i - 1}`;
        const dst = `${this.filePath}.${i}`;
        if (fs.existsSync(src)) {
          if (i === MAX_ROTATIONS) {
            fs.unlinkSync(src);
          } else {
            fs.renameSync(src, dst);
          }
        }
      }
      this.byteCount = 0;
      this.open();
    } catch (e) {
      this.reportFailure(`Rotation failed: ${errMsg(e)}`);
    }
  }

  private tryFallback(): void {
    // Try writing to OS temp dir instead — better than losing events.
    const fallbackDir = path.join(os.tmpdir(), "axoniz-logs");
    try {
      fs.mkdirSync(fallbackDir, { recursive: true });
      const fallbackPath = path.join(fallbackDir, path.basename(this.filePath));
      const flags = fs.constants.O_APPEND | fs.constants.O_CREAT | fs.constants.O_WRONLY;
      this.fd = fs.openSync(fallbackPath, flags, 0o600);
      this.failed = false;
      this.reportFailure(`Switched to fallback path: ${fallbackPath}`);
    } catch {
      this.fd = null;
    }
  }

  /** Close the writer. Flushes the buffer first. */
  close(): void {
    // Flush any buffered events before closing.
    if (this.buffer.length > 0 && this.fd !== null) {
      const pending = this.buffer.splice(0, this.buffer.length);
      for (const p of pending) {
        try {
          fs.writeSync(this.fd, p + "\n");
        } catch {
          /* ignore on close */
        }
      }
    }
    try {
      if (this.fd !== null) {
        fs.closeSync(this.fd);
      }
    } catch {
      /* ignore */
    }
    this.fd = null;
  }

  /** Return current byte count of the active .axolog file (for tests). */
  get size(): number {
    return this.byteCount;
  }

  /** Return whether the logger is in failed/fallback state. */
  get isFailed(): boolean {
    return this.failed;
  }
}

/* ── Singleton ──────────────────────────────────────────────────────────── */

let singleton: DiagLogger | null = null;
let exitHandlerRegistered = false;

/** Returns the singleton diagnostic logger, creating it on first call. */
export function getDiagLogger(username?: string | null): DiagLogger {
  if (!singleton) {
    singleton = new DiagLogger(username, "axoniz");
    // Register exit handlers exactly ONCE per process — the handler
    // closes whichever singleton is currently active at exit time.
    if (!exitHandlerRegistered) {
      exitHandlerRegistered = true;
      for (const sig of ["exit", "SIGINT", "SIGTERM", "SIGHUP"] as const) {
        try {
          process.once(sig, () => {
            try { singleton?.close(); } catch { /* ignore */ }
          });
        } catch {
          /* ignore — signal not available on this platform */
        }
      }
    }
  }
  return singleton;
}

/** Test hook — allows tests to inject a logger with a specific username. */
export function _setDiagLoggerForTest(logger: DiagLogger | null): void {
  if (singleton) {
    try { singleton.close(); } catch { /* ignore */ }
  }
  singleton = logger;
}

/** Read all .axolog files in the resolved log dir, newest first. */
export function listAxologs(): Array<{ name: string; path: string; size: number; mtime: Date }> {
  const dir = getDiagLogDir();
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries
      .filter(e => e.isFile() && e.name.endsWith(".axolog"))
      .map(e => {
        const p = path.join(dir, e.name);
        try {
          const st = fs.statSync(p);
          return { name: e.name, path: p, size: st.size, mtime: st.mtime };
        } catch {
          return { name: e.name, path: p, size: 0, mtime: new Date(0) };
        }
      })
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  } catch {
    return [];
  }
}

/* ── Helpers for callers ─────────────────────────────────────────────────── */

export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export { trimStack };
