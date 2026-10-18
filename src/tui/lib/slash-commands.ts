/**
 * Slash command handler — comprehensive implementation.
 *
 * Handles ALL slash commands end-to-end:
 *   /help /models /use /providers /provider /switch /mode /web
 *   /tools /history /config /health /memory /palace /clear /reset /exit
 *
 * Also handles:
 *   !<cmd>  — shell command execution
 *   @<path> — file attachment (reads file content into the prompt)
 */
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execSync, exec } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, "..", "..", "..", "dist");
const esmRequire = createRequire(import.meta.url);

function distRequire(rel: string): any {
  const full = path.join(DIST, rel);
  if (!fs.existsSync(full)) {
    throw new Error(`CLI not built: ${full} missing. Run "npm run build".`);
  }
  return esmRequire(full);
}

export interface SlashContext {
  agent: any;
  cwd: string;
}

export interface SlashResult {
  output: string | null;
  action?: "clear" | "exit" | "update-footer" | "launch-web" | "set-mode";
  mode?: "agent" | "chat" | "goal";
  newFooter?: { provider?: string; model?: string };
}

export async function handleInput(input: string, ctx: SlashContext): Promise<SlashResult> {
  const trimmed = input.trim();

  // Shell command: !<cmd>
  if (trimmed.startsWith("!")) {
    return handleShell(trimmed.slice(1).trim(), ctx);
  }

  // File mention: @<path>
  if (trimmed.startsWith("@")) {
    return handleFileMention(trimmed, ctx);
  }

  // Slash command: /<cmd>
  if (trimmed.startsWith("/")) {
    return handleSlash(trimmed, ctx);
  }

  return { output: null };
}

async function handleSlash(input: string, ctx: SlashContext): Promise<SlashResult> {
  const parts = input.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);
  const agent = ctx.agent;

  switch (cmd) {
    case "/help":
      return { output: formatHelp() };

    case "/clear":
      return { output: null, action: "clear" };

    case "/exit":
    case "/quit":
      return { output: null, action: "exit" };

    case "/mode": {
      if (!args[0]) {
        const current = (agent as any)._mode ?? "agent";
        return { output: `Current mode: ${current}\nOptions: agent chat goal` };
      }
      const m = args[0].toLowerCase();
      if (m === "agent" || m === "chat" || m === "goal") {
        return { output: `Mode → ${m}`, action: "set-mode", mode: m as any };
      }
      return { output: `Invalid mode: ${m}\nOptions: agent chat goal` };
    }

    case "/models": {
      if (args[0]?.toLowerCase() === "refresh") {
        return await refreshCloudModels(agent);
      }
      return { output: await listModels(agent) };
    }

    case "/providers":
      return { output: listProviders(agent) };

    case "/provider":
      return { output: currentProvider(agent) };

    case "/switch": {
      if (!args[0]) return { output: "Usage: /switch <provider>\nRun /providers to see the list." };
      return await switchProvider(agent, args[0].toLowerCase());
    }

    case "/use": {
      if (!args[0]) return { output: "Usage: /use <model-name>\nRun /models to see the list." };
      return await useModel(agent, args.join(" "));
    }

    case "/tools": {
      try {
        const tools = agent.availableTools;
        if (!tools || tools.length === 0) return { output: "(no tools registered)" };
        const lines: string[] = [`Available tools (${tools.length}):`, ""];
        for (const t of tools) {
          const fn = t.function;
          const desc = String(fn.description ?? "").split("\n")[0].slice(0, 60);
          lines.push(`  ${fn.name.padEnd(28)} ${desc}`);
        }
        return { output: lines.join("\n") };
      } catch (e) {
        return { output: `Error: ${e instanceof Error ? e.message : String(e)}` };
      }
    }

    case "/history": {
      try {
        const msgs = agent.history.getSession();
        if (msgs.length === 0) return { output: "(no messages in this session)" };
        const lines: string[] = [`Session history (${msgs.length} messages):`, ""];
        for (let i = 0; i < msgs.length; i++) {
          const m = msgs[i];
          const role = String(m.role ?? "user").toUpperCase();
          const content = String(m.content ?? "").slice(0, 80);
          lines.push(`  [${i}] ${role.padEnd(10)} ${content}`);
        }
        return { output: lines.join("\n") };
      } catch (e) {
        return { output: `Error: ${e instanceof Error ? e.message : String(e)}` };
      }
    }

    case "/config": {
      try {
        const cfg = agent.config;
        const lines: string[] = ["Active config:", ""];
        for (const k of ["provider", "model_name", "base_url", "temperature", "max_tokens", "max_steps", "workspace"]) {
          if (k in (cfg as Record<string, unknown>)) {
            lines.push(`  ${k.padEnd(16)} ${String((cfg as Record<string, unknown>)[k])}`);
          }
        }
        return { output: lines.join("\n") };
      } catch (e) {
        return { output: `Error: ${e instanceof Error ? e.message : String(e)}` };
      }
    }

    case "/health": {
      try {
        const h = await agent.health();
        const lines: string[] = ["System health:", ""];
        lines.push(`  status:     ${String(h.status ?? "—")}`);
        lines.push(`  backend:    ${String(h.backend ?? "—")}`);
        lines.push(`  model:      ${String(h.model ?? "—")}`);
        return { output: lines.join("\n") };
      } catch (e) {
        return { output: `Error: ${e instanceof Error ? e.message : String(e)}` };
      }
    }

    case "/web":
      return { output: "Launching web dashboard...", action: "launch-web" };

    case "/memory": {
      try {
        const mem = agent.memory.all();
        const keys = Object.keys(mem);
        if (keys.length === 0) return { output: "(empty)" };
        const lines: string[] = ["Semantic memory:", ""];
        for (const k of keys.slice(0, 20)) {
          lines.push(`  ${k.padEnd(18)} ${String(mem[k]).slice(0, 60)}`);
        }
        return { output: lines.join("\n") };
      } catch (e) {
        return { output: `Error: ${e instanceof Error ? e.message : String(e)}` };
      }
    }

    case "/palace": {
      try {
        const st = agent.memory.palace.status();
        return { output: `Palace: ${String(st.total_drawers ?? 0)} drawers` };
      } catch (e) {
        return { output: `Error: ${e instanceof Error ? e.message : String(e)}` };
      }
    }

    case "/reset": {
      try {
        agent.reset();
        return { output: "Conversation reset." };
      } catch (e) {
        return { output: `Error: ${e instanceof Error ? e.message : String(e)}` };
      }
    }

    default:
      return { output: `Unknown command: ${cmd}\nType /help for the list.` };
  }
}

