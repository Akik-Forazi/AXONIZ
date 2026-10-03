/**
 * AXONIZ — Core Engine — Agent Core v7
 * =====================================
 * Phase 1: TrajectoryStore, ConfidenceScorer, SelfCorrector — wired into exec()
 * Phase 2: SwarmOrchestrator — parallel sub-agent (Worker Swarm) execution
 * Phase 3: ASTIndexer — real AST codebase understanding
 * Phase 4: axonizDaemon — background file watcher + scheduled tasks
 * Phase 5: PredictiveEngine — intent modeling from behavioral history
 * Phase 6+: Persona engine (default.yaml), authority engine
 *
 * Port of axoniz/core/agent.py. All tool invocations are awaited, so the agent
 * loop, exec(), chat() and run() are async in this port.
 */
import path from "node:path";
import crypto from "node:crypto";
import { ChatHistory } from "./history.js";
import { debug, error, info, warn, getLogger } from "./debug.js";
import { WorkspaceIndexer, GitTools, TokenCounter, ContextCompressor } from "./extras.js";
import { FileTools } from "../tools/file_tools.js";
import { ShellTools } from "../tools/shell_tools.js";
import { WebTools } from "../tools/web_tools.js";
import { CodeTools } from "../tools/code_tools.js";
import { AxodexTools } from "../tools/axodex_tools.js";
import { ComputerTools } from "../tools/computer_tools.js";
import { UnifiedMemory } from "../integrations/unified_memory.js";
import {
  TrajectoryStore,
  getStore,
  ConfidenceScorer,
  SelfCorrector,
  SwarmOrchestrator,
  ASTIndexer,
  axonizDaemon,
  PredictiveEngine,
  SkillDistiller,
} from "./intelligence/index.js";
import { ShadowGuardReflex } from "./intelligence/reflex.js";
import { SemanticMemory as Memory } from "./memory.js";
import { getPersona, type Persona } from "./persona.js";
import { TOOL_SCHEMAS, type ToolFunctionSchema } from "./tool_schemas.js";
import {
  getBackend,
  isToolCallResponse,
  type Backend,
  type ChatMessage,
  type CompletionResult,
} from "./backend/index.js";
import type { AxonizConfig } from "./config.js";

export { Memory };

export interface Observation {
  tool: string;
  args: Record<string, unknown>;
  result: string;
  success: boolean;
  duration_ms: number;
}

/* ── Phase 7 lazy singletons: Authority / Workflows / Awareness / TTS / Goals ── */

let authorityEngine: unknown = null;
let workflowEngine: unknown = null;
let awarenessSvc: unknown = null;
let ttsEngine: unknown = null;
let goalService: unknown = null;
void awarenessSvc;

/** Minimal structural shapes so we never hard-depend on an unported module. */
export interface AuthorityLike {
  check(
    name: string,
    args: Record<string, unknown>,
    sessionId: string,
  ): { approved: boolean; reason: string };
  summary(): unknown;
  audit: { stats(): unknown; recent(limit: number): Array<Record<string, unknown>> };
  max_auto_level: number;
}
export interface WorkflowEngineLike {
  setAgentCallback(cb: (task: string) => Promise<string>): void;
  start(): void;
}
export interface TtsLike {
  is_available?: boolean;
  isAvailable?: boolean;
  speak_async?(text: string): void;
  speakAsync?(text: string): void;
}
export interface GoalServiceLike {
  create_goal(title: string, description: string, deadline: string, priority: string): {
    title: string;
    id: string;
  };
  list_goals(status: string): Array<{
    id: string;
    title: string;
    score: number;
    priority: { value: string } | string;
  }>;
  add_key_result(goalId: string, title: string, target: string, deadline: string): {
    title: string;
    id: string;
  };
  add_daily_action(krId: string, title: string, scheduledDate: string): {
    title: string;
    id: string;
  };
  update_score(goalId: string, score: number, krId?: string | null): string;
  complete_action(actionId: string): string;
  daily_report(): string;
}

async function getAuthority(): Promise<AuthorityLike | null> {
  if (authorityEngine === null) {
    try {
      const m = (await import("./authority.js")) as { getEngine: () => AuthorityLike };
      authorityEngine = m.getEngine();
    } catch {
      authorityEngine = false;
    }
  }
  return authorityEngine === false ? null : (authorityEngine as AuthorityLike);
}

async function getWorkflows(): Promise<WorkflowEngineLike | null> {
  if (workflowEngine === null) {
    try {
      const m = (await import("../workflows/engine.js")) as {
        getWorkflowEngine: () => WorkflowEngineLike;
      };
      workflowEngine = m.getWorkflowEngine();
    } catch {
      workflowEngine = false;
    }
  }
  return workflowEngine === false ? null : (workflowEngine as WorkflowEngineLike);
}

async function getTts(): Promise<TtsLike | null> {
  if (ttsEngine === null) {
    try {
      const m = (await import("../voice/tts.js")) as { getTts: () => TtsLike };
      ttsEngine = m.getTts();
    } catch {
      ttsEngine = false;
    }
  }
  return ttsEngine === false ? null : (ttsEngine as TtsLike);
}

async function getGoals(): Promise<GoalServiceLike | null> {
  if (goalService === null) {
    try {
      const m = (await import("../goals/service.js")) as {
        getGoalService: () => GoalServiceLike;
      };
      goalService = m.getGoalService();
    } catch {
      goalService = false;
    }
  }
  return goalService === false ? null : (goalService as GoalServiceLike);
}

/* ── Fallback system prompt (only if persona YAML fails to load) ──────────── */

const FALLBACK_SYSTEM_PROMPT =
  "You are FRAZIYM AI, a local-first AI agent.\n" +
  "Execute tasks with tools. Never guess. Read before editing. Verify after changes.\n" +
  "When done, call done() with a concise summary.";

/* ── Fallback tool-call parsing ───────────────────────────────────────────── */

const TOOL_RE = /<tool>([\s\S]*?)<\/tool>/g;
const JSON_FENCE_RE = /```(?:json)?\s*([\s\S]*?)```/g;

export interface ParsedCall {
  name: string;
  args: Record<string, unknown>;
}

/** Aggressive cleanup for 3B hallucinations (trailing commas, extra braces). */
function cleanupJson(content: string): string {
  let text = content.replace(/,(\s*[}\]])/g, "$1");
  if (text.startsWith("{")) {
    let count = 0;
    let endIdx = -1;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "{") count++;
      else if (text[i] === "}") count--;
      if (count === 0) {
        endIdx = i;
        break;
      }
    }
    if (endIdx !== -1) text = text.slice(0, endIdx + 1);
  }
  return text;
}

