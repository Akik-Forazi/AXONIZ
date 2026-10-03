/**
 * AXONIZ-ZERO · AXONIZ Workflow Engine
 * Port of `axoniz/workflows/engine.py` — trigger/action automation.
 *
 * A Workflow has:
 *   - Triggers: cron | file_change | keyword | manual | heartbeat
 *   - Conditions: optional filter expressions
 *   - Actions: run_agent | shell | notify | goal_update | palace_store
 *
 * Port notes
 * ----------
 * - Persistence: `node:sqlite` (`DatabaseSync`) — same file path
 *   (`$AXONIZ_HOME/workflows.db`) and same schema as the Python original, so an
 *   existing Python-created DB is read as-is.
 * - `threading.Thread(daemon=True)` → a cancellable async loop (`start()` /
 *   `stop()` + stop flag). Fired workflows are still dispatched
 *   fire-and-forget, one task per firing, like the Python per-fire thread. The
 *   loop's sleep timer is `unref()`ed so it never keeps the process alive,
 *   matching `daemon=True`.
 * - `threading.Lock` → **dropped on purpose**: every statement/commit pair here
 *   runs synchronously with no `await` in between, so the single-threaded event
 *   loop cannot interleave two of them.
 * - `run_now` / `_execute` / `_run_action` are `async` because shell actions and
 *   the late-bound dispatcher/memory imports are asynchronous in Node.
 * - `uuid.uuid4()[:8]` → `crypto.randomUUID().slice(0, 8)`.
 */
import { exec } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { AXONIZ_HOME } from "../core/config.js";
import { debug, info } from "../core/debug.js";
import { get_goal_service } from "../goals/service.js";

export const WORKFLOWS_DB = path.join(AXONIZ_HOME, "workflows.db");

/** Engine poll interval (`time.sleep(30)`). */
const TICK_INTERVAL_MS = 30_000;

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

