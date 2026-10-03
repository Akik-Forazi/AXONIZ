/**
 * AXONIZ-ZERO Startup Integration — boots every subsystem in the right order.
 * Port of axoniz/startup.py.
 *
 * Handles:
 *   - Palace / KG memory warm-up
 *   - Workflow engine start
 *   - Awareness service start (optional)
 *   - Telegram bot start (if configured)
 *   - Sidecar connection attempt
 *   - Web server init with all managers wired
 */
import process from "node:process";
import { loadConfig, loadConfigWithAutodetect, type AxonizConfig } from "./core/config.js";
import { debug, info, warn } from "./core/debug.js";
import type { Agent } from "./core/agent.js";

/* ── Step 1: Build agent ──────────────────────────────────────────────────── */

export async function bootAgent(
  cfg: AxonizConfig | null = null,
  overrides: Record<string, unknown> | null = null,
): Promise<Agent> {
  const { Agent } = await import("./core/agent.js");

  const config = (cfg ?? loadConfigWithAutodetect()) as unknown as Record<string, unknown>;
  if (overrides) {
    for (const [k, v] of Object.entries(overrides)) {
      if (v !== null && v !== undefined) config[k] = v;
    }
  }

  // Ensure a provider is set only when none is configured.
  const llm = config.llm as Record<string, unknown> | undefined;
  if (!config.provider && !config.backend && !llm?.active_provider) {
    config.provider = "llamacpp";
    config.backend = "llamacpp";
  }

  // Enable standby mode for faster startup: weights load on first use.
  if (config.standby === undefined || config.standby === null) config.standby = true;

  info(
    `[Startup] Building agent | provider=${String(config.provider)} ` +
      `model=${String(config.model_path ?? "none")}`,
  );
  return new Agent(config);
}

/* ── Step 2: Warm up memory ───────────────────────────────────────────────── */

export function bootMemory(agent: Agent): void {
  // Non-blocking warm-up.
  void (async () => {
    try {
      if (agent.memory.palace.is_available()) {
        const ctx = await agent.memory.palace.get_context();
        info(`[Memory] Palace warm | ${String(ctx).length} chars context loaded`);
      }
      const kgStats = agent.memory.kg.stats();
      info(`[Memory] KG ready | ${Number(kgStats.total_facts ?? 0)} facts`);
    } catch (e) {
      warn(`[Memory] Warm failed: ${errMsg(e)}`);
    }
  })();
}

/* ── Step 3: Workflow engine ──────────────────────────────────────────────── */

export async function bootWorkflows(agent: Agent): Promise<unknown> {
  try {
    const m = (await import("./workflows/engine.js")) as {
      getWorkflowEngine: () => {
        setAgentCallback(cb: (task: string) => Promise<string>): void;
        start(): void;
        status(): { total_workflows?: number; enabled?: number };
      };
    };
    const wf = m.getWorkflowEngine();
    wf.setAgentCallback((task: string) => agent.run(task));
    wf.start();
    const st = wf.status();
    info(`[Workflows] ${st.total_workflows ?? 0} workflows | ${st.enabled ?? 0} enabled`);
    return wf;
  } catch (e) {
    warn(`[Workflows] Failed to start: ${errMsg(e)}`);
    return null;
  }
}

/* ── Step 4: Awareness service (optional) ─────────────────────────────────── */

export async function bootAwareness(agent: Agent): Promise<unknown> {
  if (!loadConfig().awareness?.enabled) {
    debug("[Awareness] Disabled in config (set awareness.enabled=true to enable)");
    return null;
  }
  try {
    const m = (await import("./awareness/service.js")) as {
      getAwarenessService: () => {
        setSuggestionCallback(cb: (s: string) => void): void;
        start(): void;
      };
    };
    const svc = m.getAwarenessService();
    svc.setSuggestionCallback((s: string) => {
      agent.onToken?.(`\n[\u26a1 FRAZIYM AI] ${s}\n`);
    });
    svc.start();
    info("[Awareness] Service started");
    return svc;
  } catch (e) {
    warn(`[Awareness] Failed to start: ${errMsg(e)}`);
    return null;
  }
}

/* ── Step 5: Telegram bot (optional) ──────────────────────────────────────── */

