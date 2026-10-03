/**
 * axoniz.core.intelligence.trajectory
 * =====================================
 * Trajectory Memory — Phase 1 of the AXONIZ dominance plan.
 *
 * Every tool call the agent makes — with its arguments, result, and outcome —
 * is recorded as a trajectory entry. Over time this becomes the agent's
 * experiential memory: it knows what worked, what failed, and why.
 *
 * Unlike conversation history (which is prompt text), trajectory is structured
 * behavioral data that the agent and planner can query programmatically.
 *
 * Storage: SQLite at ~/.axoniz/trajectory.db
 * WAL mode — safe for concurrent reads while agent is writing.
 *
 * Key capabilities:
 *   - Record every tool call (name, args, result, success, duration)
 *   - Tag entries by task/session
 *   - Query: "what happened last time I ran shell_python on this file?"
 *   - Pattern detection: which tools fail most? which file paths cause loops?
 *   - Export as context block for injection into agent's system prompt
 *
 * Port notes (Python → Node):
 *   - `sqlite3` → Node 24's built-in `node:sqlite` (`DatabaseSync`). Statements
 *     are prepared per call, exactly like the Python `conn.execute(...)` usage.
 *   - `threading.Lock` is dropped: Node runs this module on a single thread, so
 *     the lock Python used to serialize `_conn` access has no analogue here.
 *   - `time.time()` (float seconds) → `Date.now() / 1000`.
 *   - SQLite cannot bind `undefined`/booleans directly, so `_bind()` coerces
 *     every parameter the way Python's sqlite3 adapter does implicitly.
 */

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import { AXONIZ_HOME } from "../config.js";

export const TRAJECTORY_DB = path.join(AXONIZ_HOME, "trajectory.db");

/* ── Schema ───────────────────────────────────────────────────────────────── */

const _SCHEMA = `
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    task        TEXT,
    workspace   TEXT,
    started_at  REAL NOT NULL,
    ended_at    REAL,
    outcome     TEXT,
    total_steps INTEGER DEFAULT 0,
    total_tools INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS steps (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  TEXT NOT NULL REFERENCES sessions(id),
    step_num    INTEGER NOT NULL,
    tool_name   TEXT NOT NULL,
    args_json   TEXT,
    result_head TEXT,
    success     INTEGER DEFAULT 1,
    duration_ms INTEGER,
    ts          REAL NOT NULL,
    notes       TEXT
);

CREATE INDEX IF NOT EXISTS idx_steps_session  ON steps(session_id);
CREATE INDEX IF NOT EXISTS idx_steps_tool     ON steps(tool_name);
CREATE INDEX IF NOT EXISTS idx_steps_ts       ON steps(ts);
`;

/* ── Helpers ──────────────────────────────────────────────────────────────── */

/** A row as returned by `node:sqlite` (null-prototype object) widened to a plain record. */
export type TrajectoryRow = Record<string, unknown>;

/** Seconds since the epoch, matching Python's `time.time()`. */
export function nowSeconds(): number {
  return Date.now() / 1000;
}

/** Coerce a JS value into something `node:sqlite` can bind. */
function _bind(v: unknown): SQLInputValue {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "bigint" || typeof v === "string") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v instanceof Uint8Array) return v;
  if (v instanceof Date) return v.toISOString();
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function _rows(rows: Array<Record<string, SQLInputValue>>): TrajectoryRow[] {
  return rows.map((r) => ({ ...r }) as TrajectoryRow);
}

/**
 * `json.dumps(args, ensure_ascii=False, default=str)[:2000]`.
 * `ensure_ascii=False` is JSON.stringify's default behaviour; `default=str` is
 * emulated with a replacer that stringifies anything JSON cannot represent.
 */
export function dumpArgs(args: unknown, limit = 2000): string {
  let out: string;
  try {
    const dumped = JSON.stringify(args, (_k, v: unknown) => {
      if (typeof v === "bigint") return v.toString();
      if (typeof v === "function") return String(v);
      if (typeof v === "undefined") return null;
      return v;
    }) as string | undefined;
    out = dumped === undefined ? "null" : dumped;
  } catch {
    out = String(args);
  }
  return out.slice(0, limit);
}

function _num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/* ── TrajectoryStore ──────────────────────────────────────────────────────── */

/** Keyword-argument form of `TrajectoryStore.record_step()` (Python's `**kwargs`). */
export interface RecordStepArgs {
  session_id: string;
  step_num: number;
  tool_name: string;
  args: Record<string, unknown>;
  result: string;
  success?: boolean;
  duration_ms?: number;
  notes?: string;
}

/**
 * Persistent behavioral memory for the agent.
 * Thread-safe in Python; single-threaded by construction in Node.
 */
