/**
 * AXONIZ web server — Express port of axoniz/web/server.py.
 *
 * Serves the static frontend from src/web/static and exposes the same REST +
 * SSE API surface as the Python original. Endpoint names, payload shapes and
 * status codes are preserved so the existing UI keeps working.
 *
 * NOTE: the bundled frontend references many more `/api/...` routes (auth 2FA,
 * email, calendar, cookbook, gallery, …) than the Python backend ever
 * implemented. Those return 404 here exactly as they did there.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import express, { type Express, type Request, type Response } from "express";
import multer from "multer";
import { openInBrowser } from "./open_browser.js";
import { spawnWebNext, stopWebNext, WEB_NEXT_DIR } from "./web-next-spawn.js";
import { AXONIZ_HOME, MODELS_DIR, loadConfigWithAutodetect, loadConfig, saveConfig, deepMerge, resolveSwarmModels, type AxonizConfig } from "../core/config.js";
import { getBackend, listSupportedProviders } from "../core/backend/index.js";
import { downloadModelAsync, getDownloadStatus, searchModels } from "../core/downloader.js";
import { getSystemTelemetry, getMetrics, trackRequest } from "../core/metrics.js";
import { getRateLimiter } from "../core/rate_limit.js";
import { getAuth } from "../core/auth.js";
import { info, warn, error as logError } from "../core/debug.js";
import { broker, _broker, formatSse } from "./broker.js";
import type { Agent, AbortFlag } from "../core/agent.js";
import { AbortFlag as AbortFlagClass } from "../core/agent.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = path.join(HERE, "static");

const auth = getAuth();
const limiter = getRateLimiter();

/* ── Stats ────────────────────────────────────────────────────────────────── */

class Stats {
  requests = 0;
  chat_turns = 0;
  agent_runs = 0;
  goal_runs = 0;
  tool_calls = 0;
  model_switches = 0;
  readonly start_time = Date.now() / 1000;

  inc(field: keyof Omit<Stats, "start_time" | "inc" | "snapshot">, n = 1): void {
    this[field] += n;
  }

  snapshot(): Record<string, number> {
    return {
      uptime_seconds: Math.floor(Date.now() / 1000 - this.start_time),
      requests: this.requests,
      chat_turns: this.chat_turns,
      agent_runs: this.agent_runs,
      goal_runs: this.goal_runs,
      tool_calls: this.tool_calls,
      model_switches: this.model_switches,
    };
  }
}

export const stats = new Stats();

/* ── Model search dirs (mirrors the Python helper) ────────────────────────── */

export function getModelSearchDirs(): string[] {
  const home = os.homedir();
  const dirs = [
    MODELS_DIR,
    path.join(HERE, "..", "models"),
    path.join(home, "Downloads"),
    path.join(home, "models"),
    "C:\\Users\\akikf\\.axoniz\\models\\lmstudio-community",
    path.join(HERE, ".."),
  ];
  const unique: string[] = [];
  for (const d of dirs) {
    if (!d) continue;
    const p = path.resolve(d);
    if (!unique.includes(p)) unique.push(p);
  }
  return unique;
}

/** Recursively collect *.gguf basenames under a directory (depth-bounded). */
function findGgufs(dir: string, depth = 0, acc: string[] = []): string[] {
  if (depth > 6) return acc;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) findGgufs(full, depth + 1, acc);
    else if (e.name.toLowerCase().endsWith(".gguf")) acc.push(e.name);
  }
  return acc;
}

/** Search a directory tree for a file by basename. */
function findByName(dir: string, name: string, depth = 0): string | null {
  if (depth > 8) return null;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      const hit = findByName(full, name, depth + 1);
      if (hit) return hit;
    } else if (e.name === name) {
      return full;
    }
  }
  return null;
}

/* ── Static file resolution (with traversal protection) ───────────────────── */

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".map": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".webm": "video/webm",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".pdf": "application/pdf",
};

