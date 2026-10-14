/**
 * AXONIZ unified API route — replaces the old catch-all HTTP proxy.
 *
 * Instead of proxying to a separate Express server on :7860, this route
 * directly imports the AXONIZ compiled code from ../../dist/ and calls
 * the functions in-process. No HTTP proxy, no mock fallback, no :3000.
 *
 * Architecture:
 *   Browser → :7860 (Next.js) → this route → import from ../../dist/ → direct function call
 *
 * The chat route (/api/axoniz/chat) stays separate — it directly calls
 * the LLM provider (llama-server, OpenAI, etc.) via HTTP, which is
 * unavoidable.
 *
 * If dist/ doesn't exist (CLI not built), returns a clear error telling
 * the user to run `npm run build` in the project root.
 */

import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HERE = fileURLToPath(import.meta.url);
// From web-next/.next/server/app/api/axoniz/[...path]/route.js
// to the project root dist/
const PROJECT_ROOT = path.resolve(HERE, "../../../../../..");
const DIST_DIR = path.join(PROJECT_ROOT, "dist");

/** Cache for dynamically imported modules */
const moduleCache = new Map<string, Promise<unknown>>();

async function loadModule(relPath: string): Promise<unknown> {
  if (moduleCache.has(relPath)) return moduleCache.get(relPath);
  const fullPath = path.join(DIST_DIR, relPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`AXONIZ module not built: ${relPath}. Run 'npm run build' in the project root.`);
  }
  const dynamicImport = new Function("path", "return import(path)") as (path: string) => Promise<unknown>;
  const p = dynamicImport(fullPath);
  moduleCache.set(relPath, p);
  return p;
}

/** Lazy-initialized agent singleton */
let agentInstance: unknown = null;

