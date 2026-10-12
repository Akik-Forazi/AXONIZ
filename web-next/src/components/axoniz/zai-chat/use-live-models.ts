"use client";
/**
 * useLiveModels — fetches the actual model list from a configured provider's
 * /v1/models endpoint via /api/axoniz/providers/test. Caches per (provider,
 * baseUrl, apiKey) for 5 minutes. NO HARDCODED FALLBACK — if the live fetch
 * fails or returns no models, returns an empty list + provider-specific
 * guidance that the UI can surface to the user.
 *
 * Returns: { models, loading, error, source, category, refetch }
 *   source   = "live" | "cache" | "empty"
 *   category = "local" | "cloud" (for surfacing the right empty-state hint)
 */
import { useState, useEffect } from "react";
import { PROVIDER_CATALOG, type ProviderId } from "@/stores/axoniz-store";

export interface LiveModel {
  id: string;
  contextLength?: number;
  pricing?: { prompt?: number; completion?: number };
}

export interface UseLiveModelsResult {
  models: LiveModel[];
  loading: boolean;
  error: string | null;
  source: "live" | "cache" | "empty";
  category: "local" | "cloud";
  /** Provider-specific guidance shown in the empty state. */
  emptyHint: string;
  refetch: () => void;
}

// Module-level cache: key = `${provider}|${baseUrl}|${apiKeyHash}`
interface CacheEntry {
  models: LiveModel[];
  source: "live" | "empty";
  fetchedAt: number;
  error: string | null;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
const cache = new Map<string, CacheEntry>();

function cacheKey(provider: string, baseUrl: string, apiKey: string): string {
  let hash = 0;
  for (let i = 0; i < apiKey.length; i++) {
    hash = ((hash << 5) - hash + apiKey.charCodeAt(i)) | 0;
  }
  return `${provider}|${baseUrl}|${hash.toString(36)}`;
}

/** Build a provider-specific empty-state hint. */
function buildEmptyHint(
  provider: ProviderId,
  baseUrl: string,
  category: "local" | "cloud",
): string {
  if (category === "local") {
    const needsServer = provider === "llamacpp" || provider === "ollama" || provider === "lmstudio";
    if (needsServer) {
      return `Start your ${provider} server${baseUrl ? ` at ${baseUrl}` : ""} — then click Refresh.`;
    }
    if (provider === "custom") {
      return `Set a baseUrl in Settings → Providers, then click Refresh.`;
    }
    return `Run your local server, then click Refresh.`;
  }
  // Cloud
  return `Check your API key in Settings → Providers and verify internet connection, then click Refresh.`;
}

export function useLiveModels(
  provider: ProviderId,
  baseUrl: string,
  apiKey: string,
): UseLiveModelsResult {
  const meta = PROVIDER_CATALOG.find((p) => p.id === provider);
  const category = meta?.category ?? "local";

  const [state, setState] = useState<{
    models: LiveModel[];
    loading: boolean;
    error: string | null;
    source: "live" | "cache" | "empty";
  }>({
    models: [],
    loading: false,
    error: null,
    source: "empty",
  });

  const [refreshToken, setRefreshToken] = useState(0);
  const refetch = () => setRefreshToken((n) => n + 1);

  useEffect(() => {
    if (!baseUrl && provider !== "llamacpp") {
      // No baseUrl configured — empty state with provider-specific hint
      setState({
        models: [],
        loading: false,
        error: "No baseUrl configured",
        source: "empty",
      });
      return;
    }

    const key = cacheKey(provider, baseUrl, apiKey);
    const cached = cache.get(key);

    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      setState({
        models: cached.models,
        loading: false,
        error: cached.error,
        source: "cache",
      });
      return;
    }

    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));

    (async () => {
      try {
        const r = await fetch("/api/axoniz/providers/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, baseUrl, apiKey }),
          signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) {
          throw new Error(`HTTP ${r.status}`);
        }
        const data = (await r.json()) as {
          ok: boolean;
          latencyMs: number;
          models?: LiveModel[];
          error?: string;
        };

        if (cancelled) return;

        if (!data.ok || !data.models || data.models.length === 0) {
          // Live fetch failed OR returned no models — EMPTY (no fallback)
          const errMsg = data.error || "Provider returned no models";
          cache.set(key, {
            models: [],
            source: "empty",
            fetchedAt: Date.now(),
            error: errMsg,
          });
          setState({
            models: [],
            loading: false,
            error: errMsg,
            source: "empty",
          });
          return;
        }

        // Live fetch succeeded
        cache.set(key, {
          models: data.models,
          source: "live",
          fetchedAt: Date.now(),
          error: null,
        });
        setState({
          models: data.models,
          loading: false,
          error: null,
          source: "live",
        });
      } catch (err) {
        if (cancelled) return;
        const e = err as Error;
        const errMsg =
          e.name === "TimeoutError" || e.name === "AbortError"
            ? "Provider timed out (8s)"
            : e.message;
        cache.set(key, {
          models: [],
          source: "empty",
          fetchedAt: Date.now(),
          error: errMsg,
        });
        setState({
          models: [],
          loading: false,
          error: errMsg,
          source: "empty",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [provider, baseUrl, apiKey, refreshToken]);

  const emptyHint = buildEmptyHint(provider, baseUrl, category);

  return {
    models: state.models,
    loading: state.loading,
    error: state.error,
    source: state.source,
    category,
    emptyHint,
    refetch,
  };
}
