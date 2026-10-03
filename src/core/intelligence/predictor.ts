/**
 * axoniz.core.intelligence.predictor
 * =====================================
 * Phase 5 — Predictive Intelligence
 *
 * You open a file, axoniz has already pre-loaded the related context,
 * run the relevant tests, and has a suggested answer before you type anything.
 *
 * It studies your session history to know:
 *   - Where you get stuck
 *   - Which files break most
 *   - What patterns predict problems
 *   - What you're likely to ask next
 *
 * This is not autocomplete. This is intent modeling from behavioral history.
 *
 * Architecture:
 *   SessionAnalyzer    — mines trajectory + history for behavioral patterns
 *   PredictiveContext  — pre-loads context based on what file you opened
 *   IntentPredictor    — predicts likely next query from recent actions
 *   HotspotTracker     — tracks which files/symbols cause the most trouble
 *
 * Port notes (Python → Node):
 *   - `PredictiveContext.preload_async` used `threading.Thread(daemon=True)`;
 *     the port schedules the work on the microtask queue instead (Node has no
 *     threads and the work is I/O bound).
 *   - `PredictiveContext.preload_file` / `_build_context` are `async` because
 *     the palace (unified memory) search is async in the Node port.
 *     `get_ready_context`, `IntentPredictor.predict`, `HotspotTracker` and
 *     `PredictiveEngine.on_task_start` stay synchronous.
 *   - `json.loads(fail["args_json"])` → `_safeParse`, which returns `{}` for a
 *     corrupt blob instead of raising the way Python would.
 */

import path from "node:path";

import { pct } from "./confidence.js";

/* ─── Trajectory surface this module reads ────────────────────────────────── */

export interface TrajectoryQueryable {
  tool_stats?(): Array<Record<string, unknown>>;
  toolStats?(): Array<Record<string, unknown>>;
  recent_failures?(tool_name?: string | null, limit?: number): Array<Record<string, unknown>>;
  recentFailures?(tool_name?: string | null, limit?: number): Array<Record<string, unknown>>;
  get_session_steps?(session_id: string): Array<Record<string, unknown>>;
  getSessionSteps?(session_id: string): Array<Record<string, unknown>>;
}

function _toolStats(t: TrajectoryQueryable): Array<Record<string, unknown>> {
  return t.tool_stats?.() ?? t.toolStats?.() ?? [];
}

function _recentFailures(
  t: TrajectoryQueryable,
  limit: number,
  tool_name: string | null = null,
): Array<Record<string, unknown>> {
  return t.recent_failures?.(tool_name, limit) ?? t.recentFailures?.(tool_name, limit) ?? [];
}

function _sessionSteps(t: TrajectoryQueryable, session_id: string): Array<Record<string, unknown>> {
  return t.get_session_steps?.(session_id) ?? t.getSessionSteps?.(session_id) ?? [];
}

/** `json.loads(x or "{}")`, tolerant of corrupt values. */
function _safeParse(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string" || !raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function _num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function _now(): number {
  return Date.now() / 1000;
}

/* ─── Session patterns ───────────────────────────────────────────────────────── */

export interface BehaviorPatternInit {
  /** stuck / error_loop / productive / exploratory */
  pattern_type: string;
  frequency: number;
  files?: string[];
  tools?: string[];
  description?: string;
}

export class BehaviorPattern {
  pattern_type: string;
  frequency: number;
  files: string[];
  tools: string[];
  description: string;

  constructor(init: BehaviorPatternInit) {
    this.pattern_type = init.pattern_type;
    this.frequency = init.frequency;
    this.files = init.files ?? [];
    this.tools = init.tools ?? [];
    this.description = init.description ?? "";
  }

  get patternType(): string {
    return this.pattern_type;
  }
}

export interface HotspotInit {
  path: string;
  error_count: number;
  edit_count?: number;
  last_touched?: number;
  typical_error?: string;
  risk_score?: number;
}

export class Hotspot {
  path: string;
  error_count: number;
  edit_count: number;
  last_touched: number;
  typical_error: string;
  risk_score: number;

  constructor(init: HotspotInit) {
    this.path = init.path;
    this.error_count = init.error_count;
    this.edit_count = init.edit_count ?? 0;
    this.last_touched = init.last_touched ?? _now();
    this.typical_error = init.typical_error ?? "unknown";
    this.risk_score = init.risk_score ?? 0;
  }

  get errorCount(): number {
    return this.error_count;
  }
  get riskScore(): number {
    return this.risk_score;
  }
}

