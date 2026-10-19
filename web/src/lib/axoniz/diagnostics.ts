/**
 * AXONIZ diagnostic logger — vendored into web so the Next.js
 * API routes can write to %LOCALAPPDATA%\FRAZIYM\axoniz\logs\*.axolog
 * without depending on the @fraziym/axoniz package.
 *
 * The same module exists in the AXONIZ CLI at src/core/diagnostics.ts.
 * They MUST stay in sync. The CLI's `axoniz logs *` commands read the
 * files produced by this module.
 *
 * File format:
 *   %LOCALAPPDATA%\FRAZIYM\axoniz\logs\YYYY-MM-DD_HH-mm-ss_Day-username.axolog
 *
 * Each line is a JSON object (JSON Lines / NDJSON).
 *
 * Privacy:
 *   - This module NEVER receives raw chat content, prompts, completions,
 *     passwords, tokens, cookies, API keys, or file uploads from the
 *     caller. The caller MUST sanitize. redact() is applied defensively
 *     as a second line of defense.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { axonizLocal } from "./paths";

/* ── Constants ───────────────────────────────────────────────────────────── */

/** Schema version — bump when the JSON shape changes in a breaking way. */
export const DIAG_SCHEMA_VERSION = 1;

/** Soft cap on the buffer (events queued while the writer is unavailable). */
const MAX_BUFFER = 500;

/** Max .axolog file size before rotation (50 MB). */
const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** Max number of rotated .axolog.N files to keep. */
const MAX_ROTATIONS = 10;

const AXONIZ_VERSION = "V00.01.007-beta-05";

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function getDiagLogDir(): string {
  return path.join(axonizLocal(), "logs");
}

const pad = (n: number, w = 2): string => String(n).padStart(w, "0");

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function dateParts(d: Date): { file: string; day: string } {
  const file =
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  return { file, day: DAYS[d.getDay()] };
}

export function sanitizeUsername(raw: string | undefined | null): string {
  if (!raw) return "unknown";
  const cleaned = String(raw).replace(/[^a-zA-Z0-9._-]/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "unknown";
}

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

function tzOffset(d: Date): string {
  const off = -d.getTimezoneOffset();
  const sign = off < 0 ? "-" : "+";
  const abs = Math.abs(off);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

/* ── Redaction ───────────────────────────────────────────────────────────── */

const REDACTED_KEYS = new Set([
  "password", "passwd", "secret", "api_key", "apikey", "authorization",
  "auth", "token", "access_token", "refresh_token", "session", "cookie",
  "cookies", "credential", "credentials", "private_key", "privatekey",
]);

const REDACTED_SUBSTR = [
  "Bearer ", "Basic ", "sk-", "pk-", "ghp_", "gho_", "xoxb-", "xoxp-",
];

export function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    let s = value;
    for (const sub of REDACTED_SUBSTR) {
      if (s.includes(sub)) {
        s = s.replace(
          new RegExp(`${sub.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^\\s,;]+`, "g"),
          `${sub}[REDACTED]`,
        );
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

/* ── The writer ──────────────────────────────────────────────────────────── */

export interface DiagEvent {
  timestamp: string;
  timestamp_utc: string;
  timezone_offset: string;
  session_id: string;
  event_id: string;
  sequence: number;
  process_id: number;
  application: string;
  application_version: string;
  component: string;
  event_type: string;
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
  already_redacted?: boolean;
}

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

  constructor(username: string | undefined | null, application = "axoniz.web") {
    this.sessionId = crypto.randomBytes(8).toString("hex");
    this.processId = process.pid;
    this.filePath = path.join(getDiagLogDir(), buildAxologFilename(new Date(), username));
    this.open();
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
      const dir = path.dirname(this.filePath);
      try { fs.mkdirSync(dir, { recursive: true }); } catch { /* may exist */ }
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
    try { return fs.statSync(this.filePath).size; } catch { return 0; }
  }

  private reportFailure(msg: string): void {
    if (this.failureReported) return;
    this.failureReported = true;
    try { process.stderr.write(`[axoniz.diagnostics] ${msg}\n`); } catch { /* ignore */ }
  }

  emit(opts: EmitOptions): boolean {
    if (this.failed && this.buffer.length >= MAX_BUFFER) return false;

    const now = new Date();
    const event: DiagEvent = {
      timestamp:
        `${pad(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
        `T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`,
      timestamp_utc: now.toISOString(),
      timezone_offset: tzOffset(now),
      session_id: this.sessionId,
      event_id: crypto.randomBytes(6).toString("hex"),
      sequence: ++this.seq,
      process_id: this.processId,
      application: opts.application ?? "axoniz.web",
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
      if (this.buffer.length > 0) {
        const pending = this.buffer.splice(0, this.buffer.length);
        for (const p of pending) fs.writeSync(this.fd, p + "\n");
      }
      this.maybeRotate();
      return true;
    } catch (e) {
      this.failed = true;
      this.buffer.push(line);
      this.reportFailure(`Write failed: ${errMsg(e)}`);
      this.tryFallback();
      return false;
    }
  }

  private maybeRotate(): void {
    if (this.byteCount < MAX_FILE_BYTES) return;
    try {
      if (this.fd !== null) { fs.closeSync(this.fd); this.fd = null; }
      for (let i = MAX_ROTATIONS; i >= 1; i--) {
        const src = i === 1 ? this.filePath : `${this.filePath}.${i - 1}`;
        const dst = `${this.filePath}.${i}`;
        if (fs.existsSync(src)) {
          if (i === MAX_ROTATIONS) fs.unlinkSync(src);
          else fs.renameSync(src, dst);
        }
      }
      this.byteCount = 0;
      this.open();
    } catch (e) {
      this.reportFailure(`Rotation failed: ${errMsg(e)}`);
    }
  }

  private tryFallback(): void {
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

  close(): void {
    if (this.buffer.length > 0 && this.fd !== null) {
      const pending = this.buffer.splice(0, this.buffer.length);
      for (const p of pending) {
        try { fs.writeSync(this.fd, p + "\n"); } catch { /* ignore on close */ }
      }
    }
    try { if (this.fd !== null) fs.closeSync(this.fd); } catch { /* ignore */ }
    this.fd = null;
  }

  get size(): number { return this.byteCount; }
  get isFailed(): boolean { return this.failed; }
}

/* ── Singleton ──────────────────────────────────────────────────────────── */

let singleton: DiagLogger | null = null;
let exitHandlerRegistered = false;

export function getDiagLogger(username?: string | null): DiagLogger {
  if (!singleton) {
    singleton = new DiagLogger(username, "axoniz.web");
    if (!exitHandlerRegistered) {
      exitHandlerRegistered = true;
      for (const sig of ["exit", "SIGINT", "SIGTERM", "SIGHUP"] as const) {
        try {
          process.once(sig, () => { try { singleton?.close(); } catch { /* ignore */ } });
        } catch { /* ignore */ }
      }
    }
  }
  return singleton;
}

export function _setDiagLoggerForTest(logger: DiagLogger | null): void {
  if (singleton) { try { singleton.close(); } catch { /* ignore */ } }
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
