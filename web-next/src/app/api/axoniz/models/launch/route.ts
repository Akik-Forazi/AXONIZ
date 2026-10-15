/**
 * POST /api/axoniz/models/launch
 *
 * Spawns `llama-server` (or other provider binary) as a child process
 * and pipes its stdout/stderr through the ServerProcessManager so the
 * dashboard can show the live output.
 *
 * The process is NOT detached (so we can capture its output) — but
 * Node's HTTP server keeps running as long as the API route handler
 * is alive, which is enough for development. (For production, you'd
 * want a separate long-running daemon process.)
 *
 * Request body:
 *   {
 *     "modelPath": "/path/to/model.gguf",
 *     "baseUrl": "http://localhost:8080",
 *     "provider": "llamacpp",  // default
 *     "nCtx": 8192,
 *     "nGpuLayers": 0,
 *     "nThreads": 8
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getServerMgr } from "@/lib/axoniz/server-mgr";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

interface LaunchBody {
  modelPath?: string;
  baseUrl?: string;
  provider?: string;
  nCtx?: number;
  nGpuLayers?: number;
  nThreads?: number;
}

function resolveBinary(provider: string): { path: string | null; error?: string } {
  const envCandidates = [
    process.env.AXONIZ_LLAMA_BIN,
    process.env.LLAMA_BIN,
    provider === "ollama" ? process.env.AXONIZ_OLLAMA_BIN : undefined,
  ].filter(Boolean) as string[];
  for (const p of envCandidates) {
    if (fs.existsSync(p)) return { path: p };
  }
  const isWin = process.platform === "win32";
  let binName: string;
  if (provider === "ollama") {
    binName = isWin ? "ollama.exe" : "ollama";
  } else if (provider === "lmstudio") {
    binName = isWin ? "lms.exe" : "lms";
  } else {
    binName = isWin ? "llama-server.exe" : "llama-server";
  }
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
    error: `${binName} binary not found. Set $AXONIZ_LLAMA_BIN or install ${provider} and put '${binName}' on PATH. Searched: env, PATH, ${homeBin}.`,
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
  const provider = body.provider ?? "llamacpp";
  const baseUrl = (body.baseUrl ?? "http://localhost:8080").replace(/\/+$/, "");

  // If already healthy, no-op.
  if (await checkHealth(baseUrl)) {
    return NextResponse.json({
      ok: true,
      baseUrl,
      message: "already running",
      pid: getServerMgr().status.pid,
    });
  }

  // Stop any existing process (different model? same model? doesn't matter —
  // user explicitly asked to launch a new one).
  getServerMgr().stop();

  const { path: binPath, error: binError } = resolveBinary(provider);
  if (!binPath) {
    return NextResponse.json({ ok: false, error: binError }, { status: 500 });
  }

  const port = (() => {
    try {
      const u = new URL(baseUrl);
      return Number(u.port) || 8080;
    } catch {
      return 8080;
    }
  })();
  const nCtx = body.nCtx ?? 8192;
  const nGpuLayers = body.nGpuLayers ?? 0;
  const nThreads = body.nThreads ?? Math.max(1, os.cpus().length - 1);

  // Build args per provider.
  let args: string[];
  if (provider === "ollama") {
    // ollama serve — no model arg needed (ollama loads models on demand per request)
    args = ["serve"];
  } else if (provider === "lmstudio") {
    // lms server start --port <port>
    args = ["server", "start", "--port", String(port)];
  } else {
    // llama-server
    args = [
      "-m", modelPath,
      "--port", String(port),
      "--ctx-size", String(nCtx),
      "-ngl", String(nGpuLayers),
      "--threads", String(nThreads),
    ];
  }

  const modelName = path.basename(modelPath);

  try {
    const proc = getServerMgr().start({
      bin: binPath,
      args,
      provider,
      modelPath,
      modelName,
      baseUrl,
      port,
    });
    // For ollama/lmstudio, there's no /health endpoint at the baseUrl —
    // they have /api/tags (ollama) and /v1/models (lmstudio). Skip the
    // health-check wait for them and just return immediately. The user
    // can watch the logs to see when the server is ready.
    if (provider !== "llamacpp") {
      return NextResponse.json({
        ok: true,
        baseUrl,
        pid: proc.pid,
        message: `${provider} server started — watch logs at /servers`,
      });
    }
    // For llamacpp: wait up to 30s for /health.
    const healthy = await waitForHealthy(baseUrl, 30_000);
    if (!healthy) {
      return NextResponse.json(
        {
          ok: false,
          error: `${provider} server was spawned but did not become healthy at ${baseUrl}/health within 30s. Check /servers for live logs.`,
          baseUrl,
          pid: proc.pid,
        },
        { status: 500 },
      );
    }
    return NextResponse.json({
      ok: true,
      baseUrl,
      pid: proc.pid,
      message: `${provider} server started`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: `failed to spawn ${provider} server: ${msg}` },
      { status: 500 },
    );
  }
}

/** GET — report current launch status (no spawn). */
export async function GET() {
  const status = getServerMgr().status;
  return NextResponse.json(status);
}
