/**
 * AXONIZ Core Extras — features that make axoniz competitive
 * ────────────────────────────────────────────────────────────
 * 1. ContextCompressor  — summarizes long conversations to fit context
 * 2. TaskPlanner        — breaks goals into verified sub-tasks (moltbot-style)
 * 3. SelfEvaluator      — agent grades its own output and retries if low quality
 * 4. TokenCounter       — estimates token usage without tiktoken
 * 5. WorkspaceIndexer   — fast project-wide symbol/file index
 * 6. GitTools           — git status, diff, commit, log
 *
 * Port of axoniz/core/extras.py
 *
 * Port notes:
 *  - `subprocess.run` → `spawnSync` so GitTools keeps the *synchronous* contract
 *    the Python agent relies on (`self.git_tools.status()` is called inline in
 *    System_scan and the shadow-branch flow). Error strings are byte-identical.
 *  - `ast.parse` → regex scanning. Python's `ast` has no Node equivalent that is
 *    dependency-free, so classes/functions/imports are extracted with anchored
 *    regexes. Limitations: `async def` is intentionally NOT collected (Python's
 *    `ast.FunctionDef` also excludes `AsyncFunctionDef`), and symbol text inside
 *    multi-line strings can produce a false positive.
 *  - File reads use UTF-8 with replacement characters instead of Python's
 *    `errors="ignore"`; every other behaviour matches.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

/* ── Shared LLM shape ─────────────────────────────────────────────────────── */

export interface ChatMessageLike {
  role?: string;
  content?: string | null;
  [key: string]: unknown;
}

/** Anything exposing a Python-style `chat(messages)` returning text or an object. */
export interface ChatLike {
  chat(messages: ChatMessageLike[]): unknown;
}

async function callChat(llm: ChatLike, messages: ChatMessageLike[]): Promise<string> {
  const resp = await llm.chat(messages);
  return typeof resp === "string" ? resp : String(resp);
}

/* ── Tool-dispatch helpers ────────────────────────────────────────────────── */

/**
 * Axoniz tool maps follow the Python kwargs convention, so the agent dispatches
 * them as `fn(argsObject)` (see `adapt()` in src/core/agent.ts). These helpers
 * accept both that single-object form and plain positional calls.
 */
export function toolArgs(args: unknown[], names: readonly string[]): Record<string, unknown> {
  const first = args[0];
  if (args.length === 1 && first !== null && typeof first === "object" && !Array.isArray(first)) {
    return first as Record<string, unknown>;
  }
  const out: Record<string, unknown> = {};
  for (let i = 0; i < names.length && i < args.length; i++) {
    const v = args[i];
    if (v !== undefined) out[names[i]] = v;
  }
  return out;
}

/** `undefined`/`null`-tolerant string coercion for optional tool args. */
export function optStr(v: unknown): string | undefined {
  return v === undefined || v === null ? undefined : String(v);
}

/** `undefined`/`null`-tolerant number coercion for optional tool args. */
export function optNum(v: unknown): number | undefined {
  return v === undefined || v === null ? undefined : Number(v);
}

/** `undefined`/`null`-tolerant boolean coercion for optional tool args. */
export function optBool(v: unknown, dflt = false): boolean {
  return v === undefined || v === null ? dflt : Boolean(v);
}

/* ══════════════════════════════════════════════════════════════════
 *  1. TOKEN COUNTER — estimates without tiktoken
 * ══════════════════════════════════════════════════════════════════ */

/** Rough token estimator: ~4 chars per token (GPT convention). */
export class TokenCounter {
  static count(text: string): number {
    return Math.max(1, Math.trunc((text ?? "").length / 4));
  }

  static count_messages(messages: ChatMessageLike[]): number {
    let total = 0;
    for (const m of messages) {
      total += TokenCounter.count((m.content as string) ?? "");
      total += 4; // message overhead
    }
    return total;
  }

  static fits(messages: ChatMessageLike[], maxTokens = 6000): boolean {
    return TokenCounter.count_messages(messages) <= maxTokens;
  }

  /* camelCase aliases */
  static countMessages(messages: ChatMessageLike[]): number {
    return TokenCounter.count_messages(messages);
  }
}

/* ══════════════════════════════════════════════════════════════════
 *  2. CONTEXT COMPRESSOR
 * ══════════════════════════════════════════════════════════════════ */

