/**
 * AXONIZ API Types — Mirror of the Express backend in src/web/server.ts.
 *
 * These types are the single source of truth for the wire contract between
 * the Next.js UI and the AXONIZ Express backend (port 7860). Every endpoint
 * exposed by `axoniz --web` has its request / response shape here.
 *
 * When the backend evolves, update these interfaces AND the proxy route —
 * the UI code only ever sees typed shapes through `axonizClient`.
 */

/* ---------- Auth ---------- */
export interface LoginRequest {
  username: string;
  password: string;
}
export interface LoginResponse {
  token: string;
  username: string;
}
export interface ApiError {
  error: string;
}

/* ---------- Config ---------- */
export interface AxonizConfig {
  _home?: string;
  _models_dir?: string;
  llm?: {
    active_provider?: string;
    providers?: Record<string, unknown>;
    n_ctx?: number;
    n_gpu_layers?: number;
    n_threads?: number;
    model?: string;
  };
  swarm_models?: Record<string, string>;
  persona?: string;
  authority_level?: number;
  voice?: {
    tts_backend?: string;
    stt_backend?: string;
    wake_word_enabled?: boolean;
  };
  web?: {
    port?: number;
    host?: string;
  };
  [key: string]: unknown;
}

/* ---------- Models / Vault ---------- */

/**
 * A single .gguf / .bin model file discovered by scanning ~/.axoniz/models.
 * Returned by GET /api/axoniz/models (catch-all route's /models case)
 * and GET /api/axoniz/models/local.
 */
export interface VaultModelEntry {
  /** Filename (e.g. "gemma-3-1b-it.Q5_K_S.gguf"). */
  id: string;
  /** Clean display name (e.g. "Gemma 3 1B IT"). */
  name: string;
  /** Full filesystem path. */
  path: string;
  /** Size in bytes. */
  sizeBytes?: number;
  /** Human-readable size (e.g. "1.2 GB"). */
  size?: string;
  /** Quantization tag (e.g. "Q5_K_S") or null. */
  quant?: string | null;
}

export interface ModelEndpoint {
  endpoint_id: string;
  models: VaultModelEntry[];
}
export interface ModelsListResponse {
  items: ModelEndpoint[];
}

export interface BackendProvider {
  id: string;
  name: string;
  description: string;
  online?: boolean;
}
export type BackendsResponse = BackendProvider[];

export interface ModelSwitchRequest {
  path: string;
}
export interface ModelSwitchResponse {
  status: "ok" | "error";
  model?: string;
  error?: string;
}

/* ---------- Forge (HuggingFace) ---------- */
export interface HuggingFaceModel {
  id: string;
  author: string;
  downloads: number;
  likes: number;
  pipeline_tag?: string;
  tags: string[];
  library_name?: string;
  lastModified?: string;
  gated?: boolean;
}
export interface ModelSearchResponse {
  items: HuggingFaceModel[];
  total?: number;
}

export interface DownloadStatusItem {
  repo_id: string;
  filename: string;
  progress: number; // 0–1
  speed_mbps?: number;
  status: "queued" | "downloading" | "completed" | "failed";
  error?: string;
  started_at?: number;
  finished_at?: number;
  size_mb?: number;
}
export type DownloadsResponse = DownloadStatusItem[];

export interface DownloadRequest {
  repo_id: string;
  filename: string;
}
export interface DownloadResponse {
  message: string;
}

/* ---------- Chat & Agent ---------- */
export interface ChatRequest {
  message: string;
  mode?: "chat" | "agent";
  conversationId?: string;
}

export interface AgentTaskRequest {
  intent: string;
  conversationId?: string;
  userId?: string;
  modality?: "text" | "voice";
}
export interface AgentTaskResponse {
  taskId: string;
  status: "started";
}

