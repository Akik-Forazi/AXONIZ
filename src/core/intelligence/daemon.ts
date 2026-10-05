/**
 * axoniz.core.intelligence.daemon
 * =================================
 * Phase 4 — axoniz OS Layer (Background Daemon)
 *
 * This is what no one has attempted in local AI.
 * axoniz runs as a background daemon on your machine:
 *
 *   File saved     → lint and test automatically
 *   Git commit     → write the changelog entry
 *   Build failed   → fix it and retry while you sleep
 *   Cron schedule  → daily code quality audit
 *   File watcher   → catch errors before you even ask
 *
 * It stops being a tool you open and becomes infrastructure you run.
 *
 * Architecture:
 *   FileWatcher    — watches workspace for changes
 *   EventQueue     — deque of file events
 *   DaemonLoop     — runs scheduled tasks + reacts to events
 *   TaskScheduler  — interval-style task scheduling
 *
 * Port notes (Python → Node):
 *   - `threading.Thread(daemon=True)` loops → `setInterval` timers that are
 *     `unref()`d, so (exactly like a Python daemon thread) they never keep the
 *     process alive, and `stop()` clears them.
 *   - `queue.Queue(maxsize=500)` → `EventQueue`, a bounded wrapper around the
 *     existing `core/backend/async_queue.ts` `AsyncQueue` (reused for the async
 *     iteration side) plus a synchronous FIFO so the daemon's poll loop keeps
 *     Python's `get_nowait()` / `empty()` semantics. A full queue drops instead
 *     of blocking: blocking is impossible on the main thread, and the Python
 *     producer ran on its own thread.
 *   - `compile(source, path, "exec")` (the Python linter) → heuristic bracket /
 *     string-balance checking; Node ships no Python parser. `.js`/`.mjs`/`.cjs`
 *     files get a REAL syntax check through `node:vm`. Consequences are
 *     documented on `_pySyntaxIssue`.
 *   - `_task_vision_sentinel` used pyautogui + pytesseract (OCR). Neither has a
 *     Node equivalent in the available dependency set, so the sentinel keeps its
 *     schedule and its `AXONIZ_DISABLE_VISION` guard but cannot extract text;
 *     it warns once and performs no capture. Documented fidelity loss.
 *   - `threading.Lock` around `_pending_lint` is unnecessary on one thread and
 *     is omitted.
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

import { AXONIZ_HOME } from "../config.js";
import { debug, error, info, warn } from "../debug.js";
import { AsyncQueue } from "../backend/async_queue.js";

/** Render an unknown thrown value the way Python's `str(e)` would. */
export function errText(e: unknown): string {
  if (e instanceof Error) return e.message || e.name;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/* ─── Events ────────────────────────────────────────────────────────────────── */

export interface FileEventInit {
  path: string;
  /** created / modified / deleted */
  event: string;
  timestamp?: number;
  size?: number;
}

export class FileEvent {
  path: string;
  event: string;
  timestamp: number;
  size: number;

  constructor(init: FileEventInit | string, event?: string, timestamp?: number, size = 0) {
    const o: FileEventInit =
      typeof init === "string"
        ? { path: init, event: event ?? "", timestamp: timestamp ?? Date.now() / 1000, size }
        : init;
    this.path = o.path;
    this.event = o.event;
    this.timestamp = o.timestamp ?? Date.now() / 1000;
    this.size = o.size ?? 0;
  }
}

export interface ScheduledTaskInit {
  name: string;
  interval_sec: number;
  callback: () => unknown;
  last_run?: number;
  enabled?: boolean;
  description?: string;
}

export class ScheduledTask {
  name: string;
  interval_sec: number;
  callback: () => unknown;
  last_run: number;
  enabled: boolean;
  description: string;

  constructor(
    init: ScheduledTaskInit | string,
    interval_sec?: number,
    callback?: () => unknown,
    last_run = 0.0,
    enabled = true,
    description = "",
  ) {
    const o: ScheduledTaskInit =
      typeof init === "string"
        ? {
            name: init,
            interval_sec: interval_sec ?? 0,
            callback: callback ?? (() => undefined),
            last_run,
            enabled,
            description,
          }
        : init;
    this.name = o.name;
    this.interval_sec = o.interval_sec;
    this.callback = o.callback;
    this.last_run = o.last_run ?? 0.0;
    this.enabled = o.enabled ?? true;
    this.description = o.description ?? "";
  }

  get intervalSec(): number {
    return this.interval_sec;
  }
  get lastRun(): number {
    return this.last_run;
  }
}

export interface DaemonEventInit {
  kind: string;
  payload: Record<string, unknown>;
  ts?: number;
}

export class DaemonEvent {
  kind: string;
  payload: Record<string, unknown>;
  ts: number;

  constructor(init: DaemonEventInit | string, payload?: Record<string, unknown>, ts?: number) {
    const o: DaemonEventInit =
      typeof init === "string"
        ? { kind: init, payload: payload ?? {}, ts }
        : init;
    this.kind = o.kind;
    this.payload = o.payload;
    this.ts = o.ts ?? Date.now() / 1000;
  }
}

/* ─── Event queue ───────────────────────────────────────────────────────────── */

/**
 * Bounded FIFO bridging the file watcher to the daemon loop.
 *
 * `AsyncQueue` (core/backend) supplies the async-iteration side; the extra
 * synchronous buffer exists because Python's `queue.Queue` offered
 * `get_nowait()`/`empty()` and the daemon's tick loop drains up to 20 events
 * without awaiting.
 */
export class EventQueue<T> implements AsyncIterable<T> {
  readonly maxsize: number;
  private readonly _async: AsyncQueue<T>;
  private readonly _buffer: T[] = [];

  constructor(maxsize = 0) {
    this.maxsize = maxsize;
    this._async = new AsyncQueue<T>();
  }

  put(item: T): void {
    if (this.maxsize > 0 && this._buffer.length >= this.maxsize) return; // drop, never block
    this._buffer.push(item);
    this._async.push(item);
  }

  put_nowait(item: T): void {
    this.put(item);
  }

  get_nowait(): T | undefined {
    return this._buffer.shift();
  }

  empty(): boolean {
    return this._buffer.length === 0;
  }

  get qsize(): number {
    return this._buffer.length;
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return this._async[Symbol.asyncIterator]();
  }
}

/* ─── Syntax sanity checks ──────────────────────────────────────────────────── */

export interface SyntaxIssue {
  error: string;
  line: number;
}

/**
 * Heuristic stand-in for Python's `compile(source, path, "exec")`.
 *
 * It catches unbalanced brackets, unterminated strings and (approximated)
 * triple-quoted strings — the failures that dominate "file saved, does it still
 * parse?" checks. It CANNOT detect real grammar errors (`def f(:` passes) and it
 * can be fooled by exotic literal shapes. `.js`/`.mjs`/`.cjs` files use the real
 * `node:vm` parser instead (`_jsSyntaxIssue`).
 */
export function _pySyntaxIssue(source: string): SyntaxIssue | null {
  const lines = source.split(/\r?\n/);
  const stack: Array<{ ch: string; line: number }> = [];
  const closerToOpener: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  let single: string | null = null;
  let triple: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (let j = 0; j < line.length; j++) {
      const ch = line[j]!;
      if (triple) {
        if (line.startsWith(triple, j)) {
          triple = null;
          j += 2;
        }
        continue;
      }
      if (single) {
        if (ch === "\\") {
          j++;
          continue;
        }
        if (ch === single) single = null;
        continue;
      }
      if (ch === "#") break;
      if ((ch === '"' || ch === "'") && line.startsWith(ch.repeat(3), j)) {
        triple = ch.repeat(3);
        j += 2;
        continue;
      }
      if (ch === '"' || ch === "'") {
        single = ch;
        continue;
      }
      if (ch === "(" || ch === "[" || ch === "{") {
        stack.push({ ch, line: i + 1 });
        continue;
      }
      if (ch === ")" || ch === "]" || ch === "}") {
        const top = stack.pop();
        if (!top || top.ch !== closerToOpener[ch]) {
          return { error: `unmatched '${ch}'`, line: i + 1 };
        }
      }
    }
  }
  if (triple) return { error: `unterminated ${triple} string`, line: lines.length };
  if (single) return { error: `unterminated ${single} string`, line: lines.length };
  const open = stack[stack.length - 1];
  if (open) return { error: `unclosed '${open.ch}'`, line: open.line };
  return null;
}

