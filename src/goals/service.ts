/**
 * AXONIZ-ZERO · AXONIZ Goal Pursuit Engine
 * Port of `axoniz/goals/service.py`.
 *
 * OKR-style goal tracking with drill-sergeant accountability:
 *   Objective → KeyResult → DailyAction
 *
 * Port notes
 * ----------
 * - Persistence: `node:sqlite` (`DatabaseSync`) — same file path
 *   (`$AXONIZ_HOME/goals.db`) and the same schema as the Python original, so an
 *   existing Python-created DB keeps working.
 * - `threading.Lock`: **dropped on purpose**. All SQLite access here is
 *   synchronous and every `statement + commit` pair runs inside one synchronous
 *   block, so the Node event loop can never interleave two of them (see the
 *   equivalent note in `src/workflows/engine.ts`).
 * - `dataclasses` → interfaces + same-named factory functions
 *   (`Goal(...)`, `KeyResult(...)`, `DailyAction(...)`), so every Python
 *   constructor keyword becomes an init-object field and the default factories
 *   (`uuid4()[:8]`, `datetime.now().isoformat()`) are preserved.
 * - Timestamps are local-time ISO-8601 without a zone offset, exactly like
 *   Python's naive `datetime.now().isoformat()`.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { AXONIZ_HOME } from "../core/config.js";
import { info } from "../core/debug.js";
import {
  GoalPriority,
  GoalStatus,
  asGoalPriority,
  asGoalStatus,
} from "./types.js";

export const GOALS_DB = path.join(AXONIZ_HOME, "goals.db");

/* ── Small helpers ────────────────────────────────────────────────────────── */

type Row = Record<string, unknown>;

function pad(n: number, w = 2): string {
  return String(n).padStart(w, "0");
}

/** Local-time ISO-8601 with milliseconds — mirrors `datetime.now().isoformat()`. */
function nowIso(): string {
  const d = new Date();
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `.${pad(d.getMilliseconds(), 3)}`
  );
}

/** `date.today().isoformat()`. */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `date.fromisoformat()` — returns UTC-epoch ms at local midnight, or null. */
function isoDateToUtcMs(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const ms = Date.UTC(y, mo - 1, d);
  const chk = new Date(ms);
  if (chk.getUTCFullYear() !== y || chk.getUTCMonth() !== mo - 1 || chk.getUTCDate() !== d) {
    return null;
  }
  return ms;
}

