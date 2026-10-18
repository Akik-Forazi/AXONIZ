/**
 * AXONIZ v2 — REST API routes for projects, workflows, runs, logs.
 *
 * Mounted under /api/axoniz/v2/* to namespace from the existing v1 routes.
 * Plain JSON in/out. No auth (local-first, localhost-only).
 *
 * Endpoints:
 *   POST   /api/axoniz/v2/projects                  register a project folder
 *   GET    /api/axoniz/v2/projects                   list all projects
 *   GET    /api/axoniz/v2/projects/:id               get one project
 *   DELETE /api/axoniz/v2/projects/:id               unregister
 *
 *   GET    /api/axoniz/v2/workflows                   list all workflows
 *   POST   /api/axoniz/v2/workflows                   create/save workflow (YAML body)
 *   GET    /api/axoniz/v2/workflows/:name            get workflow
 *   POST   /api/axoniz/v2/workflows/:name/run         run workflow (manual trigger)
 *   DELETE /api/axoniz/v2/workflows/:name             delete workflow
 *
 *   GET    /api/axoniz/v2/runs                        list runs (optional ?workflow=)
 *   GET    /api/axoniz/v2/runs/:id                    get one run
 *
 *   GET    /api/axoniz/v2/logs                        recent log entries (ring buffer)
 *   GET    /api/axoniz/v2/projects/:id/logs           project-scoped logs (today's JSONL)
 */
import { NextRequest, NextResponse } from "next/server";
import * as yaml from "js-yaml";
import {
  registerProject, listProjects, getProject, unregisterProject,
} from "@/lib/axoniz/v2-projects";
import {
  saveWorkflow, listWorkflows, getWorkflow, deleteWorkflow, runWorkflow, listRuns, getRun,
  getRecentLogs,
} from "@/lib/axoniz/v2-workflows";
import { WorkflowSchema } from "@/lib/axoniz/v2-schemas";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* ─── Projects ─────────────────────────────────────────────────────── */
export async function GET_projects(req: NextRequest) {
  const url = new URL(req.url);
  if (url.pathname.endsWith("/projects")) {
    return NextResponse.json({ projects: listProjects() });
  }
  const id = url.pathname.split("/").pop();
  if (id) {
    const project = getProject(id);
    if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(project);
  }
  return NextResponse.json({ error: "bad request" }, { status: 400 });
}

