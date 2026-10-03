/**
 * axoniz.core.intelligence.swarm
 * ================================
 * Dynamic Domain-Expert Swarm — Sequential Model Swapping
 *
 * The Swarm decomposes any complex task into phases and assigns a
 * dedicated, domain-expert model for each phase:
 *
 *   Decomposer  → breaks the task into atomic sub-tasks (reasoning model)
 *   Worker      → executes each sub-task using tools (coding/execution model)
 *   Critic      → validates each result before accepting (debugging model)
 *   Merger      → synthesises all results into a final answer (language model)
 *
 * Models are loaded sequentially and unloaded from RAM between phases
 * to stay within the memory constraints of the host machine.
 * Model paths are configured in ~/.axoniz/config.json under `swarm_models`.
 * If no swarm models are configured, the active main model is used for all
 * phases (standard behaviour).
 *
 * Architecture:
 *   SwarmOrchestrator  → drives phase transitions + model hot-swapping
 *   SwarmWorker        → executes a single sub-task with tool access
 *   SwarmCritic        → scores + validates a worker result
 *   SwarmMerger        → combines all valid results
 *
 * Port notes (Python → Node):
 *   - `ThreadPoolExecutor`/`Future` → an async scheduler with an explicit
 *     concurrency ceiling (`max_workers`), `Promise.race` for completion and a
 *     `Promise.allSettled` for teardown. No worker_threads: every step is I/O
 *     bound (LLM streaming / tools), so threads would buy nothing.
 *   - `threading.Lock` around model swapping → an async `Mutex` (the swap
 *     sequence itself awaits `unload_llm`/`ensure_llm`).
 *   - `self.llm.stream_text(messages)` (a sync generator) → `collectStream()`,
 *     an async collector that accepts an async generator, a sync generator, a
 *     plain string, a `{ text }` response object or a promise of any of those.
 *   - Every method that talks to the LLM is `async`. `review`, `merge`,
 *     `_decompose`, `run`, `run_simple` and `execute` therefore return
 *     Promises where the Python versions blocked the calling thread.
 *   - `dict` → `Map<number, SubTask>` for the `completed` registry (Python used
 *     integer keys); `_schedule_and_run(sub_tasks, completed)` takes that Map.
 *   - Python's `self.tool_map[name](**args)` (keyword arguments) has no direct
 *     JS analogue. `SwarmWorker.tool_args_mode` ("auto" | "object" |
 *     "positional") decides how arguments are passed; "auto" inspects the
 *     handler's declared arity.
 *   - `swarm.py` referenced `os.path`/`os.path.exists` without importing `os`
 *     in `_prefetch_relevant_files` and `_make_worker`; the port uses
 *     `node:path` / `node:fs` properly (the Python text-only path raised
 *     NameError there).
 */

import fs from "node:fs";
import path from "node:path";

import { debug, info, warn } from "../debug.js";
import { resolveSwarmModels, type AxonizConfig } from "../config.js";

/* ─── Small helpers ───────────────────────────────────────────────────────── */

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

function asRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function toInt(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function activeProviderName(cfg: AxonizConfig): string {
  return String(asRecord(cfg.llm).active_provider ?? "llamacpp");
}

function currentModelPath(cfg: AxonizConfig): string {
  const llm = asRecord(cfg.llm);
  const providers = asRecord(llm.providers);
  const prov = asRecord(providers[activeProviderName(cfg)]);
  return String(prov.model_path ?? cfg.model_path ?? "");
}

function setProviderModelPath(cfg: AxonizConfig, value: string): void {
  const llm = cfg.llm as unknown as Record<string, unknown>;
  const providers = asRecord(llm.providers);
  llm.providers = providers;
  const prov = activeProviderName(cfg);
  const entry = asRecord(providers[prov]);
  entry.model_path = value;
  providers[prov] = entry;
}

/** Serialises an async critical section (Python's `_MODEL_SWAP_LOCK`). */
class Mutex {
  private _tail: Promise<void> = Promise.resolve();

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this._tail;
    let release!: () => void;
    this._tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

// Global lock: only one model swap may happen at a time
const _MODEL_SWAP_LOCK = new Mutex();

/* ─── LLM bridge ──────────────────────────────────────────────────────────── */

/**
 * Structural view of the ported backend/LLM. The Python code called
 * `llm.stream_text(messages)` (a generator); the Node ports expose either
 * `streamText`, `stream_text` or `stream`, and may be sync or async.
 */
export interface SwarmLLM {
  streamText?(messages: unknown[], ...rest: unknown[]): unknown;
  stream_text?(messages: unknown[], ...rest: unknown[]): unknown;
  stream?(messages: unknown[], ...rest: unknown[]): unknown;
  complete?(messages: unknown[], ...rest: unknown[]): unknown;
}

/** Drain any stream-like LLM return value into a single string. */
export async function collectStream(llm: SwarmLLM | null | undefined, messages: unknown[]): Promise<string> {
  if (!llm) throw new Error("no LLM available");

  const fn =
    (typeof llm.streamText === "function" && llm.streamText) ||
    (typeof llm.stream_text === "function" && llm.stream_text) ||
    (typeof llm.stream === "function" && llm.stream) ||
    null;

  if (!fn) {
    if (typeof llm.complete === "function") {
      const res = await llm.complete(messages);
      const rec = asRecord(res);
      if (typeof res === "string") return res;
      if (typeof rec["text"] === "string") return rec["text"];
      return String(res ?? "");
    }
    throw new Error("LLM exposes no stream_text/streamText/complete method");
  }

  const out: unknown = await fn.call(llm, messages);

  if (out === null || out === undefined) return "";
  if (typeof out === "string") return out;

  const asAsync = out as AsyncIterable<unknown>;
  if (typeof asAsync[Symbol.asyncIterator] === "function") {
    let acc = "";
    for await (const token of asAsync) acc += String(token);
    return acc;
  }

  const asSync = out as Iterable<unknown>;
  if (typeof asSync[Symbol.iterator] === "function") {
    let acc = "";
    for (const token of asSync) acc += String(token);
    return acc;
  }

  const rec = asRecord(out);
  if (typeof rec["text"] === "string") return rec["text"];
  return String(out);
}

/* ─── Data types ───────────────────────────────────────────────────────────── */

export interface SubTaskInit {
  id: number;
  description: string;
  depends_on?: number[];
  priority?: number;
  tool_hint?: string;
  verify?: string;
  status?: string;
  result?: string;
  score?: number;
  duration_ms?: number;
  worker_id?: number;
}

export class SubTask {
  id: number;
  description: string;
  depends_on: number[];
  priority: number;
  tool_hint: string;
  verify: string;
  status: string; // pending / running / done / failed / rejected
  result: string;
  score: number;
  duration_ms: number;
  worker_id: number;

  constructor(init: SubTaskInit | number, description = "", extra: Partial<SubTaskInit> = {}) {
    const o: SubTaskInit =
      typeof init === "number" ? { id: init, description, ...extra } : init;
    this.id = o.id;
    this.description = o.description ?? "";
    this.depends_on = [...(o.depends_on ?? [])];
    this.priority = o.priority ?? 5;
    this.tool_hint = o.tool_hint ?? "";
    this.verify = o.verify ?? "";
    this.status = o.status ?? "pending";
    this.result = o.result ?? "";
    this.score = o.score ?? 0.0;
    this.duration_ms = o.duration_ms ?? 0;
    this.worker_id = o.worker_id ?? 0;
  }

  get dependsOn(): number[] {
    return this.depends_on;
  }
  get toolHint(): string {
    return this.tool_hint;
  }
  get durationMs(): number {
    return this.duration_ms;
  }
  get workerId(): number {
    return this.worker_id;
  }
}

export interface SwarmResultInit {
  task: string;
  sub_tasks: SubTask[];
  merged: string;
  success: boolean;
  total_ms: number;
  /** actual speedup achieved */
  parallelism: number;
}

export class SwarmResult {
  task: string;
  sub_tasks: SubTask[];
  merged: string;
  success: boolean;
  total_ms: number;
  parallelism: number;

  constructor(init: SwarmResultInit) {
    this.task = init.task;
    this.sub_tasks = init.sub_tasks;
    this.merged = init.merged;
    this.success = init.success;
    this.total_ms = init.total_ms;
    this.parallelism = init.parallelism;
  }

  get subTasks(): SubTask[] {
    return this.sub_tasks;
  }
  get totalMs(): number {
    return this.total_ms;
  }
}

/* ─── Decomposer ─────────────────────────────────────────────────────────────── */

export const DECOMPOSE_PROMPT = `Decompose a task into independent parallel sub-tasks.

Rules:
1. Maximize parallelism — only use depends_on for true sequential dependencies
2. Each sub-task is atomic and self-contained
3. Max 8 sub-tasks
4. tool_hint: primary tool (file_write, shell_run, etc.)
5. verify: one-line success check

Respond ONLY with JSON array:
[
  {"id": 1, "description": "...", "depends_on": [], "priority": 8, "tool_hint": "file_write", "verify": "..."},
  ...
]`;

export const CRITIC_PROMPT = `Review a worker's sub-task result.
Respond ONLY with JSON:
{"score": 8.5, "pass": true, "issues": [], "fix_hint": ""}
score: 0-10 (pass if >= 6.0)
issues: list of problems found
fix_hint: how to fix if score < 6.0`;

export const MERGE_PROMPT = `Synthesize multiple parallel worker outputs into one coherent response.
Be brief and structured. No extra commentary.`;

/* ─── Tool plumbing ────────────────────────────────────────────────────────── */

export type ToolHandler = (...args: never[]) => unknown;
export type ToolMap = Record<string, (...args: never[]) => unknown>;
export type ProgressCallback = (event: Record<string, unknown>) => void;

/** How `SwarmWorker` passes a tool's arguments (Python used `**kwargs`). */
export type ToolArgsMode = "auto" | "object" | "positional";

export interface ParsedToolCall {
  name: string;
  args: Record<string, unknown>;
}

/* ─── Worker ─────────────────────────────────────────────────────────────────── */

/**
 * A lightweight execution unit that runs a single sub-task.
 * Uses a shared tool_map from the parent agent — no separate LLM needed.
 *
 * Two execution modes depending on whether the loaded model supports tool calling:
 *   - Tool mode  (tool_capable=True):  full tool loop, can read/write files, run shell, etc.
 *   - Text mode  (tool_capable=False): receives pre-fetched file content in the prompt,
 *                                      produces pure text output (code, summary, critique).
 *                                      No tool calls attempted — avoids hallucinated JSON.
 */
export interface SwarmWorkerInit {
  worker_id: number;
  tool_map: ToolMap;
  llm: SwarmLLM | null;
  workspace: string;
  max_steps?: number;
  on_progress?: ProgressCallback | null;
  tool_capable?: boolean;
  tool_args_mode?: ToolArgsMode;
}

export class SwarmWorker {
  id: number;
  tool_map: ToolMap;
  llm: SwarmLLM | null;
  workspace: string;
  max_steps: number;
  on_progress: ProgressCallback | null;
  tool_capable: boolean;
  tool_args_mode: ToolArgsMode;

  constructor(init: SwarmWorkerInit);
  constructor(
    worker_id: number,
    tool_map: ToolMap,
    llm: SwarmLLM | null,
    workspace: string,
    max_steps?: number,
    on_progress?: ProgressCallback | null,
    tool_capable?: boolean,
  );
  constructor(
    a: SwarmWorkerInit | number,
    b?: ToolMap,
    c?: SwarmLLM | null,
    d?: string,
    e = 8,
    f: ProgressCallback | null = null,
    g = true,
  ) {
    const o: SwarmWorkerInit =
      typeof a === "number"
        ? {
            worker_id: a,
            tool_map: b ?? {},
            llm: c ?? null,
            workspace: d ?? ".",
            max_steps: e,
            on_progress: f,
            tool_capable: g,
          }
        : a;
    this.id = o.worker_id;
    this.tool_map = o.tool_map ?? {};
    this.llm = o.llm ?? null;
    this.workspace = o.workspace;
    this.max_steps = o.max_steps ?? 8;
    this.on_progress = o.on_progress ?? null;
    this.tool_capable = o.tool_capable ?? true;
    this.tool_args_mode = o.tool_args_mode ?? "auto";
  }

  get workerId(): number {
    return this.id;
  }
  get maxSteps(): number {
    return this.max_steps;
  }
  get toolCapable(): boolean {
    return this.tool_capable;
  }

  /** Execute a sub-task, update it in-place, return it. */
  async execute(sub_task: SubTask, context = ""): Promise<SubTask> {
    sub_task.status = "running";
    sub_task.worker_id = this.id;
    const t0 = Date.now();

    const prompt = this._build_prompt(sub_task, context);
    // Route to the right execution mode based on model capability
    const result = this.tool_capable
      ? await this._run_with_tools(prompt)
      : await this._run_text_only(prompt, sub_task);

    sub_task.result = result;
    sub_task.duration_ms = Date.now() - t0;
    sub_task.status = result && !result.slice(0, 50).includes("[ERROR]") ? "done" : "failed";

    if (this.on_progress) {
      this.on_progress({
        event: "worker_done",
        worker: this.id,
        task_id: sub_task.id,
        status: sub_task.status,
        ms: sub_task.duration_ms,
      });
    }

    return sub_task;
  }

  _build_prompt(sub_task: SubTask, context: string): string {
    const lines = [
      `PARALLEL WORKER TASK #${sub_task.id}:`,
      `${sub_task.description}`,
      "",
      `Success criterion: ${sub_task.verify || "task complete"}`,
      `Primary tool: ${sub_task.tool_hint || "any"}`,
    ];
    if (context) {
      lines.push(`\nCONTEXT FROM OTHER WORKERS:\n${context.slice(0, 800)}`);
    }
    lines.push(
      "\nExecute this task efficiently. " +
        "Use tools to complete it. " +
        "Call done() with a clear summary when finished.",
    );
    return lines.join("\n");
  }

  /**
   * Prompt for text-only models: pre-fetch relevant file content so the
   * model never needs to call a tool to read the workspace.
   */
  _build_text_prompt(sub_task: SubTask, context: string): string {
    // Pre-fetch file content referenced in the task description
    const file_content_block = this._prefetch_relevant_files(sub_task.description);

    const lines = [
      `TASK: ${sub_task.description}`,
      `SUCCESS CRITERION: ${sub_task.verify || "task complete"}`,
    ];
    if (file_content_block) {
      lines.push(`\nRELEVANT FILE CONTENT:\n${file_content_block}`);
    }
    if (context) {
      lines.push(`\nCONTEXT FROM OTHER WORKERS:\n${context.slice(0, 600)}`);
    }
    lines.push(
      "\nProvide your complete output below. " +
        "Do NOT attempt to call any tools or functions. " +
        "Write your full answer as plain text or code.",
    );
    return lines.join("\n");
  }

  /**
   * Extract file paths mentioned in the task description and read them
   * so a text-only model has the content it needs inline.
   */
  _prefetch_relevant_files(description: string): string {
    // Match common file path patterns in the task description
    const patterns = [
      /[\w./\\-]+\.py/g,
      /[\w./\\-]+\.ts/g,
      /[\w./\\-]+\.js/g,
      /[\w./\\-]+\.json/g,
      /[\w./\\-]+\.yaml/g,
      /[\w./\\-]+\.md/g,
    ];
    const found_paths: string[] = [];
    for (const pat of patterns) {
      found_paths.push(...description.match(pat) ?? []);
    }

    const blocks: string[] = [];
    for (const p of found_paths.slice(0, 3)) {
      // cap at 3 files to stay within context
      const full_path = path.isAbsolute(p) ? p : path.join(this.workspace, p);
      if (fs.existsSync(full_path)) {
        try {
          const content = fs.readFileSync(full_path, "utf-8").slice(0, 3000); // first 3000 chars
          blocks.push(`--- ${p} ---\n${content}`);
        } catch {
          /* unreadable — skip, mirroring Python's bare except */
        }
      }
    }
    return blocks.join("\n\n");
  }

  /** Parse `<tool>{...}</tool>` fallback calls out of a model reply. */
  _parse_fallback_calls(text: string): ParsedToolCall[] {
    const calls: ParsedToolCall[] = [];
    for (const m of text.matchAll(/<tool>([\s\S]*?)<\/tool>/g)) {
      const raw = (m[1] ?? "").trim().replace(/,\s*([}\]])/g, "$1");
      try {
        const obj = asRecord(JSON.parse(raw));
        const name = obj["name"] ?? obj["tool"];
        let args: unknown = obj["args"] ?? obj["arguments"] ?? {};
        if (typeof args === "string") {
          try {
            args = JSON.parse(args);
          } catch {
            args = {};
          }
        }
        if (name) {
          calls.push({ name: String(name), args: asRecord(args) });
        }
      } catch {
        /* unparseable hallucination — skip */
      }
    }
    return calls;
  }

  _is_done(text: string): boolean {
    const t = text.toLowerCase();
    return [
      "task complete",
      "task is complete",
      "all done",
      "i have completed",
      "finished.",
      "the task has been",
      "<endofop>",
      "successfully completed",
    ].some((s) => t.includes(s));
  }

  /** Invoke a tool handler, mirroring Python's `tool(**args)`. */
  _invoke_tool(name: string, args: Record<string, unknown>): unknown {
    const fn = this.tool_map[name];
    if (!fn) throw new Error(`unknown tool '${name}'`);
    const mode: ToolArgsMode = this.tool_args_mode;
    const useObject =
      mode === "object" || (mode === "auto" && (fn.length <= 1));
    const values = Object.values(args);
    return useObject ? (fn as (a: unknown) => unknown)(args) : (fn as (...a: unknown[]) => unknown)(...values);
  }

  /**
   * Tool-capable execution: full tool loop with <tool> parsing.
   * Used for Gemma 1B, Nemotron 4B and any other model that passed
   * tool-calling validation.
   */
  async _run_with_tools(prompt: string): Promise<string> {
    const tool_names = Object.keys(this.tool_map)
      .filter((k) => k !== "done")
      .join(", ");
    const tool_fmt =
      "\n\nTo call a tool:\n" +
      '<tool>{"name": "tool_name", "args": {"param": "value"}}</tool>\n' +
      `Tools: ${tool_names}\n` +
      'Finish: <tool>{"name": "done", "args": {"result": "summary"}}</tool>';
    const messages: Array<Record<string, unknown>> = [
      { role: "system", content: "You are a focused parallel worker agent." + tool_fmt },
      { role: "user", content: prompt },
    ];

    let finished = false;
    let final_result = "";
    let nudge = 0;

    for (let step = 0; step < this.max_steps; step++) {
      try {
        const full = await collectStream(this.llm, messages);

        const calls = this._parse_fallback_calls(full);
        if (calls.length > 0) {
          nudge = 0;
          messages.push({ role: "assistant", content: full });
          for (const fc of calls) {
            const name = fc.name;
            const args = fc.args;
            if (name === "done") {
              final_result = String(args["result"] ?? full);
              finished = true;
              break;
            }
            if (name in this.tool_map) {
              let result_str: string;
              try {
                const r = this._invoke_tool(name, args);
                result_str = r !== null && r !== undefined ? String(r) : "OK";
              } catch (e) {
                result_str = `[ERROR] ${errText(e)}`;
              }
              messages.push({
                role: "user",
                content: `Tool '${name}' returned:\n${result_str}\n\nContinue.`,
              });
            }
          }
          if (finished) break;
          continue;
        }

        if (this._is_done(full)) {
          final_result = full;
          finished = true;
          break;
        }

        nudge += 1;
        messages.push({ role: "assistant", content: full });
        if (nudge >= 3) {
          final_result = full;
          break;
        }
        messages.push({ role: "user", content: "Use a tool or call done()." });
      } catch (e) {
        final_result = `[ERROR] Worker ${this.id}: ${errText(e)}`;
        break;
      }
    }

    return final_result || "Worker completed without explicit result.";
  }

  /**
   * Text-only execution for models that cannot call tools (DeepSeek Coder
   * 1.3B, Qwen2.5 1.5B, Qwen2.5 Coder 1.5B).
   *
   * The model receives file content pre-fetched inline and is instructed
   * to produce pure text/code output only. The caller (orchestrator) is
   * responsible for writing results to disk via a tool-capable worker.
   */
  async _run_text_only(prompt: string, sub_task: SubTask): Promise<string> {
    void prompt; // Python accepted `prompt` and rebuilt a richer one from the sub-task.
    // Build a richer prompt with pre-fetched file content
    const rich_prompt = this._build_text_prompt(sub_task, "");
    const messages = [
      {
        role: "system",
        content:
          "You are a specialist code/analysis worker. " +
          "You receive a task and any relevant file content inline. " +
          "Produce only the requested output — code, analysis, or summary. " +
          "Do NOT output JSON tool calls, function calls, or <tool> blocks. " +
          "Write plain text or code blocks only.",
      },
      { role: "user", content: rich_prompt },
    ];
    try {
      const result = (await collectStream(this.llm, messages)).trim();
      return result ? result : "[TEXT-WORKER] No output produced.";
    } catch (e) {
      return `[ERROR] Text worker ${this.id}: ${errText(e)}`;
    }
  }
}