/** Real syntax check for JavaScript, via the V8 parser. */
export function _jsSyntaxIssue(source: string, filename = "file.js"): SyntaxIssue | null {
  try {
    new vm.Script(source, { filename });
    return null;
  } catch (e) {
    const err = e as Error & { lineNumber?: number };
    return { error: err.message, line: err.lineNumber ?? 0 };
  }
}

/* ─── File Watcher ───────────────────────────────────────────────────────────── */

/**
 * Watches a workspace directory for file changes using mtime polling.
 * No external deps (no watchdog needed).
 * Debounces rapid changes (e.g. editor writing temp files).
 */
export class FileWatcher {
  static readonly POLL_INTERVAL = 1.5; // seconds between polls
  static readonly DEBOUNCE_SEC = 2.0; // wait this long after last change before emitting
  static readonly MAX_FILES = 2000;
  static readonly SKIP_DIRS = new Set([
    ".git",
    "__pycache__",
    "node_modules",
    ".axoniz",
    "dist",
    "build",
    ".egg-info",
    "venv",
    "env",
    ".venv",
  ]);
  static readonly WATCH_EXTS = new Set([
    ".py",
    ".js",
    ".ts",
    ".json",
    ".yaml",
    ".yml",
    ".toml",
    ".md",
    ".txt",
    ".html",
    ".css",
  ]);

