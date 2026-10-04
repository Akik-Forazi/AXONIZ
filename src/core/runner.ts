/**
 * AXONIZ-ZERO — Runner
 * Port of axoniz/core/runner.py.
 *
 * A hand-rolled argument parser is used instead of a framework so that the
 * exact Python semantics are preserved: free-form positional arguments that may
 * also be subcommands (`config`, `model`, `memory`, `palace`, `setup`).
 */
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import process from "node:process";
import { execSync } from "node:child_process";
import {
  loadConfig,
  loadConfigWithAutodetect,
  saveConfig,
  showConfig,
  resetConfig,
  MODELS_DIR,
  AXONIZ_HOME,
  activeProvider,
  type AxonizConfig,
} from "./config.js";
import { debug, error as logError, getLogger } from "./debug.js";
import { resolveCommand } from "../tools/_internal.js";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const _pkgPath = path.join(__dirname, "../../package.json");
const _pkg = JSON.parse(fs.readFileSync(_pkgPath, "utf8"));
export const VERSION = _pkg.version;

// AXONIZ_VERSION is the FRAZIYM-format version (V00.01.000-beta-01).
// VERSION above is the semver translation (0.1.0-beta.1) used by npm.
// Both are kept in sync via tests/version.test.ts. The CLI banner shows
// the FRAZIYM version because that's the canonical identity.
import { AXONIZ_VERSION } from "../version.js";
export { AXONIZ_VERSION };

/* ── Colour ───────────────────────────────────────────────────────────────── */

function c(code: string): string {
  if (process.env.NO_COLOR || !process.stdout.isTTY) return "";
  return `\u001b[${code}m`;
}

const R = c("0");
const B = c("1");
const DG = c("90");
const GR = c("37");
const BL = c("94");
const GB = c("92");
const YL = c("93");
const RD = c("91");
const WH = c("97");
const CY = c("96");
const PURPLE = c("95");

export class C {
  static RESET = R;
  static BOLD = B;
  static GRAY = DG;
  static DGRAY = DG;
  static WHITE = WH;
  static BLUE = BL;
  static GREEN = GB;
  static YELLOW = YL;
  static RED = RD;
  static CYAN = CY;
  static PURPLE = PURPLE;
}

export function printBanner(model = "", backend = ""): void {
  console.log();
  console.log(`  ${PURPLE}${B}FRAZIYM AI${R}  ${DG}${AXONIZ_VERSION}${R}`);
  console.log(`  ${DG}local ai agent \u00b7 ${backend} \u00b7 ${model || "auto"}${R}`);
  console.log();
}

export function kv(key: string, val: unknown): void {
  console.log(`  ${DG}${key.padEnd(18)}${R}${GR}${String(val)}${R}`);
}

export function section(title: string): void {
  console.log(
    `\n  ${DG}${title.toUpperCase()}${R}\n  ${DG}${"-".repeat(Math.min(title.length + 4, 60))}${R}`,
  );
}

/* ── Argument parsing ─────────────────────────────────────────────────────── */

export interface Args {
  positional: string[];
  lc: boolean;
  cli: boolean;
  web: boolean;
  goal: string | null;
  pipe: boolean;
  provider: string | null;
  model_name: string | null;
  model_path: string | null;
  base_url: string | null;
  n_gpu_layers: number | null;
  max_steps: number | null;
  temperature: number | null;
  max_tokens: number | null;
  n_ctx: number | null;
  workspace: string | null;
  port: number;
  help: boolean;
  version: boolean;
}

export function makeDefaultArgs(): Args {
  return {
    positional: [],
    lc: false,
    cli: false,
    web: false,
    goal: null,
    pipe: false,
    provider: null,
    model_name: null,
    model_path: null,
    base_url: null,
    n_gpu_layers: null,
    max_steps: null,
    temperature: null,
    max_tokens: null,
    n_ctx: null,
    workspace: null,
    port: 7860,
    help: false,
    version: false,
  };
}

const PROVIDERS = ["llamacpp", "llamacpp_server", "lmstudio", "ollama", "openai", "openrouter", "gemini", "anthropic", "groq", "together", "mistral", "deepseek", "fireworks", "perplexity", "custom"];

