/**
 * Realistic mock responses for the AXONIZ backend, used when the actual
 * `axoniz --web` Express server on port 7860 is unreachable (preview envs,
 * standalone UI dev, etc.). All shapes match `api-types.ts` 1:1.
 *
 * When the real backend is online, the proxy route prefers real responses
 * and falls back to these only on connection error.
 */

import type {
  AbsoluteQueryResponse,
  AgentStats,
  AxonizConfig,
  AxonizSseEvent,
  BackendsResponse,
  DownloadStatusItem,
  HealthResponse,
  HuggingFaceModel,
  MemoryResponse,
  ModelSearchResponse,
  ModelsListResponse,
  SwarmStatusResponse,
  SystemStats,
  WarRoomResponse,
} from "./api-types";

export const MOCK_BACKENDS: BackendsResponse = [
  {
    id: "llamacpp",
    name: "llama.cpp (native)",
    description: "Zero-overhead GGUF inference via node-llama-cpp. Default backend.",
    online: true,
  },
  {
    id: "ollama",
    name: "Ollama",
    description: "HTTP bridge to local Ollama server. Compatible but adds latency.",
    online: false,
  },
  {
    id: "lmstudio",
    name: "LM Studio",
    description: "HTTP bridge to LM Studio's OpenAI-compatible endpoint.",
    online: false,
  },
  {
    id: "openai",
    name: "OpenAI-compatible",
    description: "Cloud or self-hosted OpenAI API. Breaks offline guarantee.",
    online: false,
  },
];

export const MOCK_CONFIG: AxonizConfig = {
  _home: "/home/axoniz/.axoniz",
  _models_dir: "/home/axoniz/.axoniz/models",
  llm: {
    active_provider: "llamacpp",
    providers: {
      llamacpp: { n_threads: 8, n_gpu_layers: 0, chat_format: "auto" },
    },
    n_ctx: 8192,
    n_gpu_layers: 0,
    n_threads: 8,
    model: "Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf",
  },
  swarm_models: {
    decomposer: "Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf",
    worker: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
    critic: "Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf",
    merger: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
  },
  persona: "AXONIZ",
  authority_level: 3,
  voice: {
    tts_backend: "kokoro",
    stt_backend: "moonshine",
    wake_word_enabled: true,
  },
  web: { port: 7860, host: "127.0.0.1" },
};

export const MOCK_MODELS: ModelsListResponse = {
  items: [
    {
      endpoint_id: "axoniz-endpoint",
      models: [
        "Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf",
        "Qwen2.5-Coder-7B-Instruct-Q5_K_M.gguf",
        "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
        "Llama-3.2-3B-Instruct-Q8_0.gguf",
        "Phi-3.5-mini-instruct-Q4_K_M.gguf",
        "DeepSeek-Coder-V2-Lite-Instruct-Q4_K_M.gguf",
        "Mistral-7B-Instruct-v0.3-Q4_K_M.gguf",
      ],
    },
  ],
};

export const MOCK_WAR_ROOM: WarRoomResponse = {
  status: {
    active_task: "Refactor authentication module across 14 files",
    decomposer: "Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf",
    critic: "Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf",
    merger: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
    started_at: Date.now() / 1000 - 184,
    progress: 0.62,
    workers: [
      {
        id: "w-01",
        role: "Worker",
        status: "complete",
        model: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
        subtask: "audit auth.ts + authority.ts surface",
        result_score: 0.92,
        started_at: Date.now() / 1000 - 184,
        finished_at: Date.now() / 1000 - 121,
      },
      {
        id: "w-02",
        role: "Worker",
        status: "complete",
        model: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
        subtask: "extract token validation into AuthorityEngine",
        result_score: 0.88,
        started_at: Date.now() / 1000 - 180,
        finished_at: Date.now() / 1000 - 89,
      },
      {
        id: "w-03",
        role: "Worker",
        status: "running",
        model: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
        subtask: "rewrite /api/auth/login with structured errors",
        started_at: Date.now() / 1000 - 92,
      },
      {
        id: "w-04",
        role: "Worker",
        status: "running",
        model: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
        subtask: "migrate config loading to async loader",
        started_at: Date.now() / 1000 - 68,
      },
      {
        id: "w-05",
        role: "Worker",
        status: "queued",
        subtask: "wire rate limiter into new auth flow",
      },
      {
        id: "w-06",
        role: "Worker",
        status: "queued",
        subtask: "rewrite integration tests for /api/auth/*",
      },
    ],
  },
};