/* ─── Critic ─────────────────────────────────────────────────────────────────── */

export interface CriticReview {
  score: number;
  pass: boolean;
  issues: string[];
  fix_hint: string;
}

/**
 * Reviews worker results and scores them.
 * Rejects low-quality results and tells the worker what to fix.
 */
export class SwarmCritic {
  llm: SwarmLLM | null;
  pass_threshold: number;

  constructor(llm: SwarmLLM | null, pass_threshold = 6.0) {
    this.llm = llm;
    this.pass_threshold = pass_threshold;
  }

  get passThreshold(): number {
    return this.pass_threshold;
  }

  /**
   * Returns {"score": float, "pass": bool, "issues": list, "fix_hint": str}
   * Fast path: obvious failures are caught without LLM.
   */
  async review(sub_task: SubTask): Promise<CriticReview> {
    // Fast-path checks (no LLM needed)
    if (!sub_task.result || sub_task.result.length < 10) {
      return {
        score: 0.0,
        pass: false,
        issues: ["Empty or trivial result"],
        fix_hint: "Complete the task",
      };
    }

    if (sub_task.result.startsWith("[ERROR]")) {
      return {
        score: 1.0,
        pass: false,
        issues: [sub_task.result.slice(0, 200)],
        fix_hint: "Fix the error and retry",
      };
    }

    if (sub_task.status === "failed") {
      return {
        score: 2.0,
        pass: false,
        issues: ["Worker reported failure"],
        fix_hint: "Retry with different approach",
      };
    }

    // Skip LLM review for simple tasks (performance optimization)
    if (sub_task.priority < 4 || sub_task.result.length < 50) {
      return { score: 7.0, pass: true, issues: [], fix_hint: "" };
    }

    // LLM review for important tasks
    try {
      const msgs = [
        { role: "system", content: CRITIC_PROMPT },
        {
          role: "user",
          content:
            `TASK: ${sub_task.description}\n` +
            `VERIFY: ${sub_task.verify}\n` +
            `RESULT:\n${sub_task.result.slice(0, 1000)}`,
        },
      ];
      const raw = await collectStream(this.llm, msgs);
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        const obj = asRecord(JSON.parse(m[0]));
        const score = Number(obj["score"] ?? 7.0);
        if (!Number.isFinite(score)) throw new Error("non-numeric score");
        const issuesRaw = obj["issues"];
        return {
          score,
          pass: score >= this.pass_threshold && Boolean(obj["pass"] ?? true),
          issues: Array.isArray(issuesRaw) ? issuesRaw.map((x) => String(x)) : [],
          fix_hint: String(obj["fix_hint"] ?? ""),
        };
      }
    } catch {
      /* fall through to the neutral default, exactly like Python */
    }