/** Parse argv (already sliced past `node script`). */
export function parseArgs(argv: string[]): Args {
  const a = makeDefaultArgs();

  const takesValue = new Set([
    "--goal",
    "--provider",
    "--model",
    "--model-path",
    "--url",
    "--gpu-layers",
    "--steps",
    "--temp",
    "--tokens",
    "--ctx",
    "--workspace",
    "--port",
  ]);

  const num = (v: string | undefined): number | null => {
    if (v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    // Support --key=value form.
    let key = arg;
    let inlineValue: string | undefined;
    if (arg.startsWith("--") && arg.includes("=")) {
      const idx = arg.indexOf("=");
      key = arg.slice(0, idx);
      inlineValue = arg.slice(idx + 1);
    }

    const value = (): string | undefined => {
      if (inlineValue !== undefined) return inlineValue;
      if (takesValue.has(key) && i + 1 < argv.length) {
        i += 1;
        return argv[i];
      }
      return undefined;
    };

    switch (key) {
      case "--lc":
        a.lc = true;
        break;
      case "--cli":
        a.cli = true;
        break;
      case "--web":
      case "-w":
        a.web = true;
        break;
      case "--pipe":
        a.pipe = true;
        break;
      case "--goal":
        a.goal = value() ?? null;
        break;
      case "--provider": {
        const p = value();
        if (p && !PROVIDERS.includes(p)) {
          process.stderr.write(
            `argument --provider: invalid choice: '${p}' (choose from ${PROVIDERS.join(", ")})\n`,
          );
          process.exit(2);
        }
        a.provider = p ?? null;
        break;
      }
      case "--model":
        a.model_name = value() ?? null;
        break;
      case "--model-path":
        a.model_path = value() ?? null;
        break;
      case "--url":
        a.base_url = value() ?? null;
        break;
      case "--gpu-layers":
        a.n_gpu_layers = num(value());
        break;
      case "--steps":
        a.max_steps = num(value());
        break;
      case "--temp":
        a.temperature = num(value());
        break;
      case "--tokens":
        a.max_tokens = num(value());
        break;
      case "--ctx":
        a.n_ctx = num(value());
        break;
      case "--workspace":
        a.workspace = value() ?? null;
        break;
      case "--port":
        a.port = num(value()) ?? 7860;
        break;
      case "--help":
      case "-h":
        a.help = true;
        break;
      case "--version":
        a.version = true;
        break;
      default:
        if (arg.startsWith("-") && arg !== "-") {
          process.stderr.write(`unrecognized argument: ${arg}\n`);
          process.exit(2);
        }
        a.positional.push(arg);
        break;
    }
  }

  return a;
}

/* ── Overrides ────────────────────────────────────────────────────────────── */

export function overridesFromArgs(args: Args): Record<string, unknown> {
  const ov: Record<string, unknown> = {};
  const keys: Array<keyof Args> = [
    "model_name",
    "model_path",
    "base_url",
    "max_steps",
    "temperature",
    "max_tokens",
    "n_ctx",
    "workspace",
    "n_gpu_layers",
  ];
  for (const k of keys) {
    const v = args[k];
    if (v !== null && v !== undefined) ov[k] = v;
  }
  // Only override the provider when explicitly set on the CLI.
  if (args.provider) {
    ov.provider = args.provider;
    ov.backend = args.provider;
  }
  return ov;
}

/* ── Help ─────────────────────────────────────────────────────────────────── */

export const HELP = `
  ${WH}${B}AXONIZ-ZERO${R}  ${DG}${AXONIZ_VERSION}  \u2014 local AI agent${R}

  ${B}MODES${R}
    ${BL}--web${R}           Launch dashboard at localhost:7860
                          (spawns Next.js UI on :3000, proxied through :7860)
    ${BL}--lc${R}            Interactive REPL
    ${BL}--cli${R}           One-shot task then exit
    ${BL}--goal "..."${R}    Autonomous goal mode (plan → execute → verify)
    ${BL}--pipe${R}          Read task from stdin
    ${BL}--version${R}       Print version and exit

  ${B}BACKEND${R}
    ${BL}--provider <p>${R}   Backend: llamacpp, llamacpp_server, lmstudio, ollama, openai,
                          openrouter, gemini, anthropic, groq, together, mistral,
                          deepseek, fireworks, perplexity, custom
    ${BL}--model-path <p>${R}  Path to .gguf model (llamacpp only)
    ${BL}--url <url>${R}       Base URL for server backends
    ${BL}--gpu-layers <n>${R}  GPU layers (llamacpp only)
    ${BL}--ctx <n>${R}         Context window (llamacpp, default 32768)
    ${BL}--temp 0.2${R}       Temperature
    ${BL}--tokens 4096${R}    Max output tokens

  ${B}SUBCOMMANDS${R}
    ${BL}axoniz install axodex${R}  Install axodex (npm install -g @fraziym/axodex)
    ${BL}axoniz version check${R}  Check if a version bump is needed (runs @fraziym/axovb)
    ${BL}axoniz version bump${R}   Auto-bump version if needed (runs @fraziym/axovb)
    ${BL}axoniz test${R}           Run multi-agent tests after dev (runs @fraziym/axotest)
    ${BL}axoniz config show${R}     Show config
    ${BL}axoniz config set k=v${R}  Set config value
    ${BL}axoniz model list${R}      List models
    ${BL}axoniz model use <n>${R}   Switch model
    ${BL}axoniz memory${R}          Show memory
    ${BL}axoniz palace${R}          Show palace status
    ${BL}axoniz health${R}          System health report

  ${B}VERSION${R}
    ${DG}FRAZIYM:${R} ${AXONIZ_VERSION}
    ${DG}npm:${R}     ${VERSION}
`;

/* ── Runner ───────────────────────────────────────────────────────────────── */

export class Runner {
  cfg: AxonizConfig;

  constructor() {
    this.cfg = loadConfig();
  }

  async buildAgent(overrides: Record<string, unknown> = {}): Promise<import("./agent.js").Agent> {
    const cfg = loadConfigWithAutodetect() as unknown as Record<string, unknown>;
    const clean = Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== null && v !== undefined));
    Object.assign(cfg, clean);

    if (clean.model_path) cfg.model_name = path.basename(String(clean.model_path));

    // Default to llamacpp only when no provider is configured at all.
    const active = cfg.provider ?? cfg.backend ?? (cfg.llm as Record<string, unknown> | undefined)?.active_provider;
    if (!active) {
      cfg.provider = "llamacpp";
      cfg.backend = "llamacpp";
    }

    const { Agent } = await import("./agent.js");
    return new Agent(cfg);
  }

  async checkBackend(agent: import("./agent.js").Agent): Promise<boolean> {
    await agent.health();
    return true;
  }
}

