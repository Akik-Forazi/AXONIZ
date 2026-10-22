/**
 * Slash command dispatcher — uses AXONIZ's REAL agent methods.
 * No mocks, no stubs. Every command calls the actual AXONIZ runtime.
 */
import path from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { PROVIDER_CATALOG, distRequire, saveConfig } from "./agent-bridge.js";
import { MODELS_DIR } from "../../core/config.js";

export interface SlashCommandEntry {
  value: string;
  description: string;
}

export const SLASH_COMMANDS: SlashCommandEntry[] = [
  { value: "/help", description: "Show commands" },
  { value: "/models", description: "List all available models" },
  { value: "/use", description: "Switch model" },
  { value: "/providers", description: "List providers" },
  { value: "/switch", description: "Switch provider" },
  { value: "/tools", description: "List agent tools" },
  { value: "/health", description: "System health" },
  { value: "/config", description: "Show config" },
  { value: "/history", description: "Session history" },
  { value: "/clear", description: "Clear screen" },
  { value: "/reset", description: "Reset conversation" },
  { value: "/exit", description: "Quit" },
];

export interface SlashResult {
  output: string | null;
  action?: "clear" | "exit";
  newFooter?: { provider?: string; model?: string };
}

export async function handleSlash(input: string, agent: any): Promise<SlashResult> {
  const parts = input.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  switch (cmd) {
    case "/help":
      return { output: [
        "AXONIZ Commands:",
        "",
        "  /help              Show this help",
        "  /models            List models (vault + registry + cloud)",
        "  /use <name>        Switch model",
        "  /providers         List all providers",
        "  /switch <p>        Switch provider (kills local model on cloud)",
        "  /tools             List agent tools",
        "  /health            System health report",
        "  /config            Show active config",
        "  /history           Show conversation history",
        "  /clear             Clear screen",
        "  /reset             Reset conversation",
        "  /exit              Quit",
        "",
        "  !<cmd>             Run shell command",
        "  @<path>            Read file into conversation",
      ].join("\n") };

    case "/clear": return { output: null, action: "clear" };
    case "/exit": case "/quit": return { output: null, action: "exit" };

    case "/models": return { output: await listModels(agent) };
    case "/providers": return { output: listProviders(agent) };
    case "/switch": return await switchProvider(agent, args[0] ?? "");
    case "/use": return await useModel(agent, args.join(" "));
    case "/tools": return { output: listTools(agent) };
    case "/health": return { output: await showHealth(agent) };
    case "/config": return { output: showConfig(agent) };
    case "/history": return { output: showHistory(agent) };
    case "/reset": agent.reset(); return { output: "Conversation reset." };
    default: return { output: `Unknown: ${cmd}. Try /help.` };
  }
}

function listProviders(agent: any): string {
  const cfg = agent.config as Record<string, unknown>;
  const llm = cfg.llm as { active_provider?: string; providers?: Record<string, Record<string, unknown>> } | undefined;
  const active = String(cfg.provider ?? cfg.backend ?? llm?.active_provider ?? "llamacpp");
  const lines = ["Providers:", ""];
  for (const p of PROVIDER_CATALOG) {
    const isOn = p.id === active;
    const pCfg = llm?.providers?.[p.id] ?? {};
    const hasKey = Boolean(pCfg.api_key);
    const key = p.needsApiKey ? (hasKey ? "+" : "-") : ".";
    const cat = p.category === "local" ? "local" : "cloud ";
    lines.push(`  ${isOn ? "*" : " "} ${p.id.padEnd(14)} ${cat} ${key}  ${p.name}`);
  }
  lines.push("", "* = active  + = key set  - = key missing  . = no key needed");
  return lines.join("\n");
}

