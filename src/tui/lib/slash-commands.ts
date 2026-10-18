/**
 * Slash command handler — intercepts `/commands` in the TUI before they
 * reach the LLM. Mirrors the slash commands from src/core/cli.ts but
 * adapted for the Ink-based UI.
 *
 * Returns the result as a string that gets rendered as an assistant
 * message in the chat log. Or returns null if the input isn't a slash
 * command (should be sent to the LLM instead).
 *
 * Special return values:
 *   - "__clear__"  → clear the message log
 *   - "__exit__"   → quit the TUI
 */
export interface SlashContext {
  agent: any;  // The AXONIZ Agent instance
  cwd: string;
}

export type SlashResult = string | null | "__clear__" | "__exit__";

export async function handleSlashCommand(input: string, ctx: SlashContext): Promise<SlashResult> {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;

  const parts = trimmed.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);
  const agent = ctx.agent;

  switch (cmd) {
    case "/help":
      return formatHelp();

    case "/clear":
      return "__clear__";

    case "/exit":
    case "/quit":
      return "__exit__";

    case "/models": {
      if (args[0]?.toLowerCase() === "refresh") {
        return "Model refresh requires a cloud provider with an API key. Run /switch <provider> first.";
      }
      return await listModels();
    }

    case "/providers":
      return listProviders(agent);

    case "/provider":
      return currentProvider(agent);

    case "/switch": {
      if (!args[0]) return "Usage: /switch <provider>\nRun /providers to see the list.";
      return await switchProvider(agent, args[0].toLowerCase());
    }

    case "/use": {
      if (!args[0]) return "Usage: /use <name>\nRun /models to see the list.";
      return `Model switching is not yet wired into the TUI. Use the CLI: axoniz model use ${args[0]}`;
    }

    case "/tools": {
      try {
        const tools = agent.availableTools;
        if (!tools || tools.length === 0) return "(no tools registered)";
        const lines: string[] = [`Available tools (${tools.length}):`, ""];
        for (const t of tools) {
          const fn = t.function;
          const desc = String(fn.description ?? "").split("\n")[0].slice(0, 60);
          lines.push(`  ${fn.name.padEnd(28)} ${desc}`);
        }
        return lines.join("\n");
      } catch (e) {
        return `Error listing tools: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    case "/history": {
      try {
        const msgs = agent.history.getSession();
        if (msgs.length === 0) return "(no messages in this session)";
        const lines: string[] = [`Session history (${msgs.length} messages):`, ""];
        for (let i = 0; i < msgs.length; i++) {
          const m = msgs[i];
          const role = String(m.role ?? "user").toUpperCase();
          const content = String(m.content ?? "").slice(0, 80);
          lines.push(`  [${i}] ${role.padEnd(10)} ${content}`);
        }
        return lines.join("\n");
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
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
        return lines.join("\n");
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    case "/health": {
      try {
        const h = await agent.health();
        const lines: string[] = ["System health:", ""];
        lines.push(`  status:     ${String(h.status ?? "—")}`);
        lines.push(`  backend:    ${String(h.backend ?? "—")}`);
        lines.push(`  model:      ${String(h.model ?? "—")}`);
        return lines.join("\n");
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    case "/web":
      return "Web dashboard launch is not yet wired into the TUI. Use the CLI: axoniz --web";

    case "/memory": {
      try {
        const mem = agent.memory.all();
        const keys = Object.keys(mem);
        if (keys.length === 0) return "(empty)";
        const lines: string[] = ["Semantic memory:", ""];
        for (const k of keys.slice(0, 20)) {
          lines.push(`  ${k.padEnd(18)} ${String(mem[k]).slice(0, 60)}`);
        }
        return lines.join("\n");
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    case "/palace": {
      try {
        const st = agent.memory.palace.status();
        return `Palace: ${String(st.total_drawers ?? 0)} drawers`;
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    case "/reset": {
      try {
        agent.reset();
        return "Conversation reset.";
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    default:
      return `Unknown command: ${cmd}\nType /help for the list of commands.`;
  }
}

function formatHelp(): string {
  const lines: string[] = [
    "Slash commands:",
    "",
    "  /help              Show this help",
    "  /models            List all available models",
    "  /use <name>        Switch model",
    "  /providers         List all supported providers",
    "  /provider          Show the active provider",
    "  /switch <p>        Switch provider live (kills local model on cloud)",
    "  /web               Launch the web dashboard",
    "  /tools             List available agent tools",
    "  /history           Show conversation history for this session",
    "  /memory            Show semantic memory",
    "  /palace            Palace status",
    "  /clear             Clear screen",
    "  /reset             Clear conversation history",
    "  /config            Show active config",
    "  /health            System health report",
    "  /exit              Quit",
    "",
    "Type !<cmd> to run a shell command.",
  ];
  return lines.join("\n");
}

const PROVIDER_CATALOG = [
  { id: "llamacpp", name: "llama.cpp (Direct GGUF)", category: "local", needsApiKey: false },
  { id: "lmstudio", name: "LM Studio", category: "local", needsApiKey: false },
  { id: "ollama", name: "Ollama", category: "local", needsApiKey: false },
  { id: "openai", name: "OpenAI", category: "cloud", needsApiKey: true },
  { id: "openrouter", name: "OpenRouter", category: "cloud", needsApiKey: true },
  { id: "orca", name: "OrcaRouter", category: "cloud", needsApiKey: true },
  { id: "anthropic", name: "Anthropic", category: "cloud", needsApiKey: true },
  { id: "gemini", name: "Google Gemini", category: "cloud", needsApiKey: true },
  { id: "groq", name: "Groq", category: "cloud", needsApiKey: true },
  { id: "together", name: "Together AI", category: "cloud", needsApiKey: true },
  { id: "mistral", name: "Mistral", category: "cloud", needsApiKey: true },
  { id: "deepseek", name: "DeepSeek", category: "cloud", needsApiKey: true },
  { id: "fireworks", name: "Fireworks AI", category: "cloud", needsApiKey: true },
  { id: "perplexity", name: "Perplexity", category: "cloud", needsApiKey: true },
  { id: "custom", name: "Custom OpenAI-compatible", category: "cloud", needsApiKey: true },
];

function currentProvider(agent: any): string {
  const cfg = agent.config as Record<string, unknown>;
  const llm = cfg.llm as { active_provider?: string; providers?: Record<string, Record<string, unknown>> } | undefined;
  const prov = String(cfg.provider ?? cfg.backend ?? llm?.active_provider ?? "llamacpp");
  const meta = PROVIDER_CATALOG.find((p) => p.id === prov);
  const pCfg = llm?.providers?.[prov] ?? {};
  const lines: string[] = [
    `Active provider: ${prov}`,
    "",
  ];
  if (meta) lines.push(`Name:           ${meta.name} (${meta.category})`);
  if (pCfg.base_url) lines.push(`Base URL:       ${String(pCfg.base_url)}`);
  if (meta?.needsApiKey) {
    const hasKey = Boolean(pCfg.api_key);
    lines.push(`API key:        ${hasKey ? "set" : "missing"}`);
  }
  return lines.join("\n");
}

function listProviders(agent: any): string {
  const cfg = agent.config as Record<string, unknown>;
  const llm = cfg.llm as { active_provider?: string; providers?: Record<string, Record<string, unknown>> } | undefined;
  const active = String(cfg.provider ?? cfg.backend ?? llm?.active_provider ?? "llamacpp");
  const lines: string[] = ["Supported providers:", ""];
  for (const p of PROVIDER_CATALOG) {
    const isOn = p.id === active;
    const dot = isOn ? "*" : " ";
    const cfg_p = llm?.providers?.[p.id] ?? {};
    const hasKey = Boolean(cfg_p.api_key);
    const keyMark = p.needsApiKey ? (hasKey ? "✓" : "✗") : "-";
    const cat = p.category === "local" ? "local" : "cloud";
    lines.push(`  ${dot} ${p.id.padEnd(16)} ${cat.padEnd(6)} ${keyMark}  ${p.name}`);
  }
  lines.push("", "* = active   ✓ = api key set   ✗ = api key missing", "Switch with: /switch <provider>");
  return lines.join("\n");
}

async function switchProvider(agent: any, target: string): Promise<string> {
  const meta = PROVIDER_CATALOG.find((p) => p.id === target);
  if (!meta) {
    return `Unknown provider: ${target}\nValid: ${PROVIDER_CATALOG.map((p) => p.id).join(", ")}`;
  }
  const cfg = agent.config as Record<string, unknown>;
  const llm = cfg.llm as { active_provider?: string; providers?: Record<string, Record<string, unknown>> } | undefined;
  if (!llm) (cfg as Record<string, unknown>).llm = { active_provider: target, providers: {} };
  if (!llm?.providers) (cfg.llm as Record<string, unknown>).providers = {};
  const providers = (cfg.llm as Record<string, unknown>).providers as Record<string, Record<string, unknown>>;
  if (!providers[target]) providers[target] = {};

  // Check env var for API key
  if (meta.needsApiKey && !providers[target].api_key) {
    const envKey = `${target.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`;
    const envVal = process.env[envKey] ?? process.env[`${target}_API_KEY`];
    if (envVal) {
      providers[target].api_key = envVal;
    } else {
      return `${target} requires an API key.\nSet env var: ${envKey}=<key>\nOr use the CLI: axoniz --provider ${target}`;
    }
  }

  // Set default base_url if missing
  const defaultBaseUrls: Record<string, string> = {
    openai: "https://api.openai.com/v1",
    openrouter: "https://openrouter.ai/api/v1",
    orca: "https://api.orcarouter.ai/v1",
    anthropic: "https://api.anthropic.com/v1",
    groq: "https://api.groq.com/openai/v1",
    together: "https://api.together.xyz/v1",
    mistral: "https://api.mistral.ai/v1",
    deepseek: "https://api.deepseek.com/v1",
    fireworks: "https://api.fireworks.ai/inference/v1",
    perplexity: "https://api.perplexity.ai",
  };
  if (!providers[target].base_url && defaultBaseUrls[target]) {
    providers[target].base_url = defaultBaseUrls[target];
  }

  (cfg.llm as Record<string, unknown>).active_provider = target;
  cfg.provider = target;
  cfg.backend = target;

  // Disable daemon + awareness when switching to cloud
  const isCloud = meta.category === "cloud";
  if (isCloud) {
    const daemon = cfg.daemon as Record<string, unknown> | undefined;
    if (daemon) daemon.enabled = false;
    cfg.awareness = { enabled: false };
  }

  // Apply to the live agent
  agent.switchBackend(target);
  return `Switched to ${target}${isCloud ? " (cloud — daemon disabled)" : " (local)"}.\nNext message will use ${target}.`;
}

async function listModels(): Promise<string> {
  // Try to import the registry from the CLI
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const req = (eval('require') as any);
    const path = await import("node:path");
    const os = await import("node:os");
    const fs = await import("node:fs");
    const distDir = path.join(process.cwd(), "dist");
    if (!fs.existsSync(path.join(distDir, "core", "models.js"))) {
      return "CLI not built. Run `npm run build` in the project root.";
    }
    const { REGISTRY } = req(path.join(distDir, "core", "models.js"));
    const lines: string[] = ["Registry (vetted, downloadable):", ""];
    for (const m of Object.values(REGISTRY)) {
      const rec = (m as { recommended?: boolean; name: string; size_gb: number; speed_toks: string; tags: string[] }).recommended ? " ★" : "";
      lines.push(`  ${(m as { name: string }).name}${rec}  ${(m as { size_gb: number }).size_gb}GB ${(m as { speed_toks: string }).speed_toks}  ${(m as { tags: string[] }).tags.slice(0, 3).join(", ")}`);
    }
    return lines.join("\n");
  } catch (e) {
    return `Error listing models: ${e instanceof Error ? e.message : String(e)}`;
  }
}