/* ── Interactive model selection ──────────────────────────────────────────── */

async function interactiveModelSelect(): Promise<string | null> {
  console.log(`\n  ${WH}${B}autonomous VAULT SCAN${R}`);
  console.log(`  ${DG}Scanning for GGUF models in ${MODELS_DIR}...${R}\n`);

  const found: string[] = [];
  collectGguf(MODELS_DIR, found, 0);

  if (found.length === 0) {
    console.log(`  ${RD}[-] No GGUF models found in vault.${R}`);
    console.log(`  ${DG}HINT: Place models in ${MODELS_DIR} or use 'axoniz model download'${R}\n`);
    return null;
  }

  found.forEach((p, i) => {
    const name = path.basename(p);
    let sizeGb = 0;
    try {
      sizeGb = fs.statSync(p).size / 1024 ** 3;
    } catch {
      /* ignore */
    }
    console.log(`  ${BL}[${i + 1}]${R}  ${WH}${name.padEnd(40)}${R}  ${DG}${sizeGb.toFixed(1)} GB${R}`);
  });

  console.log(`\n  ${DG}Enter number to select or path to a different GGUF:${R}`);

  if (!process.stdin.isTTY) return null;

  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const choice = (await rl.question(`  ${CY}Selection: ${R}`)).trim();
    if (!choice) return null;

    if (/^\d+$/.test(choice)) {
      const idx = Number(choice) - 1;
      if (idx >= 0 && idx < found.length) return found[idx];
    }
    if (fs.existsSync(choice)) return path.resolve(choice);

    console.log(`  ${RD}[-] Invalid selection.${R}`);
    return null;
  } catch {
    return null;
  } finally {
    rl.close();
  }
}

function collectGguf(dir: string, acc: string[], depth: number): void {
  if (depth > 6) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) collectGguf(full, acc, depth + 1);
    else if (e.name.toLowerCase().endsWith(".gguf")) acc.push(full);
  }
}

