/**
 * AXONIZ-ZERO Configuration
 * Central config: ~/.fraziym/axoniz/config.json (T1 HOME)
 * Machine-local state (models/logs/caches): %LOCALAPPDATA%\FRAZIYM\axoniz (T2)
 * Installed binaries (llama-server): %ProgramFiles%\fraziym\axoniz (T3, T2 fallback)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fraziymHome, fraziymLocal, fraziymPrograms } from "./paths.js";
// NOTE: do NOT import from "./debug.js" here — it would create a circular
// import chain (logger.ts → config.ts → debug.ts → logger.ts) and crash at
// startup with "Cannot access 'AXONIZ_HOME' before initialization". If you
// need to log inside config.ts, use process.stderr.write() directly.

/** T1 — user config + data root for Axoniz (`~/.fraziym/axoniz`). */
export const AXONIZ_HOME = path.join(fraziymHome(), "axoniz");
/** T2 — machine-local cache/state root for Axoniz (`%LOCALAPPDATA%\FRAZIYM\axoniz`). */
export const AXONIZ_LOCAL = path.join(fraziymLocal(), "axoniz");
/** T3 — installed binaries root for Axoniz (`%ProgramFiles%\fraziym\axoniz`). */
export const AXONIZ_PROGRAMS = path.join(fraziymPrograms(), "axoniz");
export const MODELS_DIR = path.join(AXONIZ_LOCAL, "models");
export const VOICE_MODELS_DIR = path.join(AXONIZ_LOCAL, "voice_models");
/**
 * llama-server binaries live in T3 when an elevated install put them there,
 * otherwise fall back to the machine-local T2 copy so non-admin installs work.
 */
export const LLAMA_BIN_DIR = fs.existsSync(path.join(AXONIZ_PROGRAMS, "llama"))
  ? path.join(AXONIZ_PROGRAMS, "llama")
  : path.join(AXONIZ_LOCAL, "llama");
export const CONFIG_PATH = path.join(AXONIZ_HOME, "config.json");
export const MEMORY_PATH = path.join(AXONIZ_HOME, "memory.json");
export const HISTORY_DIR = path.join(AXONIZ_HOME, "history");

export function ensureDirs(): void {
  for (const d of [AXONIZ_HOME, HISTORY_DIR, MODELS_DIR]) {
    try {
      fs.mkdirSync(d, { recursive: true });
    } catch {
      /* best-effort, mirrors Python makedirs(exist_ok=True) semantics */
    }
  }
}

ensureDirs();

export function modelDir(name: string): string {
  return path.join(MODELS_DIR, name);
}

/* ── Config shape ─────────────────────────────────────────────────────────── */

export interface LlamaCppProviderConfig {
  model_path: string;
  llama_bin: string;
  n_gpu_layers: number;
  n_ctx: number;
  temperature: number;
  max_tokens: number;
}

export interface LlamaCppServerProviderConfig extends LlamaCppProviderConfig {
  base_url: string;
  auto_start: boolean;
}

export interface OpenAIProviderConfig {
  api_key: string;
  base_url: string;
  model_name: string;
  temperature: number;
  max_tokens: number;
}

export interface OllamaProviderConfig {
  base_url: string;
  model_name: string;
  temperature: number;
  max_tokens: number;
}

export interface LMStudioProviderConfig {
  base_url: string;
  model_name: string;
  api_key: string;
  temperature: number;
  max_tokens: number;
  auto_load: boolean;
  auto_start: boolean;
  lms_bin: string;
}

export interface ProvidersConfig {
  llamacpp: LlamaCppProviderConfig;
  llamacpp_server: LlamaCppServerProviderConfig;
  openai: OpenAIProviderConfig;
  ollama: OllamaProviderConfig;
  lmstudio: LMStudioProviderConfig;
}

export interface LoggingConfig {
  level: string;
  console: boolean;
  file: boolean;
  structured: boolean;
  max_bytes: number;
  backup_count: number;
  capture_llm_prompts: boolean;
  capture_tool_args: boolean;
  capture_tool_results: boolean;
  capture_backend_health: boolean;
}

