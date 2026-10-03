/**
 * AXONIZ-ZERO Loop Engine — Goal Mode
 * Fixed: syntax error in _replan(), _plan()/_replan()/_verify() all use
 * TextResponse correctly, no SyntaxError on import.
 *
 * Port of axoniz/core/loop.py
 *
 * Port notes:
 *  - The Python module imports `C`, `_rule` and `Spinner` from
 *    `axoniz.core.cli`. `src/core/cli.ts` is owned by another agent and did not
 *    exist when this was ported, so loop.ts carries a private, behaviour-identical
 *    UI shim (same ANSI codes, same `Spinner` contract, `setInterval` instead of a
 *    `threading.Thread`). Nothing else in the file diverges.
 *  - `Agent` is not imported (that would create a circular import with
 *    src/core/agent.ts): the engine only needs the small `AgentLike` surface
 *    below, exactly the attributes the Python implementation touches.
 *  - `time.sleep(0.3)` → `await sleep(300)`.
 *  - Python's `_header()` calls `rule('═', C.BLUE)` although `_rule()` takes no
 *    arguments, which raises TypeError in Python. The shim's `rule()` accepts the
 *    optional glyph + colour so the intended output is produced.
 */
import { getLogger } from "./logger.js";

const logger = getLogger();

/* ══════════════════════════════════════════════════════════════════
 *  Private UI shim (mirrors axoniz/core/cli.py's C / _rule / Spinner)
 * ══════════════════════════════════════════════════════════════════ */

function isTty(): boolean {
  return Boolean(process.stdout.isTTY);
}

function colorOk(): boolean {
  if (process.env["NO_COLOR"]) return false;
  return isTty() || Boolean(process.env["FORCE_COLOR"]);
}

const HAS_COLOR = colorOk();

function esc(code: string): string {
  return HAS_COLOR ? `\u001b[${code}m` : "";
}

export const C = {
  R: esc("0"),
  B: esc("1"),
  D: esc("2"),
  W: esc("97"),
  GR: esc("37"),
  DG: esc("90"),
  BL: esc("94"),
  GB: esc("92"),
  YL: esc("93"),
  RD: esc("91"),
  PU: esc("35"),
  CY: esc("96"),
  AC: esc("94"),
  OK: esc("92"),
  ER: esc("91"),
  WN: esc("93"),
  TH: esc("90"),
  TC: esc("96"),
  TR: esc("92"),
  /* compat aliases */
  RESET: esc("0"),
  BOLD: esc("1"),
  GRAY: esc("90"),
  DGRAY: esc("90"),
  WHITE: esc("97"),
  BLUE: esc("94"),
  GREEN: esc("92"),
  YELLOW: esc("93"),
  RED: esc("91"),
  CYAN: esc("96"),
  PURPLE: esc("35"),
};

function terminalWidth(): number {
  return process.stdout.columns ?? 100;
}

/** `_rule()` from cli.py. Accepts the optional glyph/colour loop.py passes. */
export function _rule(glyph = "-", color: string = C.DG): void {
  console.log(`  ${color}${glyph.repeat(Math.min(terminalWidth() - 4, 72))}${C.R}`);
}

export const rule = _rule;

/** Cancellable stand-in for cli.py's `Spinner` (thread → interval). */
export class Spinner {
  text: string;
  delay: number;
  busy = false;
  protected timer: NodeJS.Timeout | null = null;
  protected chars = ["|", "/", "-", "\\"];
  protected idx = 0;

  constructor(text = "working...", delay = 0.1) {
    this.text = text;
    this.delay = delay;
  }

  start(): void {
    if (!isTty()) return;
    this.busy = true;
    this.timer = setInterval(() => {
      if (!this.busy) return;
      const char = this.chars[this.idx % this.chars.length];
      this.idx += 1;
      process.stdout.write(`\r  ${C.DG}${char} ${this.text}${C.R}`);
    }, Math.max(1, this.delay * 1000));
    if (typeof this.timer.unref === "function") this.timer.unref();
  }