export interface PredictedIntentInit {
  query: string;
  /** 0-1 */
  confidence: number;
  /** pre-loaded context to inject */
  context?: string;
  /** suggested first action */
  suggested?: string;
  reasoning?: string;
}

export class PredictedIntent {
  query: string;
  confidence: number;
  context: string;
  suggested: string;
  reasoning: string;

  constructor(init: PredictedIntentInit) {
    this.query = init.query;
    this.confidence = init.confidence;
    this.context = init.context ?? "";
    this.suggested = init.suggested ?? "";
    this.reasoning = init.reasoning ?? "";
  }
}

/* ─── Session Analyzer ───────────────────────────────────────────────────────── */

/**
 * Mines the trajectory database to extract behavioral patterns.
 * Learns: where you get stuck, which tools fail most, which files cause pain.
 */
export class SessionAnalyzer {
  traj: TrajectoryQueryable;

  constructor(trajectory: TrajectoryQueryable) {
    this.traj = trajectory;
  }

  /** Files that cause the most errors. */
  get_hotspots(limit = 10): Hotspot[] {
    const failures = _recentFailures(this.traj, 100);

    // Count errors per file
    const file_errors = new Map<string, number>();
    const file_tools = new Map<string, string>();

    for (const fail of failures) {
      const args = _safeParse(fail["args_json"]);
      const fpath = args["path"] ?? String(args["command"] ?? "").slice(0, 50);
      if (fpath) {
        const key = String(fpath);
        file_errors.set(key, (file_errors.get(key) ?? 0) + 1);
        file_tools.set(key, String(fail["tool_name"] ?? ""));
      }
    }

    const ordered = [...file_errors.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
    return ordered.map(
      ([fpath, count]) =>
        new Hotspot({
          path: fpath,
          error_count: count,
          edit_count: 0, // would need richer tracking
          last_touched: _now(),
          typical_error: file_tools.get(fpath) ?? "unknown",
          risk_score: Math.min(1.0, count / 10),
        }),
    );
  }

  /** camelCase alias. */
  getHotspots(limit = 10): Hotspot[] {
    return this.get_hotspots(limit);
  }

  /** Identify recurring behavior patterns from tool usage. */
  get_patterns(): BehaviorPattern[] {
    const stats = _toolStats(this.traj);
    if (stats.length === 0) {
      return [];
    }

    const patterns: BehaviorPattern[] = [];
    const tool_counts = new Map<string, number>();
    const fail_rates = new Map<string, number>();
    for (const s of stats) {
      const name = String(s["tool_name"]);
      const total = _num(s["total"]);
      tool_counts.set(name, total);
      fail_rates.set(name, _num(s["failures"]) / Math.max(total, 1));
    }

    // Pattern: stuck in shell_run loops
    if ((tool_counts.get("shell_run") ?? 0) > 10 && (fail_rates.get("shell_run") ?? 0) > 0.4) {
      patterns.push(
        new BehaviorPattern({
          pattern_type: "error_loop",
          frequency: Math.trunc(tool_counts.get("shell_run") ?? 0),
          files: [],
          tools: ["shell_run"],
          description: "Frequent shell_run failures — possibly environment/path issues",
        }),
      );
    }

    // Pattern: heavy file editing
    const edit_total = (tool_counts.get("file_edit") ?? 0) + (tool_counts.get("file_write") ?? 0);
    if (edit_total > 20) {
      patterns.push(
        new BehaviorPattern({
          pattern_type: "productive",
          frequency: edit_total,
          files: [],
          tools: ["file_edit", "file_write"],
          description: `Heavy file editing — ${edit_total} write operations`,
        }),
      );
    }

    // Pattern: exploration (lots of reads, lists)
    const explore =
      (tool_counts.get("file_read") ?? 0) +
      (tool_counts.get("file_list") ?? 0) +
      (tool_counts.get("code_tree") ?? 0);
    if (explore > 15) {
      patterns.push(
        new BehaviorPattern({
          pattern_type: "exploratory",
          frequency: explore,
          files: [],
          tools: ["file_read", "file_list"],
          description: `Exploration mode — ${explore} read operations without many writes`,
        }),
      );
    }

    return patterns;
  }

  /** camelCase alias. */
  getPatterns(): BehaviorPattern[] {
    return this.get_patterns();
  }

  /** Files that appear most in tool call arguments. */
  most_used_files(limit = 10): string[] {
    void limit; // Populated as trajectory accumulates session data
    return [];
  }

  /** camelCase alias. */
  mostUsedFiles(limit = 10): string[] {
    return this.most_used_files(limit);
  }

  /** One-paragraph behavioral summary. */
  summary(): string {
    const stats = _toolStats(this.traj);
    const patterns = this.get_patterns();
    const hotspots = this.get_hotspots(3);

    if (stats.length === 0) {
      return "No behavioral data yet — session history will build over time.";
    }

    const total_calls = stats.reduce((acc, s) => acc + _num(s["total"]), 0);
    const total_errors = stats.reduce((acc, s) => acc + _num(s["failures"]), 0);
    const error_rate = total_errors / Math.max(total_calls, 1);

    const top_tools = [...stats].sort((a, b) => _num(b["total"]) - _num(a["total"])).slice(0, 3);
    const top_str = top_tools.map((s) => `${String(s["tool_name"])}(${_num(s["total"])})`).join(", ");

    const parts = [
      `Behavioral summary: ${total_calls} tool calls, ${pct(error_rate)} error rate.`,
      `Most used: ${top_str}.`,
    ];
    if (patterns.length > 0) {
      parts.push(`Patterns: ${patterns.slice(0, 2).map((p) => p.description).join("; ")}.`);
    }
    if (hotspots.length > 0) {
      parts.push(`Problem areas: ${hotspots.slice(0, 3).map((h) => path.basename(h.path)).join(", ")}.`);
    }

    return parts.join(" ");
  }
}

/* ─── Predictive Context ─────────────────────────────────────────────────────── */

export interface PredictivePalace {
  is_available?(): boolean;
  isAvailable?(): boolean;
  search?(query: string, opts?: { limit?: number }): unknown;
}

export interface PredictiveAgent {
  ast_index?: { get_file_context?(p: string): string; getFileContext?(p: string): string };
  astIndex?: { get_file_context?(p: string): string; getFileContext?(p: string): string };
  trajectory: TrajectoryQueryable;
  memory?: { palace?: PredictivePalace };
}

/**
 * When you open a file, pre-load all related context:
 * - What the file contains (AST symbols)
 * - What imports it (who depends on it)
 * - Recent errors in this file
 * - Related palace memories
 *
 * This context is ready before you even ask your first question.
 */
export class PredictiveContext {
  agent: PredictiveAgent;
  _cache = new Map<string, [string, number]>(); // path → (context, timestamp)
  _cache_ttl = 60.0; // seconds