export class TrajectoryStore {
  readonly db_path: string;
  private readonly _conn: DatabaseSync;

  constructor(db_path: string = TRAJECTORY_DB) {
    this.db_path = db_path;
    try {
      fs.mkdirSync(path.dirname(db_path), { recursive: true });
    } catch {
      /* mirrors Python's makedirs(exist_ok=True) best-effort behaviour */
    }
    // Python used `timeout=5.0` for the SQLite busy handler.
    this._conn = new DatabaseSync(db_path, { timeout: 5000 });
    this._init();
  }

  get dbPath(): string {
    return this.db_path;
  }

  _init(): void {
    this._conn.exec(_SCHEMA);
  }

  /* ── Session ────────────────────────────────────────────────────────────── */

  begin_session(task: string, workspace = ""): string {
    const sid = `traj_${Date.now()}`;
    this._conn
      .prepare("INSERT INTO sessions(id,task,workspace,started_at) VALUES(?,?,?,?)")
      .run(sid, task.slice(0, 500), workspace, nowSeconds());
    return sid;
  }

  end_session(session_id: string, outcome = ""): void {
    this._conn
      .prepare("UPDATE sessions SET ended_at=?, outcome=? WHERE id=?")
      .run(nowSeconds(), outcome.slice(0, 500), session_id);
  }

  /* ── Steps ──────────────────────────────────────────────────────────────── */

