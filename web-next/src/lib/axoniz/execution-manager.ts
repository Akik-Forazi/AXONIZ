/**
 * Durable Execution Manager — owns task lifetime independently of
 * browser connections, HTTP requests, and SSE streams.
 *
 * SQLite database at ~/.axoniz/db/executions.db
 *
 * Tables:
 *   executions — one row per chat/agent task
 *   events     — ordered event journal (tokens, tool calls, etc.)
 *
 * State machine:
 *   queued → running → completed
 *                   → failed
 *                   → cancelled
 *   running → cancel_requested → cancelled
 *   any → interrupted (process crash)
 *   interrupted → recovery_required
 *
 * Both chat and agent modes share this lifecycle. Agent-specific
 * tool-call state is stored in the events table with type='tool_call'
 * and type='tool_result'.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";

// ── Database setup ─────────────────────────────────────────────────────────

function getDbPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  const dir = path.join(home, ".axoniz", "db");
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
  return path.join(dir, "executions.db");
}

let dbInstance: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(getDbPath());
    // WAL mode for better concurrent read/write performance
    dbInstance.exec("PRAGMA journal_mode=WAL");
    dbInstance.exec("PRAGMA synchronous=NORMAL");
    // Create tables
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS executions (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'chat',
        state TEXT NOT NULL DEFAULT 'queued',
        prompt TEXT NOT NULL,
        provider TEXT,
        model TEXT,
        output TEXT DEFAULT '',
        error TEXT,
        cancel_requested INTEGER DEFAULT 0,
        created_at REAL NOT NULL,
        started_at REAL,
        updated_at REAL,
        completed_at REAL,
        owner TEXT DEFAULT 'anon',
        recovery_note TEXT
      );

      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        execution_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        type TEXT NOT NULL,
        data TEXT NOT NULL DEFAULT '{}',
        ts REAL NOT NULL,
        UNIQUE(execution_id, seq),
        FOREIGN KEY (execution_id) REFERENCES executions(id)
      );

      CREATE INDEX IF NOT EXISTS idx_events_exec ON events(execution_id, seq);
      CREATE INDEX IF NOT EXISTS idx_exec_state ON executions(state);
      CREATE INDEX IF NOT EXISTS idx_exec_session ON executions(session_id);
    `);
  }
  return dbInstance;
}

// ── Types ──────────────────────────────────────────────────────────────────

export type ExecutionState =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancel_requested"
  | "cancelled"
  | "interrupted"
  | "recovery_required";

export type ExecutionMode = "chat" | "agent";

export interface Execution {
  id: string;
  session_id: string;
  mode: ExecutionMode;
  state: ExecutionState;
  prompt: string;
  provider?: string;
  model?: string;
  output: string;
  error?: string;
  cancel_requested: boolean;
  created_at: number;
  started_at?: number;
  updated_at?: number;
  completed_at?: number;
  owner: string;
  recovery_note?: string;
}

export interface ExecutionEvent {
  id: number;
  execution_id: string;
  seq: number;
  type: string;
  data: Record<string, unknown>;
  ts: number;
}

// ── ID generation ─────────────────────────────────────────────────────────

function genId(): string {
  return randomBytes(8).toString("hex");
}

// ── Core operations ────────────────────────────────────────────────────────

/** Submit a new execution. Returns the execution record. */
export function submitExecution(opts: {
  session_id: string;
  mode: ExecutionMode;
  prompt: string;
  provider?: string;
  model?: string;
  owner?: string;
}): Execution {
  const db = getDb();
  const id = genId();
  const now = Date.now() / 1000;
  db.prepare(`
    INSERT INTO executions (id, session_id, mode, state, prompt, provider, model, created_at, owner)
    VALUES (?, ?, ?, 'queued', ?, ?, ?, ?, ?)
  `).run(id, opts.session_id, opts.mode, opts.prompt, opts.provider ?? null, opts.model ?? null, now, opts.owner ?? "anon");
  return getExecution(id)!;
}

/** Get an execution by ID. */
export function getExecution(id: string): Execution | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM executions WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return rowToExecution(row);
}

