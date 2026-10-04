"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type ProviderId =
  | "llamacpp"
  | "lmstudio"
  | "ollama"
  | "openai"
  | "openrouter"
  | "gemini"
  | "anthropic"
  | "groq"
  | "together"
  | "mistral"
  | "deepseek"
  | "fireworks"
  | "perplexity"
  | "custom";

export interface ProviderConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface LlamacppConfig {
  modelPath: string;
  nCtx: number;
  nGpuLayers: number;
  nThreads: number;
}

export interface ProviderMeta {
  id: ProviderId;
  name: string;
  category: "local" | "cloud";
  description: string;
  defaultBaseUrl: string;
  needsApiKey: boolean;
  apiKeyLabel: string;
  apiKeyPlaceholder: string;
  docsUrl: string;
  /** known model identifier prefixes for hint display */
  popularModels: string[];
  /** input price per 1M tokens (USD) — for cost attribution; 0 for local */
  pricePerMTokIn: number;
  pricePerMTokOut: number;
}

export const PROVIDER_CATALOG: ProviderMeta[] = [
  {
    id: "llamacpp",
    name: "llama.cpp",
    category: "local",
    description: "Zero-overhead GGUF inference. The AXONIZ default.",
    defaultBaseUrl: "http://localhost:8080",
    needsApiKey: false,
    apiKeyLabel: "",
    apiKeyPlaceholder: "",
    docsUrl: "https://github.com/ggerganov/llama.cpp/tree/master/tools/server",
    popularModels: ["Qwen2.5-Coder-7B", "Llama-3.2-3B", "Phi-3.5-mini"],
    pricePerMTokIn: 0,
    pricePerMTokOut: 0,
  },
  {
    id: "lmstudio",
    name: "LM Studio",
    category: "local",
    description: "Local OpenAI-compatible server. Default port 1234.",
    defaultBaseUrl: "http://localhost:1234/v1",
    needsApiKey: false,
    apiKeyLabel: "API key (optional)",
    apiKeyPlaceholder: "lm-studio",
    docsUrl: "https://lmstudio.ai/docs/api-server",
    popularModels: [],
    pricePerMTokIn: 0,
    pricePerMTokOut: 0,
  },
  {
    id: "ollama",
    name: "Ollama",
    category: "local",
    description: "Local Ollama daemon. Default port 11434.",
    defaultBaseUrl: "http://localhost:11434",
    needsApiKey: false,
    apiKeyLabel: "",
    apiKeyPlaceholder: "",
    docsUrl: "https://ollama.com/docs/api",
    popularModels: ["llama3.2:3b", "qwen2.5-coder:7b", "phi3.5"],
    pricePerMTokIn: 0,
    pricePerMTokOut: 0,
  },
  {
    id: "openai",
    name: "OpenAI",
    category: "cloud",
    description: "GPT-4o, o1, o3, and the rest. Cloud — breaks offline guarantee.",
    defaultBaseUrl: "https://api.openai.com/v1",
    needsApiKey: true,
    apiKeyLabel: "API key",
    apiKeyPlaceholder: "sk-...",
    docsUrl: "https://platform.openai.com/docs/api-reference",
    popularModels: ["gpt-4o", "gpt-4o-mini", "o1", "o3-mini", "gpt-4-turbo"],
    pricePerMTokIn: 2.5,
    pricePerMTokOut: 10,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    category: "cloud",
    description: "Unified API for 300+ models. Cheapest path to frontier.",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    needsApiKey: true,
    apiKeyLabel: "API key",
    apiKeyPlaceholder: "sk-or-...",
    docsUrl: "https://openrouter.ai/docs",
    popularModels: [
      "anthropic/claude-3.5-sonnet",
      "openai/gpt-4o",
      "google/gemini-pro-1.5",
      "meta-llama/llama-3.2-70b-instruct",
      "deepseek/deepseek-chat",
    ],
    pricePerMTokIn: 0.25,
    pricePerMTokOut: 0.75,
  },
  {
    id: "gemini",
    name: "Google Gemini",
    category: "cloud",
    description: "Gemini 2.0 Flash / Pro / Ultra. Long context window.",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    needsApiKey: true,
    apiKeyLabel: "API key",
    apiKeyPlaceholder: "AIza...",
    docsUrl: "https://ai.google.dev/gemini-api/docs",
    popularModels: ["gemini-2.0-flash", "gemini-2.0-pro", "gemini-1.5-pro", "gemini-1.5-flash"],
    pricePerMTokIn: 0.075,
    pricePerMTokOut: 0.3,
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    category: "cloud",
    description: "Claude 3.5 Sonnet, Opus, Haiku. Strong on agentic tasks.",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    needsApiKey: true,
    apiKeyLabel: "API key",
    apiKeyPlaceholder: "sk-ant-...",
    docsUrl: "https://docs.anthropic.com/en/api/messages",
    popularModels: ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"],
    pricePerMTokIn: 3,
    pricePerMTokOut: 15,
  },
  {
    id: "groq",
    name: "Groq",
    category: "cloud",
    description: "LPU-accelerated inference. Fastest tokens/sec on the market.",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    needsApiKey: true,
    apiKeyLabel: "API key",
    apiKeyPlaceholder: "gsk_...",
    docsUrl: "https://console.groq.com/docs",
    popularModels: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
    pricePerMTokIn: 0.59,
    pricePerMTokOut: 0.79,
  },
  {
    id: "together",
    name: "Together AI",
    category: "cloud",
    description: "Open-weight models hosted. Cheap + fast for fine-tunes.",
    defaultBaseUrl: "https://api.together.xyz/v1",
    needsApiKey: true,
    apiKeyLabel: "API key",
    apiKeyPlaceholder: "...",
    docsUrl: "https://docs.together.ai",
    popularModels: ["meta-llama/Llama-3.3-70B-Instruct-Turbo", "Qwen/Qwen2.5-72B-Instruct-Turbo"],
    pricePerMTokIn: 0.88,
    pricePerMTokOut: 1.28,
  },
  {
    id: "mistral",
    name: "Mistral",
    category: "cloud",
    description: "Mistral + Mixtral hosted. European AI lab.",
    defaultBaseUrl: "https://api.mistral.ai/v1",
    needsApiKey: true,
    apiKeyLabel: "API key",
    apiKeyPlaceholder: "...",
    docsUrl: "https://docs.mistral.ai",
    popularModels: ["mistral-large-latest", "mistral-small-latest", "codestral-latest"],
    pricePerMTokIn: 2,
    pricePerMTokOut: 6,
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    category: "cloud",
    description: "DeepSeek V3 / R1. Cheapest reasoning models available.",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    needsApiKey: true,
    apiKeyLabel: "API key",
    apiKeyPlaceholder: "sk-...",
    docsUrl: "https://api-docs.deepseek.com",
    popularModels: ["deepseek-chat", "deepseek-reasoner"],
    pricePerMTokIn: 0.14,
    pricePerMTokOut: 0.28,
  },
  {
    id: "fireworks",
    name: "Fireworks AI",
    category: "cloud",
    description: "Fastest US-hosted inference for open-weight models.",
    defaultBaseUrl: "https://api.fireworks.ai/inference/v1",
    needsApiKey: true,
    apiKeyLabel: "API key",
    apiKeyPlaceholder: "...",
    docsUrl: "https://docs.fireworks.ai",
    popularModels: ["accounts/fireworks/models/llama-v3p3-70b-instruct", "accounts/fireworks/models/qwen2p5-coder-32b-instruct"],
    pricePerMTokIn: 0.9,
    pricePerMTokOut: 0.9,
  },
  {
    id: "perplexity",
    name: "Perplexity",
    category: "cloud",
    description: "Sonar models with built-in web search grounding.",
    defaultBaseUrl: "https://api.perplexity.ai",
    needsApiKey: true,
    apiKeyLabel: "API key",
    apiKeyPlaceholder: "pplx-...",
    docsUrl: "https://docs.perplexity.ai",
    popularModels: ["sonar-pro", "sonar", "sonar-reasoning"],
    pricePerMTokIn: 2,
    pricePerMTokOut: 8,
  },
  {
    id: "custom",
    name: "Custom OpenAI-compatible",
    category: "local",
    description: "Any endpoint that speaks the OpenAI chat protocol.",
    defaultBaseUrl: "",
    needsApiKey: false,
    apiKeyLabel: "API key (optional)",
    apiKeyPlaceholder: "",
    docsUrl: "",
    popularModels: [],
    pricePerMTokIn: 0,
    pricePerMTokOut: 0,
  },
];