export interface AwarenessConfig {
  enabled: boolean;
  interval_seconds?: number;
  [key: string]: unknown;
}

export interface AxonizConfig {
  general: {
    workspace: string;
    web_port: number;
    theme: string;
    [key: string]: unknown;
  };
  llm: {
    active_provider: string;
    providers: ProvidersConfig;
    [key: string]: unknown;
  };
  agent: {
    max_steps: number;
    persona_override: string;
    tools: {
      file_system: boolean;
      web_search: boolean;
      axodex_graph: boolean;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  memory: {
    palace_enabled: boolean;
    kg_enabled: boolean;
    [key: string]: unknown;
  };
  swarm_models: {
    decomposer: string;
    worker: string;
    critic: string;
    merger: string;
    [key: string]: unknown;
  };
  logging: LoggingConfig;
  awareness: AwarenessConfig;
  /** Anything else the user (or a legacy config) supplies. */
  [key: string]: unknown;
}

export function defaultConfig(): AxonizConfig {
  return {
    general: { workspace: ".", web_port: 7860, theme: "dark" },
    llm: {
      active_provider: "llamacpp",
      providers: {
        llamacpp: {
          model_path: "",
          llama_bin: "",
          n_gpu_layers: -1,
          n_ctx: 32768,
          temperature: 0.2,
          max_tokens: 4096,
        },
        llamacpp_server: {
          base_url: "http://localhost:8080",
          model_path: "",
          llama_bin: "",
          n_gpu_layers: -1,
          n_ctx: 32768,
          temperature: 0.2,
          max_tokens: 4096,
          auto_start: false,
        },
        openai: {
          api_key: "",
          base_url: "https://api.openai.com/v1",
          model_name: "gpt-4o",
          temperature: 0.2,
          max_tokens: 4096,
        },
        ollama: {
          base_url: "http://localhost:11434",
          model_name: "llama3",
          temperature: 0.2,
          max_tokens: 4096,
        },
        lmstudio: {
          base_url: "http://localhost:1234",
          model_name: "",
          api_key: "lm-studio",
          temperature: 0.2,
          max_tokens: 4096,
          auto_load: true,
          auto_start: false,
          lms_bin: "",
        },
      },
    },
    agent: {
      max_steps: 30,
      persona_override: "",
      tools: { file_system: true, web_search: false, axodex_graph: true },
    },
    memory: { palace_enabled: true, kg_enabled: true },
    swarm_models: { decomposer: "", worker: "", critic: "", merger: "" },
    logging: {
      level: "INFO",
      console: true,
      file: true,
      structured: true,
      max_bytes: 10 * 1024 * 1024,
      backup_count: 10,
      capture_llm_prompts: false,
      capture_tool_args: true,
      capture_tool_results: true,
      capture_backend_health: true,
    },
    awareness: { enabled: false, interval_seconds: 5 },
  };
}

export function deepMerge<T extends Record<string, unknown>>(target: T, source: Record<string, unknown>): T {
  for (const [k, v] of Object.entries(source)) {
    const cur = (target as Record<string, unknown>)[k];
    if (
      cur !== null &&
      typeof cur === "object" &&
      !Array.isArray(cur) &&
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v)
    ) {
      deepMerge(cur as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      (target as Record<string, unknown>)[k] = structuredClone(v);
    }
  }
  return target;
}

/** Convert old flat configs to the new hierarchical structure. */
export function migrateLegacyConfig(saved: Record<string, unknown>): Record<string, unknown> {
  if ("general" in saved || "llm" in saved) return saved; // Already modern

  const modern = defaultConfig() as unknown as Record<string, unknown>;

  if ("workspace" in saved) modern.general = { ...(modern.general as object), workspace: saved.workspace };
  if ("web_port" in saved) modern.general = { ...(modern.general as object), web_port: saved.web_port };

  const provider = String(saved.provider ?? saved.backend ?? "llamacpp");
  (modern.llm as Record<string, unknown>).active_provider = provider;

  const providers = (modern.llm as Record<string, unknown>).providers as Record<string, Record<string, unknown>>;
  if (provider in providers) {
    const p = providers[provider];
    for (const key of [
      "model_path",
      "llama_bin",
      "n_gpu_layers",
      "n_ctx",
      "temperature",
      "max_tokens",
      "base_url",
    ]) {
      if (key in saved) p[key] = saved[key];
    }
  }

  if ("max_steps" in saved) (modern.agent as Record<string, unknown>).max_steps = saved.max_steps;

  return modern;
}

export function loadConfig(): AxonizConfig {
  const cfg = defaultConfig() as unknown as Record<string, unknown>;
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
      let saved = JSON.parse(raw) as Record<string, unknown>;
      saved = migrateLegacyConfig(saved);
      deepMerge(cfg, saved);
    } catch {
      /* corrupt config — fall back to defaults, mirroring Python's bare except */
    }
  }
  // Auto-rehome any stale absolute paths that reference a different user's
  // home directory. This handles the common case where someone renames their
  // Windows user account (e.g. akikf -> user) and every absolute path in
  // config.json that was stored under a legacy `~/.axoniz` (or another user's
  // `~/.fraziym/axoniz`) becomes broken. We rewrite them in-place to the
  // current tier roots and persist the cleaned config back to disk so the
  // rehoming only happens once.
  const typedCfg = cfg as unknown as AxonizConfig;
  const rehomed = rehomeConfigPaths(typedCfg);
  if (rehomed > 0) {
    try {
      saveConfig(typedCfg);
    } catch {
      /* best-effort — don't fail config load if the disk is read-only */
    }
  }
  return typedCfg;
}

