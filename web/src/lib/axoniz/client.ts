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
import { useAxonizStore } from "@/stores/axoniz-store";

const BASE = "/api/axoniz";

/**
 * Pull the JWT from the Zustand store on demand. The store is persisted by
 * zustand/middleware/persist so the token survives reloads. The token is
 * set by the login flow on a successful POST /auth/login.
 *
 * Returns the empty string when no token is set — the server will then 401
 * and the UI will redirect to /login via the existing boot guard.
 */
function getAuthToken(): string {
  try {
    return useAxonizStore.getState()?.token ?? "";
  } catch {
    return "";
  }
}

/** Build the standard headers for any /api/axoniz/* request. */
function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getAuthToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extra ?? {}),
  };
}

/** Hard timeout for engine JSON calls (caller-supplied signal wins). */
const DEFAULT_TIMEOUT_MS = 8_000;

function requestInit(init?: RequestInit): RequestInit {
  return {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    headers: authHeaders(init?.headers as Record<string, string> | undefined),
  };
}

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, requestInit(init));
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

/**
 * Exported for components (vault.tsx, provider-detail.tsx) that need to
 * make a raw `fetch()` call to a streaming or multipart endpoint — wraps
 * the call with the same auth header injection as getJson/postJson.
 *
 * Usage:
 *   const res = await authedFetch("/api/axoniz/models/launch", {
 *     method: "POST",
 *     body: JSON.stringify(payload),
 *   });
 */
export function authedFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(path, {
    ...init,
    headers: authHeaders(
      typeof init?.headers === "object" && init.headers
        ? (init.headers as Record<string, string>)
        : undefined,
    ),
  });
}

/**
 * Build a URL with the current auth token appended as ?token=<jwt>.
 * Used for EventSource() URLs — the browser's EventSource can't set
 * custom headers, so the token has to ride on the query string.
 * The server-side requireAuth() checks both header and query param.
 */
export function authedUrl(path: string, extra?: Record<string, string>): string {
  const url = new URL(
    path,
    typeof window === "undefined" ? "http://localhost" : window.location.origin,
  );
  const token = getAuthToken();
  if (token) url.searchParams.set("token", token);
  if (extra) for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
  return url.pathname + url.search;
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
   *
   * NOTE: The /api/axoniz/chat route requires a valid Bearer JWT (see
   * web/src/app/api/axoniz/chat/route.ts). The token is auto-injected
   * here via authHeaders() so callers don't need to set it manually.
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
      headers: authHeaders(),
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

/* ---------- Streaming agent (SSE) ---------- */

/** Request body for POST /api/axoniz/agent-stream. */
export interface AgentStreamRequest {
  message: string;
  provider?: string;
  model?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  workspace?: string;
  maxSteps?: number;
  mode?: "chat" | "agent";
}

/** Callbacks dispatched from the agent-stream SSE events:
 *  `step`, `token`, `tool_call`, `tool_result`, `done`, `error`. */
export interface AgentStreamHandlers {
  onStep?(step: number, total: number): void;
  onToken?(token: string): void;
  onToolCall?(tc: { id?: string; name: string; args?: Record<string, unknown>; summary?: string; path?: string }): void;
  onToolResult?(tr: { id?: string; name: string; result?: unknown; status?: string; summary?: string; path?: string }): void;
  onDone?(payload: { response: string }): void;
  onError?(error: string): void;
}

/**
 * Stream a full agent / chat run from POST /api/axoniz/agent-stream.
 *
 * Returns the AbortController backing the request — pages keep it in a ref
 * so the Stop button can .abort() the run. SSE frames (`step`, `token`,
 * `tool_call`, `tool_result`, `done`, `error`) are dispatched to the given
 * handlers as they arrive.
 */
export function streamAgent(
  body: AgentStreamRequest,
  handlers: AgentStreamHandlers,
): AbortController {
  const controller = new AbortController();
  void (async () => {
    let res: Response;
    try {
      res = await authedFetch(`${BASE}/agent-stream`, {
        method: "POST",
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      return; // aborted before the request settled — nothing to report
    }
    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      handlers.onError?.(
        (err as { error?: string }).error ?? `Request failed: ${res.status}`,
      );
      return;
    }
    try {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done: closed, value } = await reader.read();
        if (closed) break;
        buffer += decoder.decode(value, { stream: true });
        // SSE frames are separated by a blank line.
        let sep = buffer.indexOf("\n\n");
        while (sep !== -1) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          sep = buffer.indexOf("\n\n");
          const parsed = parseSseFrame(frame);
          if (!parsed) continue;
          let data: Record<string, unknown>;
          try {
            data = JSON.parse(parsed.data) as Record<string, unknown>;
          } catch {
            continue;
          }
          switch (parsed.event) {
            case "step":
              handlers.onStep?.(Number(data.step ?? 0), Number(data.total ?? 0));
              break;
            case "token":
              if (typeof data.token === "string") handlers.onToken?.(data.token);
              break;
            case "tool_call":
              handlers.onToolCall?.(data as { name: string });
              break;
            case "tool_result":
              handlers.onToolResult?.(data as { name: string });
              break;
            case "done":
              handlers.onDone?.(data as { response: string });
              break;
            case "error":
              handlers.onError?.(typeof data.error === "string" ? data.error : "Agent run failed.");
              break;
          }
        }
      }
    } catch {
      // Abort during streaming lands here too — swallow it; the page's
      // cancel() path already resets its own streaming state.
      if (!controller.signal.aborted) {
        handlers.onError?.("Connection to the agent stream was lost.");
      }
    }
  })();
  return controller;
}

