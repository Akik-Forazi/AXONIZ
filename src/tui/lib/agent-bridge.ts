/**
 * AXONIZ Agent Bridge — loads the real AXONIZ Agent from dist/ and
 * wraps it for the TUI. No mocks, no stubs — real agent.chatStream().
 */
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, "..", "..");
const esmRequire = createRequire(import.meta.url);

function distRequire(mod: string): any {
  const full = path.join(DIST, mod);
  if (!fs.existsSync(full)) throw new Error(`CLI not built: ${full}. Run npm run build.`);
  return esmRequire(full);
}

export interface ProviderInfo {
  id: string;
  name: string;
  category: "local" | "cloud";
  needsApiKey: boolean;
  defaultBaseUrl: string;
}

export const PROVIDER_CATALOG: ProviderInfo[] = [
  { id: "llamacpp", name: "llama.cpp (Direct GGUF)", category: "local", needsApiKey: false, defaultBaseUrl: "" },
  { id: "lmstudio", name: "LM Studio", category: "local", needsApiKey: false, defaultBaseUrl: "http://localhost:1234/v1" },
  { id: "ollama", name: "Ollama", category: "local", needsApiKey: false, defaultBaseUrl: "http://localhost:11434" },
  { id: "openai", name: "OpenAI", category: "cloud", needsApiKey: true, defaultBaseUrl: "https://api.openai.com/v1" },
  { id: "openrouter", name: "OpenRouter", category: "cloud", needsApiKey: true, defaultBaseUrl: "https://openrouter.ai/api/v1" },
  { id: "orca", name: "OrcaRouter", category: "cloud", needsApiKey: true, defaultBaseUrl: "https://api.orcarouter.ai/v1" },
  { id: "anthropic", name: "Anthropic", category: "cloud", needsApiKey: true, defaultBaseUrl: "https://api.anthropic.com/v1" },
  { id: "groq", name: "Groq", category: "cloud", needsApiKey: true, defaultBaseUrl: "https://api.groq.com/openai/v1" },
  { id: "together", name: "Together AI", category: "cloud", needsApiKey: true, defaultBaseUrl: "https://api.together.xyz/v1" },
  { id: "mistral", name: "Mistral", category: "cloud", needsApiKey: true, defaultBaseUrl: "https://api.mistral.ai/v1" },
  { id: "deepseek", name: "DeepSeek", category: "cloud", needsApiKey: true, defaultBaseUrl: "https://api.deepseek.com/v1" },
  { id: "fireworks", name: "Fireworks AI", category: "cloud", needsApiKey: true, defaultBaseUrl: "https://api.fireworks.ai/inference/v1" },
  { id: "perplexity", name: "Perplexity", category: "cloud", needsApiKey: true, defaultBaseUrl: "https://api.perplexity.ai" },
  { id: "custom", name: "Custom OpenAI-compatible", category: "cloud", needsApiKey: true, defaultBaseUrl: "" },
];

const CLOUD = new Set(["orca", "openrouter", "openai", "anthropic", "groq", "together", "mistral", "deepseek", "fireworks", "perplexity", "gemini"]);

export function getProviderInfo(agent: any): { provider: string; model: string; baseUrl: string; hasKey: boolean } {
  const cfg = agent.config as Record<string, unknown>;
  const llm = cfg.llm as { active_provider?: string; providers?: Record<string, Record<string, unknown>> } | undefined;
  const provider = String(cfg.provider ?? cfg.backend ?? llm?.active_provider ?? "llamacpp");
  const pCfg = llm?.providers?.[provider] ?? {};
  const model = String(pCfg.model_name ?? pCfg.model_path ?? cfg.model_name ?? "auto");
  const modelShort = model.split(/[\\/]/).pop()?.replace(/\.(gguf|bin)$/i, "") ?? model;
  return {
    provider,
    model: modelShort,
    baseUrl: String(pCfg.base_url ?? ""),
    hasKey: Boolean(pCfg.api_key),
  };
}

export function createAgent(providerOverride?: string): any {
  const { loadConfig } = distRequire("core/config.js");
  const config = loadConfig();

  if (providerOverride) {
    config.provider = providerOverride;
    config.backend = providerOverride;
    const llm = config.llm as Record<string, unknown> | undefined;
    if (llm) llm.active_provider = providerOverride;
    if (CLOUD.has(providerOverride)) {
      config.daemon = { ...(config.daemon ?? {}), enabled: false };
      config.awareness = { enabled: false };
    }
  }

  const { Agent } = distRequire("core/agent.js");
  return new Agent(config);
}

export function loadConfig(): Record<string, unknown> {
  return distRequire("core/config.js").loadConfig();
}

export function saveConfig(cfg: Record<string, unknown>): void {
  distRequire("core/config.js").saveConfig(cfg);
}

export { distRequire };