    return { score: 7.0, pass: true, issues: [], fix_hint: "" };
  }

  /** camelCase alias. */
  reviewTask(sub_task: SubTask): Promise<CriticReview> {
    return this.review(sub_task);
  }
}

/* ─── Merger ─────────────────────────────────────────────────────────────────── */

/** Combines all worker results into a coherent final answer. */
export class SwarmMerger {
  llm: SwarmLLM | null;

  constructor(llm: SwarmLLM | null) {
    this.llm = llm;
  }

  /**
   * Merge all passed sub-task results.
   * For simple tasks, does it without LLM (pure concatenation).
   */
  async merge(task: string, sub_tasks: SubTask[]): Promise<string> {
    const passed = sub_tasks.filter((st) => st.status === "done" && st.score >= 5.0);

    if (passed.length === 0) {
      const failed = sub_tasks.filter((st) => st.status === "failed");
      return (
        `Swarm completed with issues. ` +
        `${sub_tasks.length} tasks, ${failed.length} failed.\n` +
        sub_tasks.map((st) => `  Task ${st.id}: ${st.result.slice(0, 200)}`).join("\n")
      );
    }

    // For 1-2 tasks, just concatenate (no LLM overhead)
    if (passed.length <= 2) {
      const parts = passed.map((st) => `Task ${st.id} (${st.description}):\n${st.result}`);
      return parts.join("\n\n---\n\n");
    }

    // For larger swarms, use LLM to merge
    try {
      const parts_text = passed
        .map((st) => `[WORKER ${st.worker_id} | Task ${st.id}: ${st.description}]\n${st.result.slice(0, 600)}`)
        .join("\n\n");
      const msgs = [
        { role: "system", content: MERGE_PROMPT },
        { role: "user", content: `ORIGINAL TASK: ${task}\n\nWORKER OUTPUTS:\n${parts_text}` },
      ];
      return (await collectStream(this.llm, msgs)).trim();
    } catch {
      // Fallback: plain concat
      return passed.map((st) => `• ${st.description}: ${st.result.slice(0, 400)}`).join("\n\n");
    }
  }