  constructor(agent: PredictiveAgent) {
    this.agent = agent;
  }

  /**
   * Pre-load context for a file. Returns context string.
   * Runs in the background so it doesn't block (Python spawned a thread; the
   * Node port returns a Promise because the palace lookup is async).
   */
  async preload_file(file_path: string): Promise<string> {
    const now = _now();
    const cached = this._cache.get(file_path);
    if (cached && now - cached[1] < this._cache_ttl) {
      return cached[0];
    }

    const context = await this._build_context(file_path);
    this._cache.set(file_path, [context, now]);
    return context;
  }

  /** camelCase alias. */
  preloadFile(file_path: string): Promise<string> {
    return this.preload_file(file_path);
  }

  /** Fire-and-forget background preload. */
  preload_async(file_path: string): void {
    void this.preload_file(file_path).catch(() => undefined);
  }

  /** camelCase alias. */
  preloadAsync(file_path: string): void {
    this.preload_async(file_path);
  }

  async _build_context(file_path: string): Promise<string> {
    const parts: string[] = [];

    // AST context
    const astIndex = this.agent.ast_index ?? this.agent.astIndex;
    if (astIndex) {
      try {
        const ctx = astIndex.get_file_context?.(file_path) ?? astIndex.getFileContext?.(file_path);
        if (ctx) {
          parts.push(ctx);
        }
      } catch {
        /* index unavailable — ignore */
      }
    }

    // Recent failures in this file
    const failures = _recentFailures(this.agent.trajectory, 20);
    const file_failures = failures.filter((f) => String(f["args_json"] ?? "").includes(file_path));
    if (file_failures.length > 0) {
      parts.push(
        `Recent errors in this file (${file_failures.length}):\n` +
          file_failures
            .slice(0, 3)
            .map((f) => `  ${String(f["tool_name"])}: ${String(f["result_head"] ?? "").slice(0, 80)}`)
            .join("\n"),
      );
    }

    // Palace search for this file
    const palace = this.agent.memory?.palace;
    const available = Boolean(
      palace && ((palace.is_available?.() ?? false) || (palace.isAvailable?.() ?? false)),
    );
    if (palace && available && typeof palace.search === "function") {
      try {
        const rel = path.basename(file_path);
        const r = (await palace.search(rel, { limit: 2 })) as
          | { results?: Array<Record<string, unknown>> }
          | Array<Record<string, unknown>>
          | null;
        const hits = Array.isArray(r) ? r : (r?.results ?? []);
        if (hits.length > 0) {
          parts.push(
            "Related memory:\n" +
              hits.map((h) => `  ${String(h["text"] ?? "").slice(0, 150)}`).join("\n"),
          );
        }
      } catch {
        /* palace search failure must not break preloading */
      }
    }

    return parts.length > 0 ? parts.join("\n\n") : "";
  }