/**
 * Walk every path-shaped field in the config and rewrite absolute paths that
 * reference a stale `C:\Users\<old_user>\.axoniz\...` (or POSIX equivalent
 * `/<old_home>/.axoniz/...`), or another home's `.fraziym/axoniz/...`
 * prefix, to the current tier roots.
 *
 * Returns the number of paths that were rehomed. The caller persists the
 * config back to disk only when >0 (so we don't churn the file on every load).
 *
 * Path fields covered:
 *   - swarm_models.{decomposer, worker, critic, merger}
 *   - top-level model_path
 *   - llm.providers.{provider}.model_path for every provider in the catalog
 *   - llm.providers.llamacpp.llama_bin
 *   - llm.providers.llamacpp_server.{model_path, llama_bin}
 *
 * Idempotent: paths already pointing inside the current tier roots are
 * returned unchanged.
 */
function rehomeConfigPaths(cfg: AxonizConfig): number {
  let count = 0;

  // swarm_models.{role}
  const swarm = cfg.swarm_models as unknown as Record<string, string> | undefined;
  if (swarm) {
    for (const role of Object.keys(swarm) as Array<keyof typeof swarm>) {
      const v = swarm[role];
      if (typeof v === "string" && v) {
        const rehomed = rehomeStalePath(v);
        if (rehomed !== v) {
          swarm[role] = rehomed;
          count++;
        }
      }
    }
  }

  // top-level model_path
  const cfgAny = cfg as unknown as Record<string, unknown>;
  if (typeof cfgAny.model_path === "string" && cfgAny.model_path) {
    const rehomed = rehomeStalePath(cfgAny.model_path);
    if (rehomed !== cfgAny.model_path) {
      cfgAny.model_path = rehomed;
      count++;
    }
  }

  // llm.providers.{*}.{model_path, llama_bin, base_url}
  const llm = (cfg as unknown as { llm?: Record<string, unknown> }).llm;
  if (llm && typeof llm.providers === "object") {
    const providers = llm.providers as Record<string, Record<string, unknown>>;
    for (const provName of Object.keys(providers)) {
      const prov = providers[provName] as Record<string, unknown>;
      for (const pathField of ["model_path", "llama_bin"]) {
        const v = prov[pathField];
        if (typeof v === "string" && v) {
          const rehomed = rehomeStalePath(v);
          if (rehomed !== v) {
            prov[pathField] = rehomed;
            count++;
          }
        }
      }
    }
  }

  return count;
}