/** `now.strftime("%H:%M")`. */
function hhmm(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
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

/**
 * Python's `f"{value:.0%}"` (round-half-even on the exact binary value).
 * Used by the `goal_update` action result string.
 */
function pyPercent0(value: number): string {
  const scaled = value * 100;
  const sign = scaled < 0 ? "-" : "";
  const abs = Math.abs(scaled);
  const floor = Math.floor(abs);
  const frac = abs - floor;
  let rounded: number;
  if (frac > 0.5) rounded = floor + 1;
  else if (frac < 0.5) rounded = floor;
  else rounded = floor % 2 === 0 ? floor : floor + 1; // half → even
  return `${sign}${rounded}%`;
}

/* ── Data classes ─────────────────────────────────────────────────────────── */

export interface TriggerInit {
  /** cron | file_change | keyword | manual | heartbeat */
  kind: string;
  /** "HH:MM" for cron, interval seconds for heartbeat */
  schedule?: string;
  /** for file_change */
  path?: string;
  /** for keyword / file_change glob */
  pattern?: string;
  /** for heartbeat */
  interval_s?: number;
}

export interface Trigger {
  kind: string;
  schedule: string;
  path: string;
  pattern: string;
  interval_s: number;
}

export function Trigger(init: TriggerInit): Trigger {
  return {
    kind: init.kind ?? "",
    schedule: init.schedule ?? "",
    path: init.path ?? "",
    pattern: init.pattern ?? "",
    interval_s: init.interval_s ?? 0,
  };
}

export interface ActionInit {
  /** run_agent | shell | notify | goal_update | palace_store */
  kind: string;
  /** for run_agent */
  task?: string;
  /** for shell */
  command?: string;
  /** for notify */
  message?: string;
  /** for goal_update */
  goal_id?: string;
  /** for goal_update */
  score?: number;
  /** for palace_store */
  wing?: string;
  /** for palace_store */
  room?: string;
  /** for palace_store */
  content?: string;
}

export interface Action {
  kind: string;
  task: string;
  command: string;
  message: string;
  goal_id: string;
  score: number;
  wing: string;
  room: string;
  content: string;
}

export function Action(init: ActionInit): Action {
  return {
    kind: init.kind ?? "",
    task: init.task ?? "",
    command: init.command ?? "",
    message: init.message ?? "",
    goal_id: init.goal_id ?? "",
    score: init.score ?? 0.0,
    wing: init.wing ?? "",
    room: init.room ?? "",
    content: init.content ?? "",
  };
}

export interface WorkflowInit {
  id?: string;
  name?: string;
  description?: string;
  enabled?: boolean;
  trigger?: Trigger;
  actions?: Action[];
  last_run?: string;
  run_count?: number;
  created_at?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  trigger: Trigger;
  actions: Action[];
  last_run: string;
  run_count: number;
  created_at: string;
}

export function Workflow(init: WorkflowInit = {}): Workflow {
  return {
    id: init.id ?? randomUUID().slice(0, 8),
    name: init.name ?? "",
    description: init.description ?? "",
    enabled: init.enabled ?? true,
    trigger: init.trigger ?? Trigger({ kind: "manual" }),
    actions: init.actions ?? [],
    last_run: init.last_run ?? "",
    run_count: init.run_count ?? 0,
    created_at: init.created_at ?? nowIso(),
  };
}

/** `dataclasses.asdict(trigger)` — field order preserved. */
export function triggerToDict(t: Trigger): Record<string, unknown> {
  return {
    kind: t.kind,
    schedule: t.schedule,
    path: t.path,
    pattern: t.pattern,
    interval_s: t.interval_s,
  };
}

/** `dataclasses.asdict(action)` — field order preserved. */
export function actionToDict(a: Action): Record<string, unknown> {
  return {
    kind: a.kind,
    task: a.task,
    command: a.command,
    message: a.message,
    goal_id: a.goal_id,
    score: a.score,
    wing: a.wing,
    room: a.room,
    content: a.content,
  };
}

function triggerFromDict(raw: unknown): Trigger {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return Trigger({
    kind: typeof o.kind === "string" ? o.kind : "manual",
    schedule: typeof o.schedule === "string" ? o.schedule : "",
    path: typeof o.path === "string" ? o.path : "",
    pattern: typeof o.pattern === "string" ? o.pattern : "",
    interval_s: typeof o.interval_s === "number" ? o.interval_s : 0,
  });
}

function actionFromDict(raw: unknown): Action {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return Action({
    kind: typeof o.kind === "string" ? o.kind : "",
    task: typeof o.task === "string" ? o.task : "",
    command: typeof o.command === "string" ? o.command : "",
    message: typeof o.message === "string" ? o.message : "",
    goal_id: typeof o.goal_id === "string" ? o.goal_id : "",
    score: typeof o.score === "number" ? o.score : 0.0,
    wing: typeof o.wing === "string" ? o.wing : "",
    room: typeof o.room === "string" ? o.room : "",
    content: typeof o.content === "string" ? o.content : "",
  });
}

/* ── Optional integrations (not ported yet) ───────────────────────────────── */
/*
 * TODO(port): `src/comms/dispatcher.ts` (Python `axoniz/comms/dispatcher.py`)
 * and `src/integrations/unified_memory.ts` (Python
 * `axoniz/integrations/unified_memory.py`) do not exist yet. The Python source
 * imports both *inside* the action handler, wrapped in try/except, so the
 * equivalent here is a late, best-effort dynamic import against a
 * non-literal specifier (TypeScript cannot resolve and must not fail on it).
 * The small interfaces below stand in for the not-yet-ported modules.
 */

interface DispatcherLike {
  send(message: string): unknown;
}

interface DispatcherModule {
  get_dispatcher?: () => DispatcherLike;
  default?: { get_dispatcher?: () => DispatcherLike };
}

interface PalaceLike {
  store(args: {
    wing: string;
    room: string;
    content: string;
    added_by: string;
  }): unknown;
}

interface UnifiedMemoryLike {
  palace: PalaceLike;
}

interface UnifiedMemoryModule {
  UnifiedMemory?: new () => UnifiedMemoryLike;
  default?: { UnifiedMemory?: new () => UnifiedMemoryLike };
}

/* ── Engine ───────────────────────────────────────────────────────────────── */

export type AgentCallback = (task: string) => string | Promise<string>;

export interface WorkflowRunRecord {
  ts: string;
  name: string;
  trigger: string;
  result: string;
  success: boolean;
  ms: number;
}

export interface WorkflowStatusEntry {
  id: string;
  name: string;
  enabled: boolean;
  trigger: string;
  last_run: string;
  runs: number;
}

export interface WorkflowEngineStatus {
  total_workflows: number;
  enabled: number;
  running: boolean;
  workflows: WorkflowStatusEntry[];
}

/**
 * Background workflow executor.
 * Checks cron/heartbeat triggers every 30s.
 * File-change triggers use polling.
 */
export class WorkflowEngine {
  db_path: string;
  _conn: DatabaseSync;
  _running = false;
  _agent_callback: AgentCallback | null = null;
  _file_mtimes = new Map<string, number>();
  _loop_promise: Promise<void> | null = null;

  /** Resolver for the current inter-tick sleep (lets `stop()` wake the loop). */
  private _wake: (() => void) | null = null;

  constructor(db_path: string = WORKFLOWS_DB) {
    this.db_path = db_path;
    fs.mkdirSync(path.dirname(db_path), { recursive: true });
    this._conn = new DatabaseSync(db_path);
    this._init_db();
  }

  _init_db(): void {
    this._conn.exec("PRAGMA journal_mode=WAL");
    this._conn.exec(`
      CREATE TABLE IF NOT EXISTS workflows (
          id          TEXT PRIMARY KEY,
          name        TEXT NOT NULL,
          description TEXT DEFAULT '',
          enabled     INTEGER DEFAULT 1,
          trigger_json TEXT NOT NULL,
          actions_json TEXT NOT NULL,
          last_run    TEXT DEFAULT '',
          run_count   INTEGER DEFAULT 0,
          created_at  TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    this._conn.exec(`
      CREATE TABLE IF NOT EXISTS workflow_runs (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          workflow_id TEXT NOT NULL,
          ts          TEXT DEFAULT CURRENT_TIMESTAMP,
          trigger     TEXT,
          result      TEXT,
          success     INTEGER DEFAULT 1,
          duration_ms INTEGER DEFAULT 0
      )
    `);
    this._conn.exec("CREATE INDEX IF NOT EXISTS idx_wf_enabled ON workflows(enabled)");
  }

  /** Wire in the agent's run() method. */
  set_agent_callback(cb: AgentCallback): void {
    this._agent_callback = cb;
  }

  /**
   * camelCase alias of `set_agent_callback` for the concurrently-ported
   * consumers (e.g. `src/core/agent.ts`) that expect camelCase. The canonical,
   * Python-faithful name remains `set_agent_callback`.
   */
  setAgentCallback(cb: AgentCallback): void {
    this.set_agent_callback(cb);
  }

  /* ── CRUD ───────────────────────────────────────────────────────────────── */

  add_workflow(wf: Workflow): string {
    this._conn
      .prepare(
        `INSERT OR REPLACE INTO workflows
           (id, name, description, enabled, trigger_json, actions_json, last_run, run_count, created_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        wf.id,
        wf.name,
        wf.description,
        wf.enabled ? 1 : 0,
        JSON.stringify(triggerToDict(wf.trigger)),
        JSON.stringify(wf.actions.map(actionToDict)),
        wf.last_run,
        wf.run_count,
        wf.created_at,
      );
    info(`[Workflows] Added: '${wf.name}' (id=${wf.id})`);
    return wf.id;
  }

  remove_workflow(wf_id: string): boolean {
    const cur = this._conn.prepare("DELETE FROM workflows WHERE id=?").run(wf_id);
    return Number(cur.changes) > 0;
  }

  enable(wf_id: string, enabled = true): void {
    this._conn
      .prepare("UPDATE workflows SET enabled=? WHERE id=?")
      .run(enabled ? 1 : 0, wf_id);
  }

  list_workflows(enabled_only = false): Workflow[] {
    let q = "SELECT * FROM workflows";
    if (enabled_only) {
      q += " WHERE enabled=1";
    }
    q += " ORDER BY created_at";
    const rows = this._conn.prepare(q).all() as Row[];
    return rows.map((r) => this._row_to_wf(r));
  }

  _row_to_wf(row: Row): Workflow {
    const t = JSON.parse(rowStr(row.trigger_json) || "{}") as unknown;
    const a = JSON.parse(rowStr(row.actions_json) || "[]") as unknown;
    const actions = Array.isArray(a) ? a.map((x) => actionFromDict(x)) : [];
    return Workflow({
      id: rowStr(row.id),
      name: rowStr(row.name),
      description: rowStr(row.description),
      enabled: Boolean(rowNum(row.enabled)),
      trigger: triggerFromDict(t),
      actions,
      last_run: rowStr(row.last_run),
      run_count: rowNum(row.run_count),
      created_at: rowStr(row.created_at),
    });
  }

  get_workflow(wf_id: string): Workflow | null {
    const row = this._conn.prepare("SELECT * FROM workflows WHERE id=?").get(wf_id) as
      | Row
      | undefined;
    return row ? this._row_to_wf(row) : null;
  }

  /* ── Execution ──────────────────────────────────────────────────────────── */

  async run_now(wf_id: string, trigger_note = "manual"): Promise<string> {
    const wf = this.get_workflow(wf_id);
    if (!wf) {
      return `Workflow ${wf_id} not found`;
    }
    return this._execute(wf, trigger_note);
  }

  async _execute(wf: Workflow, trigger_note: string): Promise<string> {
    const t0 = Date.now();
    const results: string[] = [];
    let success = true;
    try {
      for (const action of wf.actions) {
        const res = await this._run_action(action, wf);
        results.push(res);
      }
    } catch (e) {
      results.push(`Error: ${errText(e)}`);
      success = false;
    }
    const duration_ms = Math.floor(Date.now() - t0);
    const result_str = results.join(" | ").slice(0, 500);

    // Update run log
    const now = nowIso();
    this._conn
      .prepare("UPDATE workflows SET last_run=?, run_count=run_count+1 WHERE id=?")
      .run(now, wf.id);
    this._conn
      .prepare(
        `INSERT INTO workflow_runs (workflow_id, ts, trigger, result, success, duration_ms)
           VALUES (?,?,?,?,?,?)`,
      )
      .run(wf.id, now, trigger_note, result_str, success ? 1 : 0, duration_ms);

    info(`[Workflows] '${wf.name}' ran in ${duration_ms}ms — ${result_str.slice(0, 80)}`);
    return result_str;
  }

  async _run_action(action: Action, wf: Workflow): Promise<string> {
    if (action.kind === "run_agent") {
      if (this._agent_callback) {
        const task = action.task || wf.description || wf.name;
        const result = await this._agent_callback(task);
        return result ? String(result).slice(0, 300) : "done";
      }
      return "[no agent connected]";
    }

    if (action.kind === "shell") {
      try {
        const r = await runShell(action.command);
        return (r.stdout + r.stderr).slice(0, 200);
      } catch (e) {
        return `shell error: ${errText(e)}`;
      }
    }

    if (action.kind === "notify") {
      const msg = action.message || `Workflow '${wf.name}' fired`;
      try {
        // TODO(port): src/comms/dispatcher.ts not ported yet — late, best-effort import.
        const spec = "../comms/dispatcher.js";
        const mod = (await import(spec)) as DispatcherModule;
        const dispatcher = mod.get_dispatcher
          ? mod.get_dispatcher()
          : mod.default?.get_dispatcher
            ? mod.default.get_dispatcher()
            : null;
        if (!dispatcher) throw new Error("get_dispatcher not found");
        await dispatcher.send(msg);
      } catch {
        console.log(`[Workflow] ${msg}`);
      }
      return "notified";
    }

    if (action.kind === "goal_update") {
      try {
        const gs = get_goal_service();
        gs.update_score(action.goal_id, action.score);
        return `goal ${action.goal_id} score → ${pyPercent0(action.score)}`;
      } catch (e) {
        return `goal update error: ${errText(e)}`;
      }
    }

    if (action.kind === "palace_store") {
      try {
        // TODO(port): src/integrations/unified_memory.ts not ported yet — late, best-effort import.
        const spec = "../integrations/unified_memory.js";
        const mod = (await import(spec)) as UnifiedMemoryModule;
        const Ctor = mod.UnifiedMemory ?? mod.default?.UnifiedMemory;
        if (!Ctor) throw new Error("UnifiedMemory not found");
        const m = new Ctor();
        m.palace.store({
          wing: action.wing || "wing_workflows",
          room: action.room || wf.name,
          content: action.content || `Workflow '${wf.name}' fired at ${nowIso()}`,
          added_by: "workflow",
        });
        return "palace stored";
      } catch (e) {
        return `palace error: ${errText(e)}`;
      }
    }

    return `unknown action kind: ${action.kind}`;
  }

  /* ── Background loop ────────────────────────────────────────────────────── */

  start(): void {
    if (this._running) {
      return;
    }
    this._running = true;
    this._loop_promise = this._loop();
    // The loop swallows tick errors itself; this guard only prevents an
    // unhandled rejection if the sleep machinery ever throws.
    void this._loop_promise.catch((e: unknown) => debug(`Workflow loop error: ${errText(e)}`));
    info("[Workflows] Engine started");
  }

  stop(): void {
    this._running = false;
    const wake = this._wake;
    this._wake = null;
    if (wake) wake();
  }

  is_running(): boolean {
    return this._running;
  }

  private async _loop(): Promise<void> {
    while (this._running) {
      try {
        this._tick();
      } catch (e) {
        debug(`Workflow tick error: ${errText(e)}`);
      }
      if (!this._running) break;
      await this._sleep(TICK_INTERVAL_MS);
    }
  }

  /** Sleep, but wake immediately when `stop()` is called. Timer is unref'd (daemon semantics). */
  private _sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this._wake = null;
        resolve();
      }, ms);
      timer.unref?.();
      this._wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }

  _tick(): void {
    const now = new Date();
    const now_hhmm = hhmm(now);
    const today = todayIso();

    for (const wf of this.list_workflows(true)) {
      const t = wf.trigger;
      let fired = false;
      let note = "";

      if (t.kind === "cron") {
        // Fire if current time matches HH:MM and not already run today
        if (t.schedule === now_hhmm) {
          const last = wf.last_run ? wf.last_run.slice(0, 10) : "";
          if (last !== today) {
            fired = true;
            note = `cron ${t.schedule}`;
          }
        }
      } else if (t.kind === "heartbeat") {
        const interval = t.interval_s || 3600;
        if (wf.last_run) {
          try {
            const last_ts = new Date(wf.last_run);
            if (Number.isNaN(last_ts.getTime())) {
              // Python: `datetime.fromisoformat` raises → treated as first run.
              fired = true;
              note = "heartbeat (first)";
            } else if ((now.getTime() - last_ts.getTime()) / 1000 >= interval) {
              fired = true;
              note = `heartbeat ${interval}s`;
            }
          } catch {
            fired = true;
            note = "heartbeat (first)";
          }
        } else {
          fired = true;
          note = "heartbeat (first)";
        }
      } else if (t.kind === "file_change") {
        if (t.path && fs.existsSync(t.path)) {
          let mtime: number;
          try {
            mtime = fs.statSync(t.path).mtimeMs / 1000;
          } catch {
            mtime = 0;
          }
          const prev = this._file_mtimes.get(wf.id) ?? 0;
          if (mtime > prev) {
            this._file_mtimes.set(wf.id, mtime);
            if (prev > 0) {
              // don't fire on first check
              fired = true;
              note = `file_change ${t.path}`;
            }
          }
        }
      }

      if (fired) {
        debug(`[Workflows] Firing '${wf.name}' (${note})`);
        void this._execute(wf, note).catch((e: unknown) => {
          debug(`[Workflows] '${wf.name}' action error: ${errText(e)}`);
        });
      }
    }
  }

  recent_runs(n = 10): WorkflowRunRecord[] {
    const rows = this._conn
      .prepare(
        `SELECT wr.ts, w.name, wr.trigger, wr.result, wr.success, wr.duration_ms
           FROM workflow_runs wr JOIN workflows w ON wr.workflow_id = w.id
           ORDER BY wr.id DESC LIMIT ?`,
      )
      .all(n) as Row[];
    return rows.map((r) => ({
      ts: rowStr(r.ts),
      name: rowStr(r.name),
      trigger: rowStr(r.trigger),
      result: rowStr(r.result),
      success: Boolean(rowNum(r.success)),
      ms: rowNum(r.duration_ms),
    }));
  }

  status(): WorkflowEngineStatus {
    const wfs = this.list_workflows();
    const enabled = wfs.filter((w) => w.enabled).length;
    return {
      total_workflows: wfs.length,
      enabled,
      running: this._running,
      workflows: wfs.map((w) => ({
        id: w.id,
        name: w.name,
        enabled: w.enabled,
        trigger: w.trigger.kind,
        last_run: w.last_run,
        runs: w.run_count,
      })),
    };
  }

  format_for_agent(): string {
    const wfs = this.list_workflows(true);
    if (wfs.length === 0) {
      return "";
    }
    const lines = ["Active Workflows:"];
    for (const w of wfs.slice(0, 5)) {
      lines.push(`  [${w.id}] ${w.name} | trigger=${w.trigger.kind} | runs=${w.run_count}`);
    }
    return lines.join("\n");
  }
}