  workspace: string;
  queue: EventQueue<FileEvent>;
  _mtimes = new Map<string, number>();
  _pending = new Map<string, number>(); // path → time of last change
  _running = false;
  private _timer: NodeJS.Timeout | null = null;

  constructor(workspace: string, queue: EventQueue<FileEvent>) {
    this.workspace = path.resolve(workspace);
    this.queue = queue;
  }

  start(): void {
    this._running = true;
    // Initial scan (silent — don't emit for existing files)
    this._scan(false);
    this._timer = setInterval(() => {
      this._loop();
    }, FileWatcher.POLL_INTERVAL * 1000);
    // Python's thread was daemon=True: never block process exit.
    this._timer.unref?.();
    info(`[FileWatcher] Watching ${this.workspace}`);
  }

  stop(): void {
    this._running = false;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  private _loop(): void {
    if (!this._running) return;
    try {
      this._scan(true);
      this._flush_debounced();
    } catch (e) {
      debug(`[FileWatcher] scan error: ${errText(e)}`);
    }
  }

  _scan(emit: boolean): void {
    let count = 0;
    const walk = (dir: string): boolean => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return false;
      }
      for (const ent of entries) {
        if (ent.isDirectory()) {
          if (FileWatcher.SKIP_DIRS.has(ent.name)) continue;
          if (walk(path.join(dir, ent.name))) return true;
          continue;
        }
        if (!FileWatcher.WATCH_EXTS.has(path.extname(ent.name).toLowerCase())) continue;
        const fpath = path.join(dir, ent.name);
        count += 1;
        if (count > FileWatcher.MAX_FILES) return true;
        try {
          const mtime = fs.statSync(fpath).mtimeMs / 1000;
          const old = this._mtimes.get(fpath);
          if (old === undefined) {
            this._mtimes.set(fpath, mtime);
            if (emit) {
              this._pending.set(fpath, Date.now() / 1000);
            }
          } else if (mtime !== old) {
            this._mtimes.set(fpath, mtime);
            this._pending.set(fpath, Date.now() / 1000);
          }
        } catch {
          if (this._mtimes.has(fpath)) {
            this._mtimes.delete(fpath);
            if (emit) {
              this.queue.put(new FileEvent({ path: fpath, event: "deleted" }));
            }
          }
        }
      }
      return false;
    };
    walk(this.workspace);
  }

  _flush_debounced(): void {
    const now = Date.now() / 1000;
    const flush = [...this._pending.entries()]
      .filter(([, t]) => now - t >= FileWatcher.DEBOUNCE_SEC)
      .map(([p]) => p);
    for (const fpath of flush) {
      this._pending.delete(fpath);
      const event = this._mtimes.has(fpath) ? "modified" : "created";
      try {
        const size = fs.statSync(fpath).size;
        this.queue.put(new FileEvent({ path: fpath, event, size }));
      } catch {
        this.queue.put(new FileEvent({ path: fpath, event: "deleted" }));
      }
    }
  }
}

