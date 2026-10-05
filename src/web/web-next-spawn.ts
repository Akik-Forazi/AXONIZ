/**
 * Spawns the AXONIZ Next.js dashboard (web-next/) as a child process and
 * waits for it to be ready before resolving.
 *
 * `axoniz --web` now serves the new Next.js UI from `web-next/` instead
 * of the legacy scraped static files at `src/web/static/`. The Express
 * backend stays on :7860 (where all `/api/*` routes live); the Next.js
 * dev server runs on :3000; the Express server proxies all non-API GET
 * requests to :3000 so users only need to remember one port.
 *
 * Resolution priority:
 *   1. `bun run dev`  — preferred (fastest dev server on the planet)
 *   2. `npm run dev`  — fallback if bun isn't on PATH
 *   3. Give up gracefully — Express keeps serving the legacy static UI
 *      with a clear log line telling the operator to install bun or npm.
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

const DEV_PORT = Number(process.env.AXONIZ_WEB_NEXT_PORT ?? 3000);
const DEV_URL = `http://localhost:${DEV_PORT}`;
const READY_TIMEOUT_MS = 60_000;
const READY_POLL_INTERVAL_MS = 500;

let child: ChildProcess | null = null;

export interface SpawnedDevServer {
  url: string;
  port: number;
  child: ChildProcess;
}

/**
 * Spawn `bun run dev` (or `npm run dev`) in web-next/ and resolve once
 * the dev server answers a HEAD request. If web-next/ doesn't exist,
 * resolves null (the caller should fall back to the legacy static UI
 * and log a warning).
 */
export async function spawnWebNext(): Promise<SpawnedDevServer | null> {
  // If already spawned in this process, return the cached handle
  if (child && !child.killed) {
    return { url: DEV_URL, port: DEV_PORT, child };
  }

  // Verify web-next/ exists
  if (!fs.existsSync(WEB_NEXT_DIR)) {
    warn(
      `[Web] web-next/ not found at ${WEB_NEXT_DIR} — falling back to legacy static UI. Run 'git pull' or clone the dashboard into web-next/.`,
    );
    return null;
  }
  if (!fs.existsSync(path.join(WEB_NEXT_DIR, "package.json"))) {
    warn(
      `[Web] web-next/package.json missing — directory looks malformed. Falling back to legacy static UI.`,
    );
    return null;
  }

  // Pick a runner
  const bunBin = resolveCommand("bun");
  const npmBin = resolveCommand("npm");
  const runner = bunBin ?? npmBin;
  if (!runner) {
    warn(
      `[Web] Neither 'bun' nor 'npm' is on PATH — cannot start the Next.js dev server. Falling back to legacy static UI. Install bun (recommended) or Node.js.`,
    );
    return null;
  }
  const runnerLabel = bunBin ? "bun" : "npm";

  // Spawn
  info(`[Web] spawning ${runnerLabel} run dev in web-next/ (port ${DEV_PORT})`);
  child = spawn(runner, ["run", "dev"], {
    cwd: WEB_NEXT_DIR,
    env: {
      ...process.env,
      PORT: String(DEV_PORT),
      // Suppress the auto-open behavior of Next's dev server; the
      // Express proxy opens the browser to :7860 once it's ready.
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
    windowsHide: true,
  });

  // Pipe child stdout/stderr to debug logs (so we can see compile errors)
  child.stdout?.on("data", (chunk: Buffer) => {
    const line = chunk.toString().trim();
    if (line) info(`[web-next] ${line}`);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    const line = chunk.toString().trim();
    if (line) warn(`[web-next] ${line}`);
  });
  child.on("exit", (code, signal) => {
    warn(
      `[Web] Next.js dev server exited (code=${code} signal=${signal}). ` +
        `Subsequent proxied requests will 502. Restart 'axoniz --web' to relaunch.`,
    );
    child = null;
  });

  // Wait for the dev server to respond
  const ready = await waitForReady(DEV_URL, READY_TIMEOUT_MS);
  if (!ready) {
    warn(
      `[Web] Next.js dev server did not become ready within ${READY_TIMEOUT_MS / 1000}s — proxying may 502 until it's up.`,
    );
  } else {
    info(`[Web] Next.js dashboard ready at ${DEV_URL}`);
  }

  return { url: DEV_URL, port: DEV_PORT, child };
}

/** Stop the spawned Next.js dev server (called on SIGINT/SIGTERM). */
export function stopWebNext(): void {
  if (child && !child.killed) {
    try {
      child.kill("SIGTERM");
      info("[Web] Next.js dev server stopped");
    } catch {
      /* ignore */
    }
  }
  child = null;
}

async function waitForReady(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(2000) });
      // Next dev server returns 200 on /, or 404 on / without a route — either
      // means it's responding.
      if (res.status < 500) return true;
    } catch {
      /* not ready yet — try again */
    }
    await new Promise((r) => setTimeout(r, READY_POLL_INTERVAL_MS));
  }
  return false;
}