/**
 * Compresses long conversation histories to stay within context limits.
 * Strategy:
 *   - Always keep system prompt(s)
 *   - Always keep the last `keep_tail` messages verbatim
 *   - Summarize middle messages into a single summary message
 */
export class ContextCompressor {
  max_tokens: number;
  keep_tail: number;

  constructor(maxTokens = 6000, keepTail = 6) {
    this.max_tokens = maxTokens;
    this.keep_tail = keepTail;
  }

  /**
   * Compress messages if over budget.
   * `llm` is an optional backend with `.chat(messages)` for summarization.
   */
  async compress(messages: ChatMessageLike[], llm?: ChatLike | null): Promise<ChatMessageLike[]> {
    if (TokenCounter.fits(messages, this.max_tokens)) {
      return messages;
    }

    const system = messages.filter((m) => m.role === "system");
    const rest = messages.filter((m) => m.role !== "system");

    if (rest.length <= this.keep_tail + 2) {
      return messages; // not enough to compress
    }

    const head = rest.slice(0, rest.length - this.keep_tail);
    const tail = rest.slice(rest.length - this.keep_tail);

    let summaryText: string;
    if (llm && head.length > 2) {
      summaryText = await this._summarize(head, llm);
    } else {
      summaryText = this._extractive_summary(head);
    }

    const summaryMsg: ChatMessageLike = {
      role: "system",
      content: `[CONTEXT SUMMARY — earlier conversation compressed]\n${summaryText}`,
    };

    return [...system, summaryMsg, ...tail];
  }

  /** Use the LLM to summarize the messages. */
  async _summarize(messages: ChatMessageLike[], llm: ChatLike): Promise<string> {
    const transcript = messages
      .map((m) => `${String(m.role ?? "").toUpperCase()}: ${(m.content ?? "").slice(0, 500)}`)
      .join("\n");
    const prompt: ChatMessageLike[] = [
      {
        role: "system",
        content:
          "Summarize the following conversation concisely, preserving key facts, decisions, and code produced. Be factual and brief.",
      },
      { role: "user", content: transcript.slice(0, 4000) },
    ];
    try {
      return await callChat(llm, prompt);
    } catch {
      return this._extractive_summary(messages);
    }
  }

  /** Fallback: extract key lines without the LLM. */
  _extractive_summary(messages: ChatMessageLike[]): string {
    const parts: string[] = [];
    for (const m of messages) {
      const role = String(m.role ?? "");
      const content = ((m.content as string) ?? "").slice(0, 200);
      if (role === "user") {
        parts.push(`User said: ${content}`);
      } else if (role === "assistant" && content.toLowerCase().includes("done")) {
        parts.push(`Agent completed: ${content.slice(0, 150)}`);
      }
    }
    const joined = parts.slice(0, 10).join(" | ");
    return joined || "Conversation history compressed.";
  }
}

/* ══════════════════════════════════════════════════════════════════
 *  3. SELF-EVALUATOR
 * ══════════════════════════════════════════════════════════════════ */

export interface EvaluationResult {
  score: number;
  reason: string;
  improvements?: string;
  pass: boolean;
}

/**
 * After each agent response, optionally ask the same LLM to score it.
 * If the score is below the threshold, retry with a stronger prompt.
 */
export class SelfEvaluator {
  static readonly EVAL_PROMPT = `You are a strict code and task reviewer.
Rate the following agent response on a scale of 0-10 based on:
- Completeness (did it fully address the task?)
- Correctness (is the code/answer correct?)
- Clarity (is it well-explained?)

Respond with ONLY a JSON object: {"score": 7, "reason": "brief explanation", "improvements": "what to fix"}
`;

  threshold: number;
  llm: ChatLike | null;

  constructor(threshold = 6.0, llm?: ChatLike | null) {
    this.threshold = threshold;
    this.llm = llm ?? null;
  }