/* ─── Daemon Agent surface ───────────────────────────────────────────────────── */

export interface DaemonAgent {
  git_tools?: { status?(): unknown };
  gitTools?: { status?(): unknown };
  axodex?: { analyze?(): unknown; status?(): unknown };
  memory?: {
    palace?: {
      is_available?(): boolean;
      isAvailable?(): boolean;
      store?(...args: unknown[]): unknown;
    };
  };
}

/** Keyword-argument constructor form (the Python call sites use keywords). */
export interface AxonizDaemonInit {
  agent: DaemonAgent;
  workspace: string;
  on_event?: ((event: DaemonEvent) => unknown) | null;
}

/* ─── Daemon Loop ────────────────────────────────────────────────────────────── */

/**
 * Background daemon that watches files, runs scheduled tasks,
 * and reacts to events — all without user intervention.
 *
 * This is the OS layer. It's always running.
 */
export class axonizDaemon {
  static readonly DAEMON_STATE_PATH = path.join(AXONIZ_HOME, "daemon_state.json");

  agent: DaemonAgent;
  workspace: string;
  on_event: ((event: DaemonEvent) => unknown) | null;
  _queue: EventQueue<FileEvent>;
  _watcher: FileWatcher;
  _running = false;
  _event_log: DaemonEvent[] = [];
  _tasks: ScheduledTask[];
  _pending_lint = new Set<string>();
  private _timer: NodeJS.Timeout | null = null;
  private _vision_warned = false;

  constructor(
    agent: DaemonAgent,
    workspace: string,
    on_event?: ((event: DaemonEvent) => unknown) | null,
  );
  constructor(init: AxonizDaemonInit);
  constructor(
    a: AxonizDaemonInit | DaemonAgent,
    b?: string,
    c: ((event: DaemonEvent) => unknown) | null = null,
  ) {
    // Discriminate the options-object form from the positional (agent, workspace)
    // form: only the init object carries an `agent` key.
    const o: AxonizDaemonInit =
      b === undefined && a !== null && typeof a === "object" && "agent" in a
        ? (a as AxonizDaemonInit)
        : { agent: a as DaemonAgent, workspace: b ?? ".", on_event: c };

    this.agent = o.agent;
    this.workspace = path.resolve(o.workspace);
    this.on_event = o.on_event ?? null;

    this._queue = new EventQueue<FileEvent>(500);
    this._watcher = new FileWatcher(this.workspace, this._queue);

    // Scheduled tasks
    this._tasks = [
      new ScheduledTask({
        name: "lint_changed_files",
        interval_sec: 30,
        callback: () => this._task_lint_pending(),
        description: "Auto-lint Python files changed in last 30s",
      }),
      new ScheduledTask({
        name: "git_status_check",
        interval_sec: 120,
        callback: () => this._task_git_status(),
        description: "Check git status and warn about uncommitted changes",
      }),
      new ScheduledTask({
        name: "axodex_shadow_scan",
        interval_sec: 60,
        callback: () => this._task_axodex_refresh(),
        description: "Auto-refresh Axodex graph index on changes",
      }),
      new ScheduledTask({
        name: "axoniz_heartbeat",
        interval_sec: 300, // 5 minutes
        callback: () => this._task_axoniz_heartbeat(),
        description: "Proactive codebase health check and fix suggestion",
      }),
      new ScheduledTask({
        name: "vision_sentinel",
        interval_sec: 10, // 10 seconds
        callback: () => this._task_vision_sentinel(),
        description: "Monitor terminal for errors via screenshot/OCR",
      }),
      new ScheduledTask({
        name: "daily_audit",
        interval_sec: 86400, // 24h
        callback: () => this._task_daily_audit(),
        description: "Daily code quality audit",
      }),
    ];
  }

  /* ── Public API ──────────────────────────────────────────────────────────── */