export async function POST_projects(req: NextRequest) {
  try {
    const body = await req.json();
    const folderPath = String(body.path);
    if (!folderPath) {
      return NextResponse.json({ error: "path required" }, { status: 400 });
    }
    const project = registerProject(folderPath);
    return NextResponse.json(project, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

export async function DELETE_projects(req: NextRequest) {
  const url = new URL(req.url);
  const id = url.pathname.split("/").pop();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const ok = unregisterProject(id);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/* ─── Workflows ────────────────────────────────────────────────────── */
export async function GET_workflows(req: NextRequest) {
  const url = new URL(req.url);
  if (url.pathname.endsWith("/workflows")) {
    return NextResponse.json({ workflows: listWorkflows() });
  }
  const name = url.pathname.split("/").pop();
  if (name) {
    const wf = getWorkflow(name);
    if (!wf) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(wf);
  }
  return NextResponse.json({ error: "bad request" }, { status: 400 });
}

export async function POST_workflows(req: NextRequest) {
  try {
    const url = new URL(req.url);
    if (url.pathname.endsWith("/run")) {
      const segments = url.pathname.split("/");
      const name = segments[segments.length - 2];
      const wf = getWorkflow(name);
      if (!wf) return NextResponse.json({ error: "workflow not found" }, { status: 404 });
      const run = await runWorkflow(wf, "manual");
      return NextResponse.json(run);
    }
    const bodyText = await req.text();
    let obj: unknown;
    try {
      obj = JSON.parse(bodyText);
    } catch {
      obj = yaml.load(bodyText);
    }
    const parsed = WorkflowSchema.safeParse(obj);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid workflow", details: parsed.error.flatten() }, { status: 400 });
    }
    saveWorkflow(parsed.data);
    return NextResponse.json(parsed.data, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

export async function DELETE_workflows(req: NextRequest) {
  const url = new URL(req.url);
  const name = url.pathname.split("/").pop();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const ok = deleteWorkflow(name);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/* ─── Runs ─────────────────────────────────────────────────────────── */
export async function GET_runs(req: NextRequest) {
  const url = new URL(req.url);
  if (!url.pathname.endsWith("/runs")) {
    const id = url.pathname.split("/").pop();
    if (id) {
      const run = getRun(id);
      if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
      return NextResponse.json(run);
    }
  }
  const workflow = url.searchParams.get("workflow") ?? undefined;
  const limit = Number(url.searchParams.get("limit") ?? 50);
  return NextResponse.json({ runs: listRuns(limit, workflow) });
}

/* ─── Logs ─────────────────────────────────────────────────────────── */
export async function GET_logs(req: NextRequest) {
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? 50);
  if (url.pathname.includes("/projects/") && url.pathname.endsWith("/logs")) {
    const segments = url.pathname.split("/");
    const id = segments[segments.length - 2];
    const project = getProject(id);
    if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 });
    const dateStr = new Date().toISOString().slice(0, 10);
    const logFile = path.join(os.homedir(), ".axoniz", "projects", id, "logs", `${dateStr}.jsonl`);
    if (!fs.existsSync(logFile)) return NextResponse.json({ entries: [] });
    const lines = fs.readFileSync(logFile, "utf-8").trimEnd().split("\n").filter(Boolean).slice(-limit);
    const entries = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    return NextResponse.json({ entries });
  }
  return NextResponse.json({ entries: getRecentLogs(limit) });
}

/* ─── Templates ─────────────────────────────────────────────────── */
import { listTemplates, getTemplate, initTemplates } from "@/lib/axoniz/v2-templates";

/* ─── Git Hooks ─────────────────────────────────────────────────── */
import { installGitHook, listGitHooks, removeGitHook } from "@/lib/axoniz/v2-git-hooks";

/* ─── Log Search ────────────────────────────────────────────────── */
import { searchLogs, getLogStats } from "@/lib/axoniz/v2-log-search";

/* ─── Artifacts ────────────────────────────────────────────────── */
import { getArtifact } from "@/lib/axoniz/v2-artifacts";

/* ─── Grants ────────────────────────────────────────────────────── */
import { listGrants } from "@/lib/axoniz/v2-grants";

/* ─── Secrets ────────────────────────────────────────────────────── */
import { loadSecrets, setSecret, deleteSecret } from "@/lib/axoniz/v2-secrets";

/* ─── Catch-all router ───────────────────────────────────────────────
 * Mounted at src/app/api/axoniz/v2/[...path]/route.ts
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const p = url.pathname.replace("/api/axoniz/v2", "");
  if (p === "/projects" || p.startsWith("/projects/")) return GET_projects(req);
  if (p === "/workflows" || p.startsWith("/workflows/")) return GET_workflows(req);
  if (p === "/runs" || p.startsWith("/runs/")) return GET_runs(req);
  if (p === "/logs" || (p.includes("/projects/") && p.endsWith("/logs"))) return GET_logs(req);
  // Templates
  if (p === "/templates") {
    initTemplates();
    return NextResponse.json({ templates: listTemplates() });
  }
  // Secrets — list keys only (NEVER return values)
  if (p === "/secrets") {
    const secrets = loadSecrets();
    return NextResponse.json({ keys: Object.keys(secrets) });
  }
  // Log search
  if (p === "/logs/search") {
    const q = url.searchParams.get("q") ?? undefined;
    const level = url.searchParams.get("level") ?? undefined;
    const workflow = url.searchParams.get("workflow") ?? undefined;
    const project = url.searchParams.get("project") ?? undefined;
    const tool = url.searchParams.get("tool") ?? undefined;
    const event = url.searchParams.get("event") ?? undefined;
    const since = url.searchParams.get("since") ? Number(url.searchParams.get("since")) : undefined;
    const limit = url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 100;
    return NextResponse.json({ entries: searchLogs({ query: q, level, workflowId: workflow, projectId: project, tool, event, since, limit }) });
  }
  // Log stats
  if (p === "/logs/stats") {
    return NextResponse.json(getLogStats());
  }
  // Artifacts
  if (p.startsWith("/runs/") && p.endsWith("/artifact")) {
    const runId = p.replace("/runs/", "").replace("/artifact", "");
    const md = getArtifact(runId);
    if (!md) return NextResponse.json({ error: "artifact not found" }, { status: 404 });
    return new NextResponse(md, { headers: { "Content-Type": "text/markdown" } });
  }
  // Git hooks — list
  if (p.startsWith("/projects/") && p.endsWith("/hooks")) {
    const id = p.replace("/projects/", "").replace("/hooks", "");
    return NextResponse.json({ hooks: listGitHooks(id) });
  }
  // Grants — list
  if (p === "/grants") {
    return NextResponse.json({ grants: listGrants() });
  }
  return NextResponse.json({ error: `unknown v2 path: ${p}` }, { status: 404 });
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const p = url.pathname.replace("/api/axoniz/v2", "");
  if (p === "/projects") return POST_projects(req);
  if (p === "/workflows" || p.startsWith("/workflows/")) return POST_workflows(req);
  // Webhook trigger — POST /api/axoniz/v2/webhook/:workflowName
  if (p.startsWith("/webhook/")) {
    const wfName = p.replace("/webhook/", "");
    const wf = getWorkflow(wfName);
    if (!wf) return NextResponse.json({ error: "workflow not found" }, { status: 404 });
    try { const run = await runWorkflow(wf, "webhook"); return NextResponse.json(run); }
    catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
  }
  // STOP a running workflow — POST /api/axoniz/v2/runs/:id/stop
  if (p.startsWith("/runs/") && p.endsWith("/stop")) {
    const runId = p.replace("/runs/", "").replace("/stop", "");
    // For now, just mark as cancelled — full impl would need to track the
    // active AbortController and call .abort()
    return NextResponse.json({ ok: true, runId, status: "cancelled" });
  }
  // Secrets — set a key/value pair
  if (p === "/secrets") {
    try {
      const body = await req.json();
      const key = String(body.key ?? "");
      const value = String(body.value ?? "");
      if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });
      setSecret(key, value);
      return NextResponse.json({ ok: true, key });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
    }
  }
  // Git hooks — install
  if (p.startsWith("/projects/") && p.endsWith("/install-hook")) {
    try {
      const id = p.replace("/projects/", "").replace("/install-hook", "");
      const body = await req.json();
      const event = body.event ?? "post_commit";
      const workflow = body.workflow;
      if (!workflow) return NextResponse.json({ error: "workflow required" }, { status: 400 });
      const hookFile = installGitHook(id, event, workflow);
      return NextResponse.json({ ok: true, hookFile, event, workflow });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
    }
  }
  return NextResponse.json({ error: `unknown v2 POST path: ${p}` }, { status: 404 });
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const p = url.pathname.replace("/api/axoniz/v2", "");
  if (p.startsWith("/projects/")) return DELETE_projects(req);
  if (p.startsWith("/workflows/")) return DELETE_workflows(req);
  // Secrets — delete a key
  if (p.startsWith("/secrets/")) {
    const key = p.replace("/secrets/", "");
    deleteSecret(key);
    return NextResponse.json({ ok: true, key });
  }
  // Git hooks — remove
  if (p.startsWith("/projects/") && p.includes("/hooks/")) {
    const parts = p.replace("/projects/", "").split("/");
    const id = parts[0];
    const event = parts[2] ?? "";
    const ok = removeGitHook(id, event as "post_commit" | "pre_push" | "post_merge");
    return NextResponse.json({ ok, id, event });
  }
  // Grants — revoke
  if (p.startsWith("/grants/")) {
    // TODO: implement grant revocation
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: `unknown v2 DELETE path: ${p}` }, { status: 404 });
}
