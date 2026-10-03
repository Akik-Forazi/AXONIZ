/**
 * axoniz.core.intelligence.confidence
 * ======================================
 * Confidence Scorer — Phase 1 of the AXONIZ dominance plan.
 *
 * Before taking any risky action, the agent asks itself:
 * "How confident am I that this is correct and safe?"
 *
 * If confidence is below threshold, it either:
 *   - Asks the user for clarification (interactive mode)
 *   - Skips the step and notes it (autonomous mode)
 *   - Tries a safer alternative
 *
 * This stops the agent before it destroys your files, corrupts
 * your DB, or runs an irreversible command it isn't sure about.
 *
 * Port notes (Python → Node):
 *   - `re.search(pattern, text, re.IGNORECASE)` → non-global `RegExp.test()`
 *     (non-global so `lastIndex` can never leak between calls).
 *   - Python's `str(value)` (used to flatten the arguments dict into one
 *     haystack) has no JS equivalent, so `pyStr()` reproduces the pieces the
 *     risk patterns and the loop check actually depend on: dicts render as
 *     `{'k': 'v'}`, the empty dict as `{}`, booleans as `True`/`False` and
 *     `None` for null. This matters: Python's loop check compares the first 80
 *     chars of a stored JSON blob against `str(args)`, which only ever matches
 *     for the empty-argument case (`"{}" in "{}"`).
 */

/* ─── Risk classification ──────────────────────────────────────────────────── */

// Tools rated by their destructiveness (0 = safe, 1 = irreversible)
const _TOOL_RISK: Record<string, number> = {
  // Safe reads
  file_read: 0.0,
  file_list: 0.0,
  file_search: 0.0,
  code_tree: 0.0,
  code_analyze: 0.0,
  web_search: 0.0,
  web_get: 0.0,
  memory_get: 0.0,
  memory_list: 0.0,
  palace_search: 0.0,
  palace_context: 0.0,
  palace_wings: 0.0,
  palace_rooms: 0.0,
  kg_query: 0.0,
  kg_timeline: 0.0,
  kg_stats: 0.0,
  diary_read: 0.0,
  git_status: 0.0,
  git_log: 0.0,
  git_diff: 0.0,
  git_branch: 0.0,
  // Low-risk writes
  file_append: 0.2,
  memory_save: 0.1,
  palace_store: 0.1,
  kg_add: 0.1,
  diary_write: 0.0,
  git_add: 0.2,
  code_lint: 0.1,
  // Medium risk
  file_write: 0.4,
  file_edit: 0.4,
  code_format: 0.3,
  git_commit: 0.3,
  git_checkout: 0.4,
  git_stash: 0.3,
  palace_check_dup: 0.0,
  palace_delete: 0.6,
  kg_invalidate: 0.4,
  // High risk
  shell_run: 0.7,
  shell_python: 0.6,
  git_push: 0.7,
  git_pull: 0.5,
  // Maximum risk
  file_delete: 0.9,
};

