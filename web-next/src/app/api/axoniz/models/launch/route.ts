/**
 * POST /api/axoniz/models/launch
 *
 * Spawns `llama-server` (the llama.cpp binary) as a detached child
 * process with the chosen .gguf model, then waits for it to become
 * healthy at the configured baseUrl before returning.
 *
 * Request body:
 *   {
 *     "modelPath": "C:\\Users\\user\\.axoniz\\models\\FRAZIYM-AI\\Gemma-4-E2B-Uncensored\\model.gguf",
 *     "baseUrl": "http://localhost:8080",
 *     "nCtx": 8192,
 *     "nGpuLayers": 0,
 *     "nThreads": 8
 *   }
 *
 * Response:
 *   200 { ok: true, baseUrl, pid }
 *   400 { ok: false, error: "..." }
 *   500 { ok: false, error: "..." }
 *
 * Notes:
 *   - The spawned process is detached so it survives the API route
 *     returning. On Windows it gets its own console window (hidden).
 *   - If a server is already healthy at baseUrl, this is a no-op.
 *   - llama-server binary resolution order: $AXONIZ_LLAMA_BIN, then
 *     $LLAMA_BIN, then 'llama-server' on PATH, then on Windows
 *     ~/.axoniz/llama/llama-server.exe (the AXONIZ-distributed location).
 */

import { NextRequest, NextResponse } from "next/server";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

interface LaunchBody {
  modelPath?: string;
  baseUrl?: string;
  nCtx?: number;
  nGpuLayers?: number;
  nThreads?: number;
}

let runningProc: ChildProcess | null = null;
let runningPath: string | null = null;

function resolveBinary(): { path: string | null; error?: string } {
  const envCandidates = [
    process.env.AXONIZ_LLAMA_BIN,
    process.env.LLAMA_BIN,
  ].filter(Boolean) as string[];
  for (const p of envCandidates) {
    if (fs.existsSync(p)) return { path: p };
  }
  const isWin = process.platform === "win32";
  const binName = isWin ? "llama-server.exe" : "llama-server";
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, binName);
    if (fs.existsSync(candidate)) return { path: candidate };
  }
  const homeBin = path.join(os.homedir(), ".axoniz", "llama", binName);
  if (fs.existsSync(homeBin)) return { path: homeBin };
  if (isWin) {
    const pf = process.env.PROGRAMFILES || "C:\\Program Files";
    const candidate = path.join(pf, "llama.cpp", binName);
    if (fs.existsSync(candidate)) return { path: candidate };
  }
  return {
    path: null,
    error: `llama-server binary not found. Set $AXONIZ_LLAMA_BIN or install llama.cpp and put 'llama-server' on PATH. Searched: env, PATH, ${homeBin}.`,
  };
}

async function checkHealth(baseUrl: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(`${baseUrl}/health`, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForHealthy(baseUrl: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await checkHealth(baseUrl)) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

export async function POST(req: NextRequest) {
  let body: LaunchBody;
  try {
    body = (await req.json()) as LaunchBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const modelPath = body.modelPath;
  if (!modelPath) {
    return NextResponse.json({ ok: false, error: "modelPath required" }, { status: 400 });
  }
  if (!fs.existsSync(modelPath)) {
    return NextResponse.json(
      { ok: false, error: `model file not found: ${modelPath}` },
      { status: 400 },
    );
  }
  const baseUrl = (body.baseUrl ?? "http://localhost:8080").replace(/\/+$/, "");

  if (await checkHealth(baseUrl)) {
    return NextResponse.json({
      ok: true,
      baseUrl,
      message: "already running",
      pid: runningProc?.pid,
    });
  }

  if (runningProc && runningPath && runningPath !== modelPath) {
    try { runningProc.kill("SIGTERM"); } catch { /* ignore */ }
    runningProc = null;
    runningPath = null;
  }

  const { path: binPath, error: binError } = resolveBinary();
  if (!binPath) {
    return NextResponse.json({ ok: false, error: binError }, { status: 500 });
  }

  const port = (() => {
    try {
      const u = new URL(baseUrl);
      return u.port || "8080";
    } catch {
      return "8080";
    }
  })();
  const nCtx = body.nCtx ?? 8192;
  const nGpuLayers = body.nGpuLayers ?? 0;
  const nThreads = body.nThreads ?? Math.max(1, os.cpus().length - 1);

  const args = [
    "-m", modelPath,
    "--port", port,
    "--ctx-size", String(nCtx),
    "-ngl", String(nGpuLayers),
    "--threads", String(nThreads),
  ];

  try {
    const proc = spawn(binPath, args, {
      stdio: "ignore",
      detached: true,
      windowsHide: true,
    });
    runningProc = proc;
    runningPath = modelPath;

    proc.on("error", e => {
      console.error("[models/launch] spawn error:", e.message);
      runningProc = null;
      runningPath = null;
    });
    proc.on("exit", code => {
      console.log(`[models/launch] llama-server exited with code ${code}`);
      runningProc = null;
      runningPath = null;
    });
    try { proc.unref(); } catch { /* ignore */ }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: `failed to spawn llama-server: ${msg}` },
      { status: 500 },
    );
  }

  const healthy = await waitForHealthy(baseUrl, 30_000);
  if (!healthy) {
    return NextResponse.json(
      {
        ok: false,
        error: `llama-server was spawned but did not become healthy at ${baseUrl}/health within 30s. Check console output, GPU memory, or model file.`,
        baseUrl,
        pid: runningProc?.pid,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    baseUrl,
    pid: runningProc?.pid,
    message: "llama-server started",
  });
}

/** GET — report current launch status (no spawn). */
export async function GET() {
  return NextResponse.json({
    running: runningProc !== null && !runningProc.killed,
    modelPath: runningPath,
    pid: runningProc?.pid,
  });
}
