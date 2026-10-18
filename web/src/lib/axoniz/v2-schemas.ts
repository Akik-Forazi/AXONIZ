/**
 * AXONIZ v2 — schemas for projects, workflows, logs.
 *
 * These Zod schemas are the single source of truth for the v2 data model.
 * The HTTP API request/response shapes, the JSONL log format, and the
 * workflow YAML schema all derive from these definitions.
 *
 * No cryptography. No capability tokens. Just typed data.
 */
import { z } from "zod";

/* ─── Project ──────────────────────────────────────────────────────────
 * A "project" is just a folder the user pointed AXONIZ at. We scan it,
 * remember what we found (git remote, package manager, language), and
 * scope all per-project operations to that folder.
 */
export const ProjectMetaSchema = z.object({
  id: z.string(),                          // slugified basename, unique
  path: z.string(),                        // absolute path on disk
  name: z.string(),                        // human-readable name
  registeredAt: z.number(),                 // unix ms when added
  lastScannedAt: z.number().nullable(),    // unix ms of last Axodex scan
  detected: z.object({
    isGitRepo: z.boolean(),
    gitRemote: z.string().nullable(),
    packageManager: z.enum(["npm", "pnpm", "yarn", "bun", "pip", "cargo", "go", "none"]).nullable(),
    language: z.enum(["typescript", "javascript", "python", "rust", "go", "mixed", "unknown"]).nullable(),
    framework: z.string().nullable(),      // "next.js", "react", "django", etc.
    hasTests: z.boolean(),
    hasDockerfile: z.boolean(),
  }),
  palaceEnabled: z.boolean().default(true),
});
export type ProjectMeta = z.infer<typeof ProjectMetaSchema>;

/* ─── Workflow ─────────────────────────────────────────────────────────
 * A workflow is a YAML file with a trigger + ordered steps. Each step
 * is one tool invocation. Steps can reference previous step results via
 * {{step_id.field}} mustache syntax.
 */
export const WorkflowTriggerSchema = z.union([
  z.object({
    type: z.literal("manual"),
  }),
  z.object({
    type: z.literal("schedule"),
    cron: z.string(),                       // standard cron expression
  }),
  z.object({
    type: z.literal("webhook"),
    path: z.string(),                       // POST /api/workflows/:wf/webhook
    secret: z.string().optional(),          // optional bearer token
  }),
  z.object({
    type: z.literal("git_hook"),
    event: z.enum(["post_commit", "post_merge", "pre_push"]),
  }),
  z.object({
    type: z.literal("file_watch"),
    glob: z.string(),                       // e.g. "src/**/*.ts"
    events: z.array(z.enum(["create", "modify", "delete"])).default(["modify"]),
  }),
]);
export type WorkflowTrigger = z.infer<typeof WorkflowTriggerSchema>;

export const WorkflowStepSchema = z.object({
  id: z.string(),                           // used for {{step_id.field}} refs
  tool: z.enum([
    "http", "file", "shell", "agent", "log",
    // Future: "email", "slack", "github", "palace", "axodex",
    // "axotest", "axovb", "xorvoid", "xorgis", "promochu", "voice", "office",
  ]),
  // Tool-specific args — validated at runtime by each tool's own schema.
  args: z.record(z.string(), z.unknown()),
  // Optional condition — mustache-templated boolean expression.
  // Skipped if it evaluates to false. e.g. "{{fetch.status}} === 200"
  if: z.string().optional(),
  // Max wall-clock seconds for this step. Killed if exceeded.
  timeoutSec: z.number().default(60),
});
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

export const WorkflowSchema = z.object({
  name: z.string(),                         // unique ID, also the filename slug
  description: z.string().default(""),
  projectId: z.string().nullable().default(null),  // null = global workflow
  trigger: WorkflowTriggerSchema,
  steps: z.array(WorkflowStepSchema).min(1),
  // Secrets referenced via {{secrets.foo}} — resolved from ~/.axoniz/secrets.json
  secrets: z.array(z.string()).default([]),
  // Optional error handler — runs if any step fails.
  onError: z.array(WorkflowStepSchema).default([]),
  // Max wall-clock minutes for the entire workflow. Default 30.
  maxMinutes: z.number().default(30),
  enabled: z.boolean().default(true),
  createdAt: z.number().default(() => Date.now()),
  lastRunAt: z.number().nullable().default(null),
});
export type Workflow = z.infer<typeof WorkflowSchema>;

/* ─── Log entry ─────────────────────────────────────────────────────────
 * One JSON line per action. Written to:
 *   ~/.axoniz/projects/:id/logs/YYYY-MM-DD.jsonl  (project-scoped)
 *   ~/.axoniz/logs/YYYY-MM-DD.jsonl                (global workflows)
 *
 * Also indexed in SQLite for fast search.
 */
export const LogEntrySchema = z.object({
  ts: z.number(),                           // unix ms
  level: z.enum(["debug", "info", "warn", "error"]),
  workflowId: z.string().nullable(),
  projectId: z.string().nullable(),
  runId: z.string(),                        // unique per workflow execution
  stepId: z.string().nullable(),
  tool: z.string().nullable(),
  event: z.enum([
    "workflow_start", "workflow_end", "workflow_error",
    "step_start", "step_end", "step_error", "step_skip",
    "tool_call", "tool_result",
  ]),
  message: z.string(),
  // Optional structured data — step result, error details, etc.
  data: z.record(z.string(), z.unknown()).optional(),
  durationMs: z.number().optional(),
});
export type LogEntry = z.infer<typeof LogEntrySchema>;

/* ─── Workflow run ─────────────────────────────────────────────────────
 * One of these is created per workflow execution. Persisted to SQLite.
 */
export const WorkflowRunSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  projectId: z.string().nullable(),
  startedAt: z.number(),
  endedAt: z.number().nullable(),
  status: z.enum(["running", "success", "failed", "cancelled", "timeout"]),
  trigger: z.enum(["manual", "schedule", "webhook", "git_hook", "file_watch"]),
  stepsCompleted: z.number().default(0),
  stepsTotal: z.number().default(0),
  error: z.string().nullable(),
});
export type WorkflowRun = z.infer<typeof WorkflowRunSchema>;