/**
 * If `p` is an absolute path that contains a legacy `\.axoniz\` (or `/.axoniz/`)
 * segment under a NON-CURRENT home directory, or a `.fraziym/axoniz` root from
 * another home, rewrite it to point inside the current tier roots. Tier
 * routing for the tail: `models`/`voice_models` → AXONIZ_LOCAL (T2),
 * `llama` → LLAMA_BIN_DIR (T3 with T2 fallback), everything else → AXONIZ_HOME (T1).
 *
 * Examples:
 *
 *   on Windows, current user = "user":
 *     rehomeStalePath("C:\\Users\\akikf\\.axoniz\\models\\x.gguf")
 *       → "<LOCALAPPDATA>\\FRAZIYM\\axoniz\\models\\x.gguf"
 *     rehomeStalePath("C:\\Users\\akikf\\.axoniz\\config.json")
 *       → "C:\\Users\\user\\.fraziym\\axoniz\\config.json"
 *
 *   on POSIX, current $HOME = "/home/alice":
 *     rehomeStalePath("/home/bob/.axoniz/models/x.gguf")
 *       → "$XDG_CACHE_HOME/fraziym/axoniz/models/x.gguf"
 *
 * If the path is already inside the current tier roots, or doesn't contain
 * a legacy `.axoniz` / foreign `.fraziym/axoniz` segment, it's returned
 * unchanged.
 */
function rehomeStalePath(p: string): string {
  if (!p || typeof p !== "string") return p;
  // Detect absolute paths cross-platform: Windows drive letter (C:\), UNC (\\),
  // or POSIX absolute (/). Don't use path.isAbsolute because it only matches
  // the current OS's convention — a Windows config.json read on POSIX
  // (or vice versa) wouldn't be recognized.
  const isAbs = /^([A-Za-z]:[\\/]|\\\\|\/)/.test(p);
  if (!isAbs) return p;

  // Match a legacy `.axoniz` segment, or a `.fraziym/axoniz` root that was
  // written under a DIFFERENT home. The regex matches a leading separator,
  // the segment(s), then a trailing separator.
  const m = p.match(/[\\/]\.axoniz[\\/]/) ?? p.match(/[\\/]\.fraziym[\\/]axoniz[\\/]/);
  if (!m) return p;

  const matchStart = m.index ?? -1;
  if (matchStart < 0) return p;
  const matchEnd = matchStart + m[0].length; // one past the trailing separator

  // Everything after the matched segment (e.g. `models\qwen.gguf`).
  const tail = p.slice(matchEnd);
  if (!tail) return p;

  const parts = tail.split(/[\\/]/);

  // Tier routing: machine-local payloads → T2, installed binaries → T3/T2
  // (LLAMA_BIN_DIR already resolves the fallback), user data → T1.
  const first = parts[0];
  const tierBase =
    first === "models" || first === "voice_models"
      ? AXONIZ_LOCAL
      : first === "llama"
        ? LLAMA_BIN_DIR
        : AXONIZ_HOME;

  // LLAMA_BIN_DIR already ends in `llama`, so drop the duplicated segment.
  const tailParts = first === "llama" ? parts.slice(1) : parts;

  // path.join normalizes separators for the current OS.
  const candidate = path.join(tierBase, ...tailParts);

  // Idempotent: if the input already pointed inside the current tier roots,
  // the candidate equals the input and we return unchanged.
  if (candidate === p) return p;

  return candidate;
}

export function saveConfig(cfg: AxonizConfig | Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf-8");
}

export function showConfig(): void {
  const cfg = loadConfig();
  console.log("\u001b[96m[AXONIZ-ZERO Configuration]\u001b[0m");
  console.log(JSON.stringify(cfg, null, 2));
  console.log(`\n  Config: ${CONFIG_PATH}\n`);
}

export function resetConfig(): void {
  saveConfig(defaultConfig());
  console.log("\u001b[93m[Config] Reset to defaults.\u001b[0m");
}

/* ── Autodetect ───────────────────────────────────────────────────────────── */

export function activeProvider(cfg: AxonizConfig): string {
  const llm = cfg.llm as Record<string, unknown> | undefined;
  return String(
    (cfg.provider as string) ||
      (cfg.backend as string) ||
      llm?.active_provider ||
      "llamacpp",
  );
}