export async function bootTelegram(agent: Agent): Promise<unknown> {
  try {
    const m = (await import("./comms/telegram.js")) as {
      getBot: () => { isConfigured(): boolean };
      startBot: (opts: { agentCallback: (t: string) => Promise<string> }) => void;
    };
    const bot = m.getBot();
    if (!bot.isConfigured()) {
      debug("[Telegram] Not configured (set AXONIZ_TELEGRAM_TOKEN + AXONIZ_TELEGRAM_CHAT_ID)");
      return null;
    }
    m.startBot({ agentCallback: (t: string) => agent.run(t) });
    info("[Telegram] Bot started");
    return bot;
  } catch (e) {
    warn(`[Telegram] Failed to start: ${errMsg(e)}`);
    return null;
  }
}

/* ── Step 6: Sidecar connection ───────────────────────────────────────────── */

export async function bootSidecar(): Promise<unknown> {
  try {
    const m = (await import("./sidecar/client.js")) as {
      getSidecar: () => Promise<{ is_alive(): Promise<boolean>; base_url: string }>;
    };
    const sc = await m.getSidecar();
    if (await sc.is_alive()) {
      info(`[Sidecar] Connected at ${sc.base_url}`);
      return sc;
    }
    debug("[Sidecar] Not running (optional — install Jarvis sidecar to enable)");
    return null;
  } catch (e) {
    warn(`[Sidecar] Connection failed: ${errMsg(e)}`);
    return null;
  }
}

/* ── Step 7: Web server ───────────────────────────────────────────────────── */

export async function bootWeb(
  agent: Agent,
  port = 7860,
  host = "localhost",
  openBrowser = true,
): Promise<void> {
  const { WebServer } = await import("./web/server.js");
  const ws = new WebServer({ agent, host, port });
  await ws.start(openBrowser);
}

/* ── Full boot sequence ───────────────────────────────────────────────────── */

export interface FullBootOptions {
  cfg?: AxonizConfig | null;
  overrides?: Record<string, unknown> | null;
  port?: number;
  openBrowser?: boolean;
  web?: boolean;
}

/**
 * Boot everything in the correct order and return the agent.
 * If `web` is true, blocks serving the web UI.
 */
export async function fullBoot(opts: FullBootOptions = {}): Promise<Agent> {
  const { cfg = null, overrides = null, port = 7860, openBrowser = true, web = true } = opts;

  printBootHeader();

  const agent = await bootAgent(cfg, overrides);
  printStep(
    "Agent",
    `provider=${String((agent.config as Record<string, unknown>).provider)} workspace=${agent.workspace}`,
  );

  bootMemory(agent);
  printStep("Memory", "palace + KG warming");

  // Phase: Axodex check
  const axStatus = await agent.axodex.status();
  if (axStatus.includes("ERROR")) {
    printStep("Axodex", "\u001b[91mNo index found\u001b[0m (Run 'axodex analyze')");
  } else {
    printStep("Axodex", "Graph index active");
  }

  await bootWorkflows(agent);
  printStep("Workflows", "engine running");

  await bootAwareness(agent);
  printStep("Awareness", loadConfig().awareness?.enabled ? "started" : "disabled");

  await bootTelegram(agent);

  const sc = await bootSidecar();
  printStep("Sidecar", sc ? "connected" : "offline (optional)");

  console.log();

  if (web) {
    await bootWeb(agent, port, "localhost", openBrowser);
  }

  return agent;
}

/* ── Print helpers ────────────────────────────────────────────────────────── */

function c(code: string): string {
  if (process.env.NO_COLOR || !process.stdout.isTTY) return "";
  return `\u001b[${code}m`;
}

const R = c("0");
const DG = c("90");
const GR = c("37");
const GB = c("92");
const WH = c("97");
const B = c("1");
const PU = c("95");
void WH;
void R;

function printBootHeader(): void {
  console.log();
  console.log(`  ${PU}${B}AXONIZ-ZERO - FRAZIYM AI${c("0")}  ${DG}booting...${c("0")}`);
  console.log();
}

function printStep(name: string, detail: string): void {
  const lower = detail.toLowerCase();
  const status =
    !lower.includes("fail") && !lower.includes("error") ? `${GB}+${c("0")}` : `\u001b[91m-${c("0")}`;
  console.log(`  ${status}  ${DG}${name.padEnd(14)}${c("0")}${GR}${detail}${c("0")}`);
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