/** Shell action runner — mirrors `subprocess.run(..., shell=True, timeout=60)` semantics. */
function runShell(command: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    exec(
      command,
      {
        timeout: 60_000,
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true,
      },
      (err, stdout, stderr) => {
        const e = err as (Error & { code?: number | string; killed?: boolean }) | null;
        // A non-zero exit is *not* an error for `subprocess.run` (no check=True);
        // only spawn failures and timeouts raise.
        if (e && (e.killed === true || typeof e.code !== "number")) {
          reject(e);
          return;
        }
        // Python's `text=True` decodes with universal newlines: \r\n and \r → \n.
        const universal = (s: string) => s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        resolve({ stdout: universal(stdout ?? ""), stderr: universal(stderr ?? "") });
      },
    );
  });
}

/* ── Built-in workflows seeded on first start ─────────────────────────────── */

/** Add sensible default workflows if DB is empty. */
export function _seed_default_workflows(engine: WorkflowEngine): void {
  const existing = engine.list_workflows();
  if (existing.length > 0) {
    return;
  }
  const defaults: Workflow[] = [
    Workflow({
      name: "daily_goal_report",
      description: "Send daily goal briefing at 08:00",
      trigger: Trigger({ kind: "cron", schedule: "08:00" }),
      actions: [Action({ kind: "notify", message: "__goals__" })],
    }),
    Workflow({
      name: "palace_heartbeat",
      description: "Archive conversation context every 4 hours",
      trigger: Trigger({ kind: "heartbeat", interval_s: 14400 }),
      actions: [
        Action({
          kind: "palace_store",
          wing: "wing_axoniz",
          room: "heartbeat",
          content: "Heartbeat checkpoint",
        }),
      ],
    }),
  ];
  for (const wf of defaults) {
    engine.add_workflow(wf);
  }
}

/* ── Singleton ────────────────────────────────────────────────────────────── */

let _engine: WorkflowEngine | null = null;

export function get_workflow_engine(): WorkflowEngine {
  if (_engine === null) {
    _engine = new WorkflowEngine();
    _seed_default_workflows(_engine);
  }
  return _engine;
}

/**
 * camelCase alias of `get_workflow_engine` for concurrently-ported consumers
 * (`src/core/agent.ts` imports `getWorkflowEngine`) that expect camelCase.
 * The canonical, Python-faithful name remains `get_workflow_engine`.
 */
export const getWorkflowEngine = get_workflow_engine;

/** Test/override hook (not present in the Python original). */
export function _reset_workflow_engine(engine: WorkflowEngine | null = null): void {
  _engine = engine;
}