/* ── Shell command (!cmd) ──────────────────────────────────────────── */

function handleShell(cmd: string, _ctx: SlashContext): SlashResult {
  if (!cmd) return { output: "Usage: !<command>\nExample: !ls -la" };
  try {
    const out = execSync(cmd, {
      cwd: process.cwd(),
      encoding: "utf-8",
      timeout: 30_000,
      maxBuffer: 1024 * 1024 * 2,
    });
    return { output: `$ ${cmd}\n\n${out || "(no output)"}` };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    const out = err.stdout ?? "";
    const errOut = err.stderr ?? err.message ?? String(e);
    return { output: `$ ${cmd}\n\n${out}\n[error] ${errOut.slice(0, 200)}` };
  }
}

/* ── File mention (@path) ──────────────────────────────────────────── */

function handleFileMention(input: string, ctx: SlashContext): SlashResult {
  const match = input.match(/@([^\s]+)/);
  if (!match) return { output: "Usage: @<path/to/file>" };
  const filePath = match[1];
  const fullPath = path.isAbsolute(filePath) ? filePath : path.resolve(ctx.cwd, filePath);
  if (!fs.existsSync(fullPath)) {
    return { output: `File not found: ${fullPath}` };
  }
  try {
    const content = fs.readFileSync(fullPath, "utf-8");
    const relPath = path.relative(ctx.cwd, fullPath);
    const preview = content.length > 2000
      ? content.slice(0, 2000) + `\n... (${content.length - 2000} more bytes)`
      : content;
    return {
      output: `**@${relPath}** (${content.length} bytes)\n\n\`\`\`\n${preview}\n\`\`\``,
    };
  } catch (e) {
    return { output: `Error reading file: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/* ── Provider/model helpers ────────────────────────────────────────── */

const PROVIDER_CATALOG = [
  { id: "llamacpp", name: "llama.cpp (Direct GGUF)", category: "local", needsApiKey: false, defaultBaseUrl: "" },
  { id: "lmstudio", name: "LM Studio", category: "local", needsApiKey: false, defaultBaseUrl: "http://localhost:1234/v1" },
  { id: "ollama", name: "Ollama", category: "local", needsApiKey: false, defaultBaseUrl: "http://localhost:11434" },
  { id: "openai", name: "OpenAI", category: "cloud", needsApiKey: true, defaultBaseUrl: "https://api.openai.com/v1" },
  { id: "openrouter", name: "OpenRouter", category: "cloud", needsApiKey: true, defaultBaseUrl: "https://openrouter.ai/api/v1" },
  { id: "orca", name: "OrcaRouter", category: "cloud", needsApiKey: true, defaultBaseUrl: "https://api.orcarouter.ai/v1" },
  { id: "anthropic", name: "Anthropic", category: "cloud", needsApiKey: true, defaultBaseUrl: "https://api.anthropic.com/v1" },
  { id: "gemini", name: "Google Gemini", category: "cloud", needsApiKey: true, defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta" },
  { id: "groq", name: "Groq", category: "cloud", needsApiKey: true, defaultBaseUrl: "https://api.groq.com/openai/v1" },
  { id: "together", name: "Together AI", category: "cloud", needsApiKey: true, defaultBaseUrl: "https://api.together.xyz/v1" },
  { id: "mistral", name: "Mistral", category: "cloud", needsApiKey: true, defaultBaseUrl: "https://api.mistral.ai/v1" },
  { id: "deepseek", name: "DeepSeek", category: "cloud", needsApiKey: true, defaultBaseUrl: "https://api.deepseek.com/v1" },
  { id: "fireworks", name: "Fireworks AI", category: "cloud", needsApiKey: true, defaultBaseUrl: "https://api.fireworks.ai/inference/v1" },
  { id: "perplexity", name: "Perplexity", category: "cloud", needsApiKey: true, defaultBaseUrl: "https://api.perplexity.ai" },
  { id: "custom", name: "Custom OpenAI-compatible", category: "cloud", needsApiKey: true, defaultBaseUrl: "" },
];

function getProviderConfig(agent: any): { prov: string; pCfg: Record<string, unknown>; llm: Record<string, unknown> } {
  const cfg = agent.config as Record<string, unknown>;
  let llm = cfg.llm as Record<string, unknown> | undefined;
  if (!llm) { cfg.llm = { active_provider: "llamacpp", providers: {} }; llm = cfg.llm as Record<string, unknown>; }
  if (!llm.providers) llm.providers = {};
  const prov = String(cfg.provider ?? cfg.backend ?? llm.active_provider ?? "llamacpp");
  const providers = llm.providers as Record<string, Record<string, unknown>>;
  if (!providers[prov]) providers[prov] = {};
  return { prov, pCfg: providers[prov], llm };
}

function currentProvider(agent: any): string {
  const { prov, pCfg } = getProviderConfig(agent);
  const meta = PROVIDER_CATALOG.find(p => p.id === prov);
  const lines: string[] = [`Active provider: ${prov}`, ""];
  if (meta) lines.push(`Name:           ${meta.name} (${meta.category})`);
  if (pCfg.base_url) lines.push(`Base URL:       ${String(pCfg.base_url)}`);
  if (meta?.needsApiKey) {
    lines.push(`API key:        ${pCfg.api_key ? "✓ set" : "✗ missing"}`);
  }
  if (pCfg.model_name) lines.push(`Model:         ${String(pCfg.model_name)}`);
  return lines.join("\n");
}

function listProviders(agent: any): string {
  const { prov, pCfg, llm } = getProviderConfig(agent);
  const providers = llm.providers as Record<string, Record<string, unknown>>;
  const lines: string[] = ["Supported providers:", ""];
  for (const p of PROVIDER_CATALOG) {
    const isOn = p.id === prov;
    const cfg_p = providers[p.id] ?? {};
    const hasKey = Boolean(cfg_p.api_key);
    const keyMark = p.needsApiKey ? (hasKey ? "✓" : "✗") : "-";
    const model = cfg_p.model_name ? String(cfg_p.model_name).slice(0, 20) : "";
    const cat = p.category === "local" ? "local" : "cloud";
    lines.push(`  ${isOn ? "*" : " "} ${p.id.padEnd(16)} ${cat.padEnd(6)} ${keyMark}  ${p.name}${model ? "  → " + model : ""}`);
  }
  lines.push("", "* = active   ✓ = key set   ✗ = key missing", "Switch: /switch <provider>   Models: /models");
  return lines.join("\n");
}

async function switchProvider(agent: any, target: string): Promise<SlashResult> {
  const meta = PROVIDER_CATALOG.find(p => p.id === target);
  if (!meta) {
    return { output: `Unknown provider: ${target}\nValid: ${PROVIDER_CATALOG.map(p => p.id).join(", ")}` };
  }
  const { pCfg, llm } = getProviderConfig(agent);
  const providers = llm.providers as Record<string, Record<string, unknown>>;
  if (!providers[target]) providers[target] = {};

  // API key check
  if (meta.needsApiKey && !providers[target].api_key) {
    const envKey = `${target.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`;
    const envVal = process.env[envKey] ?? process.env[`${target}_API_KEY`];
    if (envVal) {
      providers[target].api_key = envVal;
    } else {
      return {
        output: `**${target}** requires an API key.\n\nSet it with:\n\`\`\`bash\nexport ${envKey}=your-key\n\`\`\`\n\nThen restart: \`node dist/tui/entry.js --provider ${target}\``,
      };
    }
  }

  // Default base_url
  if (!providers[target].base_url && meta.defaultBaseUrl) {
    providers[target].base_url = meta.defaultBaseUrl;
  }

  // Update config
  llm.active_provider = target;
  (agent.config as Record<string, unknown>).provider = target;
  (agent.config as Record<string, unknown>).backend = target;

  // Disable daemon on cloud
  const isCloud = meta.category === "cloud";
  if (isCloud) {
    const cfg = agent.config as Record<string, unknown>;
    if (!cfg.daemon) cfg.daemon = {};
    (cfg.daemon as Record<string, unknown>).enabled = false;
    cfg.awareness = { enabled: false };
    // Kill local llama-server
    const killCmd = process.platform === "win32"
      ? 'taskkill /f /im llama-server.exe 2>nul & taskkill /f /im llama-cli.exe 2>nul'
      : 'pkill -f "llama.*server" 2>/dev/null; pkill -f "llama-cli" 2>/dev/null; true';
    try { execSync(killCmd, { stdio: "ignore" }); } catch {}
  }

  // Apply to live agent
  agent.switchBackend(target);

  // Read the new model from config
  const newModel = String(providers[target]?.model_name ?? "auto");
  const modelShort = newModel.split(/[\\/]/).pop()?.replace(/\.(gguf|bin)$/i, "") ?? newModel;

  return {
    output: `**Switched to ${target}**${isCloud ? " (cloud — daemon disabled, local model killed)" : " (local)"}.\n\nNext message will use ${target}.\nRun \`/models refresh\` to fetch available models from ${target}.`,
    action: "update-footer",
    newFooter: { provider: target, model: modelShort },
  };
}

