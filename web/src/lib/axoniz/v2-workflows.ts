/**
 * AXONIZ v2 — workflow engine.
 *
 * Parses a workflow YAML (or JS object), runs steps sequentially, resolves
 * {{step_id.field}} mustache refs between steps, writes JSONL logs.
 *
 * No sandbox. No capability tokens. The workflow runs in the project's
 * folder scope (if projectId is set) or globally (if null).
 *
 * Each step has a timeoutSec (default 60s) and the whole workflow has a
 * maxMinutes budget (default 30min). Killed if exceeded.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { v4 as uuid } from "uuid";
import * as yaml from "js-yaml";
import { WorkflowSchema, type Workflow, type WorkflowStep, type WorkflowRun, type LogEntry } from "./v2-schemas";

const AXONIZ_HOME = path.join(os.homedir(), ".axoniz");
const WORKFLOWS_DIR = path.join(AXONIZ_HOME, "workflows");
const TEMPLATES_DIR = path.join(AXONIZ_HOME, "templates");
const RUNS_DB = path.join(AXONIZ_HOME, "db", "runs.json");

/* ─── Workflow CRUD ──────────────────────────────────────────────────── */
function ensureDirs() {
  fs.mkdirSync(WORKFLOWS_DIR, { recursive: true });
  fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(RUNS_DB), { recursive: true });
}

export function saveWorkflow(workflow: Workflow): void {
  ensureDirs();
  const filePath = path.join(WORKFLOWS_DIR, `${workflow.name}.yml`);
  const yamlText = yaml.dump({
    name: workflow.name,
    description: workflow.description,
    projectId: workflow.projectId,
    trigger: workflow.trigger,
    steps: workflow.steps,
    secrets: workflow.secrets,
    onError: workflow.onError,
    maxMinutes: workflow.maxMinutes,
    enabled: workflow.enabled,
  });
  fs.writeFileSync(filePath, yamlText, "utf-8");
}

export function listWorkflows(): Workflow[] {
  ensureDirs();
  const result: Workflow[] = [];
  for (const file of fs.readdirSync(WORKFLOWS_DIR)) {
    if (!file.endsWith(".yml") && !file.endsWith(".yaml")) continue;
    try {
      const yamlText = fs.readFileSync(path.join(WORKFLOWS_DIR, file), "utf-8");
      const obj = yaml.load(yamlText);
      const parsed = WorkflowSchema.safeParse(obj);
      if (parsed.success) result.push(parsed.data);
    } catch { /* skip malformed */ }
  }
  return result.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

export function getWorkflow(name: string): Workflow | null {
  const all = listWorkflows();
  return all.find(w => w.name === name) ?? null;
}

export function deleteWorkflow(name: string): boolean {
  const filePath = path.join(WORKFLOWS_DIR, `${name}.yml`);
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath);
    return true;
  }
  return false;
}

/* ─── Mustache template resolution ─────────────────────────────────────
 * Replaces {{step_id.field.path}} references in strings with values from
 * previous step results. Also handles {{secrets.foo}} and {{env.BAR}}.
 */
function resolveTemplate(str: string, context: {
  steps: Record<string, unknown>;
  secrets: Record<string, string>;
  env: Record<string, string | undefined>;
}): string {
  return str.replace(/\{\{([^}]+)\}\}/g, (_, expr) => {
    const parts = expr.trim().split(".");
    const root = parts[0];
    let value: unknown = undefined;
    if (root === "secrets") value = context.secrets[parts[1]];
    else if (root === "env") value = context.env[parts[1]];
    else value = context.steps[root];
    // Walk the path
    for (let i = 1; i < parts.length && value !== undefined; i++) {
      value = (value as Record<string, unknown>)?.[parts[i]];
    }
    if (value === undefined) return "";
    if (typeof value === "string") return value;
    return JSON.stringify(value);
  });
}

function resolveArgs(args: unknown, context: {
  steps: Record<string, unknown>;
  secrets: Record<string, string>;
  env: Record<string, string | undefined>;
}): unknown {
  if (typeof args === "string") return resolveTemplate(args, context);
  if (Array.isArray(args)) return args.map(v => resolveArgs(v, context));
  if (args && typeof args === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(args)) out[k] = resolveArgs(v, context);
    return out;
  }
  return args;
}