  /** Start daemon in background thread. */
  start(): void {
    this._running = true;
    this._watcher.start();
    this._timer = setInterval(() => {
      this._loop();
    }, 1000);
    this._timer.unref?.();
    info(`[Daemon] Started | workspace=${this.workspace}`);
  }

  stop(): void {
    this._running = false;
    this._watcher.stop();
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    info("[Daemon] Stopped");
  }

  is_running(): boolean {
    return this._running;
  }

  /** camelCase alias. */
  isRunning(): boolean {
    return this._running;
  }

  /** Add a custom scheduled task. */
  add_task(task: ScheduledTask): void {
    this._tasks.push(task);
  }

  /** camelCase alias. */
  addTask(task: ScheduledTask): void {
    this.add_task(task);
  }

  remove_task(name: string): void {
    this._tasks = this._tasks.filter((t) => t.name !== name);
  }

  /** camelCase alias. */
  removeTask(name: string): void {
    this.remove_task(name);
  }

  get_recent_events(n = 20): DaemonEvent[] {
    return this._event_log.slice(-n);
  }

  /** camelCase alias. */
  getRecentEvents(n = 20): DaemonEvent[] {
    return this.get_recent_events(n);
  }

  status(): Record<string, unknown> {
    return {
      running: this._running,
      workspace: this.workspace,
      tasks: this._tasks.map((t) => ({ name: t.name, interval: t.interval_sec, enabled: t.enabled })),
      pending_lint: this._pending_lint.size,
      recent_events: this._event_log.length,
    };
  }

  /* ── Internal loop ───────────────────────────────────────────────────────── */

  private _loop(): void {
    if (!this._running) return;

    // 1. Process file events
    this._drain_queue();

    // 2. Run scheduled tasks that are due
    const now = Date.now() / 1000;
    for (const task of this._tasks) {
      if (!task.enabled) {
        continue;
      }
      if (now - task.last_run >= task.interval_sec) {
        try {
          const res = task.callback();
          task.last_run = now;
          // Async callbacks (the Node port of the Python callbacks) report
          // their failures out of band; the schedule is marked as run
          // immediately because unlike Python we cannot observe completion
          // synchronously.
          if (res && typeof (res as Promise<unknown>).then === "function") {
            void (res as Promise<unknown>).catch((e: unknown) => {
              error(`[Daemon] Task '${task.name}' failed: ${errText(e)}`);
            });
          }
        } catch (e) {
          error(`[Daemon] Task '${task.name}' failed: ${errText(e)}`);
        }
      }
    }
  }

  _drain_queue(): void {
    // Process all pending file events.
    let processed = 0;
    while (processed < 20) {
      // max 20 per tick to avoid blocking
      const event = this._queue.get_nowait();
      if (event === undefined) break;
      this._handle_event(event);
      processed += 1;
    }
  }

  /** React to a file change event. */
  _handle_event(event: FileEvent): void {
    const p = event.path;
    const ext = path.extname(p).toLowerCase();

    // Queue Python files for linting
    if (ext === ".py" && (event.event === "created" || event.event === "modified")) {
      this._pending_lint.add(p);
    }

    // Log the event
    const daemon_ev = new DaemonEvent({
      kind: "file_change",
      payload: { path: p, event: event.event, size: event.size },
    });
    this._event_log.push(daemon_ev);
    if (this._event_log.length > 500) {
      this._event_log = this._event_log.slice(-400);
    }

    this._emit(daemon_ev);

    debug(`[Daemon] ${event.event}: ${path.relative(this.workspace, p)}`);
  }

  private _emit(ev: DaemonEvent): void {
    if (!this.on_event) return;
    try {
      const res = this.on_event(ev);
      if (res && typeof (res as Promise<unknown>).then === "function") {
        void (res as Promise<unknown>).catch(() => undefined);
      }
    } catch {
      /* listener errors must not kill the daemon */
    }
  }

  /* ── Scheduled tasks ─────────────────────────────────────────────────────── */

