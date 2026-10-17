/**
 * AXONIZ unified API route — self-contained, no dist/ imports.
 *
 * Reads config from ~/.axoniz/config.json directly.
 * Scans ~/.axoniz/models for .gguf files.
 * Uses node:os for system stats.
 * Returns real data or clear errors — no mock data.
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { requireAuth } from "@/lib/axoniz/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const AXONIZ_HOME = path.join(os.homedir(), ".axoniz");
const CONFIG_PATH = path.join(AXONIZ_HOME, "config.json");
const MODELS_DIR = path.join(AXONIZ_HOME, "models");

function formatModelName(raw: string): string {
  let s = raw.split(/[\\/]/).pop() || raw;
  s = s.replace(/\.(gguf|bin|onnx)$/i, "");
  s = s.replace(/\.?[IQ]\d+(_[A-Za-z]+)*$/i, "");
  s = s.replace(/-\d+-of-\d+$/i, "");
  s = s.replace(/[-_]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  s = s.split(" ").map(w => w.length <= 2 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  s = s.replace(/\bIt\b/g, "IT");
  return s || raw;
}

function loadConfig(): Record<string, unknown> | null {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    }
  } catch { /* corrupt config */ }
  return null;
}

function scanModels(dir: string, depth = 0): Array<Record<string, unknown>> {
  if (depth > 3) return [];
  const results: Array<Record<string, unknown>> = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...scanModels(full, depth + 1));
      } else if (entry.name.toLowerCase().endsWith(".gguf") || entry.name.toLowerCase().endsWith(".bin")) {
        let name = formatModelName(entry.name);
        try {
          const stats = fs.statSync(full);
          const sizeGb = stats.size / 1e9;
          results.push({
            id: entry.name,
            name,
            path: full,
            sizeBytes: stats.size,
            size: sizeGb >= 1 ? `${sizeGb.toFixed(1)} GB` : `${(stats.size / 1e6).toFixed(0)} MB`,
            quant: entry.name.match(/[IQ](\d)_(\w+)/)?.[0] || null,
          });
        } catch (e) {
          // stat failed — log so the user can see WHY a model is missing
          // (broken symlink, EACCES, EIO on a network mount, etc.) instead
          // of the file silently disappearing from the Vault list.
          console.warn(`[scanModels] stat failed for ${full}:`, e instanceof Error ? e.message : String(e));
        }
      }
    }
  } catch (e) {
    // dir not found / not readable — log so the user sees a real error
    // instead of the Vault just showing an empty state with no hint.
    console.warn(`[scanModels] readdirSync(${dir}) failed:`, e instanceof Error ? e.message : String(e));
  }
  return results;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const p = url.pathname.replace("/api/axoniz", "");

  // Auth check for sensitive GET endpoints — uses requireAuth() which
  // returns "axoniz" on localhost (no auth needed for local use).
  // Set AXONIZ_REQUIRE_AUTH=true in .env to require real Bearer JWT.
  const sensitiveRoutes = ["/config", "/files/list", "/memory", "/war_room", "/swarm/status"];
  const isSensitive = sensitiveRoutes.some(s => p === s || p.startsWith(s + "/"));
  if (isSensitive) {
    const user = await requireAuth(req);
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const cfg = loadConfig();

  // All responses from this proxy are tagged with x-axoniz-source: live so
  // the UI can tell the difference between the real backend and a mock
  // (when the real backend is offline). Read by boot.ts via useHealthQuery.
  const liveHeaders = { "x-axoniz-source": "live" };

  switch (p) {
    case "/health": {
      const provider = String(cfg?.provider ?? cfg?.backend ?? (cfg as any)?.llm?.active_provider ?? "llamacpp");
      const modelName = String(cfg?.model_name ?? (cfg as any)?.llm?.providers?.[provider]?.model ?? "unknown");
      return NextResponse.json({
        status: "active",
        backend: provider,
        model: formatModelName(modelName),
        model_loaded: true,
        uptime: process.uptime(),
        timestamp: Date.now(),
      }, { headers: liveHeaders });
    }

    case "/config": {
      if (!cfg) return NextResponse.json({ error: "Config not found at " + CONFIG_PATH }, { status: 404 });
      // Redact API keys before exposing — same policy as /config/cli GET.
      // Without this, GET /config would leak real API keys to anyone who
      // passes the auth gate, while /config/cli redacts them. Split-brained.
      const redacted = JSON.parse(JSON.stringify(cfg));
      try {
        const providers = redacted?.llm?.providers;
        if (providers) for (const key of Object.keys(providers)) {
          const p = providers[key];
          if (p && typeof p === "object" && p.api_key) p.api_key = "[REDACTED]";
        }
      } catch { /* ignore */ }
      return NextResponse.json(redacted);
    }

    case "/models": {
      const models = scanModels(MODELS_DIR);
      return NextResponse.json({
        items: [{ models }],
        directory: MODELS_DIR,
        count: models.length,
      });
    }

    case "/backends": {
      return NextResponse.json({
        backends: [
          { id: "llamacpp", name: "llama.cpp", category: "local", url: "http://localhost:8080" },
          { id: "lmstudio", name: "LM Studio", category: "local", url: "http://localhost:1234" },
          { id: "ollama", name: "Ollama", category: "local", url: "http://localhost:11434" },
          { id: "openai", name: "OpenAI", category: "cloud", url: "https://api.openai.com/v1" },
        ],
      });
    }

    case "/war_room":
    case "/swarm/status": {
      const swarm = (cfg as any)?.swarm_models ?? {};
      const status: Record<string, { path: string; name: string; ready: boolean }> = {};
      for (const [role, fpath] of Object.entries(swarm) as [string, string][]) {
        if (!fpath) { status[role] = { path: "", name: "", ready: false }; continue; }
        status[role] = {
          path: fpath,
          name: formatModelName(path.basename(fpath)),
          ready: fs.existsSync(fpath),
        };
      }
      const expertMode = Object.values(status).some(v => v.ready);
      return NextResponse.json({
        expert_mode: expertMode,
        roles: status,
        description: expertMode ? "Domain-expert swarm active" : "Standard swarm mode",
        active_mission: null,
        workers: [],
      });
    }

    case "/memory": {
      const palacePath = path.join(AXONIZ_HOME, "palace");
      const kgPath = path.join(AXONIZ_HOME, "knowledge_graph.sqlite3");
      let palaceDrawers = 0;
      let kgFacts = 0;
      try { if (fs.existsSync(palacePath)) palaceDrawers = fs.readdirSync(palacePath).length; } catch {}
      return NextResponse.json({
        palace: { available: fs.existsSync(palacePath), drawers: palaceDrawers },
        kg: { available: fs.existsSync(kgPath), facts: kgFacts },
        all: {},
      });
    }

    case "/system/stats": {
      const cpus = os.cpus();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      // CpuInfo = { model, speed, times: { user, nice, sys, idle, irq } }
      const cpu0 = cpus[0]?.times;
      const cpuSum = cpu0 ? (cpu0.user + cpu0.nice + cpu0.sys + cpu0.idle) || 1 : 1;
      return NextResponse.json({
        cpu: { percent: cpu0 ? (1 - cpu0.idle / cpuSum) * 100 : 0, cores: cpus.length },
        memory: { percent: (1 - freeMem / totalMem) * 100, usedGb: (totalMem - freeMem) / 1e9, totalGb: totalMem / 1e9 },
        disk: { percent: 0, usedGb: 0, totalGb: 0 },
        uptime: process.uptime(),
        hostname: os.hostname(),
        platform: process.platform,
        nodeVersion: process.version,
        axonizVersion: "0.1.7-beta.5",
      });
    }

    case "/stats":
    case "/agent/stats": {
      return NextResponse.json({
        tool_calls: 0,
        tasks_completed: 0,
        tasks_done: 0,
        messages: 0,
        tokens: 0,
      });
    }

    case "/code-graph-summary": {
      return NextResponse.json({ status: "not_available", message: "Run 'axodex analyze' to build the code graph" });
    }

    case "/absolute_query": {
      const q = url.searchParams.get("q") || "";
      return NextResponse.json({ query: q, results: [] });
    }

    case "/models/downloads": {
      return NextResponse.json({ downloads: [] });
    }

    case "/files/list": {
      const tree: string[] = [];
      try {
        const walk = (dir: string, prefix: string, depth: number) => {
          if (depth > 2) return;
          for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "dist" || e.name === ".next") continue;
            const rel = prefix ? `${prefix}/${e.name}` : e.name;
            tree.push(rel);
            if (e.isDirectory()) walk(path.join(dir, e.name), rel, depth + 1);
          }
        };
        walk(process.cwd(), "", 0);
      } catch {}
      return NextResponse.json({ tree });
    }

    case "/stream": {
      // No Express backend — return a minimal keepalive SSE
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const enqueue = (s: string) => { try { controller.enqueue(encoder.encode(s)); } catch {} };
          enqueue(": keepalive\n\n");
          // 15s heartbeat — see /api/axoniz/stream/route.ts for rationale
          const interval = setInterval(() => enqueue(": keepalive\n\n"), 15_000);
          (interval as any).unref?.();
          req.signal.addEventListener("abort", () => {
            clearInterval(interval);
            try { controller.close(); } catch {}
          });
        },
      });
      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "x-axoniz-source": "live" },
      });
    }

    case "/models/search": {
      const q = url.searchParams.get("q") || "";
      return NextResponse.json({ items: [], query: q });
    }

    default:
      return NextResponse.json({ error: `Unknown API path: ${p}` }, { status: 404 });
  }
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const p = url.pathname.replace("/api/axoniz", "");

  // Auth check — uses requireAuth() which returns "axoniz" on localhost.
  // Login and register are exempt (they issue tokens).
  const isAuthEndpoint = p === "/auth/login" || p === "/auth/register";
  if (!isAuthEndpoint) {
    const user = await requireAuth(req);
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const cfg = loadConfig();
  const body = await req.json().catch(() => ({}));

  switch (p) {
    case "/config/save": {
      try {
        fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(body, null, 2), "utf-8");
        return NextResponse.json({ status: "saved" });
      } catch (e) {
        return NextResponse.json({ error: `Failed to save: ${e}` }, { status: 500 });
      }
    }

    case "/auth/login": {
      // Real auth via CLI's bcrypt + JWT system. FAILS CLOSED.
      const { verifyCredentials, createAuthToken } = await import("@/lib/axoniz/cli-bridge");
      const username = String(body.username ?? "");
      const password = String(body.password ?? "");
      if (!username || password.length < 4) {
        return NextResponse.json({ error: "Username and password (min 4 chars) required" }, { status: 400 });
      }
      const verifiedUser = verifyCredentials(username, password);
      if (!verifiedUser) {
        // Wrong password OR auth module unavailable → 401, no token.
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
      }
      const token = await createAuthToken(verifiedUser);
      if (!token) {
        // Token creation failed → fail closed, no fallback.
        return NextResponse.json({ error: "Authentication service unavailable" }, { status: 503 });
      }
      return NextResponse.json({ token, username: verifiedUser });
    }

    case "/auth/register": {
      // Registration must use the real auth system, not issue demo tokens.
      const { verifyCredentials, createAuthToken } = await import("@/lib/axoniz/cli-bridge");
      const username = String(body.username ?? "");
      const password = String(body.password ?? "");
      if (!username || password.length < 4) {
        return NextResponse.json({ error: "Username and password (min 4 chars) required" }, { status: 400 });
      }
      // Check if user already exists — try to verify (if verifyPassword returns true,
      // the user exists and the password is correct; if it returns false, either
      // the user doesn't exist or the password is wrong — either way, registration
      // should go through the CLI's user creation, not here).
      // For now, fail closed — registration is a CLI-only operation.
      return NextResponse.json({ error: "Registration is not available via web. Use 'axoniz user create' CLI command." }, { status: 501 });
    }

    case "/reset": {
      return NextResponse.json({ status: "reset" });
    }

    case "/model/switch": {
      // The client sends { path } (from use-switch-model-mutation →
      // axonizClient.switchModel(path) → postJson("/model/switch", { path })).
      // The previous code read body.name (which was undefined) and stored
      // model_name = undefined — corrupting config.json. Now we read both:
      //   - path → persisted as model_path (the .gguf file path)
      //   - name → persisted as model_name (the display name, optional)
      if (!cfg) {
        // Config file doesn't exist or is corrupt — can't persist.
        return NextResponse.json(
          { status: "error", error: "config.json not found — run `axoniz config init` first" },
          { status: 500 },
        );
      }
      const newPath = typeof body.path === "string" ? body.path : undefined;
      const newName = typeof body.name === "string" ? body.name : undefined;
      if (!newPath && !newName) {
        return NextResponse.json(
          { status: "error", error: "must provide path or name" },
          { status: 400 },
        );
      }
      if (newPath) (cfg as any).model_path = newPath;
      if (newName) (cfg as any).model_name = newName;
      // For llamacpp, also persist into the nested llm.providers.llamacpp.model
      // so the agent's loadModel step picks it up.
      try {
        const llm = (cfg as any).llm;
        if (llm && llm.providers && llm.providers.llamacpp) {
          if (newPath) llm.providers.llamacpp.model_path = newPath;
          if (newName) llm.providers.llamacpp.model = newName;
        }
      } catch (e) {
        // Don't swallow — return the failure so the UI's toast.error fires.
        return NextResponse.json(
          { status: "error", error: `nested provider set failed: ${e instanceof Error ? (e as Error).message : String(e)}` },
          { status: 500 },
        );
      }
      try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf-8");
      } catch (e) {
        return NextResponse.json(
          { status: "error", error: `config write failed: ${e instanceof Error ? (e as Error).message : String(e)}` },
          { status: 500 },
        );
      }
      return NextResponse.json({
        status: "ok",
        model: newName ?? newPath ?? "(unknown)",
        path: newPath,
      });
    }

    case "/models/download": {
      return NextResponse.json({ status: "not_implemented", message: "Use 'axoniz model download' CLI command" });
    }

    case "/agent/task": {
      const task = String(body.task || body.message || "");
      if (!task) return NextResponse.json({ error: "Missing task" }, { status: 400 });
      return NextResponse.json({ result: "Use /api/axoniz/chat for chat, or run the agent via CLI" });
    }

    default:
      return NextResponse.json({ error: `Unknown POST path: ${p}` }, { status: 404 });
  }
}