async function useModel(agent: any, name: string): Promise<SlashResult> {
  const { prov, pCfg, llm } = getProviderConfig(agent);
  const providers = llm.providers as Record<string, Record<string, unknown>>;

  const isPath = name.includes(path.sep) || name.toLowerCase().endsWith(".gguf");
  let resolved = name;
  if (isPath && !path.isAbsolute(name)) resolved = path.resolve(name);
  if (isPath && !fs.existsSync(resolved)) {
    return { output: `Model file not found: ${resolved}` };
  }

  if (!providers[prov]) providers[prov] = {};
  if (isPath) {
    providers[prov].model_path = resolved;
    providers[prov].model_name = path.basename(resolved);
  } else {
    providers[prov].model_name = name;
  }

  // Save config
  try {
    const { saveConfig } = distRequire("core/config.js");
    saveConfig(agent.config);
  } catch {}

  // Apply to live agent
  const modelShort = (isPath ? path.basename(resolved) : name)
    .replace(/\.(gguf|bin)$/i, "");

  try {
    agent.switchModel(modelShort);
    if (isPath) {
      const agentCfg = agent.config as Record<string, unknown>;
      const agentLlm = agentCfg.llm as Record<string, unknown> | undefined;
      const agentProv = (agentLlm?.providers as Record<string, Record<string, unknown>> | undefined)?.[prov];
      if (agentProv) agentProv.model_path = resolved;
    }
    agent.rebuildLlmPublic?.();
  } catch (e) {
    return { output: `Error switching model: ${e instanceof Error ? e.message : String(e)}` };
  }

  return {
    output: `**Switched to ${modelShort}**\n\nProvider: ${prov}\nConfig saved. Next message will use the new model.`,
    action: "update-footer",
    newFooter: { provider: prov, model: modelShort },
  };
}