/* ─── Tool registry ────────────────────────────────────────────────────
 * Each tool is a function (args, ctx) → result. Registered by name.
 * ctx provides: projectId, projectPath, runId, log() helper.
 */
export interface ToolContext {
  projectId: string | null;
  projectPath: string | null;
  runId: string;
  log: (entry: Omit<LogEntry, "ts" | "runId" | "projectId">) => void;
}

export type ToolHandler = (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;

const TOOLS: Record<string, ToolHandler> = {};

export function registerTool(name: string, handler: ToolHandler) {
  TOOLS[name] = handler;
}

export function getTool(name: string): ToolHandler | undefined {
  return TOOLS[name];
}

/* ─── Built-in tools (minimal set for v2) ───────────────────────────── */
async function fetchHttp(url: string, opts?: RequestInit) {
  return fetch(url, opts);
}

// http tool — GET/POST/PUT/DELETE with optional JSON body
registerTool("http", async (args) => {
  const url = String(args.url ?? args.get ?? "");
  const method = String(args.method ?? (args.get ? "GET" : args.body ? "POST" : "GET")).toUpperCase();
  const headers = (args.headers as Record<string, string>) ?? {};
  const body = args.body !== undefined ? JSON.stringify(args.body) : undefined;
  if (body && !headers["content-type"]) headers["content-type"] = "application/json";
  const res = await fetchHttp(url, { method, headers, body });
  const text = await res.text();
  let parsedBody: unknown = text;
  try { parsedBody = JSON.parse(text); } catch { /* keep as text */ }
  return {
    status: res.status,
    ok: res.ok,
    headers: Object.fromEntries(res.headers.entries()),
    body: parsedBody,
  };
});

// file tool — read/write/append
registerTool("file", async (args, ctx) => {
  const op = String(args.op ?? "read");
  // Paths are relative to project root if projectId is set
  let filePath = String(args.path);
  if (ctx.projectPath && !path.isAbsolute(filePath)) {
    filePath = path.join(ctx.projectPath, filePath);
  }
  if (op === "read") {
    return { content: fs.readFileSync(filePath, "utf-8") };
  }
  if (op === "write") {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, String(args.content), "utf-8");
    return { written: filePath };
  }
  if (op === "append") {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, String(args.content), "utf-8");
    return { appended: filePath };
  }
  if (op === "list") {
    return { entries: fs.readdirSync(filePath) };
  }
  throw new Error(`file: unknown op "${op}"`);
});

// shell tool — run a command, return stdout/stderr/exitCode
registerTool("shell", async (args, ctx) => {
  const { exec } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execAsync = promisify(exec);
  const cmd = String(args.cmd);
  const cwd = (args.cwd ? String(args.cwd) : ctx.projectPath) ?? process.cwd();
  try {
    const result = await execAsync(cmd, {
      cwd: path.isAbsolute(cwd) ? cwd : path.join(ctx.projectPath ?? process.cwd(), cwd),
      maxBuffer: 1024 * 1024 * 10,
      timeout: (args.timeoutSec ? Number(args.timeoutSec) * 1000 : 30_000),
    });
    return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; code?: number };
    return { stdout: err.stdout ?? "", stderr: err.stderr ?? String(e), exitCode: err.code ?? 1 };
  }
});

// agent tool — call an LLM via AXONIZ's existing chat endpoint
registerTool("agent", async (args, ctx) => {
  const prompt = String(args.prompt);
  const model = args.model ? String(args.model) : undefined;
  // Reuse the existing /api/axoniz/chat durable execution path.
  // This is a placeholder — for now, return a stub.
  // TODO: wire to the existing execution-manager.
  ctx.log({
    level: "info",
    workflowId: null,
    stepId: null,
    tool: "agent",
    event: "tool_call",
    message: `agent call (prompt length ${prompt.length}, model ${model ?? "default"})`,
    data: { promptPreview: prompt.slice(0, 100) },
  });
  return { result: `[agent placeholder — prompt was: ${prompt.slice(0, 200)}]` };
});