  stop(): void {
    if (!this.busy) return;
    this.busy = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

/* ══════════════════════════════════════════════════════════════════
 *  Prompts
 * ══════════════════════════════════════════════════════════════════ */

export const PLANNER_PROMPT = `Decompose a goal into sequential sub-tasks.
Respond ONLY with a valid JSON array:
[
  {"id": 1, "task": "What to do", "verify": "How to confirm it succeeded"},
  ...
]
Max 12 tasks. Each task independently executable.`;

export const VERIFIER_PROMPT = `Assess whether a sub-task was completed based on evidence.
Respond ONLY with JSON:
{"success": true, "reason": "why it passed"}
or
{"success": false, "reason": "what is missing", "fix_hint": "corrective action"}`;

export const REPLANNER_PROMPT = `A plan hit an obstacle. Produce a new plan to reach the goal.
Respond ONLY with a valid JSON array of remaining sub-tasks:
[{"id": 1, "task": "...", "verify": "..."}, ...]`;

/* ══════════════════════════════════════════════════════════════════
 *  Agent surface (parent owns src/core/agent.ts)
 * ══════════════════════════════════════════════════════════════════ */

export interface LoopLlm {
  complete(
    messages: Array<{ role: string; content: string }>,
    maxTokens?: number,
  ): unknown;
}

export interface PlanTask {
  id: number;
  task: string;
  verify?: string;
  fix_hint?: string;
  _evidence?: string;
  _status?: string;
  [key: string]: unknown;
}

export interface AgentLike {
  config: Record<string, unknown>;
  workspace?: string;
  llm: LoopLlm;
  on_tool_result?: ((name: string, result: unknown) => void) | null;
  run(prompt: string): unknown;
}

export type ProgressCallback = (event: Record<string, unknown>) => void;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    if (typeof t.unref === "function") t.unref();
  });
}

/* ══════════════════════════════════════════════════════════════════
 *  LoopEngine
 * ══════════════════════════════════════════════════════════════════ */

export class LoopEngine {
  agent: AgentLike;
  max_cycles: number;
  max_retries: number;
  max_steps_per_task: number;
  verbose: boolean;
  on_progress: ProgressCallback | null;
  goal = "";
  plan: PlanTask[] = [];
  completed: PlanTask[] = [];
  failed: PlanTask[] = [];
  cycle = 0;
  protected _stop = false;

  constructor(
    agent: AgentLike,
    options: {
      max_cycles?: number;
      max_retries?: number;
      max_steps_per_task?: number;
      verbose?: boolean;
      on_progress?: ProgressCallback | null;
    } = {},
  ) {
    this.agent = agent;
    this.max_cycles = options.max_cycles ?? 5;
    this.max_retries = options.max_retries ?? 3;
    this.max_steps_per_task = options.max_steps_per_task ?? 20;
    this.verbose = options.verbose ?? true;
    this.on_progress = options.on_progress ?? null;
  }

  async run_goal(goal: string): Promise<string> {
    this.goal = goal;
    this._stop = false;
    this.completed = [];
    this.failed = [];
    this.cycle = 0;

    this._emit("start", { goal });
    this._header(`Objective: ${goal}`);

    for (let cycle = 1; cycle <= this.max_cycles; cycle++) {
      this.cycle = cycle;
      this._emit("cycle", { cycle, max: this.max_cycles });
      this._section(`Phase ${cycle}/${this.max_cycles} — Planning`);

      this.plan = await this._plan(goal);
      if (this.plan.length === 0) {
        this._warn("Planner returned empty plan. Retrying...");
        continue;
      }

      this._show_plan(this.plan);
      let allPassed = true;

      for (const task of this.plan) {
        if (this._stop) {
          return "Operation interrupted.";
        }

        const tid = task["id"];
        const taskDesc = task["task"];
        const verifyCond = task["verify"] ?? "task complete";

        this._task_header(tid, this.plan.length, taskDesc);
        this._emit("task_start", { id: tid, task: taskDesc });

        let success = false;
        let evidence = "";

        for (let attempt = 1; attempt <= this.max_retries; attempt++) {
          if (attempt > 1) {
            this._warn(`Retry ${attempt}/${this.max_retries}: ${task.fix_hint ?? "adjusting..."}`);
          }

          evidence = await this._run_subtask(taskDesc, verifyCond, attempt);
          const { ok, reason, fixHint } = await this._verify(taskDesc, verifyCond, evidence);

          if (ok) {
            this._ok(`Validated: ${reason}`);
            this._emit("task_done", { id: tid, reason });
            task["_evidence"] = evidence;
            task["_status"] = "done";
            success = true;
            break;
          } else {
            this._err(`Validation failed: ${reason}`);
            task["fix_hint"] = fixHint;
            this._emit("task_fail", { id: tid, reason, attempt });
            if (attempt < this.max_retries) {
              await sleep(300);
            }
          }
        }

        if (success) {
          this.completed.push(task);
        } else {
          task["_status"] = "failed";
          this.failed.push(task);
          allPassed = false;
          this._err(`Task ${tid} failed after all retries. Replanning...`);
          break;
        }
      }

      if (allPassed) {
        this._section("Final verification...");
        const { ok, reason } = await this._verify_goal(goal);
        if (ok) {
          this._header(`Goal achieved: ${reason}`);
          this._emit("goal_done", { reason, cycles: cycle });
          return `Goal achieved in ${cycle} cycle(s): ${reason}`;
        } else {
          this._warn(`Goal not fully met: ${reason}`);
          this._emit("goal_not_met", { reason });
          this.plan = await this._replan(goal, this.completed, reason);
        }
      }
    }

    this._err(`Goal not achieved after ${this.max_cycles} cycles.`);
    this._emit("goal_failed", { cycles: this.max_cycles });
    return `Could not complete goal after ${this.max_cycles} cycle(s).`;
  }