async function listModels(agent: any): Promise<string> {
  const { prov, pCfg } = getProviderConfig(agent);
  const lines: string[] = ["Available models:", ""];

  // Section 1: Local vault GGUFs
  const modelsDir = path.join(os.homedir(), ".axoniz", "models");
  const vault: string[] = [];
  function walk(dir: string, depth = 0) {
    if (depth > 6) return;
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full, depth + 1);
        else if (e.name.toLowerCase().endsWith(".gguf")) vault.push(full);
      }
    } catch {}
  }
  walk(modelsDir);
  if (vault.length > 0) {
    lines.push("**Local vault** (" + vault.length + " models):");
    for (const m of vault) {
      let sizeGb = 0;
      try { sizeGb = fs.statSync(m).size / 1024 ** 3; } catch {}
      lines.push(`  ${path.basename(m).padEnd(50)} ${sizeGb.toFixed(1)} GB`);
    }
    lines.push("");
  }

  // Section 2: Registry
  try {
    const { REGISTRY } = distRequire("core/models.js");
    lines.push("**Registry** (vetted, downloadable):");
    for (const m of Object.values(REGISTRY) as any[]) {
      const rec = m.recommended ? " ★" : "";
      lines.push(`  ${m.name}${rec}  ${m.size_gb}GB ${m.speed_toks}  ${m.tags?.slice(0, 3).join(", ")}`);
    }
    lines.push("");
  } catch {}

  // Section 3: Cloud provider models
  if (pCfg.api_key && pCfg.base_url) {
    lines.push(`**${prov} models** (from API):`);
    lines.push("  Run `/models refresh` to fetch the live list from the provider.");
    lines.push("");
  }

  // Section 4: Active
  const activeModel = String(pCfg.model_name ?? pCfg.model_path ?? "auto");
  lines.push(`**Active:** ${prov} / ${activeModel}`);
  lines.push("");
  lines.push("Switch: `/use <name>` or `/use <path/to/model.gguf>`");

  return lines.join("\n");
}