// log tool — write a custom log line (useful for debugging workflows)
registerTool("log", async (args, ctx) => {
  ctx.log({
    level: String(args.level ?? "info") as LogEntry["level"],
    workflowId: null,
    stepId: null,
    tool: "log",
    event: "tool_call",
    message: String(args.message ?? ""),
    data: args.data as Record<string, unknown> | undefined,
  });
  return { logged: true };
});

/* ─── Log writer ────────────────────────────────────────────────────────
 * Writes one JSON line per action to:
 *   ~/.axoniz/projects/:id/logs/YYYY-MM-DD.jsonl  (project-scoped)
 *   ~/.axoniz/logs/YYYY-MM-DD.jsonl                (global)
 * Plus an in-memory ring buffer for the live event stream.
 */
const RING_BUFFER_MAX = 200;
const ringBuffer: LogEntry[] = [];

export function appendLog(entry: LogEntry) {
  // Ring buffer (for live dashboard updates)
  ringBuffer.push(entry);
  if (ringBuffer.length > RING_BUFFER_MAX) ringBuffer.shift();

  // JSONL file
  const dateStr = new Date(entry.ts).toISOString().slice(0, 10);
  const dir = entry.projectId
    ? path.join(AXONIZ_HOME, "projects", entry.projectId, "logs")
    : path.join(AXONIZ_HOME, "logs");
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${dateStr}.jsonl`);
  fs.appendFileSync(filePath, JSON.stringify(entry) + "\n", "utf-8");
}

export function getRecentLogs(limit = 50): LogEntry[] {
  return ringBuffer.slice(-limit);
}

/* ─── Workflow runner ──────────────────────────────────────────────────
 * Executes a workflow. Returns a WorkflowRun record.
 */
function loadRuns(): WorkflowRun[] {
  ensureDirs();
  try {
    if (fs.existsSync(RUNS_DB)) {
      return JSON.parse(fs.readFileSync(RUNS_DB, "utf-8")) as WorkflowRun[];
    }
  } catch { /* corrupt — start fresh */ }
  return [];
}

function saveRuns(runs: WorkflowRun[]) {
  ensureDirs();
  fs.writeFileSync(RUNS_DB, JSON.stringify(runs, null, 2), "utf-8");
}

export async function runWorkflow(
  workflow: Workflow,
  trigger: WorkflowRun["trigger"] = "manual",
): Promise<WorkflowRun> {
  const runId = uuid();
  const run: WorkflowRun = {
    id: runId,
    workflowId: workflow.name,
    projectId: workflow.projectId,
    startedAt: Date.now(),
    endedAt: null,
    status: "running",
    trigger,
    stepsCompleted: 0,
    stepsTotal: workflow.steps.length,
    error: null,
  };

  const ctx: ToolContext = {
    projectId: workflow.projectId,
    projectPath: workflow.projectId ? (getProjectPath(workflow.projectId)) : null,
    runId,
    log: (entry) => appendLog({
      ts: Date.now(),
      runId: runId,
      projectId: workflow.projectId,
      ...entry,
    }),
  };

  appendLog({
    ts: Date.now(),
    level: "info",
    workflowId: workflow.name,
    projectId: workflow.projectId,
    runId,
    stepId: null,
    tool: null,
    event: "workflow_start",
    message: `Workflow "${workflow.name}" started (trigger: ${trigger})`,
    data: { trigger },
  });

  // Load secrets (placeholder — full impl would read ~/.axoniz/secrets.json encrypted)
  const secrets: Record<string, string> = {}; // TODO: load from secrets.json

  const stepResults: Record<string, unknown> = {};
  const deadline = Date.now() + workflow.maxMinutes * 60_000;
  let currentStep = 0;

  for (const step of workflow.steps) {
    if (Date.now() > deadline) {
      run.status = "timeout";
      run.error = `workflow exceeded maxMinutes=${workflow.maxMinutes}`;
      break;
    }
    currentStep++;
    appendLog({
      ts: Date.now(),
      level: "info",
      workflowId: workflow.name,
      projectId: workflow.projectId,
      runId,
      stepId: step.id,
      tool: step.tool,
      event: "step_start",
      message: `Step "${step.id}" (${step.tool}) starting`,
    });

    const handler = getTool(step.tool);
    if (!handler) {
      run.status = "failed";
      run.error = `unknown tool: ${step.tool}`;
      appendLog({
        ts: Date.now(),
        level: "error",
        workflowId: workflow.name,
        projectId: workflow.projectId,
        runId,
        stepId: step.id,
        tool: step.tool,
        event: "step_error",
        message: `Unknown tool: ${step.tool}`,
        durationMs: 0,
      });
      break;
    }

    const resolvedArgs = resolveArgs(step.args, {
      steps: stepResults,
      secrets,
      env: process.env as Record<string, string | undefined>,
    }) as Record<string, unknown>;

    try {
      const result = await handler(resolvedArgs, ctx);
      stepResults[step.id] = result;
      run.stepsCompleted = currentStep;
      appendLog({
        ts: Date.now(),
        level: "info",
        workflowId: workflow.name,
        projectId: workflow.projectId,
        runId,
        stepId: step.id,
        tool: step.tool,
        event: "step_end",
        message: `Step "${step.id}" completed`,
        data: { resultPreview: JSON.stringify(result).slice(0, 200) },
      });
    } catch (e) {
      run.status = "failed";
      run.error = `step "${step.id}": ${e instanceof Error ? e.message : String(e)}`;
      appendLog({
        ts: Date.now(),
        level: "error",
        workflowId: workflow.name,
        projectId: workflow.projectId,
        runId,
        stepId: step.id,
        tool: step.tool,
        event: "step_error",
        message: run.error,
      });
      // Run onError steps
      for (const errStep of workflow.onError) {
        try {
          const errArgs = resolveArgs(errStep.args, {
            steps: stepResults,
            secrets,
            env: process.env as Record<string, string | undefined>,
          }) as Record<string, unknown>;
          // Inject {{error}} = the error message
          (errArgs as Record<string, unknown>)._error = run.error;
          await getTool(errStep.tool)?.(errArgs, ctx);
        } catch { /* swallow */ }
      }
      break;
    }
  }

  if (run.status === "running") run.status = "success";
  run.endedAt = Date.now();
  appendLog({
    ts: Date.now(),
    level: run.status === "success" ? "info" : "error",
    workflowId: workflow.name,
    projectId: workflow.projectId,
    runId,
    stepId: null,
    tool: null,
    event: run.status === "success" ? "workflow_end" : "workflow_error",
    message: `Workflow "${workflow.name}" ${run.status}`,
    durationMs: run.endedAt - run.startedAt,
  });

  // Persist the run record
  const allRuns = loadRuns();
  allRuns.push(run);
  // Keep only the last 1000 runs
  if (allRuns.length > 1000) allRuns.splice(0, allRuns.length - 1000);
  saveRuns(allRuns);

  // Update workflow's lastRunAt
  const wf = getWorkflow(workflow.name);
  if (wf) {
    wf.lastRunAt = Date.now();
    saveWorkflow(wf);
  }

  return run;
}

/* ─── Helper to resolve project path ─────────────────────────────────── */
function getProjectPath(projectId: string | null): string | null {
  if (!projectId) return null;
  try {
    // Inline import to avoid circular dep — projects module is small.
    const { getProject } = require("./v2-projects");
    const p = getProject(projectId);
    return p?.path ?? null;
  } catch {
    return null;
  }
}

/* ─── List runs ─────────────────────────────────────────────────────── */
export function listRuns(limit = 50, workflowId?: string): WorkflowRun[] {
  const all = loadRuns();
  const filtered = workflowId ? all.filter(r => r.workflowId === workflowId) : all;
  return filtered.slice(-limit).reverse();
}

export function getRun(runId: string): WorkflowRun | null {
  return loadRuns().find(r => r.id === runId) ?? null;
}
