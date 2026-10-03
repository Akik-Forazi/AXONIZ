/**
 * AXONIZ-ZERO Autonomous Startup Integration
 * ===========================================
 * This module wires together all the autonomous components:
 * 1. LM Studio auto-discovery and model loading
 * 2. Voice stack initialization (STT, TTS, Wake Word)
 * 3. Background daemon startup
 * 4. Memory system warm-up
 * 5. Health monitoring
 * 6. Web UI dashboard sync
 *
 * Port of axoniz/integrations/autonomous_startup.py
 *
 * Port notes:
 *  - Python imports the optional sub-systems lazily inside `try:` blocks
 *    (`axoniz.core.lmstudio`, `axoniz.voice.*`, `axoniz.core.intelligence`).
 *    Those modules are owned by other agents and may not exist yet, so the
 *    imports are done with a *computed* dynamic `import()` (specifier built at
 *    runtime) inside try/catch — TypeScript does not resolve those statically,
 *    and each failure is reported exactly like Python's ImportError branch.
 *  - `time.sleep` → awaited `sleep()`.
 *  - `sys.exit(code)` → `process.exitCode = code` (never kills the host process).
 *  - `hasattr(memory, "knowledge_graph")` was checked in Python, but
 *    UnifiedMemory exposes the graph as `kg` — so Python always printed
 *    "Knowledge Graph: not configured". Here both names are checked.
 */
import { loadConfig } from "../core/config.js";
import { UnifiedMemory } from "./unified_memory.js";

/* Color codes for terminal output */
const C_RESET = "\u001b[0m";
const C_GRAY = "\u001b[90m";
const C_GREEN = "\u001b[92m";
const C_YELLOW = "\u001b[93m";
const C_RED = "\u001b[91m";
const C_BLUE = "\u001b[94m";
const C_CYAN = "\u001b[96m";

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    if (typeof t.unref === "function") t.unref();
  });
}