  /** camelCase alias. */
  mergeResults(task: string, sub_tasks: SubTask[]): Promise<string> {
    return this.merge(task, sub_tasks);
  }
}

/* ─── Orchestrator ───────────────────────────────────────────────────────────── */

/**
 * The subset of the Agent surface the swarm drives.
 *
 * Everything except `config` is deliberately optional/permissive: the ported
 * `Agent` exposes `llm`/`backend`, `workspace`, an `indexer` and a tool map
 * (`_tool_map`, `tool_map` or a JS `Map`), and the swarm adapts to whichever of
 * those spellings it finds. Internal accessors narrow the values.
 */
export interface SwarmAgent {
  config: AxonizConfig;
  llm?: SwarmLLM | null;
  backend?: SwarmLLM | null;
  workspace?: string;
  indexer?: unknown;
  _tool_map?: unknown;
  tool_map?: unknown;
  toolMap?: unknown;
  unload_llm?(): unknown;
  unloadLlm?(): unknown;
  ensure_llm?(): unknown;
  ensureLlm?(): unknown;
}

/** Build a name → handler record from a plain object or a JS `Map`. */
export function toToolMap(value: unknown): ToolMap {
  const out: ToolMap = {};
  if (value instanceof Map) {
    for (const [k, fn] of value as Map<unknown, unknown>) {
      if (typeof fn === "function") out[String(k)] = fn as ToolMap[string];
    }
    return out;
  }
  for (const [k, fn] of Object.entries(asRecord(value))) {
    if (typeof fn === "function") out[k] = fn as ToolMap[string];
  }
  return out;
}