  /** Returns {score, reason, pass} (+ improvements when the model supplied it). */
  async evaluate(task: string, response: string): Promise<EvaluationResult> {
    if (!this.llm) {
      return { score: 10.0, reason: "no evaluator configured", pass: true };
    }
    try {
      const msgs: ChatMessageLike[] = [
        { role: "system", content: SelfEvaluator.EVAL_PROMPT },
        { role: "user", content: `TASK:\n${task.slice(0, 500)}\n\nRESPONSE:\n${response.slice(0, 1500)}` },
      ];
      const raw = await callChat(this.llm, msgs);
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const obj = JSON.parse(match[0]) as Record<string, unknown>;
        const score = Number(obj["score"] ?? 5);
        return {
          score,
          reason: String(obj["reason"] ?? ""),
          improvements: String(obj["improvements"] ?? ""),
          pass: score >= this.threshold,
        };
      }
    } catch {
      /* fall through to the parse-failure result, mirroring Python */
    }
    return { score: 5.0, reason: "eval parse failed", pass: true };
  }

  /** Build a retry prompt when the score is too low. */
  retry_prompt(task: string, response: string, reason: string): string {
    return (
      `Your previous response was insufficient.\n` +
      `Issue: ${reason}\n\n` +
      `Original task: ${task}\n\n` +
      `Previous attempt (improve on this):\n${response.slice(0, 800)}\n\n` +
      `Please provide a complete, corrected response.`
    );
  }

  /** camelCase alias. */
  retryPrompt(task: string, response: string, reason: string): string {
    return this.retry_prompt(task, response, reason);
  }
}

/* ══════════════════════════════════════════════════════════════════
 *  4. WORKSPACE INDEXER
 * ══════════════════════════════════════════════════════════════════ */

export interface SymbolEntry {
  name: string;
  file: string;
}

export interface ImportEntry {
  module: string;
  file: string;
}

export interface WorkspaceIndex {
  files: number;
  classes: SymbolEntry[];
  functions: SymbolEntry[];
  imports: ImportEntry[];
}

interface ParsedFile {
  classes: string[];
  functions: string[];
  imports: string[];
}

const SKIP_DIRS = new Set([".git", "__pycache__", "node_modules", ".egg-info", "dist", "build", ".axoniz"]);

const PY_CLASS_RE = /^[ \t]*class[ \t]+([A-Za-z_]\w*)/gm;
const PY_FUNC_RE = /^[ \t]*def[ \t]+([A-Za-z_]\w*)/gm;
const PY_IMPORT_RE = /^[ \t]*import[ \t]+([^\n#]+)/gm;
const PY_FROM_RE = /^[ \t]*from[ \t]+([\w.]+)[ \t]+import/gm;

/**
 * Indexes a workspace directory for fast symbol lookup.
 * Extracts: file paths, Python classes/functions/imports.
 */
export class WorkspaceIndexer {
  workspace: string;
  protected _cache = new Map<string, ParsedFile>();
  protected _mtime = new Map<string, number>();

  constructor(workspace: string) {
    this.workspace = path.resolve(workspace);
  }

  /** Build/refresh the index. Returns a summary object. */
  index(maxFiles = 200): WorkspaceIndex {
    const result: WorkspaceIndex = { files: 0, classes: [], functions: [], imports: [] };
    const pyFiles = this._walkPythonFiles(this.workspace);

    for (const fpath of pyFiles.slice(0, maxFiles)) {
      let mtime = 0;
      try {
        mtime = fs.statSync(fpath).mtimeMs;
      } catch {
        continue;
      }
      let cached = this._cache.get(fpath);
      if (cached === undefined || this._mtime.get(fpath) !== mtime) {
        cached = this._parse_python(fpath);
        this._cache.set(fpath, cached);
        this._mtime.set(fpath, mtime);
      }

      result.files += 1;
      const rel = path.relative(this.workspace, fpath);
      for (const cls of cached.classes) result.classes.push({ name: cls, file: rel });
      for (const fn of cached.functions) result.functions.push({ name: fn, file: rel });
      for (const imp of cached.imports) result.imports.push({ module: imp, file: rel });
    }

    return result;
  }

  /** Recursive `.py` discovery with the same pruned directories as `os.walk`. */
  protected _walkPythonFiles(root: string, out: string[] = []): string[] {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      return out;
    }
    for (const e of entries) {
      const full = path.join(root, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) this._walkPythonFiles(full, out);
      } else if (e.isFile() && e.name.endsWith(".py")) {
        out.push(full);
      }
    }
    return out;
  }

  /** Regex-based stand-in for Python's `ast` symbol extraction. */
  _parse_python(fpath: string): ParsedFile {
    const result: ParsedFile = { classes: [], functions: [], imports: [] };
    let source: string;
    try {
      source = fs.readFileSync(fpath, "utf-8");
    } catch {
      return result;
    }
    try {
      for (const m of source.matchAll(PY_CLASS_RE)) result.classes.push(m[1]);
      for (const m of source.matchAll(PY_FUNC_RE)) result.functions.push(m[1]);
      for (const m of source.matchAll(PY_IMPORT_RE)) {
        for (const part of m[1].split(",")) {
          const name = part.trim().split(/\s+as\s+/)[0].trim();
          if (name) result.imports.push(name);
        }
      }
      for (const m of source.matchAll(PY_FROM_RE)) result.imports.push(m[1] ?? "");
    } catch {
      /* best effort, matching Python's bare except around parse errors */
    }
    return result;
  }

  /** Find where a class/function is defined (substring, case-insensitive). */
  find_symbol(name: string): SymbolEntry[] {
    const idx = this.index();
    const needle = name.toLowerCase();
    const results: SymbolEntry[] = [];
    for (const entry of [...idx.classes, ...idx.functions]) {
      if (entry.name.toLowerCase().includes(needle)) results.push(entry);
    }
    return results;
  }

  /** One-line project summary. */
  summary(): string {
    const idx = this.index();
    return (
      `Project: ${path.basename(this.workspace)}  ` +
      `| ${idx.files} Python files  ` +
      `| ${idx.classes.length} classes  ` +
      `| ${idx.functions.length} functions`
    );
  }

  /* camelCase aliases */
  findSymbol(name: string): SymbolEntry[] {
    return this.find_symbol(name);
  }
}

