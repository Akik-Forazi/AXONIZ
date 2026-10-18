"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AxonizSseEvent } from "@/lib/axoniz/api-types";
import { DEFAULT_THEME_ID, type Theme } from "@/lib/themes";

export type ProviderId =
  | "llamacpp"
  | "lmstudio"
  | "ollama"
  | "openai"
  | "openrouter"
  | "orca"
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
  /** Path to the .gguf model file on disk (e.g. ~/.axoniz/models/FRAZIYM-AI/.../model.gguf). */
  modelPath: string;
  /** llama-server base URL — defaults to http://localhost:8080. */
  baseUrl: string;
  /** Context window size. */
  nCtx: number;
  /** Number of GPU layers (-1 = all). */
  nGpuLayers: number;
  /** Number of CPU threads. */
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
      "liquid/lfm-2.5-2.6b:free",
      "cohere/north-mini-code:free",
      "google/gemma-4-26b-a4b-it:free",
      "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
      "anthropic/claude-3.5-sonnet",
      "openai/gpt-4o",
      "meta-llama/llama-3.2-3b-instruct",
      "deepseek/deepseek-chat",
    ],
    pricePerMTokIn: 0.25,
    pricePerMTokOut: 0.75,
  },
  {
    id: "orca",
    name: "OrcaRouter",
    category: "cloud",
    description: "OpenAI-compatible gateway to 200+ models (OpenAI, Anthropic, Google, DeepSeek, Qwen). Auto-routes to the best upstream at cost price.",
    defaultBaseUrl: "https://api.orcarouter.ai/v1",
    needsApiKey: true,
    apiKeyLabel: "API key",
    apiKeyPlaceholder: "sk-orca-...",
    docsUrl: "https://docs.privategpt.dev/providers/orcarouter",
    popularModels: [
      "openai/gpt-5.5",
      "anthropic/claude-sonnet-5",
      "google/gemini-2.0-flash",
      "deepseek/deepseek-chat",
      "deepseek/deepseek-reasoner",
      "qwen/qwen-coder-32b",
      "xai/grok-3",
      "minimax/abab-7-chat",
    ],
    // Prices vary by upstream — these are blended estimates.
    pricePerMTokIn: 0.5,
    pricePerMTokOut: 1.5,
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
  baseUrl: "http://localhost:8080",
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
  /* Sidebar collapse state — small piece of UI state, kept in store so the
       TopBar toggle button can flip it. Routing is now real Next.js routes. */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;

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

  /** Currently active chat ID — used by /chat to know which saved chat to
   *  sync to. Set when user creates a new chat or selects one from history,
   *  or when they land on /chat/s/<id> and click "Continue in chat". */
  activeChatId: string | null;
  setActiveChatId: (id: string | null) => void;

  /* ─── EventStream slice ─────────────────────────────────────────────
   * Global event stream from /api/axoniz/stream. Previously rendered as
   * a sticky side panel (EventRail) — now lifted into the store so:
   *   (a) the EventSource connection is opened ONCE by a singleton
   *       provider in the layout (not per-page);
   *   (b) events keep accumulating across page navigations;
   *   (c) the dedicated /event-stream page can render them full-screen
   *       without re-establishing the connection.
   *
   * NOT persisted — in-memory only, capped at 200 events.
   */
  railEvents: { id: number; ev: AxonizSseEvent }[];
  railConnected: boolean;
  pushRailEvent: (ev: AxonizSseEvent) => void;
  clearRailEvents: () => void;
  setRailConnected: (b: boolean) => void;

  /* ─── ChatStream slice ──────────────────────────────────────────────
   * Lifts chat messages out of the useChatStream hook's local useState
   * so navigating away from /chat/s/<id> no longer destroys the
   * in-progress stream. The hook reads/writes through this store; the
   * actual EventSource for an execution is owned by a singleton
   * ChatStreamProvider keyed by chatId, so it survives navigation.
   *
   * The JSONL file at ~/.axoniz/db/chats/<id>.jsonl is still the
   * authoritative source of truth — this slice is just the live
   * in-memory mirror, populated on mount and updated as events arrive.
   */
  messagesByChatId: Record<string, ChatMessageStore[]>;
  streamingChatId: string | null;
  /** Map of chatId → active executionId. The ChatStreamProvider reads
   *  this and opens one EventSource per active execution, so streaming
   *  survives navigation (the EventSource is owned by the layout-level
   *  provider, not by the chat page component). */
  executionIdByChatId: Record<string, string>;
  setMessagesFor: (chatId: string, msgs: ChatMessageStore[]) => void;
  appendMessageTo: (chatId: string, msg: ChatMessageStore) => void;
  updateMessageIn: (chatId: string, msgId: string, patch: Partial<ChatMessageStore>) => void;
  clearChatMessages: (chatId: string) => void;
  setStreamingChatId: (id: string | null) => void;
  setExecutionFor: (chatId: string, execId: string) => void;
  clearExecutionFor: (chatId: string) => void;

  /* ─── Theme slice ────────────────────────────────────────────────────
   * Active visual theme — applied to <html data-theme="..."> by the
   * ThemeProvider in the root layout. Themes are defined as CSS variable
   * overrides in `src/app/globals.css` (each theme is a
   * `[data-theme="<id>"]` block). To add a new theme:
   * 1. Add the CSS block in globals.css
   * 2. Add the entry to `THEMES` in `src/lib/themes.ts`
   * The store just remembers the user's choice; the actual visual
   * application is done by the ThemeProvider.
   *
   * Persisted to localStorage so the choice survives refresh.
   */
  activeTheme: string;
  setTheme: (id: string) => void;
}