export interface SwarmOrchestratorInit {
  agent: SwarmAgent;
  max_workers?: number;
  critic_threshold?: number;
  max_retries?: number;
  on_progress?: ProgressCallback | null;
}

/**
 * Main entry point for the swarm system.
 *
 * 1. Decomposes task into parallel sub-tasks
 * 2. Schedules them respecting dependencies
 * 3. Runs workers in a thread pool
 * 4. Critic reviews each result
 * 5. Retries failed/rejected tasks once
 * 6. Merger combines everything
 *
 * Usage:
 *     const swarm = new SwarmOrchestrator({ agent, max_workers: 4 });
 *     const result = await swarm.run("build a REST API...");
 */
export class SwarmOrchestrator {
  agent: SwarmAgent;
  critic_threshold: number;
  max_retries: number;
  on_progress: ProgressCallback | null;
  max_workers: number;
  critic: SwarmCritic;
  merger: SwarmMerger;
  _expert_mode: boolean;
  _original_model: string;

  constructor(init: SwarmOrchestratorInit);
  constructor(
    agent: SwarmAgent,
    max_workers?: number,
    critic_threshold?: number,
    max_retries?: number,
    on_progress?: ProgressCallback | null,
  );
  constructor(
    a: SwarmOrchestratorInit | SwarmAgent,
    b = 4,
    c = 6.0,
    d = 1,
    e: ProgressCallback | null = null,
  ) {
    const o: SwarmOrchestratorInit =
      "agent" in (a as SwarmOrchestratorInit)
        ? (a as SwarmOrchestratorInit)
        : {
            agent: a as SwarmAgent,
            max_workers: b,
            critic_threshold: c,
            max_retries: d,
            on_progress: e,
          };

    this.agent = o.agent;
    this.critic_threshold = o.critic_threshold ?? 6.0;
    this.max_retries = o.max_retries ?? 1;
    this.on_progress = o.on_progress ?? null;

    // Resolve any bare filenames in swarm_models to full paths
    resolveSwarmModels(this.agent.config);

    // If domain-expert models are configured, workers must be sequential
    // so we never have two models loaded in RAM at the same time.
    this._expert_mode = Object.values(asRecord(this.agent.config.swarm_models)).some(Boolean);
    this.max_workers = this._expert_mode ? 1 : (o.max_workers ?? 4);

    this.critic = new SwarmCritic(this._llm(), this.critic_threshold);
    this.merger = new SwarmMerger(this._llm());

    // Remember the model that was active before swarm started so we can
    // restore it when the swarm finishes.
    // Support both hierarchical config (llm.providers) and legacy flat config (model_path)
    this._original_model = currentModelPath(this.agent.config);
  }

  /** The LLM/backend the swarm should drive (`llm` or the `backend` alias). */
  private _llm(): SwarmLLM | null {
    return this.agent.llm ?? this.agent.backend ?? null;
  }

  /** Workspace root used when pre-fetching files for text-only workers. */
  private _workspace(): string {
    return String(this.agent.workspace ?? ".");
  }

  /** `agent.indexer.summary()` when the workspace indexer exposes it. */
  private _indexerSummary(): string {
    const indexer = this.agent.indexer as { summary?(): unknown } | undefined;
    if (!indexer || typeof indexer.summary !== "function") return "";
    try {
      return String(indexer.summary() ?? "");
    } catch {
      return "";
    }
  }

  /** The agent's tool registry, whichever spelling it uses. */
  private _toolMap(): ToolMap {
    return toToolMap(this.agent._tool_map ?? this.agent.tool_map ?? this.agent.toolMap);
  }

  get expertMode(): boolean {
    return this._expert_mode;
  }
  get maxWorkers(): number {
    return this.max_workers;
  }

  /* ── Model hot-swap (sequential, thread-safe) ─────────────────────────────── */

  private async _unloadLlm(): Promise<void> {
    try {
      const fn = this.agent.unload_llm ?? this.agent.unloadLlm;
      if (fn) await fn.call(this.agent);
    } catch (e) {
      debug(`[Swarm] unload_llm failed: ${errText(e)}`);
    }
  }

  private async _ensureLlm(): Promise<void> {
    try {
      const fn = this.agent.ensure_llm ?? this.agent.ensureLlm;
      if (fn) await fn.call(this.agent);
    } catch (e) {
      warn(`[Swarm] ensure_llm failed: ${errText(e)}`);
    }
  }