/* ── Main ─────────────────────────────────────────────────────────────────── */

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const pos = args.positional;

  if (args.version) {
    console.log(`axoniz-zero ${AXONIZ_VERSION}  (npm: ${VERSION})`);
    return;
  }
  if (args.help) {
    console.log(HELP);
    return;
  }

  if (pos[0] === "install") {
    const { installIntegration } = await import("../integrations/installer.js");
    if (pos.length < 2) {
      console.error("Usage: axoniz install <repository-url-or-name>");
      process.exitCode = 1;
      return;
    }
    installIntegration(pos[1]);
    return;
  }

  // AXOVB integration — version check/bump
  if (pos[0] === "version") {
    const action = pos[1] ?? "check";
    const axovbBin = resolveCommand("axovb");
    if (!axovbBin) {
      console.log(`  ${RD}[-] axovb not found. Install with: npm install -g @fraziym/axovb${R}\n`);
      process.exitCode = 1;
      return;
    }
    try {
      execSync(`"${axovbBin}" ${action}`, {
        cwd: process.cwd(),
        stdio: "inherit",
      });
    } catch {
      process.exitCode = 1;
    }
    return;
  }

  // AXOTEST integration — multi-agent testing
  if (pos[0] === "test") {
    const axotestBin = resolveCommand("axotest");
    if (!axotestBin) {
      console.log(`  ${RD}[-] axotest not found. Install with: npm install -g @fraziym/axotest${R}\n`);
      process.exitCode = 1;
      return;
    }
    const extraArgs = pos.slice(1).join(" ");
    try {
      execSync(`"${axotestBin}" run ${extraArgs}`.trim(), {
        cwd: process.cwd(),
        stdio: "inherit",
      });
    } catch {
      process.exitCode = 1;
    }
    return;
  }

  const runner = new Runner();
  const cfg = runner.cfg;
  const ov = overridesFromArgs(args);

  const logger = getLogger();
  logger.info(`CLI started | version=${VERSION} | args=${JSON.stringify(args)}`);
  logger.logEvent("cli_start", { version: VERSION, args });

  // ── Autonomous model selection ──
  const provider = String(
    ov.provider ?? activeProvider(cfg as unknown as AxonizConfig),
  );
  const isLocalGguf = provider === "llamacpp" || provider === "gguf";
  const cfgAny = cfg as unknown as Record<string, unknown>;

  if (
    (args.lc || args.goal || args.cli) &&
    isLocalGguf &&
    !ov.model_path &&
    !cfgAny.model_path
  ) {
    const selected = await interactiveModelSelect();
    if (selected) {
      ov.model_path = selected;
      logger.info(`User selected model: ${selected}`);
      console.log(`  ${GB}[+] ${DG}Using model: ${path.basename(selected)}${R}\n`);
    } else if (!args.pipe) {
      logger.error("No model selected for local GGUF backend");
      console.log(`  ${RD}[-] Model required for ${provider}.${R}\n`);
      process.exit(1);
    }
  }

  // ── Subcommands ──
  if (pos.length > 0) {
    const cmd = pos[0].toLowerCase();

    if (cmd === "model" || cmd === "models") {
      const { showTable, get: getModel } = await import("./models.js");
      const action = pos[1]?.toLowerCase() ?? "list";
      const name = pos[2];
      if (["list", "ls", "all"].includes(action)) {
        await showTable();
      } else if (action === "download" && name) {
        const filename = pos[3];
        const { downloadModel } = await import("./downloader.js");
        await downloadModel(name, filename);
      } else if (action === "use" && name) {
        const m = getModel(name);
        if (m) {
          cfgAny.model_name = m.name;
          cfgAny.temperature = m.temperature;
          cfgAny.max_tokens = m.max_tokens;
          saveConfig(cfgAny);
          logger.info(`Model switched to ${m.name}`);
          console.log(`  ${GB}[+] Switched to ${m.name}${R}`);
        } else {
          cfgAny.model_name = name;
          saveConfig(cfgAny);
          logger.info(`Model set to ${name}`);
          console.log(`  ${GB}[+] Model set to '${name}'${R}`);
        }
      }
      return;
    }

    if (cmd === "config") {
      const action = pos[1]?.toLowerCase() ?? "show";
      if (action === "show") {
        showConfig();
      } else if (action === "set" && pos.length > 2) {
        for (const pair of pos.slice(2)) {
          if (!pair.includes("=")) continue;
          const idx = pair.indexOf("=");
          const k = pair.slice(0, idx).trim();
          const rawV = pair.slice(idx + 1);
          let v: unknown = rawV;
          if (/^-?\d+$/.test(rawV)) v = parseInt(rawV, 10);
          else if (/^-?\d*\.\d+$/.test(rawV)) v = parseFloat(rawV);
          const old = cfgAny[k];
          cfgAny[k] = v;
          saveConfig(cfgAny);
          logger.logConfigChange(k, old, v);
          console.log(`  ${GB}[+] ${DG}${k} = ${String(v)}${R}`);
        }
      } else if (action === "reset") {
        resetConfig();
        logger.info("Config reset to defaults");
      }
      return;
    }

    if (cmd === "memory" || cmd === "mem" || cmd === "palace") {
      // Handled below, once an agent exists.
    } else if (cmd === "setup") {
      // first_run is an optional convenience module. The dynamic specifier is
      // built at runtime so TypeScript does not require the file to exist.
      const setupPath = "./first_run.js";
      try {
        const m = (await import(setupPath)) as { runSetup: () => Promise<void> | void };
        await m.runSetup();
      } catch (e) {
        logError(`setup unavailable (module not ported): ${errMsg(e)}`);
        console.log(`  ${YL}setup is not available in this build.${R}`);
      }
      return;
    }
  }

  // ── No args -> help ──
  if (
    pos.length === 0 &&
    !args.lc &&
    !args.cli &&
    !args.web &&
    !args.goal &&
    !args.pipe
  ) {
    console.log(HELP);
    return;
  }

  // ── Build agent ──
  const model = String(ov.model_name ?? cfgAny.model_name ?? "");
  const workspace = String(ov.workspace ?? cfgAny.workspace ?? ".");

  console.log(`\n  ${PURPLE}${B}FRAZIYM AI${R}  ${DG}${AXONIZ_VERSION}${R}`);
  const provStr = String(
    ov.provider ?? cfg.llm?.active_provider ?? cfgAny.backend ?? "llamacpp",
  );
  console.log(`  ${DG}backend${R}      ${GR}${provStr}${R}`);
  console.log(`  ${DG}eye${R}          ${GR}axodex graph active${R}`);
  console.log(`  ${DG}swarm${R}        ${GR}swarm engine ready${R}`);
  console.log(`  ${DG}workspace${R}    ${GR}${path.resolve(workspace)}${R}\n`);

  logger.info(`Building agent | provider=${provStr} | workspace=${workspace}`);

  // ── Memory / palace subcommands need an agent ──
  if (pos.length > 0) {
    const cmd = pos[0].toLowerCase();
    if (cmd === "memory" || cmd === "mem") {
      const agent = await runner.buildAgent(ov);
      const mem = agent.memory.all();
      const keys = Object.keys(mem);
      if (keys.length > 0) {
        section("semantic memory");
        for (const k of keys.slice(0, 20)) kv(k, String(mem[k]).slice(0, 72));
      } else {
        console.log(`  ${DG}(empty)${R}`);
      }
      return;
    }
    if (cmd === "health") {
      const agent = await runner.buildAgent(ov);
      const h = await agent.health();
      section("system health");
      kv("status", h.status ?? "unknown");
      kv("backend", h.backend ?? "—");
      kv("model", h.model ?? "—");
      kv("model_loaded", h.model_loaded ? "yes" : "no");
      kv("uptime", h.uptime != null ? `${Math.floor(Number(h.uptime) / 60)}m` : "—");
      const mem = h.memory as { palace?: boolean; drawers?: number; kg?: { facts?: number } } | undefined;
      if (mem) {
        kv("palace", mem.palace ? "available" : "offline");
        kv("drawers", String(mem.drawers ?? 0));
        kv("kg_facts", String(mem.kg?.facts ?? 0));
      }
      return;
    }
    if (cmd === "palace") {
      const agent = await runner.buildAgent(ov);
      const st = agent.memory.palace.status();
      console.log(`\n  ${DG}palace: ${st.total_drawers ?? 0} drawers${R}`);
      for (const [w, count] of Object.entries(st.wings ?? {}).slice(0, 10)) {
        console.log(`    ${DG}${w.padEnd(30)}${R}${GR}${count} drawers${R}`);
      }
      return;
    }
  }

  let agent: import("./agent.js").Agent;
  try {
    agent = await runner.buildAgent(ov);
    logger.logAgentInit({ provider: provStr, workspace, model });
  } catch (e) {
    logger.logAgentError(e, "build_agent");
    console.log(`\n  ${RD}\u2717 Failed to start: ${errMsg(e)}${R}\n`);
    if (e instanceof Error) console.error(e.stack);
    process.exit(1);
  }

  if (!(await runner.checkBackend(agent))) {
    logger.error("Backend health check failed");
    process.exit(1);
  }

  const h = await agent.health();
  const provStr2 = String(
    (agent.config as Record<string, unknown>).provider ??
      (agent.config as Record<string, unknown>).backend ??
      "llamacpp",
  );
  const mdlStr = String(h.model ?? (agent.config as Record<string, unknown>).model_name ?? "auto");
  const dot = h.status === "ok" ? `${GB}[*]${R}` : `${YL}[!]${R}`;
  console.log(`  ${dot}  ${DG}${provStr2}${R}  ${DG}/${R}  ${GR}${mdlStr}${R}\n`);
  logger.logBackendHealth(provStr2, h);

  // ── Web-only mode ──
  if (args.web && !args.lc && !args.cli && !args.goal) {
    try {
      const { fullBoot } = (await import("../startup.js")) as {
        fullBoot: (opts: {
          cfg?: AxonizConfig | null;
          overrides?: Record<string, unknown> | null;
          port?: number;
          openBrowser?: boolean;
          web?: boolean;
        }) => Promise<unknown>;
      };
      await fullBoot({
        cfg: null,
        overrides: Object.keys(ov).length > 0 ? ov : null,
        port: args.port,
        openBrowser: true,
        web: true,
      });
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        logger.info("Web server stopped by user");
        console.log(`\n  ${DG}stopped.${R}`);
      } else {
        throw e;
      }
    } finally {
      logger.logSessionEnd("web_stop");
    }
    return;
  }

  // ── Build the CLI ──
  const { CLI } = await import("./cli.js");
  let webUrl: string | null = null;
  if (args.web) {
    const { WebServer } = await import("../web/server.js");
    const ws = new WebServer({ agent, port: args.port });
    // Start in the background; the CLI keeps the foreground.
    void ws.listen().then((url) => {
      console.log(`  ${CY}web \u2192${R} ${BL}${url}${R}`);
    });
    webUrl = `http://localhost:${args.port}`;
    await sleep(800);
  }

  const cli = new CLI(agent, webUrl);

  // ── Pipe ──
  if (args.pipe || (!process.stdin.isTTY && !args.lc)) {
    const task = (await readStdin()).trim();
    if (task) {
      logger.logAgentRun(task, "pipe");
      await cli.runAgent(task);
    }
    logger.logSessionEnd("pipe_done");
    return;
  }

  // ── Positional inline task ──
  let task: string | null = null;
  if (pos.length > 0) {
    const skip = new Set([
      "run",
      "web",
      "config",
      "memory",
      "mem",
      "setup",
      "model",
      "models",
      "backends",
      "palace",
    ]);
    if (!skip.has(pos[0].toLowerCase())) {
      task = pos.join(" ").trim();
    } else if (pos[0].toLowerCase() === "run" && pos.length > 1) {
      task = pos.slice(1).join(" ").trim();
    }
  }
  if (task) {
    logger.logAgentRun(task, "inline");
    await cli.runAgent(task);
    logger.logSessionEnd("inline_done");
    return;
  }

  if (args.goal) {
    logger.logAgentRun(args.goal, "goal");
    await cli.runGoal(args.goal);
    logger.logSessionEnd("goal_done");
    return;
  }

  if (args.cli) {
    let oneShot: string;
    if (process.stdin.isTTY) {
      const readline = await import("node:readline/promises");
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      try {
        oneShot = (await rl.question(`  ${DG}Task: ${R}`)).trim();
      } catch {
        rl.close();
        return;
      }
      rl.close();
    } else {
      oneShot = (await readStdin()).trim();
    }
    if (oneShot) {
      logger.logAgentRun(oneShot, "cli");
      await cli.runAgent(oneShot);
    }
    logger.logSessionEnd("cli_done");
    return;
  }

  // ── Interactive REPL ──
  logger.logAgentRun("", "repl");
  try {
    await cli.run();
  } catch (e) {
    if (!(e instanceof Error && e.name === "AbortError")) throw e;
  } finally {
    logger.logSessionEnd("repl_stop");
  }
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf-8");
}

export { os, AXONIZ_HOME, debug };