/** Transition an execution to a new state. */
export function transitionState(id: string, newState: ExecutionState, extra?: { output?: string; error?: string; recovery_note?: string }): void {
  const db = getDb();
  const now = Date.now() / 1000;
  const sets: string[] = ["state = ?", "updated_at = ?"];
  const vals: unknown[] = [newState, now];
  if (extra?.output !== undefined) { sets.push("output = ?"); vals.push(extra.output); }
  if (extra?.error !== undefined) { sets.push("error = ?"); vals.push(extra.error); }
  if (extra?.recovery_note !== undefined) { sets.push("recovery_note = ?"); vals.push(extra.recovery_note); }
  if (newState === "running" ) { sets.push("started_at = ?"); vals.push(now); }
  if (newState === "completed" || newState === "failed" || newState === "cancelled") {
    sets.push("completed_at = ?"); vals.push(now);
  }
  vals.push(id);
  db.prepare(`UPDATE executions SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
}

/** Request cancellation. Does not immediately cancel — sets cancel_requested. */
export function requestCancellation(id: string): void {
  const db = getDb();
  const now = Date.now() / 1000;
  db.prepare("UPDATE executions SET cancel_requested = 1, state = 'cancel_requested', updated_at = ? WHERE id = ?").run(now, id);
}

/** Check if cancellation was requested. */
export function isCancellationRequested(id: string): boolean {
  const db = getDb();
  const row = db.prepare("SELECT cancel_requested FROM executions WHERE id = ?").get(id) as { cancel_requested: number } | undefined;
  return row?.cancel_requested === 1;
}

/** Append an event to the journal. Returns the event with sequence number. */
export function appendEvent(executionId: string, type: string, data: Record<string, unknown>): ExecutionEvent {
  const db = getDb();
  const ts = Date.now() / 1000;
  // Get next sequence number
  const maxSeq = db.prepare("SELECT MAX(seq) as max_seq FROM events WHERE execution_id = ?").get(executionId) as { max_seq: number | null } | undefined;
  const seq = (maxSeq?.max_seq ?? 0) + 1;
  const dataStr = JSON.stringify(data);
  const result = db.prepare("INSERT INTO events (execution_id, seq, type, data, ts) VALUES (?, ?, ?, ?, ?)").run(executionId, seq, type, dataStr, ts);
  return {
    id: Number(result.lastInsertRowid),
    execution_id: executionId,
    seq,
    type,
    data,
    ts,
  };
}

/** Append a token to the output AND to the event journal atomically. */
export function appendToken(executionId: string, token: string): void {
  const db = getDb();
  const ts = Date.now() / 1000;
  // Use a transaction: append to output + insert event
  db.exec("BEGIN");
  try {
    db.prepare("UPDATE executions SET output = output || ?, updated_at = ? WHERE id = ?").run(token, ts, executionId);
    const maxSeq = db.prepare("SELECT MAX(seq) as max_seq FROM events WHERE execution_id = ?").get(executionId) as { max_seq: number | null } | undefined;
    const seq = (maxSeq?.max_seq ?? 0) + 1;
    db.prepare("INSERT INTO events (execution_id, seq, type, data, ts) VALUES (?, ?, 'token', ?, ?)").run(executionId, seq, JSON.stringify({ value: token }), ts);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

/** Get all events for an execution, optionally since a sequence number. */
export function getEvents(executionId: string, sinceSeq?: number): ExecutionEvent[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM events WHERE execution_id = ? AND seq > ? ORDER BY seq ASC").all(executionId, sinceSeq ?? 0) as Array<Record<string, unknown>>;
  return rows.map(rowToEvent);
}

/** List executions for a session. */
export function listExecutions(sessionId: string): Execution[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM executions WHERE session_id = ? ORDER BY created_at DESC").all(sessionId) as Array<Record<string, unknown>>;
  return rows.map(rowToExecution);
}

/** Find non-terminal executions (for crash recovery). */
export function findNonTerminalExecutions(): Execution[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM executions WHERE state IN ('queued', 'running', 'cancel_requested') ORDER BY created_at ASC").all() as Array<Record<string, unknown>>;
  return rows.map(rowToExecution);
}

/** Mark all non-terminal executions as interrupted (called on startup). */
export function markInterruptedOnStartup(): number {
  const db = getDb();
  const result = db.prepare("UPDATE executions SET state = 'interrupted', recovery_note = 'Process restarted while execution was non-terminal' WHERE state IN ('queued', 'running', 'cancel_requested')").run();
  return Number(result.changes);
}

// ── Row mappers ────────────────────────────────────────────────────────────

function rowToExecution(row: Record<string, unknown>): Execution {
  return {
    id: String(row.id),
    session_id: String(row.session_id),
    mode: String(row.mode) as ExecutionMode,
    state: String(row.state) as ExecutionState,
    prompt: String(row.prompt ?? ""),
    provider: row.provider ? String(row.provider) : undefined,
    model: row.model ? String(row.model) : undefined,
    output: String(row.output ?? ""),
    error: row.error ? String(row.error) : undefined,
    cancel_requested: Number(row.cancel_requested) === 1,
    created_at: Number(row.created_at),
    started_at: row.started_at ? Number(row.started_at) : undefined,
    updated_at: row.updated_at ? Number(row.updated_at) : undefined,
    completed_at: row.completed_at ? Number(row.completed_at) : undefined,
    owner: String(row.owner ?? "anon"),
    recovery_note: row.recovery_note ? String(row.recovery_note) : undefined,
  };
}

function rowToEvent(row: Record<string, unknown>): ExecutionEvent {
  return {
    id: Number(row.id),
    execution_id: String(row.execution_id),
    seq: Number(row.seq),
    type: String(row.type),
    data: JSON.parse(String(row.data ?? "{}")) as Record<string, unknown>,
    ts: Number(row.ts),
  };
}

// ── Startup recovery ───────────────────────────────────────────────────────

/**
 * Called when the web server starts. Finds interrupted executions and
 * marks them for recovery. Does NOT automatically resume — the user
 * must explicitly retry.
 */
export function recoverOnStartup(): { interrupted: number; recovered: Execution[] } {
  const interrupted = markInterruptedOnStartup();
  const recovered = findNonTerminalExecutions(); // now they're all 'interrupted'
  return { interrupted, recovered };
}