  stop(): void {
    this._stop = true;
  }

  /** Call the LLM and return raw text. Used for plan/verify/replan. */
  async _llm_json(system: string, user: string): Promise<string> {
    const msgs = [
      { role: "system", content: system },
      { role: "user", content: user },
    ];
    try {
      const resp = await this.agent.llm.complete(msgs);
      if (typeof resp === "string") return resp;
      if (resp && typeof resp === "object") {
        const obj = resp as Record<string, unknown>;
        if (typeof obj["text"] === "string") return obj["text"];
        return JSON.stringify(obj);
      }
      return String(resp);
    } catch (e) {
      logger.debug(`[Loop] llm call failed: ${e instanceof Error ? e.message : String(e)}`);
      return "";
    }
  }

  async _plan(goal: string): Promise<PlanTask[]> {
    const spinner = new Spinner("Planning...");
    spinner.start();
    const raw = await this._llm_json(PLANNER_PROMPT, `GOAL: ${goal}\nWorkspace: ${this.agent.workspace ?? ""}`);
    spinner.stop();
    return this._extract_list(raw);
  }

  async _replan(goal: string, completed: PlanTask[], reason: string): Promise<PlanTask[]> {
    const spinner = new Spinner("Replanning...");
    spinner.start();
    const doneSummary = completed.map((t) => `- ${t["task"]}`).join("\n");
    const raw = await this._llm_json(
      REPLANNER_PROMPT,
      `GOAL: ${goal}\n\n` +
        `Completed:\n${doneSummary}\n\n` +
        `Issue: ${reason}\n\n` +
        `Produce a new plan for the remaining work.`,
    );
    spinner.stop();
    const tasks = this._extract_list(raw);
    // Re-number from 1 to avoid ID collisions with completed tasks
    tasks.forEach((t, i) => {
      t["id"] = i + 1;
    });
    return tasks;
  }

  async _run_subtask(task: string, verifyCond: string, attempt: number): Promise<string> {
    let prompt = `TASK: ${task}\n` + `SUCCESS CRITERION: ${verifyCond}\n`;
    if (attempt > 1) {
      prompt += "\nNOTE: Previous attempt failed. Try a different approach.\n";
    }
    prompt += "\nComplete this task. Call done() when the criterion is met.";

    const origSteps = (this.agent.config["max_steps"] as number | undefined) ?? 30;
    this.agent.config["max_steps"] = this.max_steps_per_task;

    const evidence: string[] = [];
    const origCb = this.agent.on_tool_result ?? null;

    const capture = (name: string, result: unknown): void => {
      evidence.push(`[${name}] ${String(result).slice(0, 800)}`);
      if (origCb) origCb(name, result);
    };

    this.agent.on_tool_result = capture;
    let result: unknown;
    try {
      result = await this.agent.run(prompt);
    } finally {
      this.agent.config["max_steps"] = origSteps;
      this.agent.on_tool_result = origCb;
    }

    evidence.push(`[final] ${String(result)}`);
    return evidence.join("\n");
  }

