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
  return NextResponse.json({ error: `unknown v2 path: ${p}` }, { status: 404 });
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const p = url.pathname.replace("/api/axoniz/v2", "");
  if (p === "/projects") return POST_projects(req);
  if (p === "/workflows" || p.startsWith("/workflows/")) return POST_workflows(req);
  return NextResponse.json({ error: `unknown v2 POST path: ${p}` }, { status: 404 });
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const p = url.pathname.replace("/api/axoniz/v2", "");
  if (p.startsWith("/projects/")) return DELETE_projects(req);
  if (p.startsWith("/workflows/")) return DELETE_workflows(req);
  return NextResponse.json({ error: `unknown v2 DELETE path: ${p}` }, { status: 404 });
}