async function switchProvider(agent: any, target: string): Promise<SlashResult> {
  if (!target) return { output: "Usage: /switch <provider>" };
  const meta = PROVIDER_CATALOG.find(p => p.id === target);
  if (!meta) return { output: `Unknown: ${target}. Try /providers.` };

  const cfg = agent.config as Record<string, unknown>;
  let llm = cfg.llm as Record<string, unknown> | undefined;
  if (!llm) { cfg.llm = { active_provider: target, providers: {} }; llm = cfg.llm as Record<string, unknown>; }
  if (!llm.providers) llm.providers = {};
  const providers = llm.providers as Record<string, Record<string, unknown>>;
  if (!providers[target]) providers[target] = {};

  if (meta.needsApiKey && !providers[target].api_key) {
    const envKey = `${target.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`;
    const envVal = process.env[envKey];
    if (envVal) providers[target].api_key = envVal;
    else return { output: `${target} needs an API key.\nSet: ${envKey}=<key>` };
  }
  if (!providers[target].base_url && meta.defaultBaseUrl) providers[target].base_url = meta.defaultBaseUrl;

  llm.active_provider = target;
  cfg.provider = target;
  cfg.backend = target;
  if (meta.category === "cloud") {
    cfg.daemon = { ...(cfg.daemon as Record<string, unknown> ?? {}), enabled: false };
    cfg.awareness = { enabled: false };
    try { execSync(process.platform === "win32" ? "taskkill /f /im llama-server.exe 2>nul" : "pkill -f llama.*server 2>/dev/null; true", { stdio: "ignore" }); } catch {}
  }

  saveConfig(cfg);
  agent.switchBackend(target);
  const model = String(providers[target]?.model_name ?? "auto");
  return {
    output: `Switched to ${target}${meta.category === "cloud" ? " (cloud)" : " (local)"}. Next message uses ${target}.`,
    newFooter: { provider: target, model: model.split(/[\\/]/).pop()?.replace(/\.(gguf|bin)$/i, "") ?? model },
  };
}

async function useModel(agent: any, name: string): Promise<SlashResult> {
  if (!name) return { output: "Usage: /use <model-name>" };
  const cfg = agent.config as Record<string, unknown>;
  const llm = cfg.llm as { active_provider?: string; providers?: Record<string, Record<string, unknown>> } | undefined;
  const prov = String(cfg.provider ?? cfg.backend ?? llm?.active_provider ?? "llamacpp");
  if (!llm?.providers) (cfg.llm as Record<string, unknown>).providers = {};
  const providers = (cfg.llm as Record<string, unknown>).providers as Record<string, Record<string, unknown>>;
  if (!providers[prov]) providers[prov] = {};
  providers[prov].model_name = name;
  saveConfig(cfg);
  agent.switchModel(name);
  return {
    output: `Switched to ${name}.\nProvider: ${prov}`,
    newFooter: { provider: prov, model: name.replace(/\.(gguf|bin)$/i, "") },
  };
}

async function listModels(agent: any): Promise<string> {
  const lines = ["Available models:", ""];
  const modelsDir = MODELS_DIR;
  const vault: string[] = [];
  function walk(dir: string, d = 0) {
    if (d > 6) return;
    try { for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f, d + 1);
      else if (e.name.toLowerCase().endsWith(".gguf")) vault.push(f);
    }} catch {}
  }
  walk(modelsDir);
  if (vault.length) {
    lines.push("Local vault:");
    for (const m of vault) {
      let gb = 0; try { gb = fs.statSync(m).size / 1024**3; } catch {}
      lines.push(`  ${path.basename(m).padEnd(50)} ${gb.toFixed(1)}GB`);
    }
    lines.push("");
  }
  try {
    const { REGISTRY } = distRequire("core/models.js");
    lines.push("Registry:");
    for (const m of Object.values(REGISTRY) as any[]) {
      lines.push(`  ${m.name}${m.recommended ? " *" : ""}  ${m.size_gb}GB ${m.speed_toks}`);
    }
    lines.push("");
  } catch {}
  lines.push("Switch: /use <name>");
  return lines.join("\n");
}

function listTools(agent: any): string {
  const tools = agent.availableTools;
  if (!tools?.length) return "(no tools)";
  const lines = [`Tools (${tools.length}):`, ""];
  for (const t of tools) {
    lines.push(`  ${t.function.name.padEnd(26)} ${String(t.function.description ?? "").split("\n")[0].slice(0, 50)}`);
  }
  return lines.join("\n");
}

async function showHealth(agent: any): Promise<string> {
  const h = await agent.health();
  return `Health:\n  status:   ${h.status ?? "?"}\n  backend:  ${h.backend ?? "?"}\n  model:    ${h.model ?? "?"}`;
}

function showConfig(agent: any): string {
  const cfg = agent.config as Record<string, unknown>;
  const lines = ["Config:", ""];
  for (const k of ["provider", "model_name", "base_url", "temperature", "max_tokens", "max_steps", "workspace"]) {
    if (k in cfg) lines.push(`  ${k.padEnd(14)} ${String(cfg[k])}`);
  }
  return lines.join("\n");
}

function showHistory(agent: any): string {
  const msgs = agent.history?.getSession?.() ?? [];
  if (!msgs.length) return "(empty)";
  const lines = [`History (${msgs.length}):`, ""];
  msgs.forEach((m: any, i: number) => {
    lines.push(`  [${i}] ${String(m.role ?? "user").toUpperCase().slice(0, 4).padEnd(4)} ${String(m.content ?? "").slice(0, 70)}`);
  });
  return lines.join("\n");
}
