/**
 * AXONIZ Authority Engine — Action gating and auditing.
 * Ensures that all autonomous actions are within permitted bounds.
 *
 * Port of axoniz/core/authority.py
 *
 * Port notes:
 *  - `threading.Lock` around `check()` is dropped: the JS event loop is
 *    single-threaded and `check()` is fully synchronous (no awaits), so the
 *    critical section cannot be interleaved. This is the documented
 *    "trivial async mutex only where genuinely needed" case — it is not needed.
 *  - `ApprovalDelivery.resolve()` / `setApprovalCallback()` are additive: the
 *    Python `ApprovalDelivery` only has `ask()`/`timeout`, yet
 *    `axoniz/comms/telegram.py` calls `bot.set_approval_callback(
 *    get_engine().delivery.resolve)`. The hook is provided here so the ported
 *    Telegram bridge can wire a real approval channel without losing the
 *    faithful `ask()` semantics.
 */
import fs from "node:fs";
import { getLogger } from "./logger.js";

const logger = getLogger();

/* ── AuthLevel ────────────────────────────────────────────────────────────── */

/**
 * Numeric authority levels. Mirrors the Python `IntEnum`, including the
 * duplicate-valued test aliases (`AUTONOMOUS`/`LOG_ONLY` = 1, `SOFT_GATE` = 2,
 * `REQUIRE_APPROVAL` = 4).
 *
 * Implemented as a frozen const object + union type instead of a TS `enum` so
 * the module stays fully erasable (runnable by Node's type-stripping test
 * runner as well as by tsc).
 */
export const AuthLevel = {
  SAFE: 0,
  READ: 1,
  WRITE: 2,
  EXECUTE: 3,
  SYSTEM: 4,
  DANGEROUS: 5,
  /* Aliases for tests / other modules */
  AUTONOMOUS: 1,
  LOG_ONLY: 1,
  SOFT_GATE: 2,
  REQUIRE_APPROVAL: 4,
} as const;

export type AuthLevel = (typeof AuthLevel)[keyof typeof AuthLevel];

/** Coerce an arbitrary number to a valid AuthLevel (mirrors `AuthLevel(x)`). */
export function toAuthLevel(value: number): AuthLevel {
  if (!Number.isInteger(value) || value < 0 || value > 5) {
    throw new Error(`${value} is not a valid AuthLevel`);
  }
  return value as AuthLevel;
}

/* ── Decision ─────────────────────────────────────────────────────────────── */

/** Mirrors the `Decision` dataclass (including the extra `id` set by `check`). */
export class Decision {
  approved: boolean;
  reason: string;
  /** Authority level the action was classified at. */
  level: number;
  decision_id: string;
  id = 0;

  constructor(approved: boolean, reason: string, level: number, decisionId = "") {
    this.approved = approved;
    this.reason = reason;
    this.level = level;
    this.decision_id = decisionId;
  }

  toJSON(): Record<string, unknown> {
    return {
      approved: this.approved,
      reason: this.reason,
      level: this.level,
      decision_id: this.decision_id,
      id: this.id,
    };
  }
}

/* ── Escalation rules (hardcoded safety overrides) ────────────────────────── */

const PATH_ESCALATIONS = ["data/", "etc/", "var/", "system32", ".env", ".git", "audit.jsonl"];
const COMMAND_ESCALATIONS = ["rm ", "del ", "format ", "mkfs", "> /dev/", "shadow_monarch"];

/**
 * Return 0 (SAFE) if no escalation is needed; otherwise the minimum level the
 * action must be raised to. Only ever upgrades a level.
 */
export function _escalate_check(toolName: string, args: Record<string, unknown>): number {
  // Path escalation
  if (["file_write", "file_edit", "file_delete", "file_append"].includes(toolName)) {
    const p = String(args["path"] ?? "")
      .toLowerCase()
      .replace(/\\/g, "/");
    if (PATH_ESCALATIONS.some((x) => p.includes(x))) {
      return AuthLevel.REQUIRE_APPROVAL as number;
    }
  }

  // Command escalation
  if (["shell_run", "shell_python"].includes(toolName)) {
    const cmd = String(args["command"] ?? "").toLowerCase();
    if (COMMAND_ESCALATIONS.some((x) => cmd.includes(x))) {
      return AuthLevel.REQUIRE_APPROVAL as number;
    }
  }

  return 0;
}

/** camelCase alias. */
export const escalateCheck = _escalate_check;

/* ── AuditTrail ───────────────────────────────────────────────────────────── */

export class AuditTrail {
  path: string;

  constructor(path?: string | null, dbPath?: string | null) {
    this.path = path || dbPath || "audit.jsonl";
  }

  /** Append one JSON line. Failures are swallowed (Python bare `except`). */
  log(entry: Record<string, unknown>): void {
    try {
      fs.appendFileSync(this.path, `${JSON.stringify(entry)}\n`, "utf-8");
    } catch {
      /* best effort */
    }
  }

