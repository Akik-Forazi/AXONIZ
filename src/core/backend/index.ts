/**
 * Backend factory + re-exports.
 * Port of the `Backend` ABC, response types, `get_backend` and
 * `list_supported_providers` from axoniz/core/backend.py.
 */
import { debug } from "../debug.js";
import { providerConfig, activeProvider, type AxonizConfig } from "../config.js";
import { LlamaCppBackend } from "./llamacpp.js";
import { LlamaCppServerBackend } from "./llama_server.js";
import { OpenAICompatibleBackend } from "./openai.js";
import { OllamaBackend } from "./ollama.js";
import { LMStudioBackend } from "./lmstudio.js";
import {
  Backend,
  isToolCallResponse,
  textResponse,
  toolCallResponse,
  type BackendHealth,
  type ChatMessage,
  type CompletionResult,
  type TextResponse,
  type ToolCall,
  type ToolCallResponse,
} from "./types.js";

export {
  Backend,
  isToolCallResponse,
  textResponse,
  toolCallResponse,
  LlamaCppBackend,
  LlamaCppServerBackend,
  OpenAICompatibleBackend,
  OllamaBackend,
  LMStudioBackend,
};
export type {
  BackendHealth,
  ChatMessage,
  CompletionResult,
  TextResponse,
  ToolCall,
  ToolCallResponse,
};

/**
 * Build the right backend from the hierarchical config dict.
 * Falls back to the legacy flat config when `llm` is absent.
 */
export function getBackend(cfg: AxonizConfig, tools: unknown[] = []): Backend {
  const hasLlm = cfg.llm !== undefined && cfg.llm !== null;
  const prov = hasLlm
    ? String(cfg.llm.active_provider ?? "llamacpp")
    : String(cfg.provider ?? cfg.backend ?? "llamacpp")
        .toLowerCase()
        .trim();
  const p = providerConfig(cfg, prov);

  debug(`[Backend Factory] provider=${prov}`);

  const num = (key: string, fallback: number): number => {
    const v = p[key];
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const str = (key: string, fallback: string): string => {
    const v = p[key];
    return v === undefined || v === null || v === "" ? fallback : String(v);
  };

  if (prov === "openai" || prov === "openai_compatible") {
    return new OpenAICompatibleBackend({
      baseUrl: str("base_url", "https://api.openai.com/v1"),
      apiKey: str("api_key", ""),
      modelName: str("model_name", "gpt-4o"),
      temperature: num("temperature", 0.2),
      maxTokens: num("max_tokens", 4096),
      tools,
    });
  }

  if (prov === "ollama") {
    return new OllamaBackend({
      baseUrl: str("base_url", "http://localhost:11434"),
      modelName: str("model_name", "llama3"),
      temperature: num("temperature", 0.2),
      maxTokens: num("max_tokens", 4096),
      tools,
    });
  }

  if (prov === "lmstudio") {
    return new LMStudioBackend({
      baseUrl: str("base_url", "http://localhost:1234"),
      modelName: str("model_name", ""),
      apiKey: str("api_key", "lm-studio"),
      temperature: num("temperature", 0.2),
      maxTokens: num("max_tokens", 4096),
      autoLoad: p.auto_load === undefined ? true : Boolean(p.auto_load),
      autoStart: Boolean(p.auto_start),
      lmsBin: str("lms_bin", ""),
      tools,
    });
  }

  if (prov === "gguf_server" || prov === "llamacpp_server") {
    return new LlamaCppServerBackend({
      baseUrl: str("base_url", "http://localhost:8080"),
      modelPath: str("model_path", ""),
      temperature: num("temperature", 0.2),
      maxTokens: num("max_tokens", 4096),
      nCtx: num("n_ctx", 32768),
      llamaBin: str("llama_bin", ""),
      autoStart: Boolean(p.auto_start),
      nGpuLayers: num("n_gpu_layers", -1),
      tools,
    });
  }

  // Default: llamacpp (in-process, node-llama-cpp)
  return new LlamaCppBackend({
    modelPath: str("model_path", ""),
    temperature: num("temperature", 0.2),
    maxTokens: num("max_tokens", 4096),
    nCtx: num("n_ctx", 32768),
    nGpuLayers: num("n_gpu_layers", -1),
    tools,
  });
}

export interface ProviderInfo {
  id: string;
  name: string;
  requires: string;
  model_format: string;
}

/** All supported providers, for UI display. */
export function listSupportedProviders(): ProviderInfo[] {
  return [
    {
      id: "llamacpp",
      name: "LlamaCpp (Direct GGUF)",
      requires: "node-llama-cpp",
      model_format: ".gguf file path",
    },
    {
      id: "llamacpp_server",
      name: "LlamaCpp Server",
      requires: "llama-server binary",
      model_format: ".gguf file path",
    },
    {
      id: "lmstudio",
      name: "LM Studio (LMS)",
      requires: "LM Studio running",
      model_format: "model name or path",
    },
    {
      id: "openai",
      name: "OpenAI / Compatible",
      requires: "api_key + base_url",
      model_format: "model name string",
    },
    {
      id: "ollama",
      name: "Ollama",
      requires: "Ollama running",
      model_format: "model name string",
    },
  ];
}

export { activeProvider };