function coerceArgs(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

function callFromObject(obj: Record<string, unknown>): ParsedCall | null {
  const name = obj.name ?? obj.tool ?? obj.function;
  if (!name) return null;
  return { name: String(name), args: coerceArgs(obj.args ?? obj.arguments ?? obj.parameters ?? {}) };
}

export function parseFallbackCalls(text: string): ParsedCall[] {
  const calls: ParsedCall[] = [];

  // 1. Primary: <tool>{...}</tool>
  for (const m of text.matchAll(TOOL_RE)) {
    const content = cleanupJson((m[1] ?? "").trim());
    try {
      const obj = JSON.parse(content) as Record<string, unknown>;
      const call = callFromObject(obj);
      if (call) calls.push(call);
    } catch {
      const fnMatch = content.match(/"(?:name|tool|function)"\s*:\s*"(\w+)"/);
      if (fnMatch) calls.push({ name: fnMatch[1], args: {} });
    }
  }
  if (calls.length > 0) return calls;

  // 2. ```json fenced blocks
  for (const m of text.matchAll(JSON_FENCE_RE)) {
    try {
      const obj = JSON.parse((m[1] ?? "").trim()) as Record<string, unknown>;
      const name = obj.name ?? obj.tool;
      if (name) calls.push({ name: String(name), args: coerceArgs(obj.args ?? obj.arguments ?? {}) });
    } catch {
      /* ignore */
    }
  }
  if (calls.length > 0) return calls;

  // 3. Bare {"name": "...", ...} objects
  for (const m of text.matchAll(/\{[^{}]*"name"\s*:\s*"(\w+)"[^{}]*\}/g)) {
    try {
      const obj = JSON.parse(m[0]) as Record<string, unknown>;
      const name = obj.name ?? obj.tool;
      if (name) calls.push({ name: String(name), args: coerceArgs(obj.args ?? obj.arguments ?? {}) });
    } catch {
      /* ignore */
    }
  }
  return calls;
}

const DONE_MARKERS = [
  "task complete",
  "task is complete",
  "all done",
  "i have completed",
  "i've completed",
  "finished.",
  "the task has been",
  "<endofop>",
  "i have finished",
  "successfully completed",
  "no more steps",
  "everything is done",
  "task accomplished",
];

export function isDone(text: string): boolean {
  const t = text.toLowerCase();
  return DONE_MARKERS.some((s) => t.includes(s));
}

/* ── Callback + tool types ────────────────────────────────────────────────── */

export type StepCallback = (step: number, total: number) => void;
export type TokenCallback = (token: string) => void;
export type ToolCallCallback = (name: string, args: Record<string, unknown>) => void;
export type ToolResultCallback = (name: string, result: string) => void;

/** A tool implementation: zero-arg or single-args-object, sync or async. */
export type ToolFn = (args?: Record<string, unknown>) => string | Promise<string>;

export interface DaemonEvent {
  kind: string;
  payload: Record<string, unknown>;
  ts?: number;
}

/** Simple abort signal wrapper mirroring Python's threading.Event. */
export class AbortFlag {
  private flag = false;
  set(): void {
    this.flag = true;
  }
  clear(): void {
    this.flag = false;
  }
  isSet(): boolean {
    return this.flag;
  }
}

export class Agent {
  readonly config: AxonizConfig & Record<string, unknown>;
  readonly workspace: string;

  /* Core tools */
  readonly fileTools: FileTools;
  readonly shellTools: ShellTools;
  readonly webTools: WebTools;
  readonly codeTools: CodeTools;
  readonly computerTools: ComputerTools;
  readonly reflex: ShadowGuardReflex;
  readonly history: ChatHistory;
  readonly gitTools: GitTools;
  readonly indexer: WorkspaceIndexer;
  readonly astIndex: ASTIndexer;
  readonly axodex: AxodexTools;

  /* Intelligence */
  readonly compressor: ContextCompressor;
  readonly memory: UnifiedMemory;
  readonly persona: Persona;
  readonly trajectory: TrajectoryStore;
  readonly confidence: ConfidenceScorer;
  readonly corrector: SelfCorrector;
  readonly daemon: axonizDaemon;
  readonly predictor: PredictiveEngine;
  readonly distiller: SkillDistiller;

  standby: boolean;
  llm: Backend | null = null;
  backend: Backend | null = null;
  private llmLoaded = false;
  private useNative = true;

  private toolMap = new Map<string, ToolFn>();
  private trajSessionId: string | null = null;
  private finished = false;
  private finalResult: string | null = null;
  private abortFlag: AbortFlag | null = null;
  private stepCounter = 0;
  private taskText = "";
  /** Structured log of every tool invocation in this session. */
  readonly observations: Observation[] = [];

  onStep: StepCallback | null = null;
  onToken: TokenCallback | null = null;
  onThought: TokenCallback | null = null;
  onToolCall: ToolCallCallback | null = null;
  onToolResult: ToolResultCallback | null = null;
  onDone: TokenCallback | null = null;

  constructor(kwargs: Record<string, unknown> = {}) {
    const drop = new Set(["web_port", "_home", "_models_dir"]);
    this.config = Object.fromEntries(
      Object.entries(kwargs).filter(([k]) => !drop.has(k)),
    ) as AxonizConfig & Record<string, unknown>;
    this.workspace = path.resolve(String(kwargs.workspace ?? "."));

    // ── Core tools ──
    this.fileTools = new FileTools(this.workspace);
    this.shellTools = new ShellTools(this.workspace);
    this.webTools = new WebTools(this.workspace);
    this.codeTools = new CodeTools(this.workspace);
    this.computerTools = new ComputerTools(this.workspace);
    this.reflex = new ShadowGuardReflex(this);
    this.history = new ChatHistory();
    this.gitTools = new GitTools(this.workspace);
    this.indexer = new WorkspaceIndexer(this.workspace);
    this.astIndex = new ASTIndexer(this.workspace);
    this.axodex = new AxodexTools(this.workspace);

    // ── Context compression (Phase 6+) ──
    // NOTE: ContextCompressor lives in extras.ts (ported with the core utilities).
    // Its constructor is positional: (maxTokens, keepTail).
    this.compressor = new ContextCompressor(
      Math.max(1000, Math.floor(Number(this.config.n_ctx ?? 32768) * 0.4)),
      6,
    );

    // Standby mode — don't load LLM weights on startup
    this.standby = Boolean(kwargs.standby ?? false);

    // Unified memory (TF-IDF + Palace + KG + Diary)
    this.memory = new UnifiedMemory({
      agent_name: String(kwargs.agent_name ?? "axoniz"),
    });

    // ── Persona (AXONIZ identity + role system) ──
    this.persona = getPersona(String(kwargs.role ?? "axoniz"));

    // ── Phase 1: self-aware execution intelligence ──
    this.trajectory = getStore();
    this.confidence = new ConfidenceScorer({
      risk_threshold: Number(kwargs.risk_threshold ?? 0.75),
      trajectory_store: this.trajectory as never,
    });
    this.corrector = new SelfCorrector();

    // ── Phase 4: background daemon — always on ──
    this.daemon = new axonizDaemon({
      agent: this,
      workspace: this.workspace,
      on_event: (e: DaemonEvent) => this.onDaemonEvent(e),
    });
    try {
      this.daemon.start();
    } catch (e) {
      warn(`[Daemon] failed to start: ${errText(e)}`);
    }

    // ── Phase 5 + 11 ──
    this.predictor = new PredictiveEngine(this);
    this.distiller = new SkillDistiller(this);

    // ── Tool map ──
    this.registerTools();

    if (!this.standby) this.buildLlm();
  }

  /* ── Tool registration ─────────────────────────────────────────────────── */

  private registerTools(): void {
    const t = this.toolMap;
    t.set("file_read", (a) => this.fileTools.read(String(a?.path ?? "")));
    t.set("file_write", (a) => this.fileTools.write(String(a?.path ?? ""), String(a?.content ?? "")));
    t.set("file_edit", (a) =>
      this.fileTools.edit(String(a?.path ?? ""), String(a?.old ?? ""), String(a?.new ?? "")),
    );
    t.set("file_delete", (a) => this.fileTools.delete(String(a?.path ?? "")));
    t.set("file_list", (a) => this.fileTools.listDir(String(a?.path ?? ".")));
    t.set("file_search", (a) =>
      this.fileTools.search(String(a?.path ?? "."), String(a?.pattern ?? "*")),
    );
    t.set("file_append", (a) =>
      this.fileTools.append(String(a?.path ?? ""), String(a?.content ?? "")),
    );
    t.set("shell_run", (a) => this.shellTools.run(String(a?.command ?? "")));
    t.set("shell_python", (a) => this.shellTools.runPython(String(a?.code ?? "")));
    t.set("web_get", (a) => this.webTools.get(String(a?.url ?? "")));
    t.set("web_search", (a) => this.webTools.search(String(a?.query ?? "")));
    t.set("war_room", () => this.toolWarRoom());
    t.set("code_lint", (a) => this.codeTools.lint(String(a?.path ?? "")));
    t.set("code_format", (a) => this.codeTools.formatCode(String(a?.path ?? "")));
    t.set("code_tree", (a) => this.codeTools.tree(String(a?.path ?? ".")));
    t.set("code_analyze", (a) => this.codeTools.analyze(String(a?.path ?? ".")));
    t.set("done", (a) => this.done(String(a?.result ?? "")));
    t.set("get_time", (a) => this.toolGetTime(String(a?.query ?? "all")));
    t.set("optimize_hardware", () => this.toolOptimizeHardware());

    // Injected sub-system tool maps
    for (const [k, v] of Object.entries(this.computerTools.asToolMap())) t.set(k, adapt(v));
    for (const [k, v] of Object.entries(this.memory.asToolMap())) t.set(k, adapt(v));
    for (const [k, v] of Object.entries(this.gitTools.asToolMap())) t.set(k, adapt(v));

    t.set("absolute_query", (a) => this.toolAbsoluteQuery(String(a?.query ?? "")));

    // Swarm (The Worker Swarm)
    t.set("swarm_spawn", (a) =>
      this.toolSwarmSpawn(String(a?.task ?? ""), Number(a?.workers ?? 4)),
    );
    t.set("shadow_step", (a) =>
      this.toolShadowStep(String(a?.task ?? ""), String(a?.test_cmd ?? "npm test")),
    );

    // Axodex (The Axodex Indexer)
    t.set("axodex_query", (a) => this.axodex.query(String(a?.query ?? ""), Number(a?.limit ?? 10)));
    t.set("axodex_context", (a) => this.axodex.context(String(a?.name ?? "")));
    t.set("axodex_smart_read", (a) => this.axodex.smart_read(String(a?.symbol_name ?? "")));
    t.set("axodex_impact", (a) =>
      this.axodex.impact(String(a?.target ?? ""), String(a?.direction ?? "upstream")),
    );
    t.set("axodex_detect_changes", () => this.axodex.detect_changes());
    t.set("axodex_status", () => this.axodex.status());
    t.set("axodex_analyze", () => this.axodex.analyze());

    // Goals (Phase 11)
    t.set("goal_create", (a) =>
      this.toolGoalCreate(
        String(a?.title ?? ""),
        String(a?.description ?? ""),
        String(a?.deadline ?? ""),
        String(a?.priority ?? "high"),
      ),
    );
    t.set("goal_list", (a) => this.toolGoalList(String(a?.status ?? "active")));
    t.set("goal_kr_add", (a) =>
      this.toolGoalKrAdd(
        String(a?.goal_id ?? ""),
        String(a?.title ?? ""),
        String(a?.target ?? ""),
        String(a?.deadline ?? ""),
      ),
    );
    t.set("goal_action_add", (a) =>
      this.toolGoalActionAdd(
        String(a?.kr_id ?? ""),
        String(a?.title ?? ""),
        String(a?.scheduled_date ?? ""),
      ),
    );
    t.set("goal_update_score", (a) =>
      this.toolGoalUpdateScore(
        String(a?.goal_id ?? ""),
        Number(a?.score ?? 0),
        a?.kr_id === undefined || a?.kr_id === null ? null : String(a.kr_id),
      ),
    );
    t.set("goal_action_complete", (a) =>
      this.toolGoalActionComplete(String(a?.action_id ?? "")),
    );
    t.set("goal_report", () => this.toolGoalReport());
  }

  /** Names of every registered tool (used for prompt rendering). */
  toolNames(): string[] {
    return [...this.toolMap.keys()];
  }

  hasTool(name: string): boolean {
    return this.toolMap.has(name);
  }

  /** The most recent observation, or null if none recorded. */
  get lastObservation(): Observation | null {
    return this.observations.length > 0 ? this.observations[this.observations.length - 1]! : null;
  }

  /** Summary stats for all observations in this session. */
  observationStats(): { total: number; succeeded: number; failed: number; total_ms: number } {
    let succeeded = 0;
    let failed = 0;
    let total_ms = 0;
    for (const o of this.observations) {
      if (o.success) succeeded++;
      else failed++;
      total_ms += o.duration_ms;
    }
    return { total: this.observations.length, succeeded, failed, total_ms };
  }

  /* ── Daemon event handler ──────────────────────────────────────────────── */

  private onDaemonEvent(event: DaemonEvent): void {
    const { kind, payload } = event;
    if (kind === "syntax_error") {
      warn(`[Daemon] Syntax error in ${payload.file}: ${payload.error}`);
      this.onToken?.(
        `\n[\u26a1 Daemon] Syntax error detected in ${payload.file}: ${payload.error}\n`,
      );
    } else if (kind === "git_uncommitted") {
      debug(`[Daemon] ${payload.count} uncommitted file(s)`);
    } else if (kind === "daily_audit") {
      info(
        `[Daemon] Audit: ${payload.files_checked} files, ${payload.syntax_errors} errors`,
      );
    }
  }

  /* ── Phase 2: Swarm ────────────────────────────────────────────────────── */

  /**
   * Run a task using the domain-expert swarm. Progress events are broadcast over
   * the SSE broker so the UI can display live swarm status.
   */
  async runSwarm(
    task: string,
    maxWorkers = 4,
    onProgress?: (event: Record<string, unknown>) => void,
  ): Promise<string> {
    let progress = onProgress;
    try {
      const { broker } = (await import("../web/broker.js")) as {
        broker: { broadcast(type: string, data: unknown): void };
      };
      progress = (event: Record<string, unknown>) => {
        broker.broadcast("swarm_event", event);
        const ev = String(event.event ?? "");
        const name = String(event.model ?? event.desc ?? "");
        this.onToken?.(name ? `\n[\u26a1 Swarm:${ev}] ${name}\n` : `\n[\u26a1 Swarm] ${ev}\n`);
      };
    } catch {
      progress = onProgress ?? (this.onToken ? (e) => this.onToken?.(JSON.stringify(e)) : undefined);
    }

    const swarm = new SwarmOrchestrator({
      agent: this as never,
      max_workers: maxWorkers,
      on_progress: progress as never,
    });
    const result = await swarm.run(task);
    info(
      `[Swarm] \u2713 Done: ${result.total_ms}ms | ${result.parallelism.toFixed(1)}x speedup`,
    );
    return result.merged;
  }

  /* ── Abort ─────────────────────────────────────────────────────────────── */

  setAbortEvent(ev: AbortFlag | null): void {
    this.abortFlag = ev;
  }

  private aborted(): boolean {
    return this.abortFlag !== null && this.abortFlag.isSet();
  }

  /** Alias matching the Python name. */
  set_abort_event(ev: AbortFlag | null): void {
    this.setAbortEvent(ev);
  }

  /* ── LLM lifecycle ─────────────────────────────────────────────────────── */

  ensureLlm(): boolean {
    if (this.llm === null || !this.llmLoaded) {
      info("[Agent] Deploying heavy model weights...");
      this.buildLlm();
      this.llmLoaded = true;
      return true;
    }
    return false;
  }

  ensure_llm(): boolean {
    return this.ensureLlm();
  }

  unloadLlm(): boolean {
    if (!this.llm) return false;
    info("[Agent] Unloading model weights to free RAM...");
    try {
      this.llm.unload();
    } catch {
      /* ignore */
    }
    this.llm = null;
    this.backend = null;
    this.llmLoaded = false;
    return true;
  }

  unload_llm(): boolean {
    return this.unloadLlm();
  }

  async authoritySummary(): Promise<Record<string, unknown>> {
    const ae = await getAuthority();
    if (!ae) return { status: "disabled" };
    return {
      status: "active",
      summary: ae.summary(),
      stats: ae.audit.stats(),
      max_auto_level: ae.max_auto_level,
    };
  }

  async authorityAudit(limit = 20): Promise<Array<Record<string, unknown>>> {
    const ae = await getAuthority();
    if (!ae) return [];
    return ae.audit.recent(limit);
  }

  get availableTools(): ToolFunctionSchema[] {
    const def = this.config.definition as any;
    if (!def || !def.tool_config || !def.tool_config.tool_names) {
      return TOOL_SCHEMAS;
    }
    const allowed = new Set(def.tool_config.tool_names);
    return TOOL_SCHEMAS.filter(t => allowed.has(t.function.name));
  }

  private buildLlm(): void {
    // llama.cpp supports tool calling natively via model templates.
    this.useNative = true;
    this.llm = getBackend(this.config as unknown as AxonizConfig, this.availableTools);
    this.backend = this.llm; // Autonomous alias
    this.llmLoaded = true;
    info(`[Agent] backend=${this.llm.name}`);
  }

  private rebuildLlm(): void {
    this.buildLlm();
  }

  /** Public rebuild hook for the web server's config/model-switch routes. */
  rebuildLlmPublic(): void {
    this.rebuildLlm();
  }

  /** Public wrapper for the War Room summary (used by GET /api/war_room). */
  warRoom(): string {
    return this.toolWarRoom();
  }

  /** Public wrapper for the absolute query tool (used by GET /api/absolute_query). */
  absoluteQuery(query: string): Promise<string> {
    return this.toolAbsoluteQuery(query);
  }

  /** Effective configured model path, for the UI. */
  modelPath(): string {
    const llm = this.config.llm as unknown as
      | { active_provider?: string; providers?: Record<string, Record<string, unknown>> }
      | undefined;
    const prov = llm?.active_provider ?? String(this.config.provider ?? "llamacpp");
    return String(llm?.providers?.[prov]?.model_path ?? this.config.model_path ?? "");
  }

  /** Replace the live config (used after /api/config/save). */
  applyConfig(cfg: AxonizConfig): void {
    Object.assign(this.config, cfg);
    this.rebuildLlm();
  }

  /** Run a task with an abort flag, so the UI's Stop button works. */
  async runAbortable(task: string, flag: AbortFlag): Promise<string> {
    this.setAbortEvent(flag);
    try {
      return await this.run(task);
    } finally {
      this.setAbortEvent(null);
    }
  }

  /* ── Compound tools ────────────────────────────────────────────────────── */

  /** Queries BOTH the code graph and semantic memory. */
  private async toolAbsoluteQuery(query: string): Promise<string> {
    let axRes = await this.axodex.query(query);
    if (axRes.includes("[AXODEX ERROR] No index found")) {
      axRes += "\n\u{1F4A1} HINT: Call 'axodex_analyze' to build the first graph for this workspace.";
    }

    const palRes = (await this.memory.palace.search(query, { limit: 5 })) as {
      results?: Array<{ wing: string; room: string; text: string }>;
    };
    const palLines = (palRes.results ?? []).map(
      (h) => `  [${h.wing}/${h.room}] ${h.text.slice(0, 200)}`,
    );

    return (
      `--- AXODEX (Code Graph) ---\n${axRes}\n\n` +
      `--- MEMPALACE (Long-term) ---\n` +
      (palLines.length > 0 ? palLines.join("\n") : "No memory found.")
    );
  }

  /** Decompose a complex task and execute it in parallel using a swarm. */
  private async toolSwarmSpawn(task: string, workers = 4): Promise<string> {
    const swarm = new SwarmOrchestrator({ agent: this as never, max_workers: workers });
    const result = await swarm.run(task);
    if (result.success) {
      return (
        `[SWARM SUCCESS] Parallelized task complete in ${result.total_ms}ms ` +
        `(${result.parallelism}x speedup).\n\n${result.merged}`
      );
    }
    return `[SWARM FAILED] Swarm could not complete task: ${result.merged}`;
  }

  /** Speculative execution in a shadow branch. */
  private async toolShadowStep(task: string, testCmd = "npm test"): Promise<string> {
    const branchId = crypto.randomBytes(6).toString("hex").slice(0, 6);
    const shadowBranch = `shadow/${branchId}`;
    const originalBranch = await this.gitTools.currentBranch();

    info(`[Shadow-Step] Stepping into shadow: ${shadowBranch}`);

    try {
      await this.gitTools.checkout(shadowBranch, true);

      const res = await this.run(task);

      const testRes = await this.shellTools.run(testCmd);
      const lower = testRes.toLowerCase();

      if (!lower.includes("failed") && !lower.includes("error")) {
        await this.gitTools.checkout(originalBranch);
        return (
          `[SHADOW SUCCESS] Task completed and verified in ${shadowBranch}.\n` +
          `Tests: ${testRes.slice(0, 500)}\n` +
          `Action: You can now 'git merge ${shadowBranch}' to apply changes.`
        );
      }
      warn(`[Shadow-Step] Shadow verification FAILED. Retracting to ${originalBranch}`);
      await this.gitTools.checkout(originalBranch);
      return `[SHADOW FAILED] Speculative execution failed tests:\n${testRes.slice(0, 500)}`;
    } catch (e) {
      error(`[Shadow-Step] Shadow failed: ${errText(e)}`);
      try {
        await this.gitTools.checkout(originalBranch);
      } catch {
        /* ignore */
      }
      return `[SHADOW ERROR] ${errText(e)}`;
    } finally {
      try {
        if ((await this.gitTools.currentBranch()) !== originalBranch) {
          await this.gitTools.checkout(originalBranch);
        }
      } catch {
        /* ignore */
      }
    }
  }

  /** Summary of background daemon events, audits, and uncommitted changes. */
  private toolWarRoom(): string {
    const st = this.daemon.status();
    const events = this.daemon.getRecentEvents(10);

    const lines = [`[War Room] Status: ${st.running ? "ACTIVE" : "INACTIVE"}`];
    lines.push(`  Pending lints: ${st.pending_lint}`);

    if (events.length > 0) {
      lines.push("  Recent background events:");
      for (const ev of events) {
        const ts = new Date((ev.ts ?? 0) * 1000).toTimeString().slice(0, 8);
        lines.push(`    [${ts}] ${ev.kind}: ${JSON.stringify(ev.payload).slice(0, 100)}...`);
      }
    } else {
      lines.push("  No recent background events.");
    }
    return lines.join("\n");
  }

  /** Return current time/date info. Fast — no LLM needed. */
  private toolGetTime(query = "all"): string {
    const now = new Date();
    const q = query.toLowerCase();
    const dayName = WEEKDAYS[now.getDay()];
    const monthName = MONTHS[now.getMonth()];
    const h12 = now.getHours() % 12 || 12;
    const ampm = now.getHours() < 12 ? "AM" : "PM";
    const timeStr = `${h12}:${pad2(now.getMinutes())} ${ampm}`;
    const dateStr = `${dayName}, ${monthName} ${pad2(now.getDate())} ${now.getFullYear()}`;

    if (q.includes("time") && !q.includes("date") && q !== "all") return timeStr;
    if (q.includes("date") && !q.includes("time")) return dateStr;
    if (q.includes("day")) return dayName;
    if (q.includes("year")) return String(now.getFullYear());

    const offsetMin = -now.getTimezoneOffset();
    const sign = offsetMin >= 0 ? "+" : "-";
    const abs = Math.abs(offsetMin);
    const offset = `${sign}${pad2(Math.floor(abs / 60))}${pad2(abs % 60)}`;
    return `${dateStr}  ${timeStr}  (UTC offset: ${offset})`;
  }

  private done(result = ""): string {
    this.finished = true;
    this.finalResult = result;
    return `[DONE] ${result}`;
  }

  /** Benchmark and optimize the backend for local hardware. */
  private async toolOptimizeHardware(): Promise<string> {
    try {
      const m = (await import("./optimizer.js")) as {
        applyOptimizations: (agent: Agent) => Promise<Record<string, unknown>>;
      };
      const optimized = await m.applyOptimizations(this);
      return `[OK] Hardware optimized: ${JSON.stringify(optimized, null, 2)}`;
    } catch (e) {
      return `[ERROR] Optimization failed: ${errText(e)}`;
    }
  }

  /* ── Goal tools (Phase 11) ─────────────────────────────────────────────── */

  private async toolGoalCreate(
    title: string,
    description = "",
    deadline = "",
    priority = "high",
  ): Promise<string> {
    const gs = await getGoals();
    if (!gs) return "[ERROR] Goal service unavailable";
    const g = gs.create_goal(title, description, deadline, priority);
    return `[OK] Goal created: ${g.title} (id=${g.id})`;
  }

  private async toolGoalList(status = "active"): Promise<string> {
    const gs = await getGoals();
    if (!gs) return "[ERROR] Goal service unavailable";
    const goals = gs.list_goals(status);
    if (goals.length === 0) return "No goals found.";
    return goals
      .map((g) => {
        const prio = typeof g.priority === "string" ? g.priority : g.priority.value;
        return `[${g.id}] ${g.title} | score: ${Math.round(g.score * 100)}% | priority: ${prio}`;
      })
      .join("\n");
  }

  private async toolGoalKrAdd(
    goalId: string,
    title: string,
    target = "",
    deadline = "",
  ): Promise<string> {
    const gs = await getGoals();
    if (!gs) return "[ERROR] Goal service unavailable";
    const kr = gs.add_key_result(goalId, title, target, deadline);
    return `[OK] Key Result added: ${kr.title} (id=${kr.id})`;
  }

  private async toolGoalActionAdd(
    krId: string,
    title: string,
    scheduledDate = "",
  ): Promise<string> {
    const gs = await getGoals();
    if (!gs) return "[ERROR] Goal service unavailable";
    const da = gs.add_daily_action(krId, title, scheduledDate);
    return `[OK] Daily Action added: ${da.title} (id=${da.id})`;
  }

  private async toolGoalUpdateScore(
    goalId: string,
    score: number,
    krId: string | null = null,
  ): Promise<string> {
    const gs = await getGoals();
    if (!gs) return "[ERROR] Goal service unavailable";
    return `[OK] ${gs.update_score(goalId, score, krId)}`;
  }

  private async toolGoalActionComplete(actionId: string): Promise<string> {
    const gs = await getGoals();
    if (!gs) return "[ERROR] Goal service unavailable";
    return `[OK] ${gs.complete_action(actionId)}`;
  }

  private async toolGoalReport(): Promise<string> {
    const gs = await getGoals();
    if (!gs) return "[ERROR] Goal service unavailable";
    return gs.daily_report();
  }

  /* ── Tool execution — the core of Phase 1 ──────────────────────────────── */

  /**
   * Execute a tool with:
   *   0. Authority engine gate
   *   1. Confidence/risk gate
   *   2. Timed execution
   *   3. Trajectory recording
   *   4. Self-correction analysis
   */
  async exec(name: string, args: Record<string, unknown>): Promise<string> {
    const fn = this.toolMap.get(name);
    if (!fn) return `[ERROR] Unknown tool '${name}'`;

    const def = this.config.definition as any;
    if (def && def.tool_config && def.tool_config.tool_names) {
      if (!def.tool_config.tool_names.includes(name)) {
        return `[ERROR] Tool '${name}' is not available to this agent role.`;
      }
    }

    // 0. Authority engine gate
    const authority = await getAuthority();
    if (authority && !["done", "memory_get", "memory_list"].includes(name)) {
      const decision = authority.check(name, args, this.trajSessionId ?? "");
      if (!decision.approved) {
        const blocked = `[AUTHORITY BLOCKED] '${name}' denied: ${decision.reason}`;
        this.onToolResult?.(name, blocked);
        return blocked;
      }
    }

    // 1a. Axodex guard — record impact context before mutating files
    if (["file_edit", "file_write", "file_delete"].includes(name) && "path" in args) {
      try {
        const impact = await this.axodex.impact(String(args.path));
        if (!impact.includes("[AXODEX ERROR]")) {
          debug(`[Guard] Impact for ${String(args.path)}: ${impact.slice(0, 100)}...`);
        }
      } catch {
        /* guard is advisory */
      }
    }

    // 1b. Confidence / risk gate
    const check = await this.confidence.check({
      tool_name: name,
      args,
      task: this.taskText,
      session_id: this.trajSessionId ?? "",
    });
    if (!check.allow) {
      const warningMsg = this.confidence.formatWarning(check, name, args);
      const blockedMsg =
        `[BLOCKED BY CONFIDENCE SCORER]\n${warningMsg}\n` +
        `Risk ${Math.round(check.risk * 100)}% exceeds threshold ` +
        `${Math.round(this.confidence.risk_threshold * 100)}%. Choose a safer approach.`;
      if (this.trajSessionId) {
        this.trajectory.recordStep({
          session_id: this.trajSessionId,
          step_num: this.stepCounter,
          tool_name: name,
          args,
          result: blockedMsg,
          success: false,
          duration_ms: 0,
          notes: `BLOCKED: ${check.reason}`,
        });
      }
      this.onToolResult?.(name, blockedMsg);
      return blockedMsg;
    }

    // 2. Execute with timing
    const t0 = Date.now();
    let result: string;
    let success: boolean;
    try {
      const raw = await fn(args);
      result = raw === null || raw === undefined ? "OK" : String(raw);

      // Phase 8: high-precision truncation
      if (result.length > 2000) {
        result =
          `${result.slice(0, 1000)}\n\n` +
          `... [TRUNCATED ${result.length - 2000} characters to prevent context drowning] ...\n\n` +
          `${result.slice(-1000)}\n` +
          `HINT: Use 'axodex_smart_read' for architectural context or 'file_read' with line ranges.`;
      }
      success = true;
    } catch (e) {
      if (e instanceof TypeError) {
        result = `[ERROR] Bad args for '${name}': ${errText(e)}`;
      } else {
        result = `[ERROR] '${name}' failed: ${errText(e)}`;
      }
      success = false;
    }
    const durationMs = Date.now() - t0;

    // 3. Record to trajectory
    if (this.trajSessionId) {
      this.trajectory.recordStep({
        session_id: this.trajSessionId,
        step_num: this.stepCounter,
        tool_name: name,
        args,
        result,
        success,
        duration_ms: durationMs,
      });
    }
    this.stepCounter += 1;

    // 4. Self-correction analysis
    const analysis = this.corrector.analyze(name, args, result, this.stepCounter);
    if (analysis.has_error) {
      const correctionMsg = this.corrector.buildCorrectionMessage(analysis, name);
      result = `${result}\n\n${correctionMsg}`;
    }

    // 5. Record structured observation
    this.observations.push({ tool: name, args, result, success, duration_ms: durationMs });

    return result;
  }

  /* ── System prompt ─────────────────────────────────────────────────────── */

  private sysPrompt(): string {
    const now = new Date();
    const dayName = WEEKDAYS[now.getDay()];
    const monthName = MONTHS[now.getMonth()];
    const h12 = now.getHours() % 12 || 12;
    const ampm = now.getHours() < 12 ? "AM" : "PM";
    const nowStr = `${dayName}, ${monthName} ${pad2(now.getDate())} ${now.getFullYear()} \u2014 ${h12}:${pad2(now.getMinutes())} ${ampm}`;

    const override = String(
      (this.config.agent as Record<string, unknown> | undefined)?.persona_override ?? "",
    );

    let base: string;
    if (override) {
      base = override;
    } else {
      try {
        base = this.persona.buildSystemPrompt(
          this.workspace,
          this.toolNames(),
          this.trajSessionId ?? "",
        );
      } catch {
        base = FALLBACK_SYSTEM_PROMPT;
      }
    }

    return `${base}\n\nSystem'S CLOCK: ${nowStr}\n`;
  }

  private memFence(query: string): string {
    return this.memory.getRelevantContext(query);
  }

  private currentTask(): string {
    return this.taskText;
  }

  /* ── Chat ──────────────────────────────────────────────────────────────── */

  async chat(message: string): Promise<string> {
    // ShadowGuard reflexes are instant and need no LLM.
    const reflexResponse = await this.reflex.process(message);
    if (reflexResponse) {
      info(`[ShadowGuard] Reflex: ${reflexResponse}`);
      this.onToken?.(`[ShadowGuard] ${reflexResponse}`);
      await this.speak(reflexResponse);
      return reflexResponse;
    }

    this.ensureLlm();
    this.history.append("user", message, { mode: "chat" });
    this.history.appendSession({ role: "user", content: message });

    let full = "";
    for await (const tok of this.llm!.streamText([
      { role: "system", content: this.sysPrompt() },
      { role: "user", content: message },
    ])) {
      full += tok;
      this.onToken?.(tok);
    }

    this.history.append("assistant", full, { mode: "chat" });
    this.history.appendSession({ role: "assistant", content: full });
    this.memory.syncTurn(message, full);
    this.memory.auto_extract_and_save(message, "chat");
    return full;
  }

  async *chatStream(message: string): AsyncGenerator<string> {
    this.history.append("user", message, { mode: "chat" });
    const msgs: ChatMessage[] = [
      { role: "system", content: this.sysPrompt() },
      { role: "user", content: message },
    ];

    let full = "";
    for await (const tok of this.llm!.streamText(msgs)) {
      if (this.aborted()) break;
      full += tok;
      yield tok;
    }

    this.history.append("assistant", full, { mode: "chat" });
    this.history.appendSession({ role: "assistant", content: full });
    this.memory.syncTurn(message, full);
    this.memory.auto_extract_and_save(message, "chat");
  }

  chat_stream(message: string): AsyncGenerator<string> {
    return this.chatStream(message);
  }

  /* ── System's scan ────────────────────────────────────────────────────── */

  /** The 'System's Ritual': one-shot analysis of workspace health, index, memory. */
  async SystemScan(): Promise<string> {
    const axStatus = await this.axodex.status();
    const axState = axStatus.includes("[AXODEX ERROR] No index found")
      ? "\u26a0 UNINDEXED (Run 'axodex_analyze' for graph vision)"
      : `\u2713 ${axStatus.slice(0, 60)}`;

    const gitRes = await this.gitTools.status();

    let palCount = 0;
    try {
      palCount = Number(this.memory.palace.status().total_drawers ?? 0);
    } catch {
      /* palace optional */
    }

    return (
      `[System'S SCAN: ${path.basename(this.workspace)}]\n` +
      `- Graph Vision: ${axState}\n` +
      `- Tactical Memory: ${palCount} facts stored\n` +
      `- Workspace State: ${gitRes ? gitRes.split("\n")[0] : "Ready"}\n`
    );
  }

  /* ── Agent run ─────────────────────────────────────────────────────────── */

  async run(task: string): Promise<string> {
    debug(`run() task=${task.slice(0, 80)}`);

    // Step 0: Ritual — proactive awareness
    const scanReport = await this.SystemScan();
    debug(`[Ritual] ${scanReport.split("\n")[0]}`);

    // ShadowGuard reflexes (instant, no LLM)
    const reflexResponse = await this.reflex.process(task);
    if (reflexResponse) {
      info(`[ShadowGuard] Reflex: ${reflexResponse}`);
      this.onToken?.(`[ShadowGuard] ${reflexResponse}`);
      await this.speak(reflexResponse);
      return reflexResponse;
    }

    this.finished = false;
    this.finalResult = null;
    this.taskText = task;
    this.stepCounter = 0;
    this.corrector.reset();

    this.history.append("user", task, { mode: "agent" });

    this.ensureLlm();
    this.backend = this.llm; // Autonomous alias

    this.trajSessionId = this.trajectory.beginSession(task, this.workspace);

    // Phase 8: autonomous injection — multi-stage context rather than one dump.
    const msgs: ChatMessage[] = [{ role: "system", content: this.sysPrompt() }];

    msgs.push({
      role: "user",
      content: `OBSERVATION: ${scanReport}\n\nUse your armory tools if more detail is needed.`,
    });
    msgs.push({
      role: "assistant",
      content:
        "Acknowledged. System's scan completed. I have absolute awareness of the workspace state. Awaiting your command.",
    });

    // Project Atlas as a one-time background observation
    const atlas = await this.axodex.status();
    if (!atlas.includes("[AXODEX ERROR]")) {
      msgs.push({
        role: "user",
        content: `OBSERVATION (Project Atlas):\n${atlas}\n\nUse your armory tools to explore further.`,
      });
      msgs.push({
        role: "assistant",
        content: "Acknowledged. I have indexed the project structure. Awaiting task details.",
      });
    }

    // Add history if this is a continuation
    const historyMsgs = this.history.getSession();
    if (historyMsgs.length > 0) {
      msgs.push(...historyMsgs.map((m) => ({ role: m.role, content: m.content })));
    } else {
      msgs.push({ role: "user", content: task });
    }

    const result = this.useNative ? await this.runNative(msgs) : await this.runFallback(msgs);

    this.trajectory.endSession(this.trajSessionId, result ? result.slice(0, 300) : "completed");
    this.trajSessionId = null;

    return result;
  }

  /* ── Native tool loop ──────────────────────────────────────────────────── */

  private async runNative(messages: ChatMessage[]): Promise<string> {
    const agentCfg = this.config.agent as Record<string, unknown> | undefined;
    const maxSteps = Number(agentCfg?.max_steps ?? this.config.max_steps ?? 30);
    const seen: string[] = [];
    let msgs = messages;

    for (let step = 1; step <= maxSteps; step++) {
      if (this.aborted()) return "[Stopped by user]";
      this.onStep?.(step, maxSteps);
      getLogger().logAgentStep(step, maxSteps);

      // Phase 8: cognitive distillation
      if (this.history.getSession().length > 8) {
        debug("[Cognitive] Distilling history...");
        try {
          await this.history.distill(this.backend!);
        } catch (e) {
          debug(`[Cognitive] Distillation skipped: ${errText(e)}`);
        }
      }

      // Context compression (Phase 6+)
    const curTokens = TokenCounter.countMessages(msgs as never);
    if (curTokens > this.compressor.max_tokens) {
      msgs = (await this.compressor.compress(msgs as never, this.summarizer())) as ChatMessage[];
    }

      let response: CompletionResult;
      try {
        response = await this.llm!.complete(msgs);
      } catch (e) {
        const { classifyApiError, APIFailoverReason } = (await import(
          "./intelligence/self_correction.js"
        )) as unknown as {
          classifyApiError: (e: unknown) => { value: string };
          APIFailoverReason: Record<string, string>;
        };
        const reason = classifyApiError(e);
        error(`[Agent] API Error: ${reason.value} | ${errText(e)}`);

        if (reason.value === APIFailoverReason.CONTEXT_OVERFLOW) {
          msgs = (await this.compressor.compress(msgs as never, this.summarizer())) as ChatMessage[];
          try {
            response = await this.llm!.complete(msgs);
          } catch (e2) {
            return `[ERROR] Context overflow persistent after compression: ${errText(e2)}`;
          }
        } else {
          return `[ERROR] Backend (${reason.value}): ${errText(e)}`;
        }
      }

      if (isToolCallResponse(response)) {
        for (const tc of response.calls) {
          if (this.aborted()) return "[Stopped by user]";
          const name = tc.name;
          const args = tc.args ?? {};
          const sig = `${name}::${stableStringify(args)}`;
          seen.push(sig);
          if (seen.filter((s) => s === sig).length >= 5) return `[ERROR] Loop on '${name}'.`;

          this.onToolCall?.(name, args);
          const result = await this.exec(name, args);
          this.onToolResult?.(name, result);

          if (this.finished) {
            const final = this.finalResult ?? result;
            this.syncDone(final);
            return final;
          }

          msgs.push({ role: "assistant", content: "" });
          msgs.push({ role: "tool", name, content: result });
        }
        continue;
      }

      // TextResponse
      const text = response.text ?? "";
      this.history.append("assistant", text, { step });
      this.onToken?.(text);

      if (isDone(text) || this.finished) {
        const final = this.finalResult ?? text;
        this.syncDone(final);
        await this.speak(final);
        return final;
      }

      const fb = parseFallbackCalls(text);
      if (fb.length > 0) {
        msgs.push({ role: "assistant", content: text });
        for (const fc of fb) {
          if (this.aborted()) return "[Stopped by user]";
          this.onToolCall?.(fc.name, fc.args);
          const result = await this.exec(fc.name, fc.args);
          this.onToolResult?.(fc.name, result);
          if (this.finished) {
            const final = this.finalResult ?? result;
            this.syncDone(final);
            return final;
          }
          msgs.push({ role: "user", content: `Tool '${fc.name}' returned:\n${result}` });
        }
        continue;
      }

      msgs.push({ role: "assistant", content: text });

      const nudges = msgs
        .slice(-6)
        .filter((m) => m.role === "user" && m.content.toLowerCase().includes("continue")).length;
      if (nudges >= 3) return text;

      msgs.push({ role: "user", content: "Continue. Use a tool, or call done() if finished." });
    }

    return "Reached maximum steps.";
  }

  /* ── Fallback text-parsing loop ────────────────────────────────────────── */

  private async runFallback(messages: ChatMessage[]): Promise<string> {
    const names = this.availableTools.map((s) => s.function.name).join(", ");
    const instructions =
      "\n\nTo call a tool:\n" +
      '<tool>{"name": "tool_name", "args": {"param": "value"}}</tool>\n\n' +
      `Tools: ${names}\n\n` +
      "RULES:\n" +
      "1. Session start: axodex_status \u2192 palace_context \u2192 kg_query('user') \u2192 diary_read\n" +
      "2. Code Intelligence: ALWAYS use axodex_context to understand symbols and flows.\n" +
      "3. Safety: ALWAYS run axodex_impact BEFORE modifying any function or class.\n" +
      "4. Verification: Run axodex_detect_changes BEFORE committing to verify blast radius.\n" +
      "5. After tasks: palace_store + diary_write\n" +
      '6. Finish: <tool>{"name": "done", "args": {"result": "summary"}}</tool>';

    let msgs = messages;
    if (msgs.length > 0 && msgs[0].role === "system") {
      msgs = [{ ...msgs[0], content: msgs[0].content + instructions }, ...msgs.slice(1)];
    } else {
      msgs = [{ role: "system", content: FALLBACK_SYSTEM_PROMPT + instructions }, ...msgs];
    }

    const agentCfg = this.config.agent as Record<string, unknown> | undefined;
    const maxSteps = Number(agentCfg?.max_steps ?? this.config.max_steps ?? 30);
    const seen: string[] = [];
    let nudge = 0;

    for (let step = 1; step <= maxSteps; step++) {
      if (this.aborted()) return "[Stopped by user]";
      this.onStep?.(step, maxSteps);

      const curTokens = TokenCounter.countMessages(msgs as never);
      if (curTokens > this.compressor.max_tokens) {
        msgs = (await this.compressor.compress(msgs as never, this.summarizer())) as ChatMessage[];
      }

      const tokens: string[] = [];
      try {
        for await (const tok of this.llm!.streamText(msgs)) {
          if (this.aborted()) break;
          tokens.push(tok);
          this.onToken?.(tok);
        }
      } catch (e) {
        return `[ERROR] Stream: ${errText(e)}`;
      }

      if (this.aborted()) return "[Stopped by user]";
      const full = tokens.join("");
      this.history.append("assistant", full, { step });

      const calls = parseFallbackCalls(full);
      if (calls.length > 0) {
        nudge = 0;
        msgs.push({ role: "assistant", content: full });
        for (const fc of calls) {
          if (this.aborted()) return "[Stopped by user]";
          const sig = `${fc.name}::${stableStringify(fc.args)}`;
          seen.push(sig);
          if (seen.filter((s) => s === sig).length >= 5) return `[ERROR] Loop on '${fc.name}'.`;

          this.onToolCall?.(fc.name, fc.args);
          const result = await this.exec(fc.name, fc.args);
          this.onToolResult?.(fc.name, result);

          if (this.finished) {
            const final = this.finalResult ?? result;
            this.syncDone(final);
            return final;
          }

          msgs.push({
            role: "user",
            content: `Tool '${fc.name}' returned:\n${result}\n\nContinue or call done() if complete.`,
          });
        }
        continue;
      }

      if (isDone(full)) {
        this.syncDone(full);
        return full;
      }

      nudge += 1;
      msgs.push({ role: "assistant", content: full });
      if (nudge >= 4) {
        warn("Model not calling tools after 4 nudges.");
        return full;
      }
      msgs.push({
        role: "user",
        content:
          "Use a tool to continue. Output a <tool> block, or call done() if fully complete.",
      });
    }

    return "Reached maximum steps.";
  }

  /* ── Post-task sync ────────────────────────────────────────────────────── */

  /** Speak the first sentence of a response if TTS is enabled. */
  private async speak(text: string): Promise<void> {
    const tts = await getTts();
    if (!tts) return;
    const available = Boolean(tts.is_available ?? tts.isAvailable);
    if (!available) return;
    try {
      const first = text.split(".")[0].slice(0, 120).trim();
      if (first && first.length > 10) {
        const fn = tts.speak_async ?? tts.speakAsync;
        fn?.call(tts, first);
      }
    } catch {
      /* TTS is best-effort */
    }
  }

  private syncDone(summary: string): void {
    if (!summary || summary.length < 20) return;
    const corrSummary = this.corrector.sessionSummary();
    const sessionId = this.trajSessionId;

    // System's Archive + skill distillation, off the critical path.
    void (async () => {
      try {
        const axStatus = await this.axodex.status();
        const archiveContent =
          `TASK: ${this.taskText}\n` +
          `SUMMARY: ${summary}\n` +
          `ERRORS: ${corrSummary}\n` +
          `ARCH_SCAN: ${axStatus}`;

        await this.memory.palace.store("wing_axoniz", "System-archives", archiveContent, "agent");

        const proposal = await this.distiller.analyzeSession(sessionId ?? "");
        if (proposal) {
          const name = String(proposal.name ?? proposal.title ?? "unnamed_skill");
          info(`[Evolution] New skill proposed: ${name}`);
          this.distiller.propose(proposal as never);
        }
      } catch (e) {
        debug(`[Archive] sync failed: ${errText(e)}`);
      }
    })();
  }

  /* ── Session management ────────────────────────────────────────────────── */

  reset(): void {
    this.finished = false;
    this.finalResult = null;
    this.abortFlag = null;
    this.trajSessionId = null;
    this.stepCounter = 0;
    this.corrector.reset();
    this.history.clearSession();
  }

  async runGoal(goal: string, maxCycles = 5, maxRetries = 3): Promise<string> {
    const { LoopEngine } = (await import("./loop.js")) as unknown as {
      LoopEngine: new (
        agent: Agent,
        opts: { maxCycles: number; maxRetries: number },
      ) => { runGoal(goal: string): Promise<string> };
    };
    return new LoopEngine(this, { maxCycles, maxRetries }).runGoal(goal);
  }

  run_goal(goal: string, maxCycles = 5, maxRetries = 3): Promise<string> {
    return this.runGoal(goal, maxCycles, maxRetries);
  }

  switchModel(modelName: string): string {
    this.config.model_name = modelName;
    this.rebuildLlm();
    return `[OK] Switched to ${modelName}`;
  }

  switch_model(modelName: string): string {
    return this.switchModel(modelName);
  }

  switchBackend(provider: string, extra: Record<string, unknown> = {}): string {
    this.config.provider = provider;
    this.config.backend = provider;
    Object.assign(this.config, extra);
    this.rebuildLlm();
    return `[OK] Switched to ${provider}`;
  }

  switch_backend(provider: string, extra: Record<string, unknown> = {}): string {
    return this.switchBackend(provider, extra);
  }

  updateModelParams(params: Record<string, unknown>): string {
    Object.assign(this.config, params);
    this.rebuildLlm();
    return "[OK] Params updated.";
  }

  update_model_params(params: Record<string, unknown>): string {
    return this.updateModelParams(params);
  }

  async loadModel(): Promise<string> {
    if (this.llm === null) this.buildLlm();
    return this.llm!.load();
  }

  load_model(): Promise<string> {
    return this.loadModel();
  }

  async health(): Promise<Record<string, unknown>> {
    if (this.llm === null) this.buildLlm();
    return this.llm!.healthCheck();
  }

  /** Helper for context compression — calls the LLM with a summarization prompt. */
  async generateSummary(prompt: string): Promise<string> {
    this.ensureLlm();
    try {
      const resp = await this.llm!.complete([{ role: "user", content: prompt }]);
      return resp.kind === "text" ? resp.text : JSON.stringify(resp);
    } catch (e) {
      error(`[Agent] generate_summary failed: ${errText(e)}`);
      return `Error: ${errText(e)}`;
    }
  }

  generate_summary(prompt: string): Promise<string> {
    return this.generateSummary(prompt);
  }

  /**
   * Adapter exposing the LLM as `ChatLike` (a `.chat(messages)` surface) for
   * ContextCompressor's optional LLM-driven summarisation.
   */
  private summarizer(): { chat(messages: unknown[]): Promise<string> } {
    return {
      chat: async (messages: unknown[]): Promise<string> => {
        const resp = await this.llm!.complete(messages as ChatMessage[]);
        return resp.kind === "text" ? resp.text : JSON.stringify(resp);
      },
    };
  }

  async integrationStatus(): Promise<Record<string, unknown>> {
    const st = this.memory.palace.status();
    const trajStats = this.trajectory.tool_stats();
    const astStats = this.astIndex.stats();
    const predStats = this.predictor.get_stats();
    return {
      phase: 6,
      palace_available: this.memory.palace.is_available(),
      palace_drawers: st.total_drawers ?? 0,
      palace_wings: st.wings ?? {},
      kg_stats: this.memory.kg.stats(),
      trajectory_tools: trajStats.length,
      risk_threshold: this.confidence.risk_threshold,
      ast_files: astStats.files_indexed ?? 0,
      ast_symbols: astStats.symbols ?? 0,
      daemon_running: this.daemon.is_running(),
      predictor_calls: predStats.total_calls ?? 0,
      predictor_errors: `${Math.round(Number(predStats.error_rate ?? 0) * 100)}%`,
    };
  }

  sessionMessages(): ChatMessage[] {
    return [{ role: "system", content: this.sysPrompt() }];
  }

  _session_messages(): ChatMessage[] {
    return this.sessionMessages();
  }
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Deterministic JSON with sorted keys (mirrors json.dumps(sort_keys=True)). */
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/**
 * Adapt a sub-system tool-map entry (which may take positional args or none)
 * into the uniform `(args) => string | Promise<string>` shape.
 */
function adapt(fn: unknown): ToolFn {
  const f = fn as (...a: unknown[]) => unknown;
  return (args?: Record<string, unknown>) => {
    const a = args ?? {};
    // Tool maps built by sub-systems follow the Python kwargs convention and
    // accept a single options object.
    return Promise.resolve(f(a)) as Promise<string>;
  };
}