  /** Lint all Python files that changed recently. */
  _task_lint_pending(): void {
    const pending = new Set(this._pending_lint);
    this._pending_lint.clear();

    if (pending.size === 0) {
      return;
    }

    const py_files = [...pending].filter((p) => p.endsWith(".py") && fs.existsSync(p));
    if (py_files.length === 0) {
      return;
    }

    info(`[Daemon] Auto-linting ${py_files.length} changed file(s)`);
    for (const fpath of py_files.slice(0, 5)) {
      // max 5 per cycle
      const rel = path.relative(this.workspace, fpath);
      try {
        const source = fs.readFileSync(fpath, "utf-8");
        const issue = _pySyntaxIssue(source);
        if (issue) {
          warn(`[Daemon] ✗ syntax error in ${rel}: ${issue.error} (line ${issue.line})`);
          const daemon_ev = new DaemonEvent({
            kind: "syntax_error",
            payload: { file: rel, error: issue.error, line: issue.line },
          });
          this._event_log.push(daemon_ev);
          this._emit(daemon_ev);
        } else {
          debug(`[Daemon] ✓ syntax OK: ${rel}`);
        }
      } catch {
        /* unreadable file — ignore, as Python did */
      }
    }
  }

  /** Check git status and emit events for uncommitted changes. */
  async _task_git_status(): Promise<void> {
    const gitTools = this.agent.git_tools ?? this.agent.gitTools;
    if (!gitTools || typeof gitTools.status !== "function") {
      return;
    }
    try {
      const status = String((await gitTools.status()) ?? "");
      if (status && status.trim() && !status.toLowerCase().includes("nothing to commit")) {
        const lines = status.split(/\r?\n/).filter((l) => l.trim());
        const changed_count = lines.length;
        if (changed_count > 0) {
          const ev = new DaemonEvent({
            kind: "git_uncommitted",
            payload: { count: changed_count, status: status.slice(0, 500) },
          });
          this._event_log.push(ev);
          this._emit(ev);
          debug(`[Daemon] ${changed_count} uncommitted file(s)`);
        }
      }
    } catch {
      /* git unavailable — silent, exactly like Python */
    }
  }

  /** Daily code quality check — runs lint on all Python files. */
  async _task_daily_audit(): Promise<void> {
    info("[Daemon] Running daily code audit");
    try {
      const py_files: string[] = [];
      const skip = new Set([".git", "__pycache__", "node_modules", ".axoniz"]);
      const walk = (dir: string): void => {
        let entries: fs.Dirent[];
        try {
          entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const ent of entries) {
          if (ent.isDirectory()) {
            if (skip.has(ent.name)) continue;
            walk(path.join(dir, ent.name));
          } else if (ent.name.endsWith(".py")) {
            py_files.push(path.join(dir, ent.name));
          }
        }
      };
      walk(this.workspace);

      const errors_found: Array<{ file: string; error: string }> = [];
      for (const fpath of py_files.slice(0, 50)) {
        try {
          const source = fs.readFileSync(fpath, "utf-8");
          const issue = _pySyntaxIssue(source);
          if (issue) errors_found.push({ file: fpath, error: `${issue.error} (line ${issue.line})` });
        } catch {
          /* unreadable — skip */
        }
      }

      const ev = new DaemonEvent({
        kind: "daily_audit",
        payload: {
          files_checked: py_files.slice(0, 50).length,
          syntax_errors: errors_found.length,
          errors: errors_found.slice(0, 10),
        },
      });
      this._event_log.push(ev);
      this._emit(ev);

      // Store audit results in palace
      const palace = this.agent.memory?.palace;
      const available = Boolean(
        palace && ((palace.is_available?.() ?? false) || (palace.isAvailable?.() ?? false)),
      );
      if (palace && available && typeof palace.store === "function") {
        const store = palace.store as (...a: unknown[]) => unknown;
        const content = `Audit ${_localDate()}: ${py_files.length} files, ${errors_found.length} errors`;
        try {
          // Python called this with keywords; the surrounding Node ports take
          // positional arguments, so try positional first and fall back to the
          // keyword-object form.
          try {
            await store("wing_axoniz", "daily-audits", content, "daemon");
          } catch (e) {
            if (!(e instanceof TypeError)) throw e;
            await store({
              wing: "wing_axoniz",
              room: "daily-audits",
              content,
              added_by: "daemon",
            });
          }
        } catch (e) {
          debug(`[Daemon] Palace store failed: ${errText(e)}`);
        }
      }

      info(
        `[Daemon] Daily audit: ${py_files.slice(0, 50).length} files checked, ` +
          `${errors_found.length} syntax errors`,
      );
    } catch (e) {
      error(`[Daemon] Daily audit failed: ${errText(e)}`);
    }
  }