  /** Record a gated action (exact Python field set + ordering). */
  record(tool: string, args: Record<string, unknown>, level: number, approved: boolean, reason: string): void {
    this.log({
      tool,
      args,
      level: Math.trunc(level),
      approved,
      reason,
      timestamp: Date.now() / 1000,
    });
  }

  /** Last `n` parsed entries (empty list when missing/corrupt). */
  recent(n = 10): Array<Record<string, unknown>> {
    if (!fs.existsSync(this.path)) return [];
    try {
      const lines = fs.readFileSync(this.path, "utf-8").split(/\r?\n/).filter((l) => l.length > 0);
      return lines.slice(-n).map((l) => JSON.parse(l) as Record<string, unknown>);
    } catch {
      return [];
    }
  }

  stats(): { total_actions: number; blocked_actions: number } {
    let rows: Array<Record<string, unknown>> = [];
    if (fs.existsSync(this.path)) {
      try {
        rows = fs
          .readFileSync(this.path, "utf-8")
          .split(/\r?\n/)
          .filter((l) => l.length > 0)
          .map((l) => JSON.parse(l) as Record<string, unknown>);
      } catch {
        /* Python swallows and keeps rows = [] */
      }
    }

    return {
      total_actions: rows.length,
      blocked_actions: rows.filter((r) => !(r["approved"] ?? true)).length,
    };
  }
}

/* ── ApprovalLearner ──────────────────────────────────────────────────────── */

export class ApprovalLearner {
  approvals = new Map<string, number>();
  denials = new Map<string, number>();

  is_auto_approved(tool: string): boolean {
    return (this.approvals.get(tool) ?? 0) >= 3 && (this.denials.get(tool) ?? 0) === 0;
  }

  record_approval(tool: string): void {
    this.approvals.set(tool, (this.approvals.get(tool) ?? 0) + 1);
    this.denials.set(tool, 0);
  }

  record_denial(tool: string): void {
    this.denials.set(tool, (this.denials.get(tool) ?? 0) + 1);
    this.approvals.set(tool, 0);
  }

  /* camelCase aliases */
  isAutoApproved(tool: string): boolean {
    return this.is_auto_approved(tool);
  }
  recordApproval(tool: string): void {
    this.record_approval(tool);
  }
  recordDenial(tool: string): void {
    this.record_denial(tool);
  }
}

/* ── ApprovalDelivery ─────────────────────────────────────────────────────── */

export type ApprovalCallback = (tool: string, args: Record<string, unknown>) => boolean;

export class ApprovalDelivery {
  timeout: number;
  /** Optional synchronous approval channel wired in by a CLI/Telegram bridge. */
  protected callback: ApprovalCallback | null = null;
  protected pending: ((approved: boolean) => void) | null = null;

  constructor(timeout = 30.0) {
    this.timeout = timeout;
  }

  /** Additive: install a synchronous approval channel. */
  setApprovalCallback(cb: ApprovalCallback | null): void {
    this.callback = cb;
  }

  /**
   * Additive: resolve the approval that `askAsync()` is currently waiting on.
   * `axoniz/comms/telegram.py` wires this into the bot's approval callback.
   */
  resolve(approved: boolean): void {
    const p = this.pending;
    this.pending = null;
    if (p) p(approved);
  }

  /**
   * Faithful port: never prompts interactively (there is no synchronous prompt
   * in Node), so it returns False after printing the approval banner — exactly
   * like the Python implementation when nothing is wired up.
   */
  ask(tool: string, args: Record<string, unknown>): boolean {
    if (this.timeout <= 0) return false;
    if (this.callback) {
      try {
        return this.callback(tool, args);
      } catch (e) {
        logger.debug(`[Authority] approval callback failed: ${String(e)}`);
        return false;
      }
    }
    console.log(`\n  ${AuthLevel.DANGEROUS} APPROVAL REQUIRED: ${tool}(${JSON.stringify(args)})`);
    return false;
  }

  /** Additive async variant used by channels that can await a human. */
  async askAsync(tool: string, args: Record<string, unknown>): Promise<boolean> {
    if (this.timeout <= 0) return false;
    if (this.callback) {
      try {
        return this.callback(tool, args);
      } catch {
        return false;
      }
    }
    console.log(`\n  ${AuthLevel.DANGEROUS} APPROVAL REQUIRED: ${tool}(${JSON.stringify(args)})`);
    return await new Promise<boolean>((resolve) => {
      this.pending = resolve;
      const t = setTimeout(() => {
        if (this.pending === resolve) {
          this.pending = null;
          resolve(false);
        }
      }, Math.max(1, this.timeout) * 1000);
      if (typeof t.unref === "function") t.unref();
    });
  }
}

/* ── Default rules ────────────────────────────────────────────────────────── */