/** A single chat message in the store mirror. Mirrors ChatMessage from
 *  use-chat-stream.ts but kept here to avoid a cyclic import. */
export interface ChatMessageStore {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  pending?: boolean;
  error?: boolean;
}

export const useAxonizStore = create<UiState>()(
  persist(
    (set, get) => ({
      token: null,
      username: null,
      sidebarCollapsed: false,
      activeModel: null,
      activeProvider: "llamacpp",
      dataSource: "unknown",
      providers: DEFAULT_PROVIDERS,
      llamacpp: DEFAULT_LLAMACPP,
      modelPickerOpen: false,
      activeChatId: null,

      // EventStream — in-memory, not persisted. The singleton provider
      // (EventStreamProvider in the auth layout) opens the EventSource
      // and calls pushRailEvent() on every event. The /event-stream page
      // and any other consumer just reads railEvents from the store.
      railEvents: [],
      railConnected: false,
      pushRailEvent: (ev) =>
        set((s) => {
          const next = [...s.railEvents, { id: s.railEvents.length + 1, ev }];
          return { railEvents: next.slice(-200) };
        }),
      clearRailEvents: () => set({ railEvents: [] }),
      setRailConnected: (b) => set({ railConnected: b }),

      // ChatStream — in-memory mirror of messages per chatId, so
      // navigating away from /chat/s/<id> doesn't kill the in-flight
      // stream's accumulated messages.
      messagesByChatId: {},
      streamingChatId: null,
      executionIdByChatId: {},
      setMessagesFor: (chatId, msgs) =>
        set((s) => ({
          messagesByChatId: {
            ...s.messagesByChatId,
            [chatId]: msgs,
          },
        })),
      appendMessageTo: (chatId, msg) =>
        set((s) => {
          const prev = s.messagesByChatId[chatId] ?? [];
          return {
            messagesByChatId: {
              ...s.messagesByChatId,
              [chatId]: [...prev, msg],
            },
          };
        }),
      updateMessageIn: (chatId, msgId, patch) =>
        set((s) => {
          const prev = s.messagesByChatId[chatId] ?? [];
          return {
            messagesByChatId: {
              ...s.messagesByChatId,
              [chatId]: prev.map((m) => (m.id === msgId ? { ...m, ...patch } : m)),
            },
          };
        }),
      clearChatMessages: (chatId) =>
        set((s) => {
          const next = { ...s.messagesByChatId };
          delete next[chatId];
          return { messagesByChatId: next };
        }),
      setStreamingChatId: (id) => set({ streamingChatId: id }),
      setExecutionFor: (chatId, execId) =>
        set((s) => ({
          executionIdByChatId: {
            ...s.executionIdByChatId,
            [chatId]: execId,
          },
        })),
      clearExecutionFor: (chatId) =>
        set((s) => {
          const next = { ...s.executionIdByChatId };
          delete next[chatId];
          return { executionIdByChatId: next };
        }),

      // Theme — persisted. Default to DEFAULT_THEME_ID ("default" = monochrome
      // dark). Setting a new id tells the ThemeProvider to swap the
      // `data-theme` attribute on <html>, which cascades the new CSS
      // variable overrides from globals.css. Invalid ids are silently
      // coerced back to the default on ThemeProvider mount (see lib/themes.ts).
      activeTheme: DEFAULT_THEME_ID,
      setTheme: (id) => set({ activeTheme: id }),

      setAuth: (token, username) => set({ token, username }),
      logout: () => set({ token: null, username: null }),

      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),

      openModelPicker: () => set({ modelPickerOpen: true }),
      closeModelPicker: () => set({ modelPickerOpen: false }),
      pickModel: (provider, model) => {
        // 1. Update frontend state IMMEDIATELY (instant UI feedback)
        set({
          activeProvider: provider,
          activeModel: model,
          providers: {
            ...get().providers,
            [provider]: { ...get().providers[provider], model },
          },
          modelPickerOpen: false,
        });
        // 2. Tell the backend to switch provider (fire-and-forget)
        //    This writes config.json, kills local model, disables daemon
        fetch("/api/axoniz/v2/provider/activate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, model }),
        }).catch(() => { /* ignore — UI already updated */ });
      },
        }),
      setActiveModel: (activeModel) => set({ activeModel }),
      setActiveProvider: (activeProvider) => set({ activeProvider }),
      setDataSource: (dataSource) => set({ dataSource }),
      setActiveChatId: (activeChatId) => set({ activeChatId: activeChatId ?? null }),
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
      name: "axoniz-store-v9",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        token: s.token,
        username: s.username,
        sidebarCollapsed: s.sidebarCollapsed,
        activeModel: s.activeModel,
        activeProvider: s.activeProvider,
        providers: s.providers,
        llamacpp: s.llamacpp,
        activeChatId: s.activeChatId,
        activeTheme: s.activeTheme,
      }),
      version: 9,
      migrate: (persisted: unknown) => {
        // Merge DEFAULT_PROVIDERS with any persisted provider configs.
        // This preserves user-configured API keys while adding new
        // providers (like OrcaRouter) that were added after the last
        // persist. Without this, providers["orca"] would be undefined
        // and crash the UI.
        const old = (persisted ?? {}) as Partial<UiState>;
        const oldProviders = (old.providers ?? {}) as Record<string, ProviderConfig>;
        const mergedProviders = { ...DEFAULT_PROVIDERS } as Record<ProviderId, ProviderConfig>;
        // Preserve any user-configured provider settings
        for (const [id, cfg] of Object.entries(oldProviders)) {
          if (id in mergedProviders) {
            mergedProviders[id as ProviderId] = cfg as ProviderConfig;
          }
        }
        return {
          token: old.token ?? null,
          username: old.username ?? null,
          sidebarCollapsed: old.sidebarCollapsed ?? false,
          activeModel: old.activeModel ?? null,
          activeProvider: old.activeProvider ?? "llamacpp" as ProviderId,
          dataSource: "unknown" as "mock" | "live" | "unknown",
          providers: mergedProviders,
          llamacpp: old.llamacpp ?? DEFAULT_LLAMACPP,
          modelPickerOpen: false,
          activeTheme: old.activeTheme ?? "shadow-monarch",
        };
      },
    },
  ),
);
