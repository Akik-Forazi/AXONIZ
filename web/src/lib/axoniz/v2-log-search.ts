/**
 * v2 log search — SQLite index for fast log searching.
 *
 * The JSONL log files are great for append-only writes, but searching
 * across days/projects requires reading every file. This module
 * maintains a SQLite index that allows fast filtering by:
 *   - text search (LIKE on message)
 *   - level (info/warn/error)
 *   - workflowId
 *   - projectId
 *   - tool
 *   - event
 *   - time range
 *
 * Database: ~/.axoniz/db/logsearch.sqlite
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DatabaseSync } from "node:sqlite";
import type { LogEntry } from "./v2-schemas";

const DB_PATH = path.join(os.homedir(), ".axoniz", "db", "logsearch.sqlite");

let db: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (db) return db;
  const dir = path.dirname(DB_PATH);
  fs.mkdirSync(dir, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS logs (
      ts INTEGER NOT NULL,
      level TEXT NOT NULL,
      workflow_id TEXT,
      project_id TEXT,
      run_id TEXT NOT NULL,
      step_id TEXT,
      tool TEXT,
      event TEXT NOT NULL,
      message TEXT NOT NULL,
      duration_ms INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs(ts);
    CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);
    CREATE INDEX IF NOT EXISTS idx_logs_workflow ON logs(workflow_id);
    CREATE INDEX IF NOT EXISTS idx_logs_project ON logs(project_id);
    CREATE INDEX IF NOT EXISTS idx_logs_tool ON logs(tool);
    CREATE INDEX IF NOT EXISTS idx_logs_event ON logs(event);
  `);
  return db;
}

/** Index a log entry in SQLite (fast, non-blocking). */
export function indexLog(entry: LogEntry): void {
  try {
    const d = getDb();
    d.prepare(`
      INSERT INTO logs (ts, level, workflow_id, project_id, run_id, step_id, tool, event, message, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.ts, entry.level, entry.workflowId, entry.projectId,
      entry.runId, entry.stepId, entry.tool, entry.event,
      entry.message, entry.durationMs ?? null
    );
  } catch (e) {
    // Don't fail the workflow if logging fails
    console.warn("[log-search] index failed:", e instanceof Error ? e.message : String(e));
  }
}

/** Search logs with filters. Returns matching entries. */
export function searchLogs(filters: {
  query?: string;
  level?: string;
  workflowId?: string;
  projectId?: string;
  tool?: string;
  event?: string;
  since?: number;
  limit?: number;
}): LogEntry[] {
  const d = getDb();
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters.query) {
    conditions.push("message LIKE ?");
    params.push(`%${filters.query}%`);
  }
  if (filters.level) {
    conditions.push("level = ?");
    params.push(filters.level);
  }
  if (filters.workflowId) {
    conditions.push("workflow_id = ?");
    params.push(filters.workflowId);
  }
  if (filters.projectId) {
    conditions.push("project_id = ?");
    params.push(filters.projectId);
  }
  if (filters.tool) {
    conditions.push("tool = ?");
    params.push(filters.tool);
  }
  if (filters.event) {
    conditions.push("event = ?");
    params.push(filters.event);
  }
  if (filters.since) {
    conditions.push("ts >= ?");
    params.push(filters.since);
  }

  const where = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";
  const limit = filters.limit ?? 100;
  const sql = `SELECT * FROM logs${where} ORDER BY ts DESC LIMIT ${limit}`;

  const rows = d.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  return rows.map(r => ({
    ts: r.ts as number,
    level: r.level as LogEntry["level"],
    workflowId: (r.workflow_id as string) ?? null,
    projectId: (r.project_id as string) ?? null,
    runId: r.run_id as string,
    stepId: (r.step_id as string) ?? null,
    tool: (r.tool as string) ?? null,
    event: r.event as LogEntry["event"],
    message: r.message as string,
    durationMs: (r.duration_ms as number) ?? undefined,
  }));
}

/** Get log statistics (counts by level, event, tool). */
export function getLogStats(): {
  total: number;
  byLevel: Record<string, number>;
  byEvent: Record<string, number>;
  byTool: Record<string, number>;
} {
  const d = getDb();
  const total = (d.prepare("SELECT COUNT(*) as count FROM logs").get() as { count: number }).count;
  const byLevelRows = d.prepare("SELECT level, COUNT(*) as count FROM logs GROUP BY level").all() as Array<{level: string; count: number}>;
  const byEventRows = d.prepare("SELECT event, COUNT(*) as count FROM logs GROUP BY event").all() as Array<{event: string; count: number}>;
  const byToolRows = d.prepare("SELECT tool, COUNT(*) as count FROM logs WHERE tool IS NOT NULL GROUP BY tool").all() as Array<{tool: string; count: number}>;

  return {
    total,
    byLevel: Object.fromEntries(byLevelRows.map(r => [r.level, r.count])),
    byEvent: Object.fromEntries(byEventRows.map(r => [r.event, r.count])),
    byTool: Object.fromEntries(byToolRows.map(r => [r.tool, r.count])),
  };
}