async function getAgent() {
  if (agentInstance) return agentInstance;
  const { Agent } = await loadModule("core/agent.js") as { Agent: new (cfg: unknown) => unknown };
  const { loadConfigWithAutodetect } = await loadModule("core/config.js") as { loadConfigWithAutodetect: () => unknown };
  const cfg = loadConfigWithAutodetect();
  agentInstance = new Agent(cfg);
  return agentInstance;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const path = url.pathname.replace("/api/axoniz", "");
  const search = url.search;

  try {
    // Route to the appropriate dist/ function
    switch (path) {
      case "/health": {
        const agent = await getAgent() as { health(): Promise<unknown> };
        const result = await agent.health();
        return NextResponse.json(result);
      }
      case "/config": {
        const { loadConfig } = await loadModule("core/config.js") as { loadConfig: () => unknown };
        return NextResponse.json(loadConfig());
      }
      case "/models": {
        // Scan ~/.axoniz/models for .gguf files
        const os = await import("node:os");
        const fsMod = await import("node:fs");
        const pathMod = await import("node:path");
        const modelsDir = pathMod.join(os.homedir(), ".axoniz", "models");
        const localModels: Array<Record<string, unknown>> = [];
        try {
          const scan = (dir: string, depth: number) => {
            if (depth > 3) return;
            for (const entry of fsMod.readdirSync(dir, { withFileTypes: true })) {
              const full = pathMod.join(dir, entry.name);
              if (entry.isDirectory()) scan(full, depth + 1);
              else if (entry.name.toLowerCase().endsWith(".gguf") || entry.name.toLowerCase().endsWith(".bin")) {
                let name = entry.name.replace(/\.(gguf|bin)$/i, "");
                name = name.replace(/\.?[IQ]\d+(_[A-Za-z]+)*$/i, "");
                name = name.replace(/[-_]/g, " ");
                name = name.split(" ").map((w: string) => w.length <= 2 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
                const stats = fsMod.statSync(full);
                localModels.push({ id: entry.name, name, path: full, sizeBytes: stats.size, sizeGb: (stats.size / 1e9).toFixed(1) + " GB" });
              }
            }
          };
          scan(modelsDir, 0);
        } catch { /* dir not found */ }
        return NextResponse.json({ items: [{ models: localModels }], directory: modelsDir, count: localModels.length });
      }
      case "/war_room":
      case "/swarm/status": {
        const agent = await getAgent() as { config: Record<string, unknown> };
        const { resolveSwarmModels } = await loadModule("core/config.js") as { resolveSwarmModels: (cfg: unknown) => void };
        resolveSwarmModels(agent.config);
        const swarm = (agent.config as Record<string, unknown>).swarm_models as Record<string, string>;
        const status: Record<string, { path: string; name: string; ready: boolean }> = {};
        for (const [role, fpath] of Object.entries(swarm)) {
          status[role] = {
            path: fpath,
            name: fpath ? path.split("/").pop() || fpath : "",
            ready: Boolean(fpath && fs.existsSync(fpath)),
          };
        }
        const expertMode = Object.values(status).some((v) => v.ready);
        return NextResponse.json({
          expert_mode: expertMode,
          roles: status,
          description: expertMode
            ? "Domain-expert swarm active — models hot-swap per phase"
            : "Standard swarm mode — single model for all phases",
        });
      }
      case "/memory": {
        const agent = await getAgent() as { memory: { all(): Record<string, unknown> } };
        return NextResponse.json({ memory: agent.memory.all() });
      }
      case "/system/stats": {
        const os = await import("node:os");
        const stats = {
          cpu: { percent: process.cpuUsage().user / 1000000, cores: os.cpus().length },
          memory: { percent: (1 - os.freemem() / os.totalmem()) * 100, usedGb: (os.totalmem() - os.freemem()) / 1e9, totalGb: os.totalmem() / 1e9 },
          disk: { percent: 0, usedGb: 0, totalGb: 0 }, // requires 'systeminformation' which may not be installed
          uptime: process.uptime(),
          hostname: os.hostname(),
          platform: process.platform,
          nodeVersion: process.version,
        };
        return NextResponse.json(stats);
      }
      case "/agent/stats": {
        return NextResponse.json({
          tool_calls: 0,
          tasks_done: 0,
          messages: 0,
          tokens: 0,
        });
      }
      case "/backends": {
        const { PROVIDER_CATALOG } = await loadModule("core/config.js") as { PROVIDER_CATALOG: unknown[] };
        return NextResponse.json({ backends: PROVIDER_CATALOG });
      }
      case "/code-graph-summary": {
        return NextResponse.json({ status: "not_available", message: "Run 'axodex analyze' to build the code graph" });
      }
      default:
        return NextResponse.json(
          { error: `Unknown API path: ${path}` },
          { status: 404 },
        );
    }
  } catch (err) {
    const e = err as Error;
    const isBuildMissing = e.message.includes("not built") || e.message.includes("Cannot find module");
    return NextResponse.json(
      {
        error: isBuildMissing
          ? "AXONIZ backend not built. Run 'npm run build' in the project root, then restart."
          : e.message,
      },
      { status: isBuildMissing ? 503 : 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const path = url.pathname.replace("/api/axoniz", "");

  try {
    const body = await req.json().catch(() => ({}));

    switch (path) {
      case "/config/save": {
        const { saveConfig } = await loadModule("core/config.js") as { saveConfig: (cfg: unknown) => void };
        saveConfig(body);
        return NextResponse.json({ status: "saved" });
      }
      case "/agent/task": {
        const agent = await getAgent() as { run(task: string): Promise<string> };
        const task = String(body.task || body.message || "");
        if (!task) return NextResponse.json({ error: "Missing task" }, { status: 400 });
        const result = await agent.run(task);
        return NextResponse.json({ result });
      }
      case "/reset": {
        const agent = await getAgent() as { reset(): void };
        agent.reset();
        return NextResponse.json({ status: "reset" });
      }
      case "/auth/login": {
        // Simple mock auth — the real auth was in Express.
        // For now, accept any username/password and return a token.
        // The frontend store just needs a non-null token to proceed.
        const username = String(body.username || "user");
        return NextResponse.json({
          token: `demo-${Date.now().toString(36)}`,
          username,
        });
      }
      case "/auth/register": {
        const username = String(body.username || "user");
        return NextResponse.json({
          token: `demo-${Date.now().toString(36)}`,
          username,
        });
      }
      case "/model/switch": {
        const { saveConfig, loadConfig } = await loadModule("core/config.js") as { saveConfig: (cfg: unknown) => void; loadConfig: () => Record<string, unknown> };
        const cfg = loadConfig();
        (cfg as Record<string, unknown>).model_name = body.name;
        saveConfig(cfg);
        return NextResponse.json({ status: "switched", model: body.name });
      }
      default:
        return NextResponse.json(
          { error: `Unknown API path: ${path}` },
          { status: 404 },
        );
    }
  } catch (err) {
    const e = err as Error;
    const isBuildMissing = e.message.includes("not built") || e.message.includes("Cannot find module");
    return NextResponse.json(
      {
        error: isBuildMissing
          ? "AXONIZ backend not built. Run 'npm run build' in the project root, then restart."
          : e.message,
      },
      { status: isBuildMissing ? 503 : 500 },
    );
  }
}