function getObj(cfg: Record<string, unknown>, key: string): Record<string, unknown> {
  const v = cfg[key];
  return v !== null && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

export interface LmStudioManagerLike {
  is_online(): boolean | Promise<boolean>;
  get_active_model(): unknown;
  get_models(): unknown[];
  load_model(name: string): { ok?: boolean; error?: string } | Promise<{ ok?: boolean; error?: string }>;
  refresh?(): unknown;
}

export interface StartupAgentLike {
  config: Record<string, unknown>;
}

/** Coordinates autonomous system startup. */
export class AutonomousStartup {
  config: Record<string, unknown>;
  components: Record<string, boolean>;
  errors: string[];

  constructor(config?: Record<string, unknown> | null) {
    this.config = config ?? {};
    this.components = {
      lm_studio: false,
      voice_stack: false,
      daemon: false,
      memory: false,
      web_server: false,
    };
    this.errors = [];
  }

  /** Non-literal dynamic import — the target modules are optional peers. */
  protected async _importModule(specifier: string): Promise<Record<string, unknown>> {
    const mod = (await import(specifier)) as Record<string, unknown>;
    return mod;
  }

  /** Start all autonomous components. Returns True if all succeed. */
  async start_all(): Promise<boolean> {
    console.log(`\n${C_CYAN}╔════════════════════════════════════════════╗${C_RESET}`);
    console.log(`${C_CYAN}║   AXONIZ-ZERO Autonomous Startup v2.0     ║${C_RESET}`);
    console.log(`${C_CYAN}╚════════════════════════════════════════════╝${C_RESET}\n`);

    // 1. LM Studio Manager
    await this._start_lm_studio();

    // 2. Voice Stack
    await this._start_voice_stack();

    // 3. Memory Systems
    await this._start_memory();

    // 4. Daemon Engine
    await this._start_daemon();

    // 5. Summary
    this._print_summary();

    return Object.values(this.components).every(Boolean);
  }

  /** Initialize the LM Studio manager with auto-load. */
  protected async _start_lm_studio(): Promise<void> {
    console.log(`${C_GRAY}[1/4]${C_RESET} LM Studio Manager...`);

    try {
      const mod = await this._importModule("../core/lmstudio.js");
      const getManager = (mod["get_manager"] ?? mod["getManager"]) as ((baseUrl?: string) => LmStudioManagerLike) | undefined;
      if (!getManager) throw new Error("get_manager not exported by core/lmstudio.js");

      const cfg = loadConfig() as unknown as Record<string, unknown>;
      const baseUrl = String(cfg["base_url"] ?? "http://127.0.0.1:1234/v1");

      const mgr = getManager(baseUrl);

      // Wait for the first poll
      await sleep(1000);

      if (await mgr.is_online()) {
        const active = mgr.get_active_model();
        const models = mgr.get_models();

        console.log(`  ${C_GREEN}✓${C_RESET} Online · ${models.length} model(s) available`);

        // Auto-load the configured model
        const targetModel = cfg["model_name"] === undefined ? undefined : String(cfg["model_name"]);
        if (targetModel && targetModel !== active) {
          console.log(`  ${C_CYAN}→${C_RESET} Auto-loading: ${targetModel}`);
          const result = await mgr.load_model(targetModel);
          if (result.ok) {
            console.log(`  ${C_GREEN}✓${C_RESET} Model loaded successfully`);
          } else {
            console.log(`  ${C_YELLOW}⚠${C_RESET} Load failed: ${result.error ?? "unknown"}`);
          }
        } else if (active) {
          console.log(`  ${C_GRAY}→${C_RESET} Active model: ${String(active)}`);
        }

        this.components["lm_studio"] = true;
      } else {
        console.log(`  ${C_YELLOW}⚠${C_RESET} LM Studio not responding at ${baseUrl}`);
        console.log(`  ${C_GRAY}  Start LM Studio and load a model to enable${C_RESET}`);
        this.errors.push("LM Studio offline");
      }
    } catch (e) {
      console.log(`  ${C_RED}✗${C_RESET} Failed: ${errText(e)}`);
      this.errors.push(`LM Studio error: ${errText(e)}`);
    }
  }

  /** Initialize voice components (STT, TTS, Wake Word). */
  protected async _start_voice_stack(): Promise<void> {
    console.log(`\n${C_GRAY}[2/4]${C_RESET} Voice Stack...`);

    try {
      // Check whether voice is enabled in config
      const cfg = loadConfig() as unknown as Record<string, unknown>;
      const voice = getObj(cfg, "voice");

      if (!voice["enabled"]) {
        console.log(`  ${C_GRAY}−${C_RESET} Disabled in config (set voice.enabled=true to enable)`);
        return;
      }

      // Initialize TTS
      try {
        const mod = await this._importModule("../voice/tts.js");
        const getTts = (mod["get_tts"] ?? mod["getTts"]) as ((...a: unknown[]) => unknown) | undefined;
        if (!getTts) throw new Error("get_tts not exported by voice/tts.js");
        getTts();
        const engine = String(getObj(voice, "tts")["engine"] ?? "kokoro");
        console.log(`  ${C_GREEN}✓${C_RESET} TTS: ${engine}`);
        this.components["voice_stack"] = true;
      } catch (e) {
        console.log(`  ${C_YELLOW}⚠${C_RESET} TTS unavailable: ${errText(e)}`);
      }

      // Initialize STT
      try {
        const mod = await this._importModule("../voice/stt.js");
        const getStt = (mod["get_stt"] ?? mod["getStt"]) as ((...a: unknown[]) => unknown) | undefined;
        if (!getStt) throw new Error("get_stt not exported by voice/stt.js");
        getStt();
        const engine = String(getObj(voice, "stt")["engine"] ?? "moonshine");
        console.log(`  ${C_GREEN}✓${C_RESET} STT: ${engine}`);
      } catch (e) {
        console.log(`  ${C_YELLOW}⚠${C_RESET} STT unavailable: ${errText(e)}`);
      }

      // Initialize Wake Word
      try {
        const mod = await this._importModule("../voice/wake_word.js");
        const getWakeWord = (mod["get_wake_word"] ?? mod["getWakeWord"]) as ((...a: unknown[]) => unknown) | undefined;
        if (!getWakeWord) throw new Error("get_wake_word not exported by voice/wake_word.js");
        getWakeWord();
        const phrase = String(getObj(voice, "wake_word")["phrase"] ?? "hey axoniz");
        console.log(`  ${C_GREEN}✓${C_RESET} Wake word: '${phrase}'`);
      } catch (e) {
        console.log(`  ${C_YELLOW}⚠${C_RESET} Wake word unavailable: ${errText(e)}`);
      }
    } catch (e) {
      console.log(`  ${C_RED}✗${C_RESET} Failed: ${errText(e)}`);
      this.errors.push(`Voice stack error: ${errText(e)}`);
    }
  }

  /** Initialize the unified memory system. */
  protected async _start_memory(): Promise<void> {
    console.log(`\n${C_GRAY}[3/4]${C_RESET} Memory Systems...`);

    try {
      const memory = new UnifiedMemory();

      // Check Palace (local SQLite drawer store)
      try {
        const status = memory.palace ? memory.palace.status() : {};
        if (status) {
          const drawers = Number((status as Record<string, unknown>)["total_drawers"] ?? 0);
          console.log(`  ${C_GREEN}✓${C_RESET} Palace: ${drawers} memory drawers`);
        }
      } catch {
        console.log(`  ${C_GRAY}−${C_RESET} Palace: not configured`);
      }

      // Check Diary
      try {
        if (memory.diary) {
          console.log(`  ${C_GREEN}✓${C_RESET} Diary: chronological logging active`);
        }
      } catch {
        console.log(`  ${C_GRAY}−${C_RESET} Diary: not configured`);
      }

      // Check Knowledge Graph (Python checked `knowledge_graph`; the real
      // attribute is `kg`, so both are accepted here).
      try {
        const kg = (memory as unknown as Record<string, unknown>)["knowledge_graph"] ?? memory.kg;
        if (kg) {
          console.log(`  ${C_GREEN}✓${C_RESET} Knowledge Graph: relationship tracking active`);
        }
      } catch {
        console.log(`  ${C_GRAY}−${C_RESET} Knowledge Graph: not configured`);
      }

      this.components["memory"] = true;
    } catch (e) {
      console.log(`  ${C_YELLOW}⚠${C_RESET} Partial initialization: ${errText(e)}`);
    }
  }

  /** Initialize the background daemon engine. */
  protected async _start_daemon(): Promise<void> {
    console.log(`\n${C_GRAY}[4/4]${C_RESET} Daemon Engine...`);

    try {
      const cfg = loadConfig() as unknown as Record<string, unknown>;
      if (!getObj(cfg, "daemon")["enabled"]) {
        console.log(`  ${C_GRAY}−${C_RESET} Disabled in config (set daemon.enabled=true to enable)`);
        return;
      }

      const mod = await this._importModule("../core/intelligence/index.js");
      const DaemonCtor = (mod["axonizDaemon"] ?? mod["AxonizDaemon"]) as (new () => { start(): unknown }) | undefined;
      if (!DaemonCtor) throw new Error("axonizDaemon not exported by core/intelligence/index.js");

      const daemon = new DaemonCtor();

      // Start the daemon in the background
      await daemon.start();

      console.log(`  ${C_GREEN}✓${C_RESET} Background tasks active`);
      console.log(`  ${C_GRAY}  File watching and scheduled tasks enabled${C_RESET}`);

      this.components["daemon"] = true;
    } catch (e) {
      console.log(`  ${C_YELLOW}⚠${C_RESET} Not started: ${errText(e)}`);
    }
  }

  /** Print the startup summary. */
  protected _print_summary(): void {
    console.log(`\n${C_GRAY}${"─".repeat(46)}${C_RESET}`);

    const total = Object.keys(this.components).length;
    const active = Object.values(this.components).filter(Boolean).length;

    let status: string;
    if (active === total) {
      status = `${C_GREEN}All systems operational${C_RESET}`;
    } else if (active > 0) {
      status = `${C_YELLOW}Partial: ${active}/${total} components active${C_RESET}`;
    } else {
      status = `${C_RED}Failed to start${C_RESET}`;
    }

    console.log(`\n  Status: ${status}`);

    if (this.errors.length > 0) {
      console.log(`\n  ${C_YELLOW}Warnings:${C_RESET}`);
      for (const error of this.errors) {
        console.log(`    • ${error}`);
      }
    }

    console.log(`\n${C_GRAY}Ready for autonomous operation${C_RESET}`);
    console.log();
  }

  /** Comprehensive health check for all components. */
  async health_check(): Promise<{ overall: string; components: Record<string, Record<string, unknown>> }> {
    const health: { overall: string; components: Record<string, Record<string, unknown>> } = {
      overall: "healthy",
      components: {},
    };

    // LM Studio
    try {
      const mod = await this._importModule("../core/lmstudio.js");
      const getManager = (mod["get_manager"] ?? mod["getManager"]) as ((baseUrl?: string) => LmStudioManagerLike) | undefined;
      if (!getManager) throw new Error("get_manager not exported by core/lmstudio.js");
      const mgr = getManager();
      if (mgr.refresh) await mgr.refresh(); // Force poll

      health.components["lm_studio"] = {
        status: (await mgr.is_online()) ? "ok" : "offline",
        active_model: mgr.get_active_model(),
        available_models: mgr.get_models().length,
      };
    } catch (e) {
      health.components["lm_studio"] = { status: "error", error: errText(e) };
    }

    // Voice
    try {
      const cfg = loadConfig() as unknown as Record<string, unknown>;
      const voice = getObj(cfg, "voice");
      const voiceEnabled = Boolean(voice["enabled"]);

      health.components["voice"] = {
        status: voiceEnabled ? "enabled" : "disabled",
        tts_engine: String(getObj(voice, "tts")["engine"] ?? "none"),
        stt_engine: String(getObj(voice, "stt")["engine"] ?? "none"),
      };
    } catch (e) {
      health.components["voice"] = { status: "error", error: errText(e) };
    }

    // Memory
    try {
      new UnifiedMemory();
      health.components["memory"] = {
        status: "ok",
        systems: ["palace", "diary", "knowledge_graph", "tfidf"],
      };
    } catch (e) {
      health.components["memory"] = { status: "error", error: errText(e) };
    }

    // Check whether any component failed
    for (const component of Object.values(health.components)) {
      if (component["status"] === "error" || component["status"] === "offline") {
        health.overall = "degraded";
      }
    }

    return health;
  }
}

/**
 * Auto-load the configured model in LM Studio on agent startup.
 * Called by WebServer.__init__ and runner.py
 */
export async function auto_load_model_on_startup(agent: StartupAgentLike): Promise<boolean> {
  try {
    const mod = await (async (): Promise<Record<string, unknown>> => {
      const spec = "../core/lmstudio.js";
      return (await import(spec)) as Record<string, unknown>;
    })();
    const getManager = (mod["get_manager"] ?? mod["getManager"]) as ((baseUrl?: string) => LmStudioManagerLike) | undefined;
    if (!getManager) throw new Error("get_manager not exported by core/lmstudio.js");

    const modelName = agent.config["model_name"] === undefined ? undefined : String(agent.config["model_name"]);
    const provider = agent.config["provider"] ?? agent.config["backend"];

    // Only auto-load when using LM Studio
    if (provider !== "lmstudio" || !modelName) {
      return false;
    }

    const mgr = getManager();

    // Check whether it is already loaded
    const current = mgr.get_active_model();
    if (current === modelName) {
      console.log(`  ${C_GRAY}[Auto-Load]${C_RESET} Model already active: ${modelName}`);
      return true;
    }

    // Request load
    console.log(`  ${C_CYAN}[Auto-Load]${C_RESET} Requesting LM Studio to load: ${modelName}`);
    const result = await mgr.load_model(modelName);

    if (result.ok) {
      console.log(`  ${C_GREEN}✓${C_RESET} Model loaded successfully`);

      // Give LM Studio time to load
      await sleep(2000);

      // Verify
      if (mgr.refresh) await mgr.refresh();
      const now = mgr.get_active_model();
      if (now === modelName) {
        console.log(`  ${C_GREEN}✓${C_RESET} Verified: ${modelName} is active`);
        return true;
      }
      console.log(`  ${C_YELLOW}⚠${C_RESET} Model load pending (may take a few seconds)`);
      return false;
    }

    console.log(`  ${C_YELLOW}⚠${C_RESET} Load failed: ${result.error ?? "unknown error"}`);
    return false;
  } catch (e) {
    console.log(`  ${C_YELLOW}⚠${C_RESET} Auto-load error: ${errText(e)}`);
    return false;
  }
}

export const autoLoadModelOnStartup = auto_load_model_on_startup;

/* ── CLI ─────────────────────────────────────────────────────────────────── */

/** CLI for the autonomous startup integration (`--check` / `--start`). */
export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const startup = new AutonomousStartup();

  if (argv.includes("--check")) {
    console.log("\nRunning health check...\n");
    const health = await startup.health_check();
    console.log(JSON.stringify(health, null, 2));
    process.exitCode = health.overall === "healthy" ? 0 : 1;
    return process.exitCode;
  }

  if (argv.includes("--start")) {
    const success = await startup.start_all();
    process.exitCode = success ? 0 : 1;
    return process.exitCode;
  }

  // Default: show status
  await startup.start_all();
  return 0;
}

/** ESM equivalent of `if __name__ == "__main__": main()`. */
const invokedDirectly =
  typeof process.argv[1] === "string" &&
  /autonomous_startup\.(ts|js)$/.test(process.argv[1]);

if (invokedDirectly) {
  void main();
}