/** `[pattern, extra_risk, reason]`, mirroring `_RISKY_PATTERNS`. */
const _RISKY_PATTERNS: Array<[RegExp, number, string]> = [
  [/rm\s+-rf/i, 1.0, "rm -rf is irreversible"],
  [/format\s+[a-z]:/i, 1.0, "disk format detected"],
  [/drop\s+table/i, 0.9, "SQL DROP TABLE detected"],
  [/delete\s+from/i, 0.8, "SQL DELETE detected"],
  [/truncate/i, 0.8, "SQL TRUNCATE detected"],
  [/>\s*\/dev\//i, 0.9, "redirect to device detected"],
  [/shutil\.rmtree/i, 0.9, "rmtree detected"],
  [/os\.remove|os\.unlink/i, 0.7, "file deletion in code"],
  [/\.\.\.\/|\/\.\.\//i, 0.6, "path traversal detected"],
  [/chmod\s+777/i, 0.5, "dangerous permissions"],
  [/curl.*\|.*sh/i, 0.9, "pipe to shell detected"],
  [/wget.*\|.*bash/i, 0.9, "pipe to bash detected"],
  [/eval\s*\(/i, 0.7, "eval() detected"],
  [/exec\s*\(/i, 0.6, "exec() detected"],
  [/subprocess.*shell\s*=\s*True/i, 0.7, "shell=True detected"],
];

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

/** Approximate Python's `str(value)` for the value shapes tool arguments use. */
export function pyStr(v: unknown): string {
  if (v === null || v === undefined) return "None";
  if (typeof v === "string") return `'${v}'`;
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  if (Array.isArray(v)) return `[${v.map((x) => pyStr(x)).join(", ")}]`;
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    const body = Object.keys(obj)
      .map((k) => `${pyStr(k)}: ${pyStr(obj[k])}`)
      .join(", ");
    return `{${body}}`;
  }
  return String(v);
}

/** Python's `round(x, 2)` for the non-huge values used here. */
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/** Python's `f"{x:.0%}"` (0.666 → "67%"). */
export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

function risksLabel(score: number): string {
  if (score <= 0.1) return "safe";
  if (score <= 0.3) return "low risk";
  if (score <= 0.5) return "moderate risk";
  if (score <= 0.7) return "high risk";
  return "very high risk";
}

/* ─── assess_risk ─────────────────────────────────────────────────────────── */

/**
 * `(risk_score 0.0-1.0, reason)`.
 * 0.0 = completely safe, 1.0 = extremely dangerous.
 *
 * The tuple is returned as an array that also carries `risk` / `reason`
 * properties, so both `const [risk, reason] = assess_risk(...)` (Python's
 * tuple unpacking) and `assess_risk(...).risk` work. JSON serialisation still
 * produces a two-element array, preserving the Python shape.
 */
export type RiskAssessment = [number, string] & { risk: number; reason: string };

export function assess_risk(tool_name: string, args: Record<string, unknown>): RiskAssessment {
  let base = _TOOL_RISK[tool_name] ?? 0.5;
  const reasons: string[] = [];

  // Check argument content for dangerous patterns
  const args_text = Object.values(args ?? {})
    .map((v) => pyStr(v))
    .join(" ")
    .toLowerCase();
  for (const [pattern, extra_risk, reason] of _RISKY_PATTERNS) {
    if (pattern.test(args_text)) {
      base = Math.max(base, extra_risk);
      reasons.push(reason);
    }
  }

  // Extra checks for specific tools
  if (tool_name === "shell_run") {
    const cmd = String((args ?? {})["command"] ?? "");
    // System-level destructive commands
    if (["mkfs", "fdisk", "parted", "dd if="].some((kw) => cmd.includes(kw))) {
      base = 1.0;
      reasons.push("system-level destructive command");
    }
    // Network downloads piped to shell (Python used a case-sensitive search)
    if (/(curl|wget).*(sh|bash|python|node)/.test(cmd)) {
      base = Math.max(base, 0.9);
      reasons.push("remote code execution pattern");
    }
  }

  if (tool_name === "file_delete") {
    const p = String((args ?? {})["path"] ?? "");
    // Deleting directories or system-looking paths
    if (p.includes(".git") || p === "." || p === "/" || p === "C:\\") {
      base = 1.0;
      reasons.push("deleting critical path");
    }
  }

  if (tool_name === "file_write") {
    const p = String((args ?? {})["path"] ?? "").toLowerCase();
    // Writing to config/system files
    if ([".bashrc", ".zshrc", "hosts", "sudoers", "passwd"].some((x) => p.includes(x))) {
      base = Math.max(base, 0.8);
      reasons.push("writing to system config");
    }
  }

  const reason_str = reasons.length > 0 ? reasons.join("; ") : risksLabel(base);
  const risk = round2(base);
  const tuple: [number, string] = [risk, reason_str];
  return Object.assign(tuple, { risk, reason: reason_str });
}

export const assessRisk = assess_risk;

/* ─── ConfidenceScorer ────────────────────────────────────────────────────── */

/** Structural view of the trajectory store this scorer only reads from. */
export interface TrajectoryLike {
  repeated_args?(session_id: string, threshold?: number): Array<Record<string, unknown>>;
  repeatedArgs?(session_id: string, threshold?: number): Array<Record<string, unknown>>;
  recent_failures?(tool_name?: string | null, limit?: number): Array<Record<string, unknown>>;
  recentFailures?(tool_name?: string | null, limit?: number): Array<Record<string, unknown>>;
}

/** Shape of what `ConfidenceScorer.check()` returns (Python dict keys preserved). */
export interface CheckResult {
  allow: boolean;
  confidence: number;
  risk: number;
  risk_label: string;
  reason: string;
  warnings: string[];
}

export interface ConfidenceScorerOptions {
  risk_threshold?: number;
  trajectory_store?: TrajectoryLike | null;
}

/** Keyword-argument form of `ConfidenceScorer.check()` (Python's `**kwargs`). */
export interface CheckArgs {
  tool_name: string;
  args: Record<string, unknown>;
  task?: string;
  session_id?: string;
}

/**
 * Scores the agent's confidence before taking an action.
 * Combines:
 *   - Tool risk level
 *   - Trajectory history (has this failed before?)
 *   - Context coherence (does the action make sense given the task?)
 *
 * The agent calls check() before executing any tool.
 * If confidence < threshold, it can stop, ask, or skip.
 */
export class ConfidenceScorer {
  risk_threshold: number;
  traj: TrajectoryLike | null;

  constructor(risk_threshold?: number, trajectory_store?: TrajectoryLike | null);
  constructor(options?: ConfidenceScorerOptions);
  constructor(
    risk_threshold: number | ConfidenceScorerOptions = 0.7,
    trajectory_store: TrajectoryLike | null = null,
  ) {
    if (typeof risk_threshold === "object" && risk_threshold !== null) {
      this.risk_threshold = risk_threshold.risk_threshold ?? 0.7;
      this.traj = risk_threshold.trajectory_store ?? null;
    } else {
      this.risk_threshold = risk_threshold;
      this.traj = trajectory_store;
    }
  }

  get riskThreshold(): number {
    return this.risk_threshold;
  }

  /**
   * Returns:
   * {
   *     "allow":       bool,    # should the agent proceed?
   *     "confidence":  float,   # 0.0-1.0 how confident we are it's OK
   *     "risk":        float,   # 0.0-1.0 how dangerous this action is
   *     "risk_label":  str,
   *     "reason":      str,
   *     "warnings":    list[str],
   * }
   *
   * Both Python's positional form and a single options object are accepted.
   */
  check(init: CheckArgs): CheckResult;
  check(tool_name: string, args: Record<string, unknown>, task?: string, session_id?: string): CheckResult;
  check(
    a: CheckArgs | string,
    args: Record<string, unknown> = {},
    task = "",
    session_id = "",
  ): CheckResult {
    const o: CheckArgs =
      typeof a === "string" ? { tool_name: a, args, task, session_id } : a;
    const tool_name = o.tool_name;
    const toolArgs = o.args ?? {};
    const sessionId = o.session_id ?? "";
    void (o.task ?? ""); // Python accepted `task` for context coherence; it is unused there too.

    const [risk, risk_reason] = assess_risk(tool_name, toolArgs);
    const warnings: string[] = [];

    // Check trajectory for repeated failures on this tool
    let failure_penalty = 0.0;
    if (this.traj && sessionId) {
      const loops =
        this.traj.repeated_args?.(sessionId, 2) ??
        this.traj.repeatedArgs?.(sessionId, 2) ??
        [];
      const args_json = pyStr(toolArgs);
      for (const lp of loops) {
        // `lp["args_json"][:80] in args_json` — Python's `in` is a substring
        // test and is True for the empty prefix, so `includes("")` matches it.
        const prefix = String(lp["args_json"] ?? "").slice(0, 80);
        if (String(lp["tool_name"]) === tool_name && args_json.includes(prefix)) {
          failure_penalty = 0.3;
          warnings.push(
            `This exact ${tool_name} call has been made ${lp["cnt"]}x already — possible loop`,
          );
          break;
        }
      }
    }

    // Recent failures on this tool in this session
    if (this.traj) {
      const recent =
        this.traj.recent_failures?.(tool_name, 3) ?? this.traj.recentFailures?.(tool_name, 3) ?? [];
      if (recent.length > 0) {
        failure_penalty = Math.max(failure_penalty, 0.15);
        warnings.push(`${tool_name} has failed recently (${recent.length} times)`);
      }
    }

    // Effective risk = base risk + failure penalty
    const effective_risk = Math.min(1.0, risk + failure_penalty);

    // Confidence = inverse of effective risk
    const confidence = round2(1.0 - effective_risk);

    // Decision
    let allow = effective_risk < this.risk_threshold;

    // Force-block truly catastrophic actions regardless of threshold
    if (risk >= 0.95) {
      allow = false;
      warnings.push("Action classified as catastrophic — blocked unconditionally");
    }

    return {
      allow,
      confidence,
      risk: effective_risk,
      risk_label: risksLabel(effective_risk),
      reason: risk_reason,
      warnings,
    };
  }

  /** camelCase alias, same two call styles. */
  checkAction(init: CheckArgs): CheckResult;
  checkAction(
    tool_name: string,
    args: Record<string, unknown>,
    task?: string,
    session_id?: string,
  ): CheckResult;
  checkAction(
    a: CheckArgs | string,
    args: Record<string, unknown> = {},
    task = "",
    session_id = "",
  ): CheckResult {
    return typeof a === "string" ? this.check(a, args, task, session_id) : this.check(a);
  }

  /** Format a human-readable warning for the agent to see. */
  format_warning(check_result: CheckResult, tool_name: string, args: Record<string, unknown>): string {
    void args; // Python's signature took `args` and never used it.
    const lines = [
      `⚠ CONFIDENCE CHECK: ${tool_name}`,
      `  Risk:       ${pct(check_result.risk)} (${check_result.risk_label})`,
      `  Confidence: ${pct(check_result.confidence)}`,
    ];
    if (check_result.reason) {
      lines.push(`  Reason:     ${check_result.reason}`);
    }
    for (const w of check_result.warnings) {
      lines.push(`  Warning:    ${w}`);
    }
    if (!check_result.allow) {
      lines.push("  DECISION:   BLOCKED — too risky to proceed without verification");
    } else {
      lines.push("  DECISION:   Proceeding with caution");
    }
    return lines.join("\n");
  }

  /** camelCase alias. */
  formatWarning(
    check_result: CheckResult,
    tool_name: string,
    args: Record<string, unknown>,
  ): string {
    return this.format_warning(check_result, tool_name, args);
  }
}