async function refreshCloudModels(agent: any): Promise<SlashResult> {
  const { prov, pCfg } = getProviderConfig(agent);
  const baseUrl = String(pCfg.base_url ?? "");
  const apiKey = String(pCfg.api_key ?? "");

  if (!baseUrl) return { output: `No base_url configured for ${prov}. Run /switch ${prov} first.` };

  try {
    const url = baseUrl.endsWith("/v1") ? baseUrl + "/models" : baseUrl + "/v1/models";
    const res = await fetch(url, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { output: `HTTP ${res.status}: ${await res.text().catch(() => "")}` };

    const data = (await res.json()) as { data?: Array<{ id: string; context_length?: number }> };
    const models = data.data ?? [];
    if (models.length === 0) return { output: "Provider returned 0 models." };

    const lines: string[] = [`**${models.length} models available from ${prov}:**`, ""];
    for (const m of models.slice(0, 50)) {
      const ctx = m.context_length ? `  ${Math.round(m.context_length / 1024)}K ctx` : "";
      lines.push(`  ${m.id}${ctx}`);
    }
    if (models.length > 50) lines.push(`\n... and ${models.length - 50} more`);
    lines.push("\nSwitch with: `/use <model-id>`");

    return { output: lines.join("\n"), action: "update-footer" };
  } catch (e) {
    return { output: `Failed to fetch models: ${e instanceof Error ? e.message : String(e)}` };
  }
}

function formatHelp(): string {
  return `**Slash commands:**

  /help              Show this help
  /models            List all available models (vault + registry + cloud)
  /models refresh    Fetch live model list from the cloud provider
  /use <name>        Switch model (name or path to .gguf)
  /providers         List all supported providers with status
  /provider          Show the active provider details
  /switch <p>        Switch provider live (kills local model on cloud)
  /mode [agent|chat|goal]  Switch agent mode
  /web               Launch the web dashboard in browser
  /tools             List available agent tools
  /history           Show conversation history for this session
  /config            Show active config
  /health            System health report
  /memory            Show semantic memory
  /palace            Palace status
  /clear             Clear screen
  /reset             Clear conversation history
  /exit              Quit

**Other:**
  !<cmd>             Run a shell command (e.g. !ls -la)
  @<path>            Read a file into the conversation (e.g. @src/index.ts)`;
}