export const DEFAULT_PROVIDERS: Record<ProviderId, ProviderConfig> =
  Object.fromEntries(
    PROVIDER_CATALOG.map((p) => [
      p.id,
      {
        enabled: p.id === "llamacpp",
        baseUrl: p.defaultBaseUrl,
        apiKey: "",
        model: p.popularModels[0] ?? "",
      },
    ]),
  ) as Record<ProviderId, ProviderConfig>;

const DEFAULT_LLAMACPP: LlamacppConfig = {
  modelPath: "~/.axoniz/models/Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf",
  nCtx: 8192,
  nGpuLayers: 0,
  nThreads: 8,
};

interface AuthState {
  token: string | null;
  username: string | null;
  setAuth: (token: string, username: string) => void;
  logout: () => void;
}

interface UiState extends AuthState {
  /* navigation — state-based router. URL stays /, but the app tracks a path */
  route: string;
  navigate: (to: string) => void;
  navigateBack: () => void;
  navigateToSection: (section: string) => void;

  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  activeModel: string | null;
  activeProvider: ProviderId;
  dataSource: "mock" | "live" | "unknown";

  providers: Record<ProviderId, ProviderConfig>;
  llamacpp: LlamacppConfig;

  /* model picker — for the chat/agent header */
  modelPickerOpen: boolean;
  openModelPicker: () => void;
  closeModelPicker: () => void;
  pickModel: (provider: ProviderId, model: string) => void;