  /** Get cached context if available (never blocks). */
  get_ready_context(file_path: string): string {
    const cached = this._cache.get(file_path);
    if (cached) {
      return cached[0];
    }
    return "";
  }

  /** camelCase alias. */
  getReadyContext(file_path: string): string {
    return this.get_ready_context(file_path);
  }
}

/* ─── Intent Predictor ───────────────────────────────────────────────────────── */

/**
 * Predicts what you're likely to ask next, based on:
 * - What file you just opened
 * - Recent tool call sequence
 * - Session history patterns
 * - Time of day / working patterns
 *
 * No model needed — pure rule-based pattern matching over trajectory.
 * Fast enough to run synchronously.
 */
export class IntentPredictor {
  /** [recent tools] → predicted query, suggested action */
  static readonly SEQUENCE_RULES: Array<[string[], string, string]> = [
    [
      ["file_read", "file_read"],
      "Understand how these files relate to each other",
      "code_analyze to map the structure",
    ],
    [["file_write", "shell_run"], "Test if the code you wrote works", "shell_python to run tests"],
    [
      ["shell_run", "shell_run", "shell_run"],
      "Debugging a command that keeps failing",
      "file_read to check the script for the issue",
    ],
    [
      ["file_edit", "file_edit", "file_edit"],
      "Refactoring a file — check for consistency",
      "code_lint to find remaining issues",
    ],
    [
      ["web_search", "file_write"],
      "Implementing something from research",
      "shell_python to test the implementation",
    ],
    [
      ["code_tree", "file_read"],
      "Exploring a new codebase",
      "code_analyze to understand the structure",
    ],
    [
      ["file_delete", "file_write"],
      "Replacing a file — check nothing else broke",
      "ast_find_callers to check dependencies",
    ],
  ];

  traj: TrajectoryQueryable;

  constructor(trajectory: TrajectoryQueryable) {
    this.traj = trajectory;
  }

  /** Predict likely next intent from recent tool sequence. */
  predict(session_id: string, recent_n = 5): PredictedIntent | null {
    const recent = _sessionSteps(this.traj, session_id).slice(-recent_n);
    if (recent.length === 0) {
      return null;
    }

    const recent_tools = recent.map((s) => String(s["tool_name"]));

    // Try sequence rules
    for (const [rule_seq, query, suggestion] of IntentPredictor.SEQUENCE_RULES) {
      if (recent_tools.length >= rule_seq.length) {
        const tail = recent_tools.slice(-rule_seq.length);
        if (tail.length === rule_seq.length && tail.every((t, i) => t === rule_seq[i])) {
          return new PredictedIntent({
            query,
            confidence: 0.7,
            context: "",
            suggested: suggestion,
            reasoning: `You just ran: ${rule_seq.join(" → ")}`,
          });
        }
      }
    }

    // Fallback: last tool failed → predict retry
    const last = recent[recent.length - 1]!;
    if (_num(last["success"]) === 0) {
      return new PredictedIntent({
        query: `Fix the error in ${String(last["tool_name"])}`,
        confidence: 0.8,
        context: `Last error: ${String(last["result_head"] ?? "").slice(0, 200)}`,
        suggested: "Read the error and fix the issue",
        reasoning: "Last tool call failed",
      });
    }

    return null;
  }

  /** Return a pre-loaded suggestion string for the UI. */
  preload_suggestion(session_id: string): string {
    const pred = this.predict(session_id);
    if (!pred) {
      return "";
    }
    return (
      `💡 Predicted: ${pred.query}\n` +
      `   Suggested action: ${pred.suggested}\n` +
      `   (because: ${pred.reasoning})`
    );
  }

  /** camelCase alias. */
  preloadSuggestion(session_id: string): string {
    return this.preload_suggestion(session_id);
  }
}

/* ─── Hotspot Tracker ────────────────────────────────────────────────────────── */

/**
 * Tracks which files and functions cause the most problems over time.
 * Feeds into the predictive system to pre-load context for problem areas.
 */
export class HotspotTracker {
  traj: TrajectoryQueryable;
  _hotspots: Hotspot[] = [];
  _last_update = 0.0;

  constructor(trajectory: TrajectoryQueryable) {
    this.traj = trajectory;
  }