/** Local midnight (UTC-epoch ms) of *today*, matching `date.today()`. */
function todayUtcMs(): number {
  const d = new Date();
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Python's `f"{value:.0%}"` / `f"{value:.1%}"`.
 * Python rounds half-to-even on the exact binary value, so this replicates
 * that instead of JavaScript's round-half-up.
 */
function pyPercent(value: number, digits: number): string {
  const mult = 10 ** digits;
  const scaled = value * 100 * mult;
  const sign = scaled < 0 ? "-" : "";
  const abs = Math.abs(scaled);
  const floor = Math.floor(abs);
  const frac = abs - floor;
  let rounded: number;
  if (frac > 0.5) rounded = floor + 1;
  else if (frac < 0.5) rounded = floor;
  else rounded = floor % 2 === 0 ? floor : floor + 1; // half → even
  return `${sign}${(rounded / mult).toFixed(digits)}%`;
}

function rowStr(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

function rowNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/* ── Data model (port of the dataclasses in service.py) ───────────────────── */

export interface DailyActionInit {
  id?: string;
  key_result_id?: string;
  title?: string;
  done?: boolean;
  scheduled_date?: string;
  completed_date?: string;
}

export interface DailyAction {
  id: string;
  key_result_id: string;
  title: string;
  done: boolean;
  /** YYYY-MM-DD */
  scheduled_date: string;
  completed_date: string;
}

export function DailyAction(init: DailyActionInit = {}): DailyAction {
  return {
    id: init.id ?? randomUUID().slice(0, 8),
    key_result_id: init.key_result_id ?? "",
    title: init.title ?? "",
    done: init.done ?? false,
    scheduled_date: init.scheduled_date ?? "",
    completed_date: init.completed_date ?? "",
  };
}

export interface KeyResultInit {
  id?: string;
  goal_id?: string;
  title?: string;
  /** 0.0 → 1.0 */
  score?: number;
  /** e.g. "Ship v1.0" */
  target?: string;
  /** YYYY-MM-DD */
  deadline?: string;
  daily_actions?: DailyAction[];
}

export interface KeyResult {
  id: string;
  goal_id: string;
  title: string;
  score: number;
  target: string;
  deadline: string;
  daily_actions: DailyAction[];
}

export function KeyResult(init: KeyResultInit = {}): KeyResult {
  return {
    id: init.id ?? randomUUID().slice(0, 8),
    goal_id: init.goal_id ?? "",
    title: init.title ?? "",
    score: init.score ?? 0.0,
    target: init.target ?? "",
    deadline: init.deadline ?? "",
    daily_actions: init.daily_actions ?? [],
  };
}

export interface GoalInit {
  id?: string;
  title?: string;
  description?: string;
  status?: GoalStatus;
  priority?: GoalPriority;
  score?: number;
  /** YYYY-MM-DD */
  deadline?: string;
  created_at?: string;
  updated_at?: string;
  key_results?: KeyResult[];
}

export interface Goal {
  id: string;
  title: string;
  description: string;
  status: GoalStatus;
  priority: GoalPriority;
  score: number;
  deadline: string;
  created_at: string;
  updated_at: string;
  key_results: KeyResult[];
}

export function Goal(init: GoalInit = {}): Goal {
  const now = nowIso();
  return {
    id: init.id ?? randomUUID().slice(0, 8),
    title: init.title ?? "",
    description: init.description ?? "",
    status: init.status ?? GoalStatus.ACTIVE,
    priority: init.priority ?? GoalPriority.HIGH,
    score: init.score ?? 0.0,
    deadline: init.deadline ?? "",
    created_at: init.created_at ?? now,
    updated_at: init.updated_at ?? now,
    key_results: init.key_results ?? [],
  };
}

/** Shape of one entry returned by `health_check()`. */
export interface GoalConcern {
  id: string;
  title: string;
  /** OVERDUE | AT_RISK | BEHIND */
  issue: string;
  days: number;
  score: number;
}

/* ── Service ──────────────────────────────────────────────────────────────── */

export class GoalService {
  db_path: string;
  _conn: DatabaseSync;

  constructor(db_path: string = GOALS_DB) {
    this.db_path = db_path;
    fs.mkdirSync(path.dirname(db_path), { recursive: true });
    this._conn = new DatabaseSync(db_path);
    this._init_db();
  }

  _init_db(): void {
    this._conn.exec("PRAGMA journal_mode=WAL");
    this._conn.exec(`
      CREATE TABLE IF NOT EXISTS goals (
          id          TEXT PRIMARY KEY,
          title       TEXT NOT NULL,
          description TEXT DEFAULT '',
          status      TEXT DEFAULT 'active',
          priority    TEXT DEFAULT 'high',
          score       REAL DEFAULT 0.0,
          deadline    TEXT DEFAULT '',
          created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at  TEXT DEFAULT CURRENT_TIMESTAMP,
          data_json   TEXT DEFAULT '{}'
      )
    `);
    this._conn.exec(`
      CREATE TABLE IF NOT EXISTS key_results (
          id          TEXT PRIMARY KEY,
          goal_id     TEXT NOT NULL,
          title       TEXT NOT NULL,
          score       REAL DEFAULT 0.0,
          target      TEXT DEFAULT '',
          deadline    TEXT DEFAULT '',
          data_json   TEXT DEFAULT '{}'
      )
    `);
    this._conn.exec(`
      CREATE TABLE IF NOT EXISTS daily_actions (
          id              TEXT PRIMARY KEY,
          key_result_id   TEXT NOT NULL,
          title           TEXT NOT NULL,
          done            INTEGER DEFAULT 0,
          scheduled_date  TEXT DEFAULT '',
          completed_date  TEXT DEFAULT ''
      )
    `);
    this._conn.exec("CREATE INDEX IF NOT EXISTS idx_goal_status ON goals(status)");
    this._conn.exec("CREATE INDEX IF NOT EXISTS idx_kr_goal ON key_results(goal_id)");
    this._conn.exec("CREATE INDEX IF NOT EXISTS idx_da_kr ON daily_actions(key_result_id)");
  }

  /* ── CRUD ───────────────────────────────────────────────────────────────── */

  create_goal(
    title: string,
    description = "",
    deadline = "",
    priority: string = "high",
  ): Goal {
    const g = Goal({
      title,
      description,
      deadline,
      priority: asGoalPriority(priority),
      status: GoalStatus.ACTIVE,
    });
    this._conn
      .prepare(
        "INSERT INTO goals (id,title,description,status,priority,score,deadline,created_at,updated_at,data_json) VALUES (?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        g.id,
        g.title,
        g.description,
        g.status,
        g.priority,
        g.score,
        g.deadline,
        g.created_at,
        g.updated_at,
        "{}",
      );
    info(`[Goals] Created: '${title}' (id=${g.id})`);
    return g;
  }

  add_key_result(goal_id: string, title: string, target = "", deadline = ""): KeyResult {
    const kr = KeyResult({ goal_id, title, target, deadline });
    this._conn
      .prepare(
        "INSERT INTO key_results (id,goal_id,title,score,target,deadline,data_json) VALUES (?,?,?,?,?,?,?)",
      )
      .run(kr.id, goal_id, title, 0.0, target, deadline, "{}");
    return kr;
  }

  add_daily_action(key_result_id: string, title: string, scheduled_date = ""): DailyAction {
    const da = DailyAction({
      key_result_id,
      title,
      scheduled_date: scheduled_date || todayIso(),
    });
    this._conn
      .prepare(
        "INSERT INTO daily_actions (id,key_result_id,title,done,scheduled_date) VALUES (?,?,?,?,?)",
      )
      .run(da.id, key_result_id, title, 0, da.scheduled_date);
    return da;
  }

  /** Update score for a goal or key result (0.0-1.0). */
  update_score(goal_id: string, score: number, key_result_id: string | null = null): string {
    score = Math.max(0.0, Math.min(1.0, score));
    if (key_result_id) {
      this._conn
        .prepare("UPDATE key_results SET score=? WHERE id=? AND goal_id=?")
        .run(score, key_result_id, goal_id);
    } else {
      this._conn
        .prepare("UPDATE goals SET score=?, updated_at=? WHERE id=?")
        .run(score, nowIso(), goal_id);
    }
    return `Score updated: ${pyPercent(score, 1)}`;
  }

  complete_action(action_id: string): string {
    this._conn
      .prepare("UPDATE daily_actions SET done=1, completed_date=? WHERE id=?")
      .run(todayIso(), action_id);
    return `Action ${action_id} marked done`;
  }

  set_status(goal_id: string, status: string): string {
    this._conn
      .prepare("UPDATE goals SET status=?, updated_at=? WHERE id=?")
      .run(status, nowIso(), goal_id);
    return `Status → ${status}`;
  }

  /* ── Queries ────────────────────────────────────────────────────────────── */

  list_goals(status: string | null = null): Goal[] {
    let q = "SELECT * FROM goals";
    const params: string[] = [];
    if (status) {
      q += " WHERE status=?";
      params.push(status);
    }
    q += " ORDER BY priority DESC, deadline ASC";
    const rows = this._conn.prepare(q).all(...params) as Row[];
    return rows.map((r) => this._row_to_goal(r));
  }

  get_goal(goal_id: string): Goal | null {
    const row = this._conn.prepare("SELECT * FROM goals WHERE id=?").get(goal_id) as
      | Row
      | undefined;
    return row ? this._row_to_goal(row) : null;
  }

  _row_to_goal(row: Row): Goal {
    return Goal({
      id: rowStr(row.id),
      title: rowStr(row.title),
      description: rowStr(row.description),
      status: asGoalStatus(rowStr(row.status)),
      priority: asGoalPriority(rowStr(row.priority)),
      score: rowNum(row.score),
      deadline: rowStr(row.deadline),
      created_at: rowStr(row.created_at),
      updated_at: rowStr(row.updated_at),
    });
  }

  count(status = "active"): number {
    const row = this._conn
      .prepare("SELECT COUNT(*) FROM goals WHERE status=?")
      .get(status) as Row | undefined;
    if (!row) return 0;
    const first = Object.values(row)[0];
    return rowNum(first);
  }

  /* ── Accountability ─────────────────────────────────────────────────────── */

  /** Check all active goals for health. Returns list of concerns. */
  health_check(): GoalConcern[] {
    const concerns: GoalConcern[] = [];
    const today = todayUtcMs();
    const goals = this.list_goals("active");
    for (const g of goals) {
      if (!g.deadline) continue;
      const dlMs = isoDateToUtcMs(g.deadline);
      if (dlMs === null) continue; // Python: `except ValueError: pass`
      const days_left = Math.round((dlMs - today) / 86_400_000);
      if (days_left < 0) {
        concerns.push({
          id: g.id,
          title: g.title,
          issue: "OVERDUE",
          days: Math.abs(days_left),
          score: g.score,
        });
      } else if (days_left <= 3 && g.score < 0.7) {
        concerns.push({
          id: g.id,
          title: g.title,
          issue: "AT_RISK",
          days: days_left,
          score: g.score,
        });
      } else if (days_left <= 7 && g.score < 0.4) {
        concerns.push({
          id: g.id,
          title: g.title,
          issue: "BEHIND",
          days: days_left,
          score: g.score,
        });
      }
    }
    return concerns;
  }

  /** AXONIZ's daily goal briefing — drill sergeant tone. */
  daily_report(): string {
    const active = this.list_goals("active");
    const concerns = this.health_check();

    const lines: string[] = ["⚔️ *AXONIZ Daily Goal Report*\n"];

    if (active.length === 0) {
      lines.push("No active goals. Set objectives, Shadow Monarch.");
      return lines.join("\n");
    }

    for (const g of active) {
      // Python `"█" * n + "░" * (10 - n)` with negative repeats yielding "".
      const filled = Math.trunc(g.score * 10);
      const score_bar = "█".repeat(Math.max(0, filled)) + "░".repeat(Math.max(0, 10 - filled));
      const deadline_str = g.deadline ? ` | deadline: ${g.deadline}` : "";
      lines.push(`• *${g.title}*${deadline_str}`);
      lines.push(`  [${score_bar}] ${pyPercent(g.score, 0)}`);
    }

    if (concerns.length > 0) {
      lines.push("\n⚠️ *Concerns:*");
      for (const c of concerns) {
        if (c.issue === "OVERDUE") {
          lines.push(
            `  🔴 '${c.title}' is ${c.days} days OVERDUE (${pyPercent(c.score, 0)})`,
          );
        } else if (c.issue === "AT_RISK") {
          lines.push(
            `  🟡 '${c.title}' — ${c.days} days left, only ${pyPercent(c.score, 0)} done`,
          );
        } else {
          lines.push(
            `  🟠 '${c.title}' — behind pace (${pyPercent(c.score, 0)} with ${c.days}d left)`,
          );
        }
      }
      lines.push("\nDeploy resources or face consequences, my liege.");
    } else {
      lines.push("\nAll objectives on track. Shadow Monarch's will be done.");
    }

    return lines.join("\n");
  }

  /** What needs to happen today. */
  morning_plan(): string {
    const today = todayIso();
    const actions = this._conn
      .prepare(
        `SELECT da.title AS title, kr.title AS kr_title, g.title AS g_title
           FROM daily_actions da
           JOIN key_results kr ON da.key_result_id = kr.id
           JOIN goals g ON kr.goal_id = g.id
           WHERE da.done=0 AND da.scheduled_date=? AND g.status='active'
           ORDER BY g.priority DESC`,
      )
      .all(today) as Row[];

    if (actions.length === 0) {
      return `No actions scheduled for today (${today}).`;
    }
    const lines: string[] = [`📋 *Today's Mission (${today}):*`];
    for (const a of actions) {
      lines.push(`  • [${rowStr(a.g_title)}] ${rowStr(a.title)}`);
    }
    return lines.join("\n");
  }

  /** Compact goal list for agent context injection. */
  format_goals(): string {
    const active = this.list_goals("active");
    if (active.length === 0) return "";
    const lines: string[] = [];
    for (const g of active.slice(0, 5)) {
      const dl = g.deadline ? ` (due ${g.deadline})` : "";
      lines.push(`  [${pyPercent(g.score, 0)}] ${g.title}${dl}`);
    }
    return "Active Goals:\n" + lines.join("\n");
  }
}

/* ── Singleton ────────────────────────────────────────────────────────────── */

let _service: GoalService | null = null;

export function get_goal_service(): GoalService {
  if (_service === null) {
    _service = new GoalService();
  }
  return _service;
}

/**
 * camelCase alias of `get_goal_service` for concurrently-ported consumers
 * (`src/core/agent.ts` imports `getGoalService`) that expect camelCase.
 * The canonical, Python-faithful name remains `get_goal_service`.
 */
export const getGoalService = get_goal_service;

/** Test/override hook (not present in the Python original). */
export function _reset_goal_service(service: GoalService | null = null): void {
  _service = service;
}