export const MOCK_SWARM_STATUS: SwarmStatusResponse = {
  expert_mode: true,
  roles: {
    decomposer: { path: "/home/axoniz/.axoniz/models/Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf", name: "Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf", ready: true },
    worker:     { path: "/home/axoniz/.axoniz/models/Llama-3.2-3B-Instruct-Q4_K_M.gguf",     name: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",     ready: true },
    critic:     { path: "/home/axoniz/.axoniz/models/Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf", name: "Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf", ready: true },
    merger:     { path: "/home/axoniz/.axoniz/models/Llama-3.2-3B-Instruct-Q4_K_M.gguf",     name: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",     ready: true },
  },
  description: "Domain-expert swarm active — models hot-swap per phase",
};

export const MOCK_MEMORY: MemoryResponse = {
  palace: {
    wings: [
      {
        name: "Project",
        rooms: [
          {
            name: "AXONIZ",
            drawers: [
              { name: "architecture", count: 14 },
              { name: "decisions", count: 13 },
              { name: "todo", count: 6 },
            ],
          },
          { name: "Fraziym-Web", drawers: [{ name: "structure", count: 9 }] },
        ],
      },
      {
        name: "Skills",
        rooms: [
          {
            name: "Refactoring",
            drawers: [
              { name: "rename-symbol", count: 3 },
              { name: "extract-function", count: 5 },
            ],
          },
          { name: "Bugfix", drawers: [{ name: "stacktrace-triage", count: 8 }] },
        ],
      },
      { name: "People", rooms: [{ name: "Contacts", drawers: [{ name: "colleagues", count: 12 }] }] },
    ],
    is_available: true,
  },
  knowledge_graph: {
    facts: 1284,
    subjects: 612,
    recent: [
      { subject: "AXONIZ", predicate: "uses_backend", object: "node-llama-cpp", valid_from: 1735689600 },
      { subject: "SwarmOrchestrator", predicate: "supports", object: "RAM-aware hot-swap", valid_from: 1735689600 },
      { subject: "Axodex", predicate: "indexes", object: "4843 symbols", valid_from: 1735689600 },
    ],
  },
  diary: { sessions_today: 4, last_event: "tool_call:axodex_query" },
};

export const MOCK_HEALTH: HealthResponse = {
  status: "active",
  backend: "llamacpp",
  model: "Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf",
  model_loaded: true,
  uptime: 14782,
  memory: {
    palace: true,
    drawers: 318,
    kg: { facts: 1284, subjects: 612 },
  },
};

export const MOCK_SYSTEM_STATS: SystemStats = {
  cpu: { usage: 0.34, cores: 8 },
  memory: { used: 9_842_302_976, total: 16_702_693_376, percent: 0.589 },
  disk: { used: 284_398_295_040, total: 512_110_190_592, percent: 0.555 },
  uptime: 86_400 + 14_782,
  platform: "linux x64",
  hostname: "axoniz-sandbox",
  axoniz_version: "0.2.1",
  load_avg: [1.24, 0.98, 0.81],
};

export const MOCK_AGENT_STATS: AgentStats = {
  tool_calls: 4821,
  tasks_completed: 184,
  messages_sent: 1248,
  tokens: { input: 9_842_316, output: 1_284_902 },
  trajectory_size: 4821,
  active_session: "sess_8b3f9a2c",
  started_at: Date.now() / 1000 - 14_782,
};

export const MOCK_ABSOLUTE_QUERY: AbsoluteQueryResponse = {
  result: {
    summary: "Found 6 symbol matches in the code graph and 3 memory palace entries related to 'agent loop'.",
    code_matches: [
      {
        type: "symbol",
        label: "Agent.run()",
        detail: "Main entry point — async generator yielding tokens and tool calls",
        score: 0.97,
        location: "src/core/agent.ts:412",
        snippet: "async *run(prompt: string, opts?: RunOpts): AsyncGenerator<...> { ... }",
      },
      {
        type: "symbol",
        label: "GoalLoop.run()",
        detail: "Goal-mode execution loop with plan / verify / repair phases",
        score: 0.91,
        location: "src/core/loop.ts:88",
      },
      {
        type: "symbol",
        label: "_exec(name, args)",
        detail: "Tool execution gate — authority + confidence + trajectory",
        score: 0.88,
        location: "src/core/agent.ts:612",
      },
    ],
    memory_matches: [
      {
        type: "memory",
        label: "DEC-007: node-llama-cpp over Ollama",
        detail: "Decision rationale — direct KV cache control",
        score: 0.84,
        location: "Palace › Project › AXONIZ › decisions",
      },
      {
        type: "fact",
        label: "TrajectoryStore records every tool call",
        detail: "SQLite behavioral memory for self-correction",
        score: 0.79,
        location: "KnowledgeGraph",
      },
    ],
  },
};

export const MOCK_HF_SEARCH: ModelSearchResponse = {
  items: [
    {
      id: "Qwen/Qwen2.5-Coder-7B-Instruct",
      author: "Qwen",
      downloads: 184_392,
      likes: 412,
      pipeline_tag: "text-generation",
      tags: ["qwen", "coder", "7b", "instruct", "gguf-ready"],
      library_name: "transformers",
      lastModified: "2026-08-14T10:00:00Z",
      gated: false,
    },
    {
      id: "meta-llama/Llama-3.2-3B-Instruct",
      author: "meta-llama",
      downloads: 412_398,
      likes: 924,
      pipeline_tag: "text-generation",
      tags: ["llama-3.2", "3b", "instruct", "edge"],
      library_name: "transformers",
      lastModified: "2026-07-02T14:00:00Z",
      gated: true,
    },
    {
      id: "microsoft/Phi-3.5-mini-instruct",
      author: "microsoft",
      downloads: 98_421,
      likes: 312,
      pipeline_tag: "text-generation",
      tags: ["phi-3.5", "mini", "3.8b", "instruct"],
      library_name: "transformers",
      lastModified: "2026-06-21T08:00:00Z",
      gated: false,
    },
    {
      id: "deepseek-ai/DeepSeek-Coder-V2-Lite-Instruct",
      author: "deepseek-ai",
      downloads: 84_221,
      likes: 248,
      pipeline_tag: "text-generation",
      tags: ["deepseek", "coder", "v2", "lite", "16b-moe"],
      library_name: "transformers",
      lastModified: "2026-05-18T12:00:00Z",
      gated: false,
    },
    {
      id: "mistralai/Mistral-7B-Instruct-v0.3",
      author: "mistralai",
      downloads: 312_842,
      likes: 712,
      pipeline_tag: "text-generation",
      tags: ["mistral", "7b", "instruct", "v0.3"],
      library_name: "transformers",
      lastModified: "2026-04-09T10:00:00Z",
      gated: false,
    },
    {
      id: "TheBloke/Llama-3.2-3B-Instruct-GGUF",
      author: "TheBloke",
      downloads: 48_281,
      likes: 142,
      pipeline_tag: "text-generation",
      tags: ["gguf", "quantized", "q4_k_m", "ready-for-axoniz"],
      lastModified: "2026-08-19T00:00:00Z",
      gated: false,
    },
  ],
  total: 6,
};

export const MOCK_DOWNLOADS: DownloadStatusItem[] = [
  {
    repo_id: "Qwen/Qwen2.5-Coder-7B-Instruct",
    filename: "qwen2.5-coder-7b-instruct-q4_k_m.gguf",
    progress: 0.42,
    speed_mbps: 18.4,
    status: "downloading",
    started_at: Date.now() / 1000 - 38,
    size_mb: 4427,
  },
  {
    repo_id: "TheBloke/Llama-3.2-3B-Instruct-GGUF",
    filename: "llama-3.2-3b-instruct-q4_k_m.gguf",
    progress: 1,
    status: "completed",
    started_at: Date.now() / 1000 - 1840,
    finished_at: Date.now() / 1000 - 1244,
    size_mb: 1982,
  },
];

export const MOCK_HF_MODEL_DETAIL: HuggingFaceModel = MOCK_HF_SEARCH.items[0];

/* ---------- SSE event generator (used by /api/axoniz/stream) ---------- */

/**
 * Produces a scripted-but-plausible stream of AXONIZ SSE events. Used when
 * the real backend is unreachable. Mimics: tool calls, swarm fan-out,
 * token streaming, memory stores, and final `done`.
 */
export function* mockSseEventStream(): Generator<AxonizSseEvent, void, void> {
  const now = () => Date.now() / 1000;
  yield { type: "health", status: "active", ts: now() };
  yield {
    type: "thought",
    value: "User asked to analyze the authentication flow — I'll fan out a swarm to audit /api/auth/* endpoints in parallel.",
    ts: now(),
  };
  yield {
    type: "swarm",
    phase: "decompose",
    status: "complete",
    detail: "4 subtasks generated",
    ts: now(),
  };
  yield {
    type: "swarm",
    worker_id: "w-01",
    phase: "worker",
    status: "running",
    detail: "auditing /api/auth/login handler",
    ts: now(),
  };
  yield {
    type: "tool_call",
    tool: "axodex_query",
    args: { query: "auth login JWT" },
    ts: now(),
  };
  yield {
    type: "tool_result",
    tool: "axodex_query",
    result: "3 execution flows found: login → token-issue → config-load → rate-limit",
    success: true,
    ts: now(),
  };
  yield {
    type: "memory",
    action: "store",
    key: "session/auth-audit-context",
    ts: now(),
  };
  yield {
    type: "swarm",
    worker_id: "w-02",
    phase: "worker",
    status: "running",
    detail: "extracting AuthorityEngine abstraction",
    ts: now(),
  };
  yield {
    type: "tool_call",
    tool: "file_read",
    args: { path: "src/core/auth.ts" },
    ts: now(),
  };
  yield {
    type: "tool_result",
    tool: "file_read",
    result: "Read 184 lines from src/core/auth.ts — JWT + bcrypt implementation",
    success: true,
    ts: now(),
  };
  yield {
    type: "swarm",
    worker_id: "w-01",
    phase: "worker",
    status: "complete",
    detail: "audit finished — score 0.92",
    ts: now(),
  };
  yield { type: "token", value: "Auth", ts: now() };
  yield { type: "token", value: " flow", ts: now() };
  yield { type: "token", value: " audited", ts: now() };
  yield { type: "token", value: ". Two", ts: now() };
  yield { type: "token", value: " refactor", ts: now() };
  yield { type: "token", value: " targets", ts: now() };
  yield { type: "token", value: " identified", ts: now() };
  yield { type: "token", value: ".", ts: now() };
  yield {
    type: "done",
    summary: "Auth audit complete. 2 refactor targets identified across 4 audited files.",
    ts: now(),
  };
}