  /** Background Axodex refresh. */
  async _task_axodex_refresh(): Promise<void> {
    if (!this.agent.axodex) return;
    // Only refresh if there are uncommitted changes or recent file events
    if (this._event_log.length > 0) {
      const last_ev = this._event_log[this._event_log.length - 1]!;
      if (Date.now() / 1000 - last_ev.ts < 60) {
        debug("[Daemon] Triggering Axodex shadow scan...");
        try {
          await this.agent.axodex.analyze?.();
        } catch (e) {
          debug(`[Daemon] Axodex refresh failed: ${errText(e)}`);
        }
      }
    }
  }

  /** Proactive codebase health check and fix suggestion. */
  async _task_axoniz_heartbeat(): Promise<void> {
    if (!this.agent.axodex) return;

    info("[Daemon] Axoniz Heartbeat: Scanning for architectural weaknesses...");
    try {
      // 1. Check for stale index
      const status = String((await this.agent.axodex.status?.()) ?? "");
      if (status.toLowerCase().includes("stale")) {
        await this.agent.axodex.analyze?.();
      }

      // 2. Proactively look for syntax errors in the last edited files
      // This is already handled by _task_lint_pending, but we can add more logic here.

      // 3. Emit a heartbeat event
      const ev = new DaemonEvent({
        kind: "axoniz_heartbeat",
        payload: { status: "healthy", scanned_at: new Date().toISOString() },
      });
      this._event_log.push(ev);
      this._emit(ev);
    } catch (e) {
      error(`[Daemon] Heartbeat failed: ${errText(e)}`);
    }
  }

  /**
   * Monitor terminal/screen for errors via OCR.
   *
   * FIDELITY LOSS: Python used `pyautogui.screenshot()` + `pytesseract` to read
   * the screen and look for critical fail markers. No OCR engine is available in
   * the Node dependency set (and `screenshot-desktop` alone cannot read text), so
   * the sentinel keeps its schedule + guard but cannot perform detection. It
   * warns once per process and then stays silent.
   */
  async _task_vision_sentinel(): Promise<void> {
    if (process.env.AXONIZ_DISABLE_VISION) {
      return;
    }
    if (!this._vision_warned) {
      this._vision_warned = true;
      warn(
        "[Vision] OCR-based visual error detection is unavailable in the Node port (no tesseract) — sentinel idle.",
      );
    }
  }

  /** Persist daemon state for restart. */
  save_state(): void {
    const state = {
      workspace: this.workspace,
      last_run: Object.fromEntries(this._tasks.map((t) => [t.name, t.last_run])),
      saved_at: Date.now() / 1000,
    };
    try {
      fs.mkdirSync(path.dirname(axonizDaemon.DAEMON_STATE_PATH), { recursive: true });
      fs.writeFileSync(axonizDaemon.DAEMON_STATE_PATH, JSON.stringify(state, null, 2), "utf-8");
    } catch {
      /* best effort, mirrors Python's bare except */
    }
  }

  /** camelCase alias. */
  saveState(): void {
    this.save_state();
  }

  /** Restore task last_run times from previous session. */
  load_state(): void {
    try {
      if (!fs.existsSync(axonizDaemon.DAEMON_STATE_PATH)) return;
      const raw = JSON.parse(fs.readFileSync(axonizDaemon.DAEMON_STATE_PATH, "utf-8")) as {
        last_run?: Record<string, number>;
      };
      const last_run = raw.last_run ?? {};
      for (const task of this._tasks) {
        if (task.name in last_run) {
          task.last_run = Number(last_run[task.name]);
        }
      }
    } catch {
      /* corrupt state — ignore, as Python did */
    }
  }

  /** camelCase alias. */
  loadState(): void {
    this.load_state();
  }
}

/** Python's `datetime.now().strftime('%Y-%m-%d')` — local date, not UTC. */
function _localDate(d = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