export function resolveStatic(urlPath: string): { full: string; mime: string } | null {
  let rel = urlPath === "/" || !urlPath ? "index.html" : urlPath.replace(/^\/+/, "");
  if (rel.startsWith("static/")) rel = rel.slice(7);

  const full = path.resolve(STATIC_DIR, rel);
  const root = path.resolve(STATIC_DIR);
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  try {
    if (!fs.statSync(full).isFile()) return null;
  } catch {
    return null;
  }
  return { full, mime: MIME[path.extname(full).toLowerCase()] ?? "application/octet-stream" };
}

/* ── Server ───────────────────────────────────────────────────────────────── */

export interface WebServerOptions {
  agent: Agent | null;
  host?: string;
  port?: number;
}

export class WebServer {
  agent: Agent | null;
  readonly host: string;
  readonly port: number;
  private app: Express;
  private server: ReturnType<Express["listen"]> | null = null;
  /** Abort flags keyed by request id, so the UI can cancel a running turn. */
  private aborts = new Map<string, AbortFlag>();

  constructor(opts: WebServerOptions) {
    this.agent = opts.agent;
    this.host = opts.host ?? "localhost";
    this.port = opts.port ?? 7860;
    this.app = this.build();
  }

  /* ── Auth ────────────────────────────────────────────────────────────── */

  private usersFileExists(): boolean {
    try {
      return fs.existsSync(path.join(path.dirname(auth.secretFile), "users.json"));
    } catch {
      return false;
    }
  }

  private async authenticate(req: Request): Promise<boolean> {
    const header = req.headers.authorization;
    if (!header) return !this.usersFileExists(); // No users defined -> allow local access
    if (header.startsWith("Bearer ")) {
      return (await auth.verifyToken(header.slice(7))) !== null;
    }
    return false;
  }

  /* ── App wiring ──────────────────────────────────────────────────────── */

  private build(): Express {
    const app = express();

    // CORS (the Python server sent these on every response).
    app.use((_req, res, next) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      next();
    });