/* ══════════════════════════════════════════════════════════════════
 *  5. GIT TOOLS
 * ══════════════════════════════════════════════════════════════════ */

export type GitToolFn = (...args: unknown[]) => string;

/** Git operations for the agent. Requires `git` in PATH. */
export class GitTools {
  workspace: string;

  constructor(workspace: string) {
    this.workspace = path.resolve(workspace);
  }

  /**
   * Run `git <args>` in the workspace. Returns stdout, or the exact Python
   * error strings: "[git error] <stderr>", "[ERROR] git not found in PATH",
   * "[ERROR] git timed out", "[ERROR] <e>", or "(no output)".
   */
  _git(args: string[], timeout = 15): string {
    let res: ReturnType<typeof spawnSync>;
    try {
      res = spawnSync("git", args, {
        cwd: this.workspace,
        timeout: Math.max(0, Math.trunc(timeout * 1000)),
        encoding: "utf-8",
        maxBuffer: 32 * 1024 * 1024,
        windowsHide: true,
      });
    } catch (e) {
      return `[ERROR] ${errText(e)}`;
    }

    const err = (res.error ?? null) as (NodeJS.ErrnoException & { code?: string }) | null;
    if (err) {
      if (err.code === "ENOENT") return "[ERROR] git not found in PATH";
      if (err.code === "ETIMEDOUT" || (err as { killed?: boolean }).killed) return "[ERROR] git timed out";
      return `[ERROR] ${errText(err)}`;
    }

    const out = String(res.stdout ?? "").trim();
    const stderr = String(res.stderr ?? "").trim();
    if (res.status !== 0 && stderr) {
      return `[git error] ${stderr}`;
    }
    return out || "(no output)";
  }

  status(): string {
    return this._git(["status", "--short", "--branch"]);
  }

  diff(filePath?: string | null, staged = false): string {
    const args = ["diff"];
    if (staged) args.push("--cached");
    if (filePath) args.push(filePath);
    let out = this._git(args);
    if (out.length > 6000) {
      out = `${out.slice(0, 6000)}\n… [diff truncated]`;
    }
    return out;
  }

  log(n = 10, oneline = true): string {
    const fmt = oneline ? "--oneline" : "--format=%h %an %ar %s";
    return this._git(["log", fmt, `-${n}`]);
  }

  add(p = "."): string {
    return this._git(["add", p]);
  }

  commit(message: string): string {
    return this._git(["commit", "-m", message]);
  }

  branch(): string {
    return this._git(["branch", "-v"]);
  }

  checkout(branchName: string, create = false): string {
    const args = ["checkout"];
    if (create) args.push("-b");
    args.push(branchName);
    return this._git(args);
  }

  push(remote = "origin", branchName?: string | null): string {
    const args = ["push", remote];
    if (branchName) args.push(branchName);
    return this._git(args, 30);
  }

  pull(): string {
    return this._git(["pull"], 30);
  }

  stash(): string {
    return this._git(["stash"]);
  }

  stash_pop(): string {
    return this._git(["stash", "pop"]);
  }