  async _verify(task: string, condition: string, evidence: string): Promise<{ ok: boolean; reason: string; fixHint: string }> {
    const spinner = new Spinner("Verifying...");
    spinner.start();
    const raw = await this._llm_json(
      VERIFIER_PROMPT,
      `Task: ${task}\nRequired: ${condition}\nEvidence:\n${evidence.slice(0, 3000)}`,
    );
    spinner.stop();
    const obj = this._extract_obj(raw);
    if (obj && Object.keys(obj).length > 0) {
      return {
        ok: Boolean(obj["success"] ?? false),
        reason: String(obj["reason"] ?? ""),
        fixHint: String(obj["fix_hint"] ?? ""),
      };
    }
    // Heuristic fallback
    if (evidence.includes("[DONE]") || evidence.toLowerCase().includes("completed")) {
      return { ok: true, reason: "Completion detected in evidence.", fixHint: "" };
    }
    return { ok: false, reason: "Could not parse verification response.", fixHint: "Review logs." };
  }

  async _verify_goal(goal: string): Promise<{ ok: boolean; reason: string; fixHint: string }> {
    const evidence = this.completed.map((t) => `${t["task"]}: ${String(t["_evidence"] ?? "").slice(0, 200)}`).join("\n");
    return await this._verify(
      `Overall goal: ${goal}`,
      "Entire goal is fully realized.",
      evidence,
    );
  }

  /* ── JSON helpers ─────────────────────────────────────────────────────── */

  _extract_list(text: string): PlanTask[] {
    const m = text.match(/\[[\s\S]*\]/);
    if (m) {
      try {
        return JSON.parse(m[0]) as PlanTask[];
      } catch {
        /* fall through */
      }
    }
    return [];
  }

  _extract_obj(text: string): Record<string, unknown> {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]) as Record<string, unknown>;
      } catch {
        /* fall through */
      }
    }
    return {};
  }

  /* ── UI helpers ───────────────────────────────────────────────────────── */

  _emit(event: string, data: Record<string, unknown>): void {
    if (this.on_progress) {
      this.on_progress({ event, ...data });
    }
  }

  _header(msg: string): void {
    if (!this.verbose) return;
    console.log(`\n  ${C.BOLD}${C.WHITE}${msg}${C.RESET}`);
    rule("═", C.BLUE);
  }

  _section(msg: string): void {
    if (!this.verbose) return;
    console.log(`\n  ${C.BLUE}◆${C.RESET} ${C.GRAY}${msg}${C.RESET}`);
  }

  _task_header(tid: number, total: number, task: string): void {
    if (!this.verbose) return;
    const barW = 16;
    const filled = Math.trunc((barW * tid) / Math.max(total, 1));
    const bar = `${C.BLUE}${"▪".repeat(filled)}${C.DGRAY}${"·".repeat(barW - filled)}${C.RESET}`;
    console.log(`\n  ${bar}  ${C.WHITE}${C.BOLD}[${tid}/${total}]${C.RESET} ${C.WHITE}${task}${C.RESET}`);
  }

  _show_plan(plan: PlanTask[]): void {
    if (!this.verbose) return;
    console.log(`\n  ${C.GRAY}Plan (${plan.length} tasks):${C.RESET}`);
    for (const t of plan) {
      console.log(`    ${C.DGRAY}${String(t["id"]).padStart(2)}.${C.RESET} ${C.WHITE}${t["task"]}${C.RESET}`);
      console.log(`        ${C.DGRAY}✓ ${t["verify"] ?? "—"}${C.RESET}`);
    }
  }

  _ok(msg: string): void {
    if (this.verbose) console.log(`   ${C.GREEN}✓ ${msg}${C.RESET}`);
  }

  _err(msg: string): void {
    if (this.verbose) console.log(`   ${C.RED}✗ ${msg}${C.RESET}`);
  }

  _warn(msg: string): void {
    if (this.verbose) console.log(`   ${C.YELLOW}⚠ ${msg}${C.RESET}`);
  }

  _info(msg: string): void {
    if (this.verbose) console.log(`   ${C.GRAY}${msg}${C.RESET}`);
  }
}