export function providerConfig(cfg: AxonizConfig, provider?: string): Record<string, unknown> {
  const prov = provider ?? activeProvider(cfg);
  const providers = cfg.llm?.providers as unknown as Record<string, Record<string, unknown>> | undefined;
  return providers?.[prov] ?? {};
}

export function loadConfigWithAutodetect(): AxonizConfig {
  const cfg = loadConfig();
  const prov = (cfg.llm?.active_provider as string) ?? "llamacpp";

  if (prov === "llamacpp" || prov === "llamacpp_server") {
    const p = providerConfig(cfg, prov);
    if (!p.llama_bin) {
      const suffix = process.platform === "win32" ? ".exe" : "";
      const target = `llama-server${suffix}`;
      const candidate = path.join(LLAMA_BIN_DIR, target);
      if (fs.existsSync(candidate)) {
        p.llama_bin = candidate;
      } else if (fs.existsSync(target)) {
        p.llama_bin = path.resolve(target);
      }
    }
  }

  // NOTE: resolveSwarmModels(cfg) used to be called here at config-load
  // time, which meant the swarm model paths were resolved (and warned about
  // when stale) BEFORE the agent was even built — the user saw 8 stale-path
  // warnings on every startup. Now resolution is deferred to first swarm use
  // (src/core/intelligence/swarm.ts:936 calls it lazily). If the swarm is
  // never invoked, the paths are never touched.
  return cfg;
}

/**
 * Resolve swarm_models name/basename entries to full absolute paths.
 * Searches known model directories so config.json can store just a bare
 * filename like 'qwen2.5-coder-1.5b.Q5_K_M.gguf'. Mutates cfg in place.
 */
export function resolveSwarmModels(cfg: AxonizConfig): void {
  const swarm = cfg.swarm_models as unknown as Record<string, string> | undefined;
  if (!swarm || !Object.values(swarm).some(Boolean)) return;

  const searchDirs = getModelSearchDirs();

  for (const [role, entry] of Object.entries(swarm)) {
    if (!entry) continue;
    if (path.isAbsolute(entry) && fs.existsSync(entry)) continue;

    let resolved: string | undefined;
    for (const d of searchDirs) {
      if (!isDir(d)) continue;
      const hits = walkMatch(d, entry);
      if (hits.length > 0) {
        resolved = hits[0];
        break;
      }
      const candidate = path.join(d, entry);
      if (fs.existsSync(candidate)) {
        resolved = candidate;
        break;
      }
    }

    if (resolved) {
      swarm[role] = resolved;
    } else {
      // Stale path in the user's config.json — silently clear it so the
      // swarm falls back to the active main model (per the docstring:
      // "If no swarm models are configured, the active main model is used
      // for all phases (standard behaviour).")
      //
      // Previously this fired `process.emitWarning` on every startup, which
      // printed 8 warnings (one per role × 2 passes) for paths the user
      // long since moved/deleted. Demoted to a single stderr write (only
      // visible when LOG_LEVEL=debug or stderr is captured).
      process.stderr.write(
        `[axovb:config] [debug] Swarm model '${entry}' for role '${role}' not found in any search dir — clearing. Swarm will use the active main model for this role.\n`,
      );
      swarm[role] = "";
    }
  }
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** Recursive search for a filename (or glob-free basename match) under `dir`. */
function walkMatch(dir: string, entry: string, depth = 0, acc: string[] = []): string[] {
  if (depth > 8 || acc.length > 0) return acc;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    if (acc.length > 0) break;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      walkMatch(full, entry, depth + 1, acc);
    } else if (e.name === entry) {
      acc.push(full);
    }
  }
  return acc;
}

/** Ordered list of directories to scan for .gguf files. */
export function getModelSearchDirs(): string[] {
  const home = os.homedir();
  return [
    MODELS_DIR,
    path.join(home, "lmstudio-community"),
    path.join(home, ".cache", "lm-studio", "models"),
    path.join(home, "AppData", "Roaming", "LM Studio", "user", "models"),
    path.join(home, "Downloads"),
    ".",
  ];
}