  is_repo(): boolean {
    return fs.existsSync(path.join(this.workspace, ".git"));
  }

  init(): string {
    return this._git(["init"]);
  }

  current_branch(): string {
    return this._git(["branch", "--show-current"]);
  }

  as_tool_map(): Record<string, GitToolFn> {
    return {
      git_status: () => this.status(),
      git_diff: (...args: unknown[]) => {
        const a = toolArgs(args, ["path", "staged"]);
        return this.diff(optStr(a["path"]), optBool(a["staged"]));
      },
      git_log: (...args: unknown[]) => {
        const a = toolArgs(args, ["n", "oneline"]);
        return this.log(optNum(a["n"]) ?? 10, optBool(a["oneline"], true));
      },
      git_add: (...args: unknown[]) => {
        const a = toolArgs(args, ["path"]);
        return this.add(optStr(a["path"]) ?? ".");
      },
      git_commit: (...args: unknown[]) => {
        const a = toolArgs(args, ["message"]);
        return this.commit(String(a["message"] ?? ""));
      },
      git_branch: () => this.branch(),
      git_checkout: (...args: unknown[]) => {
        const a = toolArgs(args, ["branch", "create"]);
        return this.checkout(String(a["branch"] ?? ""), optBool(a["create"]));
      },
      git_push: (...args: unknown[]) => {
        const a = toolArgs(args, ["remote", "branch"]);
        return this.push(optStr(a["remote"]) ?? "origin", optStr(a["branch"]));
      },
      git_pull: () => this.pull(),
      git_stash: () => this.stash(),
    };
  }

  /* camelCase aliases */
  isRepo(): boolean {
    return this.is_repo();
  }
  currentBranch(): string {
    return this.current_branch();
  }
  stashPop(): string {
    return this.stash_pop();
  }
  asToolMap(): Record<string, GitToolFn> {
    return this.as_tool_map();
  }
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/* ══════════════════════════════════════════════════════════════════
 *  6. SMART PLANNER
 * ══════════════════════════════════════════════════════════════════ */

export const PLANNER_PROMPT = `You are a precise task planner for a coding agent.
Given a high-level goal, produce a step-by-step execution plan.

Rules:
- Each step must be a single, concrete, verifiable action
- Steps must be ordered by dependency
- Maximum 10 steps
- Each step has: id, action (what to do), verify (how to confirm it worked), tool_hint (which tool to use)

Respond ONLY with a JSON array:
[
  {"id": 1, "action": "Create src/ directory", "verify": "src/ exists", "tool_hint": "file_list"},
  {"id": 2, "action": "Write main.py with FastAPI skeleton", "verify": "main.py contains 'from fastapi'", "tool_hint": "file_write"}
]`;

export interface PlanStep {
  id: number;
  action: string;
  verify: string;
  tool_hint?: string;
  [key: string]: unknown;
}

/** Breaks a goal into verified steps. Uses the agent's LLM. */
export class SmartPlanner {
  llm: ChatLike | null;

  constructor(llm?: ChatLike | null) {
    this.llm = llm ?? null;
  }

  async plan(goal: string, workspaceSummary = ""): Promise<PlanStep[]> {
    if (!this.llm) {
      return [{ id: 1, action: goal, verify: "task complete", tool_hint: "done" }];
    }
    const context = workspaceSummary ? `Workspace: ${workspaceSummary}\n\nGoal: ${goal}` : `Goal: ${goal}`;
    const msgs: ChatMessageLike[] = [
      { role: "system", content: PLANNER_PROMPT },
      { role: "user", content: context },
    ];
    try {
      const raw = await callChat(this.llm, msgs);
      const match = raw.match(/\[[\s\S]*\]/);
      if (match) {
        return JSON.parse(match[0]) as PlanStep[];
      }
    } catch {
      /* fall through to the single-step fallback */
    }
    return [{ id: 1, action: goal, verify: "task complete", tool_hint: "done" }];
  }

  format_plan(steps: PlanStep[]): string {
    const lines = [`Plan (${steps.length} steps):`];
    for (const s of steps) {
      lines.push(`  ${s.id}. ${s.action}`);
      lines.push(`     verify: ${s.verify}  |  tool: ${s.tool_hint ?? "?"}`);
    }
    return lines.join("\n");
  }

  /* camelCase alias */
  formatPlan(steps: PlanStep[]): string {
    return this.format_plan(steps);
  }
}
