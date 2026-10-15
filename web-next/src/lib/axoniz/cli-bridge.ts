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
 * Path resolution: process.cwd() is web-next/ when running via the CLI's
 * spawnWebNextOnPort(). Going up one level reaches the project root,
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
  provider: string;
  workspace: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  modelPath?: string;
  temperature?: number;
  maxTokens?: number;
  nCtx?: number;
  nGpuLayers?: number;
}

export async function createAgent(config: AgentConfig) {
  const mod = load<{ Agent: new (cfg: Record<string, unknown>) => unknown }>("core/agent.js");
  return new mod.Agent(config);
}

export async function execAgent(
  goal: string,
  config: AgentConfig,
): Promise<{ result: string; steps?: unknown[] }> {
  const mod = load<{ Agent: new (cfg: Record<string, unknown>) => { run: (goal: string) => Promise<string> } }>("core/agent.js");
  const a = new mod.Agent(config);
  const result = await a.run(goal);
  return { result };
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
    const agent = new agentMod.Agent(config);
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
    const mod = load<{ CostTracker: new () => { getTaskTotal: () => unknown } }>("core/intelligence/cost_tracker.js");
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

/* ── Utility ────────────────────────────────────────────────────────────── */

export function getDistPath(): string {
  return DIST;
}