/* ---------- War Room / Swarm ---------- */
export interface WarRoomStatus {
  workers?: WarRoomWorker[];
  active_task?: string | null;
  decomposer?: string;
  critic?: string;
  merger?: string;
  started_at?: number;
  progress?: number;
}
export interface WarRoomWorker {
  id: string;
  role: string;
  status: "idle" | "running" | "complete" | "failed";
  model?: string;
  subtask?: string;
  result_score?: number;
  started_at?: number;
  finished_at?: number;
}
export interface WarRoomResponse {
  status?: WarRoomStatus;
  error?: string;
}

export interface SwarmRoleStatus {
  path: string;
  name: string;
  ready: boolean;
}
export interface SwarmStatusResponse {
  expert_mode: boolean;
  roles: Record<string, SwarmRoleStatus>;
  description: string;
}

/* ---------- Memory ---------- */
export interface MemoryWing {
  name: string;
  rooms: MemoryRoom[];
}
export interface MemoryRoom {
  name: string;
  drawers: MemoryDrawer[];
}
export interface MemoryDrawer {
  name: string;
  entries: MemoryEntry[];
  count?: number;
}
export interface MemoryEntry {
  id?: string;
  key: string;
  value: string;
  tags?: string[];
  created_at?: number;
  updated_at?: number;
  score?: number;
}
export interface MemoryStatus {
  palace: boolean;
  drawers: number;
  kg: {
    facts?: number;
    subjects?: number;
  };
}
export type MemoryResponse = Record<string, unknown>;

export interface AbsoluteQueryResponse {
  result?: {
    code_matches?: AbsoluteQueryHit[];
    memory_matches?: AbsoluteQueryHit[];
    summary?: string;
  };
  error?: string;
}
export interface AbsoluteQueryHit {
  type: "symbol" | "memory" | "file" | "fact";
  label: string;
  detail?: string;
  score: number;
  location?: string;
  snippet?: string;
}

/* ---------- System ---------- */
export interface HealthResponse {
  status?: "active" | "inactive";
  backend?: string;
  model?: string;
  model_loaded?: boolean;
  uptime?: number;
  memory?: MemoryStatus;
  error?: string;
}

export interface SystemStats {
  cpu?: { usage: number; cores: number };
  memory?: { used: number; total: number; percent: number };
  disk?: { used: number; total: number; percent: number };
  uptime?: number;
  platform?: string;
  hostname?: string;
  axoniz_version?: string;
  load_avg?: number[];
}

export interface AgentStats {
  tool_calls?: number;
  tasks_completed?: number;
  messages_sent?: number;
  tokens?: { input: number; output: number };
  trajectory_size?: number;
  active_session?: string;
  started_at?: number;
}

/* ---------- SSE Event Stream ---------- */
export type AxonizSseEvent =
  | { type: "token"; value: string; ts: number }
  | { type: "tool_call"; tool: string; args: Record<string, unknown>; ts: number }
  | { type: "tool_result"; tool: string; result: string; success: boolean; ts: number }
  | { type: "thought"; value: string; ts: number }
  | { type: "swarm"; worker_id?: string; phase: string; status: string; detail?: string; ts: number }
  | { type: "memory"; action: "store" | "recall" | "graph"; key: string; ts: number }
  | { type: "error"; error: string; ts: number }
  | { type: "done"; summary?: string; ts: number }
  | { type: "health"; status: string; ts: number }
  | { type: string; ts: number; [key: string]: unknown };

/* ---------- Voice ---------- */
export interface VoiceStatus {
  tts_available: boolean;
  stt_available: boolean;
  wake_word_available: boolean;
  tts_backend?: string;
  stt_backend?: string;
}
export interface TranscribeResponse {
  text?: string;
  error?: string;
}

/* ---------- Files ---------- */
export interface FileTreeResponse {
  tree: FileTreeNode[];
}
export interface FileTreeNode {
  name: string;
  type: "file" | "dir";
  path: string;
  size?: number;
  children?: FileTreeNode[];
}