/** Map UI chat messages to the {role, content}[] the agent-stream route expects. */
export function messageHistoryForLlm(
  messages: ReadonlyArray<{ role: string; content: string }>,
): Array<{ role: "user" | "assistant"; content: string }> {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
}

/** Read a workspace file through /api/axoniz/workspace-file. */
export async function readFile(path: string): Promise<{
  path: string;
  name?: string;
  content: string;
  language?: string;
  readOnly?: boolean;
}> {
  const res = await authedFetch(authedUrl("/api/axoniz/workspace-file", { path }));
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? `readFile failed: ${res.status}`);
  }
  return (await res.json()) as {
    path: string;
    name?: string;
    content: string;
    language?: string;
    readOnly?: boolean;
  };
}

/* ---------- Workspace / sessions / health ---------- */

/** One entry of the workspace listing returned by /api/axoniz/workspace-list. */
export interface WorkspaceEntry {
  path: string;
  name: string;
  kind: "file" | "dir";
  size: number;
  mtime: number;
  ext?: string;
  depth: number;
}

/** Response of /api/axoniz/workspace-list. */
export interface WorkspaceListResult {
  root: string;
  rootName?: string;
  entries: WorkspaceEntry[];
}

/** List the workspace directory tree. */
export async function listWorkspace(dir?: string, depth = 3): Promise<WorkspaceListResult> {
  const params = new URLSearchParams({ depth: String(depth) });
  if (dir) params.set("path", dir);
  return getJson<WorkspaceListResult>(`/workspace-list?${params.toString()}`);
}

/** Per-repo git state returned by /api/axoniz/workspace-gitlog. */
export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  dirty: boolean;
  staged: number;
  modified: number;
  untracked: number;
  head: string;
}

export interface GitLogEntry {
  hash: string;
  author: string;
  date: string;
  subject: string;
}

export interface GitLogResult {
  isGitRepo: boolean;
  status: GitStatus | null;
  log: GitLogEntry[];
}

/** Read the git branch/status/recent-log of a workspace directory. */
export function getGitLog(dir: string, limit = 20): Promise<GitLogResult> {
  return getJson<GitLogResult>(
    `/workspace-gitlog?${new URLSearchParams({ path: dir, limit: String(limit) })}`,
  );
}

/** Session metadata — same shape as stores/axoniz-workspace-store SessionMeta. */
export interface AxonizSessionMeta {
  id: string;
  title: string;
  ts: string;
  path?: string;
  messageCount?: number;
}

/** List the CLI's history sessions (~/.axoniz/history) via /history-sessions. */
export async function listSessions(): Promise<AxonizSessionMeta[]> {
  const out = await getJson<{ sessions: AxonizSessionMeta[] }>("/history-sessions");
  return Array.isArray(out.sessions) ? out.sessions : [];
}

/** Result of a provider reachability test through /api/axoniz/providers/test. */
export interface ProviderTestResult {
  ok: boolean;
  latencyMs: number;
  models: Array<{ id: string; name?: string; contextLength?: number }>;
  error?: string;
}

/** Test that a provider endpoint is actually reachable and list its models. */
export function testProvider(body: {
  provider: string;
  baseUrl: string;
  apiKey?: string;
}): Promise<ProviderTestResult> {
  return axonizClient.testProvider(body);
}

/** Backend health payload consumed by the System page. */
export interface AxonizHealth {
  status: string;
  backend?: string;
  model?: string;
  loaded?: boolean;
  uptime_s?: number;
  palace?: { drawers?: number; kg_facts?: number };
  [key: string]: unknown;
}

/** Backend /health — falls back to a mock payload when the backend is down. */
export function getHealth(): Promise<AxonizHealth> {
  return getJson<AxonizHealth>("/health");
}

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
