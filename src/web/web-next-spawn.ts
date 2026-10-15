/**
 * Spawns the AXONIZ Next.js dashboard on the configured port (default 7860).
 *
 * New architecture (single server, no proxy):
 *   - Next.js runs on :7860 (was :3000)
 *   - No Express server, no proxy
 *   - Next.js API routes import AXONIZ code directly from dist/
 *   - Chat API route directly calls the LLM provider (HTTP, unavoidable)
 *   - Agent/memory/swarm API routes call AXONIZ functions in-process (CODE, not HTTP)
 */

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { info, warn } from "../core/debug.js";
import { resolveCommand } from "../tools/_internal.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
export const WEB_NEXT_DIR = path.join(REPO_ROOT, "web-next");

const DEFAULT_PORT = 7860;
const READY_TIMEOUT_MS = 60_000;
const READY_POLL_INTERVAL_MS = 500;

let child: ChildProcess | null = null;

export interface SpawnedDevServer {
  url: string;
  port: number;
  child: ChildProcess;
}

export async function spawnWebNextOnPort(port: number = DEFAULT_PORT): Promise<SpawnedDevServer | null> {
  const devUrl = `http://localhost:${port}`;

  if (child && !child.killed) {
    return { url: devUrl, port, child };
  }

  if (!fs.existsSync(WEB_NEXT_DIR)) {
    warn(`[Web] web-next/ not found at ${WEB_NEXT_DIR}.`);
    return null;
  }
  if (!fs.existsSync(path.join(WEB_NEXT_DIR, "package.json"))) {
    warn(`[Web] web-next/package.json missing.`);
    return null;
  }

  const bunBin = resolveCommand("bun");
  const npmBin = resolveCommand("npm");
  const runner = bunBin ?? npmBin;
  if (!runner) {
    warn(`[Web] Neither 'bun' nor 'npm' is on PATH.`);
    return null;
  }
  const runnerLabel = bunBin ? "bun" : "npm";

  // Production mode: when AXONIZ_WEB_PROD=1 is set in the env, spawn
  // `next start` (compiled .next/) instead of `next dev` (Turbopack).
  // The user must run `npm run build` in web-next/ first to generate
  // the .next/ directory. Production mode has NO first-load compilation
  // overhead — every API route returns in <50ms instead of 1-2s.
  const useProd = process.env.AXONIZ_WEB_PROD === "1";
  const displayLabel = useProd ? "start (production)" : "run dev";

  info(`[Web] spawning ${runnerLabel} ${displayLabel} in web-next/ (port ${port})`);

  const isWin = process.platform === "win32";
  let cmd: string;
  let args: string[];

  if (isWin && runnerLabel === "npm") {
    const npmDir = path.dirname(runner);
    const npmCliPath = path.join(npmDir, "node_modules", "npm", "bin", "npm-cli.js");
    if (fs.existsSync(npmCliPath)) {
      cmd = process.execPath;
      args = useProd
        ? [npmCliPath, "run", "start:prod"]
        : [npmCliPath, "run", "dev"];
      info(`[Web] using node.exe + npm-cli.js directly`);
    } else {
      cmd = process.env.ComSpec || "cmd.exe";
      args = useProd ? ["/c", "npm run start:prod"] : ["/c", "npm run dev"];
    }
  } else {
    cmd = runner;
    args = useProd ? ["run", "start:prod"] : ["run", "dev"];
  }

  child = spawn(cmd, args, {
    cwd: WEB_NEXT_DIR,
    env: {
      ...process.env,
      PORT: String(port),
      NEXT_TELEMETRY_DISABLED: "1",
      ...(useProd ? { NODE_ENV: "production" } : {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
    windowsHide: true,
  });

  child.stdout?.on("data", (chunk: Buffer) => {
    const line = chunk.toString().trim();
    if (line) info(`[web-next] ${line}`);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    const line = chunk.toString().trim();
    if (line) warn(`[web-next] ${line}`);
  });
  child.on("exit", (code, signal) => {
    warn(`[Web] Next.js exited (code=${code} signal=${signal}).`);
    child = null;
  });

  const ready = await waitForReady(devUrl, READY_TIMEOUT_MS);
  if (ready) {
    info(`[Web] dashboard ready at ${devUrl}`);
  } else {
    warn(`[Web] dashboard not ready within ${READY_TIMEOUT_MS / 1000}s.`);
  }

  return { url: devUrl, port, child };
}

export async function spawnWebNext(): Promise<SpawnedDevServer | null> {
  return spawnWebNextOnPort(DEFAULT_PORT);
}

export function stopWebNext(): void {
  if (child && !child.killed) {
    try { child.kill("SIGTERM"); info("[Web] stopped"); } catch { /* ignore */ }
  }
  child = null;
}

async function waitForReady(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(2000) });
      if (res.status < 500) return true;
    } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, READY_POLL_INTERVAL_MS));
  }
  return false;
}