  /**
   * Record a single tool call.
   *
   * Accepts either Python's positional argument list or a single options object
   * (`{ session_id, step_num, tool_name, args, result, success, duration_ms,
   * notes }`), because the surrounding Node ports call it with keywords.
   */
  record_step(init: RecordStepArgs): void;
  record_step(
    session_id: string,
    step_num: number,
    tool_name: string,
    args: Record<string, unknown>,
    result: string,
    success?: boolean,
    duration_ms?: number,
    notes?: string,
  ): void;
  record_step(
    a: RecordStepArgs | string,
    step_num = 0,
    tool_name = "",
    args: Record<string, unknown> = {},
    result = "",
    success = true,
    duration_ms = 0,
    notes = "",
  ): void {
    const o: RecordStepArgs =
      typeof a === "string"
        ? { session_id: a, step_num, tool_name, args, result, success, duration_ms, notes }
        : a;
    const args_json = dumpArgs(o.args ?? {});
    const result_head = o.result ? o.result.slice(0, 500) : "";
    this._conn
      .prepare(
        `INSERT INTO steps
           (session_id,step_num,tool_name,args_json,result_head,success,duration_ms,ts,notes)
           VALUES(?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        o.session_id,
        _bind(o.step_num),
        o.tool_name,
        args_json,
        result_head,
        (o.success ?? true) ? 1 : 0,
        _bind(o.duration_ms ?? 0),
        nowSeconds(),
        String(o.notes ?? "").slice(0, 300),
      );
    this._conn
      .prepare("UPDATE sessions SET total_steps=total_steps+1, total_tools=total_tools+1 WHERE id=?")
      .run(o.session_id);
  }

  /* ── Queries ────────────────────────────────────────────────────────────── */

  get_session_steps(session_id: string): TrajectoryRow[] {
    const rows = this._conn
      .prepare("SELECT * FROM steps WHERE session_id=? ORDER BY step_num")
      .all(session_id);
    return _rows(rows);
  }

  /** Return recent failed steps, optionally filtered by tool. */
  recent_failures(tool_name: string | null = null, limit = 10): TrajectoryRow[] {
    const rows = tool_name
      ? this._conn
          .prepare("SELECT * FROM steps WHERE success=0 AND tool_name=? ORDER BY ts DESC LIMIT ?")
          .all(tool_name, _bind(limit))
      : this._conn
          .prepare("SELECT * FROM steps WHERE success=0 ORDER BY ts DESC LIMIT ?")
          .all(_bind(limit));
    return _rows(rows);
  }

  /** Per-tool success/failure counts. */
  tool_stats(): TrajectoryRow[] {
    const rows = this._conn
      .prepare(
        `SELECT tool_name,
                COUNT(*) as total,
                SUM(success) as successes,
                COUNT(*)-SUM(success) as failures,
                AVG(duration_ms) as avg_ms
         FROM steps GROUP BY tool_name ORDER BY total DESC`,
      )
      .all();
    return _rows(rows);
  }

  /** Detect tool+args combinations called 3+ times in one session (loop detection). */
  repeated_args(session_id: string, threshold = 3): TrajectoryRow[] {
    const rows = this._conn
      .prepare(
        `SELECT tool_name, args_json, COUNT(*) as cnt
         FROM steps WHERE session_id=?
         GROUP BY tool_name, args_json
         HAVING cnt >= ?`,
      )
      .all(session_id, _bind(threshold));
    return _rows(rows);
  }

  /** Find past sessions with similar task descriptions (simple keyword match). */
  similar_tasks(query: string, limit = 5): TrajectoryRow[] {
    const words = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 0 && w.length > 3)
      .slice(0, 5);
    if (words.length === 0) return [];
    const like_clauses = words.map(() => "LOWER(task) LIKE ?").join(" OR ");
    const params: SQLInputValue[] = words.map((w) => `%${w}%`);
    params.push(_bind(limit));
    const rows = this._conn
      .prepare(`SELECT * FROM sessions WHERE ${like_clauses} ORDER BY started_at DESC LIMIT ?`)
      .all(...params);
    return _rows(rows);
  }

  /**
   * Build a compact context block for injection into the agent's prompt.
   * Shows: tool stats, recent failures, any detected loops.
   */
  context_block(session_id: string | null = null, max_chars = 600): string {
    const lines: string[] = [];

    // Tool stats (top 5 most used)
    const stats = this.tool_stats();
    if (stats.length > 0) {
      lines.push("[TRAJECTORY — tool usage this project]");
      for (const s of stats.slice(0, 5)) {
        const total = _num(s["total"]);
        const failures = _num(s["failures"]);
        const avg = s["avg_ms"];
        const fail_pct = Math.trunc((100 * failures) / Math.max(total, 1));
        lines.push(
          `  ${String(s["tool_name"])}: ${total} calls, ${fail_pct}% fail` +
            (avg ? `, avg ${Math.trunc(_num(avg))}ms` : ""),
        );
      }
    }

    // Session-level loop detection
    if (session_id) {
      const loops = this.repeated_args(session_id, 3);
      if (loops.length > 0) {
        lines.push("[WARNING — potential loops detected in this session]");
        for (const lp of loops.slice(0, 3)) {
          lines.push(`  ${String(lp["tool_name"])} called ${_num(lp["cnt"])}x with same args`);
        }
      }
    }

    const result = lines.join("\n");
    return result ? result.slice(0, max_chars) : "";
  }

  /** Export full session as a dict (for palace storage). */
  export_session(session_id: string): TrajectoryRow {
    const sess = this._conn.prepare("SELECT * FROM sessions WHERE id=?").get(session_id);
    if (!sess) return {};
    const steps = this.get_session_steps(session_id);
    return { ...(sess as TrajectoryRow), steps };
  }

  /** Close the underlying handle (Node has no GC-driven connection teardown). */
  close(): void {
    try {
      this._conn.close();
    } catch {
      /* already closed */
    }
  }

  /* ── camelCase aliases ──────────────────────────────────────────────────── */

  beginSession(task: string, workspace = ""): string {
    return this.begin_session(task, workspace);
  }
  endSession(session_id: string, outcome = ""): void {
    this.end_session(session_id, outcome);
  }
  recordStep(
    session_id: string,
    step_num: number,
    tool_name: string,
    args: Record<string, unknown>,
    result: string,
    success?: boolean,
    duration_ms?: number,
    notes?: string,
  ): void;
  recordStep(init: RecordStepArgs): void;
  recordStep(
    a: RecordStepArgs | string,
    step_num = 0,
    tool_name = "",
    args: Record<string, unknown> = {},
    result = "",
    success = true,
    duration_ms = 0,
    notes = "",
  ): void {
    if (typeof a === "string") {
      this.record_step(a, step_num, tool_name, args, result, success, duration_ms, notes);
    } else {
      this.record_step(a);
    }
  }
  getSessionSteps(session_id: string): TrajectoryRow[] {
    return this.get_session_steps(session_id);
  }
  recentFailures(tool_name: string | null = null, limit = 10): TrajectoryRow[] {
    return this.recent_failures(tool_name, limit);
  }
  toolStats(): TrajectoryRow[] {
    return this.tool_stats();
  }
  repeatedArgs(session_id: string, threshold = 3): TrajectoryRow[] {
    return this.repeated_args(session_id, threshold);
  }
  similarTasks(query: string, limit = 5): TrajectoryRow[] {
    return this.similar_tasks(query, limit);
  }
  contextBlock(session_id: string | null = null, max_chars = 600): string {
    return this.context_block(session_id, max_chars);
  }
  exportSession(session_id: string): TrajectoryRow {
    return this.export_session(session_id);
  }
}

/* ── Module-level singleton ───────────────────────────────────────────────── */

let _store: TrajectoryStore | null = null;

export function get_store(): TrajectoryStore {
  if (_store === null) _store = new TrajectoryStore();
  return _store;
}

export function getStore(): TrajectoryStore {
  return get_store();
}