export const _DEFAULT_RULES: Record<string, number> = {
  file_read: 1,
  file_list: 1,
  file_search: 1,
  web_get: 1,
  web_search: 1,
  get_time: 0,
  file_write: 2,
  file_edit: 2,
  file_append: 2,
  file_delete: 4,
  shell_run: 3,
  shell_python: 3,
  git_commit: 2,
  git_push: 3,
  mouse_move: 3,
  mouse_click: 3,
  key_type: 3,
  key_press: 3,
  screen_capture: 1,
  optimize_hardware: 4,
  done: 0,
};

/* ── AuthorityEngine ──────────────────────────────────────────────────────── */

export class AuthorityEngine {
  config: Record<string, unknown>;
  audit: AuditTrail;
  learner: ApprovalLearner;
  delivery: ApprovalDelivery;
  default_level: AuthLevel;
  max_auto_level: number;
  _paused = false;
  _id_counter = 0;
  /** Dynamic per-tool overrides (set_rule). */
  protected _rules = new Map<string, AuthLevel>();

  constructor(config?: Record<string, unknown> | null, defaultLevel = 3) {
    this.config = config ?? {};
    const dbPath = (this.config["audit_db"] ?? this.config["db_path"] ?? "axoniz_audit.jsonl") as string;
    this.audit = new AuditTrail(dbPath);
    this.learner = new ApprovalLearner();
    this.delivery = new ApprovalDelivery(Number(this.config["approval_timeout"] ?? 30));
    this.default_level = toAuthLevel(defaultLevel);
    this.max_auto_level = Number(this.config["max_auto_level"] ?? AuthLevel.EXECUTE);
  }

  set_rule(toolName: string, level: number): void {
    this._rules.set(toolName, toAuthLevel(level));
  }

  /** camelCase alias. */
  setRule(toolName: string, level: number): void {
    this.set_rule(toolName, level);
  }

  check(toolName: string, args: Record<string, unknown>, _sessionId = "default"): Decision {
    this._id_counter += 1;
    if (this._paused) {
      return new Decision(false, "System paused", AuthLevel.DANGEROUS);
    }

    // 1. Base level: Dynamic override -> Default rules -> Default engine level
    const base = this._rules.get(toolName) ?? _DEFAULT_RULES[toolName] ?? this.default_level;
    let level: number = base;

    // 2. Path & command escalation (hardcoded safety overrides) — upgrade only.
    const escLevel = _escalate_check(toolName, args);
    if (escLevel > 0) {
      level = Math.max(level, escLevel);
    }

    // 3. Learner check (auto-approval of trusted patterns)
    if (this.learner.is_auto_approved(toolName)) {
      level = AuthLevel.SAFE;
    }

    let approved = level <= this.max_auto_level;

    // Match test expectations for the reason string.
    let reason: string;
    if ((level <= AuthLevel.READ || level === AuthLevel.AUTONOMOUS) && approved) {
      reason = "autonomous";
    } else if (approved) {
      reason = "Auto-approved";
    } else {
      reason = `Action level ${level} exceeds threshold`;
    }

    if (!approved) {
      // Try delivery
      if (this.delivery.ask(toolName, args)) {
        this.learner.record_approval(toolName);
        approved = true;
        reason = "User approved";
      } else {
        this.learner.record_denial(toolName);
      }
    }

    this.audit.record(toolName, args, level, approved, reason);

    const d = new Decision(approved, reason, Math.trunc(level));
    d.id = this._id_counter;
    d.decision_id = String(this._id_counter);
    return d;
  }

  emergency_pause(): void {
    this._paused = true;
  }

  resume(): void {
    this._paused = false;
  }

  summary(): string {
    return `Authority: ${this._paused ? "PAUSED" : "Active"} | Audit: ${this.audit.path}`;
  }

  recent_audit(n = 10): string {
    const rows = this.audit.recent(n);
    if (rows.length === 0) return "No audit records.";
    const lines: string[] = [];
    for (const r of rows) {
      lines.push(
        `[${formatTime(Number(r["timestamp"] ?? 0))}] ` +
          `${String(r["tool"])} -> ${r["approved"] ? "OK" : "BLOCKED"} (${String(r["reason"])})`,
      );
    }
    return lines.join("\n");
  }

  /* camelCase aliases */
  emergencyPause(): void {
    this.emergency_pause();
  }
  recentAudit(n = 10): string {
    return this.recent_audit(n);
  }
}

/** `time.strftime('%H:%M:%S', time.localtime(ts))` for a float epoch. */
function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  const p = (x: number): string => String(x).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/* ── Module singleton ─────────────────────────────────────────────────────── */

let _engine_instance: AuthorityEngine | null = null;

export function get_engine(config?: Record<string, unknown> | null): AuthorityEngine {
  if (_engine_instance === null) {
    _engine_instance = new AuthorityEngine(config);
  }
  return _engine_instance;
}

export const getEngine = get_engine;

/** Test/reset hook (not present in Python; additive, keeps the singleton honest). */
export function _resetEngine(): void {
  _engine_instance = null;
}
