/**
 * CLI Bridge — centralized dynamic imports from the compiled CLI at dist/.
 *
 * This is the SINGLE connection point between the web dashboard and the
 * CLI's agent system. Every API route that needs CLI functionality goes
 * through here — no scattered dynamic imports across route files.
 *
 * The CLI is compiled to dist/ via `npm run build` in the project root.
 * This module uses dynamic import() to lazily load only what's needed,
 * when it's needed — keeping the web server fast.
 *
 * Path resolution: process.cwd() is web/ when running via the CLI's
 * spawnWebOnPort(). Going up one level reaches the project root,
 * where dist/ lives.
 */

import path from "node:path";

const DIST = path.join(process.cwd(), "..", "dist");

/**
 * eval('require') bypasses Turbopack's static module analysis. Turbopack
 * intercepts ALL import() and require() calls at build time — even
 * createRequire doesn't work. eval('require') is the standard escape
 * hatch in the Next.js/webpack world: the bundler can't see inside
 * eval so it can't try to statically resolve the path.
 *
 * This is safe because:
 *   1. We control the input path (it's computed from DIST + a hardcoded
 *      relative path, never user-supplied)
 *   2. The require'd modules are our own compiled CLI code, not user input
 *   3. The eval only runs on the server (nodejs runtime), never in the browser
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any, no-eval
const dynamicRequire = (mod: string) => (eval('require') as any)(mod);

/** Cache for already-loaded modules. */
const cache = new Map<string, unknown>();

function load<T>(relPath: string): T {
  const full = path.join(DIST, relPath);
  if (!cache.has(full)) {
    cache.set(full, dynamicRequire(full));
  }
  return cache.get(full) as T;
}

/* ── Phase 1: Agent + Tools ─────────────────────────────────────────────── */

export interface AgentConfig {
  provider?: string;
  workspace?: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  modelPath?: string;
  temperature?: number;
  maxTokens?: number;
  nCtx?: number;
  nGpuLayers?: number;
}

/** Load the CLI's canonical config from ~/.axoniz/config.json */
export function loadCliConfig(): Record<string, unknown> {
  try {
    const mod = load<{ loadConfig: () => Record<string, unknown> }>("core/config.js");
    return mod.loadConfig();
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Save config to ~/.axoniz/config.json (the CLI's canonical config).
 *
 * THROWS on failure — callers (e.g. /api/axoniz/config/cli POST route)
 * should catch and return a 500 to the client. Previously this swallowed
 * errors silently, so a broken dist/ or read-only filesystem would
 * appear as a successful save to the user.
 */
export function saveCliConfig(cfg: Record<string, unknown>): void {
  const mod = load<{ saveConfig: (cfg: Record<string, unknown>) => void }>("core/config.js");
  mod.saveConfig(cfg);
}

/** Create an Agent from the CLI's canonical config */
export function createAgent(config?: Record<string, unknown>) {
  const mod = load<{ Agent: new (cfg: Record<string, unknown>) => { chatStream: (msg: string) => AsyncGenerator<string>; run: (task: string) => Promise<string>; health: () => Promise<unknown> } }>("core/agent.js");
  const cfg = config ?? loadCliConfig();
  return new mod.Agent(cfg);
}

/** Stream chat tokens from the CLI's Agent.chatStream() */
export async function* streamAgentChat(message: string, history?: Array<{ role: string; content: string }>): AsyncGenerator<string> {
  // Try the CLI agent first (requires dist/ to be built)
  try {
    const agent = createAgent();
    for await (const tok of agent.chatStream(message)) {
      yield tok;
    }
    return;
  } catch (e) {
    // Agent module unavailable (dist/ not built) — fall back to direct HTTP proxy.
    console.warn('[chat] CLI agent unavailable, using direct proxy fallback:', e instanceof Error ? e.message : String(e));
  }

  // Direct HTTP proxy fallback — reads config and proxies to the provider
  const config = loadCliConfig();
  const llm = (config as Record<string, unknown>)?.llm as {
    active_provider?: string;
    providers?: Record<string, {
      base_url?: string;
      api_key?: string;
      model_name?: string;
      model_path?: string;
    }>;
  } | undefined;

  const provider = llm?.active_provider ?? "llamacpp";
  const providerCfg = llm?.providers?.[provider] ?? {};
  const baseUrl = providerCfg.base_url ?? "http://localhost:8080";
  const apiKey = providerCfg.api_key;
  const model = providerCfg.model_name ?? providerCfg.model_path ?? "unknown";

  // ── CONTEXT COMPRESSION ──────────────────────────────────────
  // If the history is too long (over ~4000 tokens), compress it into
  // a summary + recent messages. This prevents free-tier models
  // (OrcaRouter GLM 5.3 Flash Free, OpenRouter free) from hitting
  // their token limit when sessions accumulate 500K tokens.
  //
  // The compression is extractive (no extra LLM call) — it takes
  // the first ~200 chars of each old message and builds a summary.
  // This is fast, free, and good enough for most use cases.
  let compressedHistory = history ?? [];
  let wasCompressed = false;
  try {
    const { manageContext } = await import("./context-manager");
    const managed = await manageContext(
      (history ?? []).map(h => ({
        role: h.role as "user" | "assistant" | "system",
        content: h.content,
      })),
      {
        maxTokens: 4000,     // safe for 8K free-tier models
        recentCount: 10,     // keep last 10 messages verbatim
        useLLMSummary: false, // extractive only (no extra LLM call)
      }
    );
    compressedHistory = managed.messages;
    wasCompressed = managed.wasCompressed;
    if (wasCompressed) {
      console.log(`[chat] context compressed: ${history?.length ?? 0} messages → ${compressedHistory.length} (summary + ${10} recent)`);
    }
  } catch (e) {
    // If context-manager fails to load, just use the full history
    console.warn('[chat] context compression failed, using full history:', e instanceof Error ? e.message : String(e));
  }

  const messages = [
    ...compressedHistory.map((h) => ({ role: h.role, content: h.content })),
    { role: "user" as const, content: message },
  ];

  const url = baseUrl.endsWith("/v1")
    ? baseUrl + "/chat/completions"
    : baseUrl + "/v1/chat/completions";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: "Bearer " + apiKey } : {}),
    },
    body: JSON.stringify({ model, messages, stream: true }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error("Provider returned " + response.status + ": " + text.slice(0, 200));
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (data === "[DONE]") return;
        try {
          const parsed = JSON.parse(data);
          const token = parsed.choices?.[0]?.delta?.content;
          if (token) yield token;
        } catch { /* skip malformed SSE */ }
      }
    }
  }
}

