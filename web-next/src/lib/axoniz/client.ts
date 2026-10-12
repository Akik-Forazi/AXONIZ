/**
 * AXONIZ typed client — the single entry point the UI uses to talk to the
 * backend. Every call goes through `/api/axoniz/*` Next.js routes which in
 * turn proxy to the real Express backend on port 7860 (with mock fallback).
 *
 * UI components should NEVER call fetch() with hardcoded AXONIZ URLs — they
 * import these helpers so the contract stays typed end-to-end.
 */

import type {
  AbsoluteQueryResponse,
  AgentStats,
  AgentTaskRequest,
  AgentTaskResponse,
  AxonizConfig,
  BackendsResponse,
  ChatRequest,
  DownloadRequest,
  DownloadResponse,
  DownloadsResponse,
  FileTreeResponse,
  HealthResponse,
  LoginRequest,
  LoginResponse,
  MemoryResponse,
  ModelSearchResponse,
  ModelSwitchRequest,
  ModelSwitchResponse,
  ModelsListResponse,
  SwarmStatusResponse,
  SystemStats,
  VoiceStatus,
  WarRoomResponse,
} from "./api-types";

const BASE = "/api/axoniz";

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? `Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

async function postJson<T>(
  path: string,
  body?: unknown,
  init?: RequestInit,
): Promise<T> {
  return getJson<T>(path, {
    method: "POST",
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...init,
  });
}

/* ---------- Auth ---------- */
// Auth is the AXONIZ backend's responsibility (src/web/server.ts uses
// getAuth() + bcrypt + JWT). The UI just passes credentials through the
// proxy. In dev/preview without the backend, the proxy returns a mock
// token clearly tagged with _source: "mock" — never pretend to be real
// auth on the UI side.
export const axonizClient = {
  login: (body: LoginRequest) =>
    postJson<LoginResponse | { error: string }>("/auth/login", body),

  /* ---------- Config ---------- */
  getConfig: () => getJson<AxonizConfig>("/config"),
  saveConfig: (patch: Record<string, unknown>) =>
    postJson<{ status: "saved" }>("/config/save", patch),

  /* ---------- Models / Vault ---------- */
  listModels: () => getJson<ModelsListResponse>("/models"),
  listBackends: () => getJson<BackendsResponse>("/backends"),
  switchModel: (path: string) =>
    postJson<ModelSwitchResponse>("/model/switch", { path } satisfies ModelSwitchRequest),

  /* ---------- Forge ---------- */
  searchModels: (q: string) =>
    getJson<ModelSearchResponse>(`/models/search?q=${encodeURIComponent(q)}`),
  startDownload: (repo_id: string, filename: string) =>
    postJson<DownloadResponse>("/models/download", { repo_id, filename } satisfies DownloadRequest),
  listDownloads: () => getJson<DownloadsResponse>("/models/downloads"),

  /* ---------- Provider connection test ---------- */
  /** Actually pings the user's configured endpoint and returns real models/errors. */
  testProvider: (body: {
    provider: string;
    baseUrl: string;
    apiKey?: string;
  }) =>
    postJson<{
      ok: boolean;
      latencyMs: number;
      models: Array<{ id: string; contextLength?: number; pricing?: { prompt?: number; completion?: number } }>;
      error?: string;
    }>("/providers/test", body),

  /* ---------- Chat & Agent ---------- */
  submitTask: (body: AgentTaskRequest) =>
    postJson<AgentTaskResponse>("/agent/task", body),

  /**
   * Real streaming chat — actually proxies to the user's configured provider
   * (any of 14 supported). Returns the raw Response; the caller parses SSE.
   */
  chatStream: (
    body: {
      message: string;
      history?: Array<{ role: "user" | "assistant"; content: string }>;
      provider: string;
      baseUrl?: string;
      apiKey?: string;
      model?: string;
      systemPrompt?: string;
      temperature?: number;
      maxTokens?: number;
    },
    signal?: AbortSignal,
  ) =>
    fetch(`${BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    }),

  /* ---------- War Room / Swarm ---------- */
  warRoom: () => getJson<WarRoomResponse>("/war_room"),
  swarmStatus: () => getJson<SwarmStatusResponse>("/swarm/status"),

  /* ---------- Memory ---------- */
  memory: () => getJson<MemoryResponse>("/memory"),
  absoluteQuery: (q: string) =>
    getJson<AbsoluteQueryResponse>(`/absolute_query?q=${encodeURIComponent(q)}`),

  /* ---------- System ---------- */
  health: () => getJson<HealthResponse>("/health"),
  systemStats: () => getJson<SystemStats>("/system/stats"),
  agentStats: () => getJson<AgentStats>("/stats"),
  files: () => getJson<FileTreeResponse>("/files/list"),

  /* ---------- Voice ---------- */
  voiceStatus: () => getJson<VoiceStatus>("/voice/tts"),

  /* ---------- SSE stream ---------- */
  streamUrl: () => `${BASE}/stream`,

  /* ---------- Reset ---------- */
  reset: () => postJson<{ status: "reset" }>("/reset"),
};

/** Parse a single SSE frame from a chunk. Returns [eventType, dataString] or null. */
export function parseSseFrame(chunk: string): {
  event: string;
  data: string;
} | null {
  const lines = chunk.split("\n");
  let event = "message";
  let dataParts: string[] = [];
  for (const line of lines) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataParts.push(line.slice(5).trim());
    else if (line === "" && (event !== "message" || dataParts.length > 0)) {
      return { event, data: dataParts.join("\n") };
    }
  }
  if (event !== "message" || dataParts.length > 0) {
    return { event, data: dataParts.join("\n") };
  }
  return null;
}
