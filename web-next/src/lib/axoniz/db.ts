/**
 * AXONIZ persistent DB — stores API keys, provider configs, and other
 * settings at ~/.axoniz/db/ instead of relying on browser localStorage.
 *
 * Files:
 *   ~/.axoniz/db/config.json   — provider API keys + settings
 *   ~/.axoniz/db/chats/        — chat files (moved from ~/.axoniz/chats/)
 *
 * The browser localStorage store is still used for ephemeral UI state
 * (sidebar collapse, active chat ID, etc.) but API keys and provider
 * configs are persisted here so they survive browser cache clears
 * and are shared across browsers on the same machine.
 *
 * Permissions: 0600 (user read/write only) on POSIX, default ACL on
 * Windows. Never logs key values — only key NAMES.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function getDbDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(home, ".axoniz", "db");
}

function getConfigPath(): string {
  return path.join(getDbDir(), "config.json");
}

function ensureDbDir(): void {
  try {
    fs.mkdirSync(getDbDir(), { recursive: true });
    fs.mkdirSync(path.join(getDbDir(), "chats"), { recursive: true });
  } catch { /* ignore */ }
}

export interface ProviderDbConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface DbConfig {
  /** Provider configs keyed by provider ID (llamacpp, openrouter, etc.) */
  providers: Record<string, ProviderDbConfig>;
  /** llamacpp-specific settings */
  llamacpp: {
    modelPath: string;
    baseUrl: string;
    nCtx: number;
    nGpuLayers: number;
    nThreads: number;
  };
  /** Last-used provider */
  activeProvider: string;
  /** Last-used model name */
  activeModel: string | null;
  /** Schema version for future migrations */
  schemaVersion: number;
}

const DEFAULT_CONFIG: DbConfig = {
  providers: {},
  llamacpp: {
    modelPath: "",
    baseUrl: "http://localhost:8080",
    nCtx: 8192,
    nGpuLayers: 0,
    nThreads: 8,
  },
  activeProvider: "llamacpp",
  activeModel: null,
  schemaVersion: 1,
};

/** Read the config DB. Returns defaults if not yet created. */
export function readConfig(): DbConfig {
  try {
    const raw = fs.readFileSync(getConfigPath(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<DbConfig>;
    // Merge with defaults so missing fields get filled in.
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      providers: { ...DEFAULT_CONFIG.providers, ...(parsed.providers ?? {}) },
      llamacpp: { ...DEFAULT_CONFIG.llamacpp, ...(parsed.llamacpp ?? {}) },
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/** Write the config DB atomically (write to temp + rename). */
export function writeConfig(cfg: DbConfig): void {
  ensureDbDir();
  const tmpPath = getConfigPath() + ".tmp";
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(cfg, null, 2), {
      encoding: "utf-8",
      mode: 0o600,
    });
    fs.renameSync(tmpPath, getConfigPath());
  } catch (e) {
    // Fallback: direct write (not atomic but better than nothing).
    try {
      fs.writeFileSync(getConfigPath(), JSON.stringify(cfg, null, 2), {
        encoding: "utf-8",
        mode: 0o600,
      });
    } catch { /* disk full / perms — silently drop */ }
  }
}

/** Get a single provider's config from the DB. */
export function getProviderConfig(providerId: string): ProviderDbConfig | null {
  const cfg = readConfig();
  return cfg.providers[providerId] ?? null;
}

/** Save a single provider's config to the DB. Merges with existing. */
export function saveProviderConfig(providerId: string, patch: Partial<ProviderDbConfig>): void {
  const cfg = readConfig();
  const existing = cfg.providers[providerId] ?? {
    enabled: false,
    baseUrl: "",
    apiKey: "",
    model: "",
  };
  cfg.providers[providerId] = { ...existing, ...patch };
  writeConfig(cfg);
}

/** Save the entire llamacpp block. */
export function saveLlamacppConfig(patch: Partial<DbConfig["llamacpp"]>): void {
  const cfg = readConfig();
  cfg.llamacpp = { ...cfg.llamacpp, ...patch };
  writeConfig(cfg);
}

/** Save active provider + model. */
export function saveActiveSelection(provider: string, model: string | null): void {
  const cfg = readConfig();
  cfg.activeProvider = provider;
  cfg.activeModel = model;
  writeConfig(cfg);
}

/** Get the DB directory path (for diagnostics). */
export function getDbPath(): string {
  return getDbDir();
}
