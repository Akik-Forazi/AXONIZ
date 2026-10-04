/**
 * AXONIZ proxy route — every UI request hits /api/axoniz/<path> and this
 * handler forwards it to the real AXONIZ Express backend at localhost:7860.
 *
 * If the backend is unreachable (preview env, axoniz not running), we fall
 * back to mock responses that match the API contract 1:1 so the UI stays
 * fully interactive. The response carries an `x-axoniz-source: mock|live`
 * header so the UI can badge the data source.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  MOCK_ABSOLUTE_QUERY,
  MOCK_AGENT_STATS,
  MOCK_BACKENDS,
  MOCK_CONFIG,
  MOCK_DOWNLOADS,
  MOCK_HEALTH,
  MOCK_HF_SEARCH,
  MOCK_MEMORY,
  MOCK_MODELS,
  MOCK_SYSTEM_STATS,
  MOCK_SWARM_STATUS,
  MOCK_WAR_ROOM,
} from "@/lib/axoniz/mock-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BACKEND_URL = process.env.AXONIZ_BACKEND_URL ?? "http://127.0.0.1:7860";

/* Map of mock responses keyed by `METHOD:/path`. */
function mockFor(method: string, path: string, search: string, body: unknown): unknown | null {
  const q = new URLSearchParams(search);
  if (method === "GET" && path === "/health") return MOCK_HEALTH;
  if (method === "GET" && path === "/config") return MOCK_CONFIG;
  if (method === "GET" && path === "/models") return MOCK_MODELS;
  if (method === "GET" && path === "/backends") return MOCK_BACKENDS;
  if (method === "GET" && path === "/war_room") return MOCK_WAR_ROOM;
  if (method === "GET" && path === "/swarm/status") return MOCK_SWARM_STATUS;
  if (method === "GET" && path === "/memory") return MOCK_MEMORY;
  if (method === "GET" && path === "/system/stats") return MOCK_SYSTEM_STATS;
  if (method === "GET" && path === "/stats") return MOCK_AGENT_STATS;
  if (method === "GET" && path === "/absolute_query") {
    return MOCK_ABSOLUTE_QUERY;
  }
  if (method === "GET" && path === "/models/search") {
    const term = q.get("q") ?? "";
    const filtered = !term
      ? MOCK_HF_SEARCH.items
      : MOCK_HF_SEARCH.items.filter((m) =>
          [m.id, m.author, ...(m.tags ?? [])].some((s) =>
            s.toLowerCase().includes(term.toLowerCase()),
          ),
        );
    return { items: filtered, total: filtered.length };
  }
  if (method === "GET" && path === "/models/downloads") return MOCK_DOWNLOADS;
  if (method === "POST" && path === "/auth/login") {
    const { username, password } = (body ?? {}) as {
      username: string;
      password: string;
    };
    // For preview: accept any non-empty credentials.
    if (username && password && password.length >= 4) {
      return { token: `mock-${Date.now()}-${username}`, username };
    }
    return { error: "Invalid credentials" };
  }
  if (method === "POST" && path === "/config/save") return { status: "saved" as const };
  if (method === "POST" && path === "/model/switch") {
    const { path: modelPath } = (body ?? {}) as { path: string };
    if (modelPath) return { status: "ok" as const, model: modelPath };
    return { status: "error" as const, error: "Missing path" };
  }
  if (method === "POST" && path === "/models/download") {
    const { repo_id, filename } = (body ?? {}) as {
      repo_id: string;
      filename: string;
    };
    return { message: `Queued download of ${repo_id}/${filename}` };
  }
  if (method === "POST" && path === "/agent/task") {
    const { intent } = (body ?? {}) as { intent: string };
    return {
      taskId: `task_${Math.random().toString(16).slice(2, 10)}`,
      status: "started" as const,
      _intent: intent,
    };
  }
  if (method === "POST" && path === "/providers/test") {
    return { status: "ok", latency_ms: 42 };
  }
  if (method === "POST" && path === "/reset") return { status: "reset" as const };
  if (method === "GET" && path === "/files/list") {
    return { tree: [] };
  }
  if (method === "GET" && path === "/voice/tts") {
    return {
      tts_available: true,
      stt_available: true,
      wake_word_available: true,
      tts_backend: "kokoro",
      stt_backend: "moonshine",
    };
  }
  return null;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, ctx);
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, ctx);
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, ctx);
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, ctx);
}

async function proxy(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await ctx.params;
  const axonizPath = "/" + segments.join("/");
  const method = req.method.toUpperCase();
  const search = req.nextUrl.search;
  const upstreamUrl = `${BACKEND_URL}/api/${axonizPath}${search}`;

  // Read the request body ONCE — NextRequest body stream can only be read
  // a single time, so we cache it for both upstream forwarding and mock.
  let bodyText: string | undefined;
  if (method !== "GET" && method !== "HEAD") {
    try {
      bodyText = await req.text();
    } catch {
      /* no body — fine */
    }
  }
  let bodyJson: unknown = undefined;
  if (bodyText) {
    try {
      bodyJson = JSON.parse(bodyText);
    } catch {
      bodyJson = undefined;
    }
  }

  // Try live backend first.
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 800);
    const init: RequestInit = {
      method,
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    };
    if (bodyText) init.body = bodyText;
    const upstream = await fetch(upstreamUrl, init);
    clearTimeout(timeout);

    if (upstream.ok) {
      const text = await upstream.text();
      return new NextResponse(text, {
        status: upstream.status,
        headers: {
          "Content-Type": upstream.headers.get("content-type") ?? "application/json",
          "x-axoniz-source": "live",
        },
      });
    }
    if (upstream.status === 404) {
      return NextResponse.json(
        { error: "Not found", path: axonizPath },
        { status: 404, headers: { "x-axoniz-source": "live" } },
      );
    }
    // Fall through to mock on other upstream errors.
  } catch {
    /* backend unreachable — use mock */
  }

  const mock = mockFor(method, axonizPath, search, bodyJson);
  if (mock === null) {
    return NextResponse.json(
      { error: `No mock for ${method} ${axonizPath}` },
      { status: 404, headers: { "x-axoniz-source": "mock" } },
    );
  }

  // Login failures should propagate 401 to mirror real backend.
  if (mock && typeof mock === "object" && "error" in mock) {
    return NextResponse.json(mock, {
      status: 401,
      headers: { "x-axoniz-source": "mock" },
    });
  }

  return NextResponse.json(mock, {
    status: 200,
    headers: { "x-axoniz-source": "mock" },
  });
}