  setProvider: (id: ProviderId, patch: Partial<ProviderConfig>) => void;
  setLlamacpp: (patch: Partial<LlamacppConfig>) => void;
  setActiveModel: (m: string | null) => void;
  setActiveProvider: (p: ProviderId) => void;
  setDataSource: (s: "mock" | "live") => void;
}

const INITIAL_ROUTE = "/chat";

export const useAxonizStore = create<UiState>()(
  persist(
    (set, get) => ({
      token: null,
      username: null,
      route: INITIAL_ROUTE,
      sidebarCollapsed: false,
      activeModel: null,
      activeProvider: "llamacpp",
      dataSource: "unknown",
      providers: DEFAULT_PROVIDERS,
      llamacpp: DEFAULT_LLAMACPP,
      modelPickerOpen: false,

      setAuth: (token, username) => set({ token, username, route: INITIAL_ROUTE }),
      logout: () => set({ token: null, username: null, route: "/chat" }),

      navigate: (to) => set({ route: to }),
      navigateBack: () => {
        const r = get().route;
        const parts = r.split("/").filter(Boolean);
        if (parts.length > 1) {
          set({ route: "/" + parts.slice(0, -1).join("/") });
        }
      },
      navigateToSection: (section) => set({ route: `/${section}` }),

      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      openModelPicker: () => set({ modelPickerOpen: true }),
      closeModelPicker: () => set({ modelPickerOpen: false }),
      pickModel: (provider, model) =>
        set({
          activeProvider: provider,
          activeModel: model,
          providers: {
            ...get().providers,
            [provider]: { ...get().providers[provider], model },
          },
          modelPickerOpen: false,
        }),
      setActiveModel: (activeModel) => set({ activeModel }),
      setActiveProvider: (activeProvider) => set({ activeProvider }),
      setDataSource: (dataSource) => set({ dataSource }),
      setProvider: (id, patch) =>
        set((s) => ({
          providers: {
            ...s.providers,
            [id]: { ...s.providers[id], ...patch },
          },
        })),
      setLlamacpp: (patch) =>
        set((s) => ({ llamacpp: { ...s.llamacpp, ...patch } })),
    }),
    {
      name: "axoniz-store-v4",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        token: s.token,
        username: s.username,
        route: s.route,
        sidebarCollapsed: s.sidebarCollapsed,
        activeModel: s.activeModel,
        activeProvider: s.activeProvider,
        providers: s.providers,
        llamacpp: s.llamacpp,
      }),
      version: 4,
      migrate: () => ({
        token: null,
        username: null,
        route: INITIAL_ROUTE,
        sidebarCollapsed: false,
        activeModel: null,
        activeProvider: "llamacpp" as ProviderId,
        dataSource: "unknown" as "mock" | "live" | "unknown",
        providers: DEFAULT_PROVIDERS,
        llamacpp: DEFAULT_LLAMACPP,
        modelPickerOpen: false,
      }),
    },
  ),
);