  /**
   * Unload the current LLM and load the domain-expert model assigned
   * to `role` in config.swarm_models.  A no-op if:
   *   - expert mode is disabled (no swarm_models configured)
   *   - the requested role has no model assigned
   *   - the correct model is already loaded
   */
  async _swap_model_for_role(role: string): Promise<void> {
    if (!this._expert_mode) {
      return;
    }

    const cfg = this.agent.config;
    const model_path = String(asRecord(cfg.swarm_models)[role] ?? "");

    if (!model_path) {
      return; // role has no expert model — use whatever is loaded
    }
    if (!fs.existsSync(model_path)) {
      warn(`[Swarm] Model for role '${role}' not found: '${model_path}'`);
      return;
    }

    const current_path = currentModelPath(cfg);

    if (current_path === model_path) {
      return; // already the right model
    }

    await _MODEL_SWAP_LOCK.runExclusive(async () => {
      info(`[Swarm] ▶ Phase '${role}' — loading ${path.basename(model_path)}`);
      this._emit("model_swap", { role, model: path.basename(model_path) });

      await this._unloadLlm();
      setProviderModelPath(cfg, model_path);
      await this._ensureLlm();

      // Keep critic and merger wired to the current LLM
      const llm = this._llm();
      this.critic.llm = llm;
      this.merger.llm = llm;
    });
  }

  /** Reload the model that was active before the swarm started. */
  async _restore_original_model(): Promise<void> {
    if (!this._expert_mode || !this._original_model) {
      return;
    }
    const cfg = this.agent.config;
    const current = currentModelPath(cfg);
    if (current === this._original_model) {
      return;
    }
    await _MODEL_SWAP_LOCK.runExclusive(async () => {
      info(`[Swarm] Restoring original model: ${path.basename(this._original_model)}`);
      await this._unloadLlm();
      setProviderModelPath(cfg, this._original_model);
      await this._ensureLlm();
    });
  }

  /* ── Main entry point ─────────────────────────────────────────────────────── */

  /** Full swarm execution pipeline. Returns SwarmResult. */
  async run(task: string): Promise<SwarmResult> {
    const t_start = Date.now();
    const mode = this._expert_mode ? "expert" : "standard";
    info(`[Swarm] Starting (${mode} mode): ${task.slice(0, 60)}`);
    this._emit("swarm_start", { task, mode });

    let all_tasks: SubTask[] = [];
    let merged = "";

    try {
      // ── Phase 1: Decompose ──────────────────────────────────────────
      await this._swap_model_for_role("decomposer");
      const sub_tasks = await this._decompose(task);
      info(`[Swarm] Decomposed into ${sub_tasks.length} sub-tasks`);
      this._emit("decomposed", {
        count: sub_tasks.length,
        tasks: sub_tasks.map((st) => st.description),
      });

      // ── Phase 2: Execute ────────────────────────────────────────────
      await this._swap_model_for_role("worker");
      const completed = new Map<number, SubTask>();
      await this._schedule_and_run(sub_tasks, completed);

      // ── Phase 3: Critic review + retry ──────────────────────────────
      await this._swap_model_for_role("critic");
      for (const st of [...completed.values()]) {
        const review = await this.critic.review(st);
        st.score = review.score;

        if (!review.pass && this.max_retries > 0) {
          info(`[Swarm] Critic rejected task ${st.id} (score=${st.score.toFixed(1)}), retrying`);
          this._emit("critic_retry", {
            task_id: st.id,
            score: st.score,
            issues: review.issues,
          });
          let retry_st = new SubTask({
            id: st.id,
            description: st.description + `\n\nFIX REQUIRED: ${review.fix_hint}`,
            depends_on: st.depends_on,
            priority: st.priority,
            tool_hint: st.tool_hint,
            verify: st.verify,
          });
          await this._swap_model_for_role("worker");
          const worker = this._make_worker(st.id % this.max_workers);
          const ctx = this._build_context(completed, st.id);
          retry_st = await worker.execute(retry_st, ctx);

          await this._swap_model_for_role("critic");
          const review2 = await this.critic.review(retry_st);
          retry_st.score = review2.score;
          completed.set(st.id, retry_st);
        }
      }

      // ── Phase 4: Merge ──────────────────────────────────────────────
      await this._swap_model_for_role("merger");
      all_tasks = [...completed.values()];
      merged = await this.merger.merge(task, all_tasks);
    } finally {
      // Always restore the original model so the agent is usable
      // immediately after the swarm finishes, regardless of errors.
      await this._restore_original_model();
    }

    const total_ms = Date.now() - t_start;
    const seq_time_ms = all_tasks.reduce((acc, st) => acc + st.duration_ms, 0);
    const parallelism = seq_time_ms > 0 ? seq_time_ms / Math.max(total_ms, 1) : 1.0;

    const result = new SwarmResult({
      task,
      sub_tasks: all_tasks,
      merged,
      success: all_tasks.some((st) => st.status === "done"),
      total_ms,
      parallelism: Math.round(parallelism * 100) / 100,
    });

    const passed = all_tasks.filter((st) => st.score >= 6.0).length;
    this._emit("swarm_done", {
      total_ms,
      seq_ms: seq_time_ms,
      speedup: `${parallelism.toFixed(1)}x`,
      passed,
    });
    info(
      `[Swarm] ✓ Done in ${total_ms}ms — ${parallelism.toFixed(1)}x speedup | ${passed}/${all_tasks.length} passed`,
    );

    return result;
  }