  get_hotspots(refresh = false): Hotspot[] {
    const now = _now();
    if (refresh || now - this._last_update > 60) {
      const analyzer = new SessionAnalyzer(this.traj);
      this._hotspots = analyzer.get_hotspots();
      this._last_update = now;
    }
    return this._hotspots;
  }

  /** camelCase alias. */
  getHotspots(refresh = false): Hotspot[] {
    return this.get_hotspots(refresh);
  }

  is_hotspot(file_path: string): boolean {
    for (const h of this.get_hotspots()) {
      if (file_path.includes(h.path) || h.path.includes(file_path)) {
        return true;
      }
    }
    return false;
  }

  /** camelCase alias. */
  isHotspot(file_path: string): boolean {
    return this.is_hotspot(file_path);
  }

  format(): string {
    const hotspots = this.get_hotspots();
    if (hotspots.length === 0) {
      return "No problem files identified yet.";
    }
    const lines = ["Problem files (by error frequency):"];
    for (const h of hotspots.slice(0, 5)) {
      lines.push(
        `  ${path.basename(h.path)}: ` +
          `${h.error_count} errors, ` +
          `risk=${pct(h.risk_score)}`,
      );
    }
    return lines.join("\n");
  }
}

/* ─── Predictive Engine (top-level) ──────────────────────────────────────────── */

/**
 * Combines all prediction components into one object wired into the Agent.
 *
 * At every turn:
 * 1. Prefetch context for recently accessed files
 * 2. Predict likely next intent
 * 3. Track hotspots
 * 4. Inject everything into the system prompt silently
 */
export class PredictiveEngine {
  agent: PredictiveAgent;
  analyzer: SessionAnalyzer;
  predictor: IntentPredictor;
  hotspots: HotspotTracker;
  ctx_cache: PredictiveContext;

  constructor(agent: PredictiveAgent) {
    this.agent = agent;
    this.analyzer = new SessionAnalyzer(agent.trajectory);
    this.predictor = new IntentPredictor(agent.trajectory);
    this.hotspots = new HotspotTracker(agent.trajectory);
    this.ctx_cache = new PredictiveContext(agent);
  }

  get ctxCache(): PredictiveContext {
    return this.ctx_cache;
  }

  /**
   * Called at the start of each agent run.
   * Returns a context block to inject into the system prompt.
   */
  on_task_start(task: string, session_id: string): string {
    void task; // Python accepted the task text and only used the session id.
    const parts: string[] = [];

    // Behavioral summary
    const summary = this.analyzer.summary();
    if (summary && !summary.includes("No behavioral data")) {
      parts.push(`[BEHAVIORAL CONTEXT]\n${summary}`);
    }

    // Intent prediction
    if (session_id) {
      const pred = this.predictor.predict(session_id);
      if (pred && pred.confidence > 0.6) {
        parts.push(`[PREDICTED NEXT STEP]\n${pred.query}\nSuggested: ${pred.suggested}`);
      }
    }

    // Hotspot warning
    const hotspot_str = this.hotspots.format();
    if (!hotspot_str.includes("No problem files")) {
      parts.push(`[PROBLEM FILES]\n${hotspot_str}`);
    }

    return parts.join("\n\n");
  }

  /** camelCase alias. */
  onTaskStart(task: string, session_id: string): string {
    return this.on_task_start(task, session_id);
  }

  /** Pre-load context when user mentions a file. */
  on_file_open(file_path: string): Promise<string> {
    return this.ctx_cache.preload_file(file_path);
  }

  /** camelCase alias. */
  onFileOpen(file_path: string): Promise<string> {
    return this.on_file_open(file_path);
  }

  /** Scan text for file paths and preload them in background. */
  on_file_mention(text: string): void {
    const paths = text.match(/[\w/\\\-\.]+\.py/g) ?? [];
    for (const p of paths.slice(0, 3)) {
      this.ctx_cache.preload_async(p);
    }
  }

  /** camelCase alias. */
  onFileMention(text: string): void {
    this.on_file_mention(text);
  }

  get_stats(): Record<string, unknown> {
    const stats = _toolStats(this.agent.trajectory);
    const patterns = this.analyzer.get_patterns();
    const total = stats.reduce((acc, s) => acc + _num(s["total"]), 0);
    return {
      total_calls: total,
      error_rate: stats.reduce((acc, s) => acc + _num(s["failures"]), 0) / Math.max(total, 1),
      patterns: patterns.map((p) => p.pattern_type),
      hotspot_count: this.hotspots.get_hotspots().length,
    };
  }

  /** camelCase alias. */
  getStats(): Record<string, unknown> {
    return this.get_stats();
  }
}
