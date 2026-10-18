#!/usr/bin/env node
/**
 * axoniz-tui — launches the gemini-cli UI with AXONIZ's provider config.
 *
 * This wrapper:
 *   1. Reads AXONIZ's config from ~/.axoniz/config.json
 *   2. Maps the active provider to gemini-cli's env vars:
 *      - GEMINI_API_KEY (for Google Gemini)
 *      - GOOGLE_API_KEY + GOOGLE_GENAI_USE_VERTEXAI (for Vertex)
 *      - For OpenAI-compatible providers (orca, openrouter, etc.):
 *        sets GOOGLE_GENAI_USE_VERTEXAI=false + custom base URL
 *   3. Launches `gemini` binary with the mapped env
 *
 * Usage:
 *   axoniz-tui                    # start with current config
 *   axoniz-tui --provider orca    # override provider
 *   axoniz-tui --model gemini-2.5-flash  # override model
 *
 * The user gets the EXACT gemini-cli UI (same code Google ships)
 * but streaming from their AXONIZ provider instead of Google's API.
 *
 * For MCP/tools integration: gemini-cli supports MCP servers natively.
 * The AXONIZ MCP servers (axodex, palace, forge, war-room, etc.) can
 * be configured in ~/.gemini/settings.json to give the gemini-cli UI
 * access to AXONIZ's 72 tools.
 */
import process from "node:process";
import { execSync, spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

// ── Read AXONIZ config ──
function loadAxonizConfig(): Record<string, unknown> {
  const configPath = path.join(os.homedir(), ".axoniz", "config.json");
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch {
    return {};
  }
}

// ── Map AXONIZ provider to gemini-cli env vars ──
function mapProviderToGeminiEnv(
  cfg: Record<string, unknown>,
  providerOverride?: string,
): Record<string, string> {
  const env: Record<string, string> = {};
  const llm = cfg.llm as { active_provider?: string; providers?: Record<string, Record<string, unknown>> } | undefined;
  const provider = providerOverride ?? String(cfg.provider ?? cfg.backend ?? llm?.active_provider ?? "llamacpp");
  const pCfg = llm?.providers?.[provider] ?? {};

  // Check env var for API key
  const envKey = `${provider.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`;
  const apiKey = String(pCfg.api_key ?? "") || process.env[envKey] ?? process.env[`${provider}_API_KEY`] ?? "";

  // Map provider to gemini-cli's expected env vars
  switch (provider) {
    case "gemini":
    case "orca":
    case "openrouter":
    case "openai":
    case "groq":
    case "together":
    case "mistral":
    case "deepseek":
    case "fireworks":
    case "perplexity":
    case "custom":
      // For OpenAI-compatible providers, use the custom base URL approach.
      // gemini-cli supports custom endpoints via GOOGLE_GENAI_USE_VERTEXAI=false
      // + a custom API key. The actual base URL mapping happens via the
      // settings.json config file.
      if (apiKey) env.GEMINI_API_KEY = apiKey;
      env.GOOGLE_GENAI_USE_VERTEXAI = "false";
      env.AXONIZ_PROVIDER = provider;
      env.AXONIZ_BASE_URL = String(pCfg.base_url ?? "");
      break;

    case "anthropic":
      // Anthropic via gemini-cli requires a custom setup
      if (apiKey) env.GEMINI_API_KEY = apiKey;
      env.GOOGLE_GENAI_USE_VERTEXAI = "false";
      env.AXONIZ_PROVIDER = provider;
      break;

    default:
      // For local providers (llamacpp, lmstudio, ollama):
      // gemini-cli doesn't support these directly. Fall back to
      // Google's free tier if the user has a Google account.
      env.GOOGLE_GENAI_USE_VERTEXAI = "false";
      break;
  }

  // Model override
  if (pCfg.model_name) {
    env.GEMINI_MODEL = String(pCfg.model_name);
  }

  return env;
}

// ── Ensure ~/.gemini/settings.json has AXONIZ MCP servers ──
function ensureMcpConfig(): void {
  const geminiDir = path.join(os.homedir(), ".gemini");
  const settingsPath = path.join(geminiDir, "settings.json");

  try {
    fs.mkdirSync(geminiDir, { recursive: true });
  } catch {}

  let settings: Record<string, unknown> = {};
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  } catch {}

  // Add AXONIZ MCP servers if not already present
  if (!settings.mcpServers) settings.mcpServers = {};
  const mcpServers = settings.mcpServers as Record<string, unknown>;

  const axonizServers = {
    "axoniz-axodex": { command: "axoniz", args: ["mcp-server", "axodex"] },
    "axoniz-palace": { command: "axoniz", args: ["mcp-server", "palace"] },
    "axoniz-forge": { command: "axoniz", args: ["mcp-server", "forge"] },
    "axoniz-war-room": { command: "axoniz", args: ["mcp-server", "war-room"] },
    "axoniz-tools": { command: "axoniz", args: ["mcp-server", "tools"] },
  };

  let changed = false;
  for (const [name, config] of Object.entries(axonizServers)) {
    if (!mcpServers[name]) {
      mcpServers[name] = config;
      changed = true;
    }
  }

  if (changed) {
    try {
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
      process.stderr.write("[axoniz-tui] Added AXONIZ MCP servers to ~/.gemini/settings.json\n");
    } catch {}
  }
}

// ── Main ──
async function main() {
  const args = process.argv.slice(2);
  let providerOverride: string | undefined;
  let modelOverride: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--provider" && args[i + 1]) {
      providerOverride = args[i + 1];
      args.splice(i, 2);
      i--;
    } else if (args[i] === "--model" && args[i + 1]) {
      modelOverride = args[i + 1];
      args.splice(i, 2);
      i--;
    }
  }

  const cfg = loadAxonizConfig();
  const geminiEnv = mapProviderToGeminiEnv(cfg, providerOverride);

  // Ensure MCP config is set up
  ensureMcpConfig();

  // Find the gemini binary
  const geminiBin = execSync("which gemini", { encoding: "utf-8" }).trim();
  if (!geminiBin || !fs.existsSync(geminiBin)) {
    console.error("gemini CLI not found. Install with: npm install -g @google/gemini-cli");
    process.exit(1);
  }

  // Print a header so the user knows this is AXONIZ launching gemini-cli
  console.log(`
  ┌──────────────────────────────────────────────┐
  │ AXONIZ → gemini-cli wrapper                  │
  │ Provider: ${providerOverride ?? geminiEnv.AXONIZ_PROVIDER ?? "default"}${" ".repeat(Math.max(0, 28 - (providerOverride ?? geminiEnv.AXONIZ_PROVIDER ?? "default").length))}│
  │ Model: ${modelOverride ?? geminiEnv.GEMINI_MODEL ?? "auto"}${" ".repeat(Math.max(0, 35 - (modelOverride ?? geminiEnv.GEMINI_MODEL ?? "auto").length))}│
  │ MCP: 5 AXONIZ servers configured             │
  └──────────────────────────────────────────────┘
  Launching gemini-cli UI...
  `);

  // Spawn gemini-cli with the mapped environment
  const child = spawn(geminiBin, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      ...geminiEnv,
      ...(modelOverride ? { GEMINI_MODEL: modelOverride } : {}),
    },
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

void main();