  /** Convenience: run and return just the merged string. */
  async run_simple(task: string): Promise<string> {
    return (await this.run(task)).merged;
  }

  /** camelCase alias. */
  async runSimple(task: string): Promise<string> {
    return this.run_simple(task);
  }

  /* ── Internal ────────────────────────────────────────────────────────────── */

  /** Use LLM to decompose task into sub-tasks. */
  async _decompose(task: string): Promise<SubTask[]> {
    const workspace_summary = this._indexerSummary();
    const context = workspace_summary ? `Workspace: ${workspace_summary}\n\nTask: ${task}` : task;

    const msgs = [
      { role: "system", content: DECOMPOSE_PROMPT },
      { role: "user", content: context },
    ];
    try {
      const raw = await collectStream(this._llm(), msgs);
      const m = raw.match(/\[[\s\S]*\]/);
      if (m) {
        const data = JSON.parse(m[0]) as unknown[];
        return data.slice(0, 8).map((d, i) => {
          const rec = asRecord(d);
          const depsRaw = rec["depends_on"];
          return new SubTask({
            id: toInt(rec["id"], i + 1),
            description: String(rec["description"] ?? ""),
            depends_on: Array.isArray(depsRaw) ? depsRaw.map((x) => toInt(x, 0)) : [],
            priority: toInt(rec["priority"], 5),
            tool_hint: String(rec["tool_hint"] ?? ""),
            verify: String(rec["verify"] ?? ""),
          });
        });
      }
    } catch (e) {
      warn(`[Swarm] Decompose failed: ${errText(e)}`);
    }

    // Fallback: single sub-task
    return [new SubTask({ id: 1, description: task, verify: "task complete", priority: 8 })];
  }

  /**
   * Execute sub-tasks respecting depends_on.
   * Independent tasks run in parallel, bounded by `max_workers`
   * (Python's `ThreadPoolExecutor(max_workers=...)`).
   */
  async _schedule_and_run(sub_tasks: SubTask[], completed: Map<number, SubTask>): Promise<void> {
    const pending = new Map<number, SubTask>(sub_tasks.map((st) => [st.id, st]));
    const running = new Map<number, Promise<void>>();

    while (pending.size > 0 || running.size > 0) {
      // Find tasks that can now run (all dependencies done)
      const ready = [...pending.values()].filter((st) =>
        st.depends_on.every((dep) => completed.has(dep)),
      );

      let started = false;
      for (const st of ready) {
        if (running.size >= Math.max(this.max_workers, 1)) break;
        pending.delete(st.id);
        const ctx = this._build_context(completed);
        const worker = this._make_worker(st.id % this.max_workers);
        this._emit("worker_start", { task_id: st.id, desc: st.description });
        const promise = worker
          .execute(st, ctx)
          .then((result_st) => {
            completed.set(result_st.id, result_st);
          })
          .catch((e: unknown) => {
            // Mark failed
            const original = sub_tasks.find((s) => s.id === st.id);
            if (original) {
              original.status = "failed";
              original.result = `[ERROR] ${errText(e)}`;
              completed.set(st.id, original);
            }
          })
          .finally(() => {
            running.delete(st.id);
          });
        running.set(st.id, promise);
        started = true;
      }

      if (running.size === 0) {
        if (!started) break; // nothing running, nothing ready = dependency cycle
        continue;
      }

      // Wait for at least one to finish
      await Promise.race(running.values());
    }

    // Drain any stragglers (only reachable if the loop exited via a cycle break)
    if (running.size > 0) {
      await Promise.allSettled(running.values());
    }
  }

  _make_worker(worker_id: number): SwarmWorker {
    // Determine whether the currently loaded model supports tool calling
    // by checking against the explicit whitelist in config.
    const cfg = this.agent.config;
    const capableRaw = cfg.swarm_tool_capable_models;
    const capable_models: string[] = Array.isArray(capableRaw) ? capableRaw.map((c) => String(c)) : [];
    const current_model = currentModelPath(cfg);
    // Match by full path or just filename
    const current_basename = path.basename(current_model);
    const tool_capable =
      capable_models.length === 0 || // if list is empty, assume all models can use tools
      capable_models.includes(current_model) ||
      capable_models.some((c) => path.basename(c) === current_basename);
    if (!tool_capable) {
      info(`[Swarm] Worker ${worker_id} → text-only mode (${current_basename})`);
    }
    return new SwarmWorker({
      worker_id,
      tool_map: this._toolMap(),
      llm: this._llm(),
      workspace: this._workspace(),
      max_steps: 8,
      on_progress: this.on_progress,
      tool_capable,
    });
  }

  /** Build context string from already-completed sub-tasks. */
  _build_context(completed: Map<number, SubTask>, exclude_id: number | null = null): string {
    const parts: string[] = [];
    for (const tid of [...completed.keys()].sort((x, y) => x - y)) {
      if (tid === exclude_id) {
        continue;
      }
      const st = completed.get(tid);
      if (!st) continue;
      if (st.status === "done" && st.result) {
        parts.push(`Task ${tid} (${st.description.slice(0, 60)}): ${st.result.slice(0, 300)}`);
      }
    }
    return parts.slice(0, 3).join("\n"); // limit context size
  }

  _emit(event: string, data: Record<string, unknown>): void {
    if (this.on_progress) {
      try {
        this.on_progress({ event, ...data });
      } catch {
        /* progress callbacks must never break the swarm */
      }
    }
  }
}