    app.use(express.json({ limit: "50mb" }));
    app.use(express.urlencoded({ extended: true, limit: "50mb" }));

    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 * 1024 } });

    // Rate limiting for API traffic only (static assets excluded, as in Python).
    app.use("/api", (req, res, next) => {
      this.recordRequest();
      const ip = req.ip ?? "local";
      if (!limiter.isAllowed(ip, 100, 60)) {
        res.status(429).json({ error: "Rate limit exceeded" });
        return;
      }
      next();
    });

    app.options("/{*splat}", (_req, res) => {
      res.status(204).end();
    });

    /* ── Metrics ───────────────────────────────────────────────────────── */
    app.get("/metrics", async (_req, res) => {
      try {
        res.type("text/plain; version=0.0.4; charset=utf-8").send(await getMetrics());
      } catch (e) {
        res.status(500).send(String(errMsg(e)));
      }
    });

    /* ── Voice (GET) ───────────────────────────────────────────────────── */
    app.get("/api/voice/tts", async (req, res) => {
      const text = String(req.query.text ?? "").trim();
      if (!text) {
        res.status(400).json({ error: "No text provided" });
        return;
      }
      try {
        const { TTSEngine } = (await import("../voice/tts.js")) as {
          TTSEngine: new (opts?: Record<string, unknown>) => {
            synthesizeToBytes(text: string): Promise<Buffer | Uint8Array | null>;
          };
        };
        const engine = new TTSEngine({ provider: "auto" });
        const audio = await engine.synthesizeToBytes(text);
        if (!audio) {
          res.status(500).json({ error: "TTS synthesis failed" });
          return;
        }
        const buf = Buffer.isBuffer(audio) ? audio : Buffer.from(audio);
        res.type("audio/wav").setHeader("Content-Length", String(buf.length)).send(buf);
      } catch (e) {
        res.status(500).json({ error: errMsg(e) });
      }
    });

    app.get("/api/voice/stt", (_req, res) => {
      res.status(405).json({ error: "Use POST for STT" });
    });

    /* ── GET API ───────────────────────────────────────────────────────── */
    app.get("/api/models/search", async (req, res) => {
      res.json(await searchModels(String(req.query.q ?? "gguf")));
    });

    app.get("/api/models/downloads", (_req, res) => {
      res.json(getDownloadStatus());
    });

    app.get("/api/war_room", (_req, res) => {
      if (!this.agent) {
        res.json({ error: "No agent" });
        return;
      }
      res.json({ status: this.agent.warRoom() });
    });

    app.get("/api/absolute_query", async (req, res) => {
      if (!this.agent) {
        res.json({ error: "No agent" });
        return;
      }
      res.json({ result: await this.agent.absoluteQuery(String(req.query.q ?? "")) });
    });

    /* ── SSE event stream ──────────────────────────────────────────────── */
    app.get("/api/stream", (req, res) => {
      this.openSse(res);
      const q = broker.addClient();

      const heartbeat = setInterval(() => {
        try {
          res.write(": keepalive\n\n");
        } catch {
          /* handled by close */
        }
      }, 15000);
      heartbeat.unref?.();

      let closed = false;
      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        broker.removeClient(q);
      };
      req.on("close", cleanup);
      req.on("error", cleanup);

      void (async () => {
        try {
          for await (const ev of q) {
            res.write(formatSse(ev));
          }
        } catch {
          /* client went away */
        } finally {
          cleanup();
          res.end();
        }
      })();
    });

    app.get("/api/health", async (_req, res) => {
      if (!this.agent) {
        res.json({ status: "inactive" });
        return;
      }
      try {
        const h = { ...(await this.agent.health()) } as Record<string, unknown>;
        try {
          const memSt = this.agent.memory.palace.status();
          h.memory = {
            palace: this.agent.memory.palace.is_available(),
            drawers: memSt.total_drawers ?? 0,
            kg: this.agent.memory.kg.stats(),
          };
        } catch {
          /* memory optional */
        }
        res.json(h);
      } catch (e) {
        res.status(500).json({ error: errMsg(e) });
      }
    });

    app.get("/api/config", (_req, res) => {
      const cfg = loadConfigWithAutodetect() as unknown as Record<string, unknown>;
      cfg._home = AXONIZ_HOME;
      cfg._models_dir = MODELS_DIR;
      res.json(cfg);
    });

    app.get("/api/models", (_req, res) => {
      const found = new Set<string>();
      for (const d of getModelSearchDirs()) {
        if (!fs.existsSync(d)) continue;
        for (const f of findGgufs(d)) found.add(f);
      }
      res.json({
        items: [{ endpoint_id: "axoniz-endpoint", models: [...found].sort() }],
      });
    });

    app.get("/api/backends", (_req, res) => {
      res.json(listSupportedProviders());
    });

    app.get("/api/memory", (_req, res) => {
      res.json(this.agent ? this.agent.memory.all() : {});
    });

    app.get("/api/stats", (_req, res) => {
      res.json(stats.snapshot());
    });

    app.get("/api/system/stats", async (_req, res) => {
      res.json(await getSystemTelemetry());
    });

    app.get("/api/files/list", (_req, res) => {
      if (!this.agent) {
        res.status(500).json({ error: "No agent" });
        return;
      }
      res.json({ tree: this.agent.codeTools.tree(".", 3) });
    });

    app.get("/api/swarm/status", (_req, res) => {
      const cfg = loadConfig();
      resolveSwarmModels(cfg);
      const swarm = (cfg.swarm_models ?? {}) as unknown as Record<string, string>;
      const status: Record<string, { path: string; name: string; ready: boolean }> = {};
      for (const [role, fpath] of Object.entries(swarm)) {
        status[role] = {
          path: fpath,
          name: fpath ? path.basename(fpath) : "",
          ready: Boolean(fpath && fs.existsSync(fpath)),
        };
      }
      const expertMode = Object.values(status).some((v) => v.ready);
      res.json({
        expert_mode: expertMode,
        roles: status,
        description: expertMode
          ? "Domain-expert swarm active — models hot-swap per phase"
          : "Standard swarm mode — single model for all phases",
      });
    });

    /* ── POST API ──────────────────────────────────────────────────────── */
    app.post("/api/auth/login", async (req, res) => {
      const username = String(req.body?.username ?? "");
      const password = String(req.body?.password ?? "");
      if (auth.verifyPassword(username, password)) {
        const token = await auth.createToken(username);
        res.json({ token, username });
        return;
      }
      res.status(401).json({ error: "Invalid credentials" });
    });

    app.post("/api/voice/stt", upload.single("audio"), async (req, res) => {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: "Invalid STT request format" });
        return;
      }
      const tmp = path.join(os.tmpdir(), `axoniz-stt-${crypto.randomUUID()}.webm`);
      try {
        fs.writeFileSync(tmp, file.buffer);
        const { STTEngine } = (await import("../voice/stt.js")) as {
          STTEngine: new () => { transcribe(p: string): Promise<string> };
        };
        const engine = new STTEngine();
        const text = await engine.transcribe(tmp);
        if (text) {
          res.json({ text });
          return;
        }
        res.status(500).json({ error: "Transcription failed" });
      } catch (e) {
        res.status(500).json({ error: errMsg(e) });
      } finally {
        try {
          fs.rmSync(tmp, { force: true });
        } catch {
          /* ignore */
        }
      }
    });

    app.post("/api/models/download", (req, res) => {
      const repoId = req.body?.repo_id;
      const filename = req.body?.filename;
      if (!repoId || !filename) {
        res.status(400).json({ error: "Missing repo_id or filename" });
        return;
      }
      res.json({ message: downloadModelAsync(String(repoId), String(filename)) });
    });

    app.post("/api/agent/task", (req, res) => {
      const conversationId = String(req.body?.conversationId ?? "default");
      const userId = String(req.body?.userId ?? "default");
      const intent = String(req.body?.intent ?? req.body?.message ?? "").trim();
      const modality = String(req.body?.modality ?? "text");

      if (!intent) {
        res.status(400).json({ error: "Missing intent" });
        return;
      }
      const taskId = `task_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
      void this.runAgentTaskBg(taskId, intent, conversationId, userId, modality);
      res.json({ taskId, status: "started" });
    });

    app.post("/api/chat", async (req, res) => {
      const message = String(req.body?.message ?? req.body?.content ?? "").trim();
      const mode = String(req.body?.mode ?? "chat");
      if (!message || !this.agent) {
        res.status(400).json({ error: "Bad request" });
        return;
      }
      this.openSse(res);

      const abortFlag = new AbortFlagClass();
      const requestId = crypto.randomUUID();
      this.aborts.set(requestId, abortFlag);
      req.on("close", () => abortFlag.set());

      try {
        if (mode === "agent") await this.agentSse(message, abortFlag, res);
        else await this.chatSse(message, abortFlag, res);
      } catch (e) {
        this.writeSse(res, { type: "error", error: errMsg(e) });
      } finally {
        this.aborts.delete(requestId);
        try {
          res.write("data: [CLOSE]\n\n");
        } catch {
          /* ignore */
        }
        res.end();
      }
    });

    app.post("/api/config/save", (req, res) => {
      const cfg = loadConfig() as unknown as Record<string, unknown>;
      deepMerge(cfg, (req.body ?? {}) as Record<string, unknown>);
      saveConfig(cfg);
      if (this.agent) {
        this.agent.applyConfig(cfg as unknown as AxonizConfig);
      }
      res.json({ status: "saved" });
    });

    app.post("/api/providers/test", async (req, res) => {
      const provider = String(req.body?.provider ?? "openai");
      const testCfg = {
        llm: {
          active_provider: provider,
          providers: { [provider]: req.body?.config ?? {} },
        },
      } as unknown as AxonizConfig;
      try {
        const b = getBackend(testCfg);
        res.json(await b.healthCheck());
      } catch (e) {
        res.json({ status: "error", error: errMsg(e) });
      }
    });

    app.post("/api/model/switch", (req, res) => {
      const modelName = String(req.body?.path ?? "").trim();
      if (!modelName) {
        res.json({ ok: false, msg: "No model name provided" });
        return;
      }

      const cfg = loadConfig() as unknown as Record<string, unknown>;
      let fullPath: string | null = null;

      if (fs.existsSync(modelName)) {
        fullPath = modelName;
      } else {
        for (const d of getModelSearchDirs()) {
          if (!fs.existsSync(d)) continue;
          const hit = findByName(d, modelName);
          if (hit) {
            fullPath = hit;
            break;
          }
          const candidate = path.join(d, modelName);
          if (fs.existsSync(candidate)) {
            fullPath = candidate;
            break;
          }
        }
      }

      if (!fullPath) {
        res.json({ ok: false, msg: `Model '${modelName}' not found` });
        return;
      }

      const llm = (cfg.llm ?? {}) as Record<string, unknown>;
      const prov = String(llm.active_provider ?? "llamacpp");
      const providers = (llm.providers ?? {}) as Record<string, Record<string, unknown>>;
      providers[prov] = providers[prov] ?? {};
      providers[prov].model_path = fullPath;
      llm.providers = providers;
      cfg.llm = llm;
      saveConfig(cfg);

      if (this.agent) {
        this.agent.applyConfig(cfg as unknown as AxonizConfig);
        stats.inc("model_switches");
      }

      broker.broadcast("model_switched", {
        model: path.basename(fullPath),
        path: fullPath,
      });
      res.json({ ok: true, loaded: path.basename(fullPath) });
    });

    app.post("/api/reset", (_req, res) => {
      this.agent?.reset();
      res.json({ status: "reset" });
    });

    /* ── Next.js dashboard proxy ───────────────────────────────────────
     *
     * Every non-API GET request is proxied to the Next.js dev server
     * running on http://localhost:3000 (spawned in start()). The
     * Express server keeps all /api/* routes; the dashboard is the
     * only thing that gets proxied. This means a single port (:7860)
     * gives users both the API and the new dashboard — no second
     * URL to remember.
     *
     * Fallback: if the Next.js dev server isn't running (spawn failed,
     * web-next/ missing, etc.), fall back to the legacy static UI at
     * src/web/static/ so the system never goes dark. A clear log line
     * tells the operator which UI is being served.
     */
    app.use(async (req, res, next) => {
      // /api/* is handled by the routes above — never proxy.
      if (req.path.startsWith("/api/")) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      // Only proxy GET/HEAD; the dashboard uses POST for its own /api/*
      // routes which are handled above. Other methods on non-API paths
      // are unusual — let them fall through to the 404 handler.
      if (req.method !== "GET" && req.method !== "HEAD") {
        next();
        return;
      }

      const devUrl = `http://localhost:3000${req.originalUrl || req.path}`;
      try {
        const upstream = await fetch(devUrl, {
          method: req.method,
          headers: sanitizeProxyHeaders(req.headers),
          redirect: "manual",
          signal: AbortSignal.timeout(30_000),
        });
        // Forward status + headers
        res.status(upstream.status);
        upstream.headers.forEach((value, key) => {
          // Skip hop-by-hop headers and host — they belong to the dev server.
          if (isHopByHop(key)) return;
          res.setHeader(key, value);
        });
        // Stream the body
        if (upstream.body) {
          const reader = upstream.body.getReader();
          const push = async () => {
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                res.write(value);
              }
            } finally {
              res.end();
            }
          };
          void push();
        } else {
          res.end();
        }
      } catch (e) {
        // Dev server not reachable — fall back to legacy static UI if present.
        const hit = resolveStatic(req.path);
        if (hit) {
          const noCache = hit.full.endsWith(".html") || req.path === "/";
          res.setHeader("Cache-Control", noCache ? "no-cache" : "max-age=3600");
          res.setHeader("X-Axoniz-Ui", "legacy-static-fallback");
          res.type(hit.mime).sendFile(hit.full);
          return;
        }
        if (!req.path.includes(".")) {
          const index = resolveStatic("index.html");
          if (index) {
            res.setHeader("X-Axoniz-Ui", "legacy-static-fallback");
            res.type("text/html; charset=utf-8").sendFile(index.full);
            return;
          }
        }
        res
          .status(502)
          .setHeader("Content-Type", "text/plain; charset=utf-8")
          .send(
            `Next.js dev server not reachable at ${devUrl}\n` +
              `Make sure 'bun run dev' (or 'npm run dev') is running in ${WEB_NEXT_DIR}.\n` +
              `Error: ${e instanceof Error ? e.message : String(e)}`,
          );
      }
    });

    app.use("/{*splat}", (_req, res) => {
      res.status(404).json({ error: "Not found" });
    });

    return app;
  }

  /* ── SSE helpers ─────────────────────────────────────────────────────── */

  private openSse(res: Response): void {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": "*",
    });
    // Flush headers immediately so the client sees the stream open.
    res.flushHeaders?.();
  }

  private writeSse(res: Response, ev: unknown): boolean {
    try {
      res.write(`data: ${JSON.stringify(ev, jsonReplacer)}\n\n`);
      return true;
    } catch {
      return false;
    }
  }

  private async chatSse(message: string, abortFlag: AbortFlag, res: Response): Promise<void> {
    stats.inc("chat_turns");
    try {
      for await (const token of this.agent!.chatStream(message)) {
        if (abortFlag.isSet()) break;
        if (!this.writeSse(res, { type: "token", token })) break;
      }
    } finally {
      this.writeSse(res, { type: "done", response: "" });
    }
  }

  private async agentSse(message: string, abortFlag: AbortFlag, res: Response): Promise<void> {
    stats.inc("agent_runs");
    const tcs: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const agent = this.agent!;

    agent.onToken = (t) => this.writeSse(res, { type: "token", token: t });
    agent.onToolCall = (n, a) => {
      tcs.push({ tool: n, args: a });
      this.writeSse(res, { type: "tool_call", tool: n, args: a });
    };
    agent.onToolResult = (n, r) => {
      this.writeSse(res, { type: "tool_result", tool: n, result: String(r).slice(0, 1000) });
    };

    try {
      const response = await agent.runAbortable(message, abortFlag);
      this.writeSse(res, { type: "done", response, tool_calls: tcs });
    } finally {
      agent.onToken = null;
      agent.onToolCall = null;
      agent.onToolResult = null;
    }
  }

  /* ── Background agent task (the "orb" activity feed) ──────────────────── */

  private async runAgentTaskBg(
    taskId: string,
    intent: string,
    conversationId: string,
    userId: string,
    modality: string,
  ): Promise<void> {
    const agent = this.agent;
    if (!agent) return;

    const t0 = Date.now();
    const uuid8 = () => crypto.randomUUID().replace(/-/g, "").slice(0, 8);

    _broker.broadcast("task_started", {
      taskId,
      conversationId,
      userId,
      intent,
      modality,
      agentState: "analyzing",
    });
    _broker.broadcast("agent_state_changed", {
      taskId,
      newState: "thinking",
      orbColor: "cyan",
      message: "Analyzing request...",
    });

    let activitiesCount = 0;
    const activeActivity = new Map<string, { id: string; start: number }>();

    agent.onToolCall = (name, args) => {
      activitiesCount += 1;
      const activityId = `act_${uuid8()}`;
      activeActivity.set(name, { id: activityId, start: Date.now() });
      _broker.broadcast("activity_started", {
        taskId,
        activityId,
        toolName: name,
        description: `Executing tool: ${name}`,
        input: args,
        estimatedDuration: 2000,
      });
      _broker.broadcast("agent_state_changed", {
        taskId,
        newState: "executing",
        orbColor: "yellow",
        message: `Running ${name}...`,
      });
    };

    agent.onToolResult = (name, result) => {
      const entry = activeActivity.get(name);
      if (entry) {
        activeActivity.delete(name);
        _broker.broadcast("activity_completed", {
          taskId,
          activityId: entry.id,
          toolName: name,
          status: String(result).toLowerCase().includes("error") ? "error" : "success",
          output: String(result).slice(0, 1000),
          duration: Date.now() - entry.start,
        });
      }
      _broker.broadcast("agent_state_changed", {
        taskId,
        newState: "thinking",
        orbColor: "cyan",
        message: "Planning next steps...",
      });
    };

    try {
      const response = await agent.run(intent);
      _broker.broadcast("agent_message", {
        taskId,
        messageId: `msg_${uuid8()}`,
        content: response,
        modality,
      });
      _broker.broadcast("task_completed", {
        taskId,
        conversationId,
        status: "success",
        result: response,
        duration: Date.now() - t0,
        activitiesCount,
      });
      _broker.broadcast("agent_state_changed", {
        taskId,
        newState: "complete",
        orbColor: "green",
      });
    } catch (e) {
      _broker.broadcast("agent_state_changed", {
        taskId,
        newState: "error",
        orbColor: "red",
        message: errMsg(e),
      });
      _broker.broadcast("task_completed", {
        taskId,
        conversationId,
        status: "failed",
        error: errMsg(e),
        duration: Date.now() - t0,
        activitiesCount,
      });
    } finally {
      agent.onToolCall = null;
      agent.onToolResult = null;
    }
  }

  private recordRequest(): void {
    stats.inc("requests");
    trackRequest("/api", "200", 0);
  }

  /* ── Lifecycle ───────────────────────────────────────────────────────── */

  /** Start listening. Resolves once the socket is bound. */
  async listen(): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.port, this.host, () => {
          resolve(`http://${this.host}:${this.port}`);
        });
        this.server.on("error", reject);
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Start the server and optionally open a browser. Blocks forever.
   *
   * On startup, also spawns the Next.js dashboard (`web-next/`) on
   * :3000 as a child process. The Express server proxies all non-API
   * GET requests to it, so visiting :7860 gives the user the new
   * dashboard (with a fallback to the legacy static UI if the
   * dev server fails to start).
   */
  async start(openBrowser = true): Promise<void> {
    const url = await this.listen();

    // Spawn the Next.js dashboard in the background. Resolve fast —
    // don't block startup if web-next/ can't be reached.
    let devReady = false;
    try {
      const dev = await spawnWebNext();
      devReady = !!dev;
    } catch (e) {
      warn(`[Web] could not spawn Next.js dashboard: ${errMsg(e)}`);
    }

    console.log(`\n  \u001b[97mAXONIZ (Axodex)\u001b[0m \u001b[90mLlamaCpp Edition\u001b[0m`);
    console.log(`  \u001b[90mweb -> \u001b[94m${url}\u001b[0m`);
    if (devReady) {
      console.log(`  \u001b[90mdashboard -> \u001b[94mhttp://localhost:3000\u001b[0m \u001b[90m(proxied)\u001b[0m`);
    } else {
      console.log(`  \u001b[90mdashboard -> \u001b[91mnot started\u001b[0m \u001b[90m(falling back to legacy static UI)\u001b[0m`);
    }
    console.log();
    info(`[Web] serving at ${url} (dashboard ${devReady ? "live" : "legacy fallback"})`);

    if (openBrowser) {
      setTimeout(() => {
        void openInBrowser(url).catch((e) => warn(`[Web] could not open browser: ${errMsg(e)}`));
      }, 1000);
    }

    // Block until the process is told to stop.
    await new Promise<void>((resolve) => {
      const shutdown = () => {
        stopWebNext();
        void this.close().finally(resolve);
      };
      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
    });
  }

  async close(): Promise<void> {
    // Stop the Next.js dev server child process.
    stopWebNext();
    broker.closeAll();
    if (!this.server) return;
    await new Promise<void>((resolve) => {
      this.server!.close(() => resolve());
    });
    this.server = null;
  }

  get expressApp(): Express {
    return this.app;
  }
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Mirror Python's `json.dumps(..., default=str)`. */
function jsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) return value.message;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function") return undefined;
  return value;
}

/* ── Proxy helpers (Next.js dashboard forwarding) ─────────────────────────── */

/**
 * RFC 7230 hop-by-hop headers — must not be forwarded by a proxy.
 * Also strips the Host header (the dev server sets its own).
 */
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length", // let the stream handle its own length
]);

function isHopByHop(headerName: string): boolean {
  return HOP_BY_HOP.has(headerName.toLowerCase());
}

/**
 * Pass through request headers to the dev server, but strip hop-by-hop
 * and Host (the dev server sets its own Host from its listen address).
 */
function sanitizeProxyHeaders(headers: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (isHopByHop(key)) continue;
    if (Array.isArray(value)) {
      out[key] = value.join(", ");
    } else if (typeof value === "string") {
      out[key] = value;
    }
  }
  return out;
}

export { broker, _broker };
export { logError };