/** Run the full agent loop (with tools, memory, swarm) */
export async function execAgent(
  goal: string,
  config?: Record<string, unknown>,
): Promise<{ result: string }> {
  const agent = createAgent(config);
  const result = await agent.run(goal);
  return { result };
}

/** Check backend health */
export async function checkBackendHealth(): Promise<unknown> {
  try {
    const agent = createAgent();
    return await agent.health();
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/* ── Phase 2: Memory ────────────────────────────────────────────────────── */

export async function queryMemory(q: string) {
  try {
    const mod = load<{ UnifiedMemory: new () => { palace: { search: (q: string, w?: unknown, r?: unknown, n?: number) => unknown; is_available: () => boolean } } }>("integrations/unified_memory.js");
    const mem = new mod.UnifiedMemory();
    if (mem.palace.is_available()) {
      return mem.palace.search(q, null, null, 5);
    }
    return { results: [], message: "palace not available" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function storeMemory(key: string, value: string) {
  try {
    const mod = load<{ UnifiedMemory: new () => { store: (k: string, v: string) => void; palace: { is_available: () => boolean; store: (w: string, r: string, c: string, a: string) => void } } }>("integrations/unified_memory.js");
    const mem = new mod.UnifiedMemory();
    if (mem.palace.is_available()) {
      mem.palace.store("memory", "session", `${key}: ${value}`, "axoniz");
      return { ok: true };
    }
    return { error: "palace not available" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getMemoryStatus() {
  try {
    const mod = load<{ UnifiedMemory: new () => { palace: { is_available: () => boolean; list_wings: () => unknown }; kg: { _get: () => { stats: () => unknown } | null; _kg: { stats: () => unknown } | null } } }>("integrations/unified_memory.js");
    const mem = new mod.UnifiedMemory();
    const palaceAvail = mem.palace.is_available();
    let kgStats: unknown = null;
    try {
      // KG uses lazy initialization — call _get() to initialize, then stats()
      const kg = mem.kg._get?.() ?? mem.kg._kg;
      if (kg?.stats) kgStats = kg.stats();
    } catch { /* KG not initialized */ }
    return {
      palace: { available: palaceAvail, wings: palaceAvail ? mem.palace.list_wings() : { wings: [] } },
      kg: { available: kgStats !== null, stats: kgStats },
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/* ── Phase 3: Swarm ─────────────────────────────────────────────────────── */

export async function runSwarm(task: string, config: AgentConfig) {
  try {
    const agentMod = load<{ Agent: new (cfg: Record<string, unknown>) => unknown }>("core/agent.js");
    const swarmMod = load<{ SwarmOrchestrator: new (agent: unknown) => { run: (task: string) => Promise<unknown> } }>("core/intelligence/swarm.js");
    const agent = new agentMod.Agent(config as Record<string, unknown>);
    const swarm = new swarmMod.SwarmOrchestrator(agent);
    const result = await swarm.run(task);
    return result;
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/* ── Phase 4: Workflows + Goals ─────────────────────────────────────────── */

export async function listWorkflows() {
  try {
    const mod = load<{ get_workflow_engine: () => { list_workflows: (enabled_only?: boolean) => unknown[] } }>("workflows/engine.js");
    const engine = mod.get_workflow_engine();
    return engine.list_workflows(false);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function runWorkflow(id: string) {
  try {
    const mod = load<{ get_workflow_engine: () => { run_now: (id: string) => Promise<unknown> } }>("workflows/engine.js");
    const engine = mod.get_workflow_engine();
    return await engine.run_now(id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function listGoals() {
  try {
    const mod = load<{ get_goal_service: () => { list_goals: (status?: string | null) => unknown[] } }>("goals/service.js");
    const svc = mod.get_goal_service();
    return svc.list_goals(null);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/* ── Phase 5: Daemon + Cost + Voice ─────────────────────────────────────── */

export async function getDaemonStatus() {
  try {
    const mod = load<{ axonizDaemon: { status?: () => unknown } }>("core/intelligence/daemon.js");
    return mod.axonizDaemon.status?.() ?? { running: false };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e), running: false };
  }
}

export async function getCostSummary() {
  try {
    const mod = load<{ CostTracker: new (pricing: { inputPricePerMTok: number; outputPricePerMTok: number }) => { getTaskTotal: () => unknown } }>("core/intelligence/cost_tracker.js");
    const tracker = new mod.CostTracker({ inputPricePerMTok: 0, outputPricePerMTok: 0 });
    return tracker.getTaskTotal();
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function synthesizeVoice(text: string) {
  try {
    const mod = load<{ get_tts: () => { synthesize: (text: string) => Promise<unknown> } }>("voice/tts.js");
    const tts = mod.get_tts();
    return await tts.synthesize(text);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/* ── Phase 6: Authentication (bcrypt + JWT via CLI core) ──────────────────── */

/**
 * Verify a username/password against the CLI's auth system.
 * Uses bcrypt + JWT from dist/core/auth.js.
 * Returns the username if valid, null if invalid OR if auth module is unavailable.
 * FAILS CLOSED — never issues a token when auth can't be verified.
 */
export function verifyCredentials(username: string, password: string): string | null {
  try {
    const mod = load<{
      getAuth: () => {
        verifyPassword: (u: string, p: string) => boolean;
        createToken: (u: string) => Promise<string>;
        verifyToken: (t: string) => Promise<string | null>;
      };
    }>("core/auth.js");
    const auth = mod.getAuth();
    if (auth.verifyPassword(username, password)) {
      return username;
    }
    return null;  // Wrong password → no token
  } catch (e) {
    // Auth module unavailable — FAIL CLOSED. No fallback.
    console.error("[auth] CLI auth module unavailable — FAILING CLOSED:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

/**
 * Create a JWT token for the given username.
 * Returns null if the auth module is unavailable — NEVER creates a local- fallback.
 */
export async function createAuthToken(username: string): Promise<string | null> {
  try {
    const mod = load<{
      getAuth: () => { createToken: (u: string) => Promise<string> };
    }>("core/auth.js");
    const auth = mod.getAuth();
    return await auth.createToken(username);
  } catch (e) {
    // FAIL CLOSED — no local- token fallback.
    console.error("[auth] Token creation failed — FAILING CLOSED:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

/**
 * Verify a JWT token. Returns the username if valid, null if invalid
 * OR if the auth module is unavailable.
 * NEVER accepts local- tokens or any token without cryptographic verification.
 */
export async function verifyAuthToken(token: string): Promise<string | null> {
  // Reject forged local- tokens immediately.
  if (token.startsWith("local-") || token.startsWith("demo-")) {
    return null;
  }
  try {
    const mod = load<{
      getAuth: () => { verifyToken: (t: string) => Promise<string | null> };
    }>("core/auth.js");
    const auth = mod.getAuth();
    return await auth.verifyToken(token);
  } catch (e) {
    // Auth module unavailable — FAIL CLOSED. No fallback verification.
    console.error("[auth] Token verification failed — FAILING CLOSED:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

/**
 * Extract the bearer token from an Authorization header.
 * Returns the token string or null.
 */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  if (authHeader.startsWith("Bearer ")) return authHeader.slice(7);
  return authHeader.startsWith("bearer ") ? authHeader.slice(7) : null;
}

/* ── Utility ────────────────────────────────────────────────────────────── */

export function getDistPath(): string {
  return DIST;
}
