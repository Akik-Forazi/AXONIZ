/**
 * Real provider connection test — ACTUALLY pings the user's configured
 * endpoint and returns the real list of available models (or real errors).
 *
 * Supported providers (14):
 *  - lmstudio / openai / openrouter / groq / together / mistral /
 *    deepseek / fireworks / perplexity / anthropic / gemini / custom
 *    → GET {baseUrl}/models (OpenAI-compatible) with Authorization header
 *  - ollama → GET {baseUrl}/api/tags
 *  - llamacpp → GET {baseUrl}/health
 *
 * For Anthropic: GET {baseUrl}/models with x-api-key + anthropic-version headers
 * For Gemini: GET {baseUrl}/models?key={apiKey}
 *
 * Returns: { ok, latencyMs, models: [{id, contextLength?, pricing?}], error? }
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

interface ModelInfo {
  id: string;
  contextLength?: number;
  pricing?: { prompt?: number; completion?: number };
}

interface TestBody {
  provider: string;
  baseUrl: string;
  apiKey?: string;
}

interface TestResult {
  ok: boolean;
  latencyMs: number;
  models: ModelInfo[];
  error?: string;
}

const TIMEOUT_MS = 8000;

function normalizeUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

async function pingOpenAICompatible(baseUrl: string, apiKey: string): Promise<TestResult> {
  const start = Date.now();
  try {
    const r = await fetch(`${normalizeUrl(baseUrl)}/models`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const latencyMs = Date.now() - start;
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      return {
        ok: false,
        latencyMs,
        models: [],
        error: `HTTP ${r.status} ${r.statusText}${text ? ` — ${text.slice(0, 200)}` : ""}`,
      };
    }
    const data = (await r.json()) as {
      data?: Array<{ id: string; context_length?: number; pricing?: { prompt?: string; completion?: string } }>;
      models?: Array<{ id: string }>;
    };
    const models: ModelInfo[] = (data.data ?? data.models ?? []).map((m) => ({
      id: m.id,
      contextLength: (m as { context_length?: number }).context_length,
      pricing: m.pricing
        ? {
            prompt: m.pricing.prompt ? Number(m.pricing.prompt) : undefined,
            completion: m.pricing.completion ? Number(m.pricing.completion) : undefined,
          }
        : undefined,
    }));
    return { ok: true, latencyMs, models };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      models: [],
      error:
        err instanceof Error
          ? err.name === "TimeoutError" || err.name === "AbortError"
            ? "Connection timed out (8s). Is the server running and reachable?"
            : err.message
          : "Unknown error",
    };
  }
}

async function pingOllama(baseUrl: string): Promise<TestResult> {
  const start = Date.now();
  try {
    const r = await fetch(`${normalizeUrl(baseUrl)}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const latencyMs = Date.now() - start;
    if (!r.ok) {
      return {
        ok: false,
        latencyMs,
        models: [],
        error: `HTTP ${r.status} ${r.statusText}`,
      };
    }
    const data = (await r.json()) as {
      models?: Array<{ name: string; size?: number; details?: { parameter_size?: string; quantization_level?: string } }>;
    };
    const models: ModelInfo[] = (data.models ?? []).map((m) => ({
      id: m.name,
    }));
    return { ok: true, latencyMs, models };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      models: [],
      error:
        err instanceof Error
          ? err.name === "TimeoutError" || err.name === "AbortError"
            ? "Connection timed out (8s). Is Ollama running on this URL?"
            : err.message
          : "Unknown error",
    };
  }
}

async function pingLlamaCpp(baseUrl: string): Promise<TestResult> {
  const start = Date.now();
  try {
    const r = await fetch(`${normalizeUrl(baseUrl)}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const latencyMs = Date.now() - start;
    if (!r.ok) {
      return {
        ok: false,
        latencyMs,
        models: [],
        error: `HTTP ${r.status} ${r.statusText}`,
      };
    }
    return { ok: true, latencyMs, models: [] };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      models: [],
      error:
        err instanceof Error
          ? err.name === "TimeoutError" || err.name === "AbortError"
            ? "Connection timed out (8s). Is llama-server running on this URL?"
            : err.message
          : "Unknown error",
    };
  }
}

async function pingAnthropic(baseUrl: string, apiKey: string): Promise<TestResult> {
  const start = Date.now();
  try {
    const r = await fetch(`${normalizeUrl(baseUrl)}/models`, {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const latencyMs = Date.now() - start;
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      return {
        ok: false,
        latencyMs,
        models: [],
        error: `HTTP ${r.status} ${r.statusText}${text ? ` — ${text.slice(0, 200)}` : ""}`,
      };
    }
    const data = (await r.json()) as {
      data?: Array<{ id: string; display_name?: string; created_at?: string }>;
    };
    const models: ModelInfo[] = (data.data ?? []).map((m) => ({
      id: m.id,
    }));
    return { ok: true, latencyMs, models };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      models: [],
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

async function pingGemini(baseUrl: string, apiKey: string): Promise<TestResult> {
  const start = Date.now();
  try {
    const r = await fetch(`${normalizeUrl(baseUrl)}/models?key=${apiKey}`, {
      method: "GET",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const latencyMs = Date.now() - start;
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      return {
        ok: false,
        latencyMs,
        models: [],
        error: `HTTP ${r.status} ${r.statusText}${text ? ` — ${text.slice(0, 200)}` : ""}`,
      };
    }
    const data = (await r.json()) as {
      models?: Array<{ name: string; displayName?: string; inputTokenLimit?: number; outputTokenLimit?: number }>;
    };
    const models: ModelInfo[] = (data.models ?? []).map((m) => ({
      id: m.name.replace(/^models\//, ""),
      contextLength: m.inputTokenLimit,
    }));
    return { ok: true, latencyMs, models };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      models: [],
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function POST(req: NextRequest) {
  let body: TestBody;
  try {
    body = (await req.json()) as TestBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body", models: [], latencyMs: 0 },
      { status: 400 },
    );
  }

  if (!body.baseUrl && body.provider !== "llamacpp") {
    return NextResponse.json(
      { ok: false, error: "Missing baseUrl", models: [], latencyMs: 0 },
      { status: 400 },
    );
  }

  let result: TestResult;
  switch (body.provider) {
    case "lmstudio":
    case "openai":
    case "openrouter":
    case "groq":
    case "together":
    case "mistral":
    case "deepseek":
    case "fireworks":
    case "perplexity":
    case "custom":
      result = await pingOpenAICompatible(body.baseUrl, body.apiKey ?? "");
      break;
    case "ollama":
      result = await pingOllama(body.baseUrl);
      break;
    case "llamacpp":
      result = await pingLlamaCpp(body.baseUrl);
      break;
    case "anthropic":
      result = await pingAnthropic(body.baseUrl, body.apiKey ?? "");
      break;
    case "gemini":
      result = await pingGemini(body.baseUrl, body.apiKey ?? "");
      break;
    default:
      result = {
        ok: false,
        error: `Unknown provider: ${body.provider as string}`,
        models: [],
        latencyMs: 0,
      };
  }

  return NextResponse.json(result, {
    status: 200,
    headers: { "x-axoniz-source": "live" },
  });
}
