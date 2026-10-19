"use client";

import { useEffect } from "react";
import { useAxonizStore } from "@/stores/axoniz-store";
import { authedFetch } from "@/lib/axoniz/client";
import { useHealthQuery, useConfigQuery } from "./queries";

/**
 * On mount (when authenticated), pulls health + config from the backend
 * and populates the store with the active model name + data source tag.
 *
 * Config now loads from ~/.fraziym/axoniz/config.json (the CLI's canonical config)
 * via GET /api/axoniz/config/cli — the SAME file the CLI uses. No more
 * ~/.fraziym/axoniz/db/config.json duplicate. API keys are redacted by the API.
 *
 * The boot fetch uses authedFetch() so the Bearer JWT is attached
 * automatically from the Zustand store. Without the header, /config/cli
 * returns 401 and the store stays at DEFAULT_PROVIDERS (empty api_key).
 */
export function useAxonizBoot() {
  const token = useAxonizStore((s) => s.token);
  const setActiveModel = useAxonizStore((s) => s.setActiveModel);
  const setDataSource = useAxonizStore((s) => s.setDataSource);
  const setProvider = useAxonizStore((s) => s.setProvider);
  const setLlamacpp = useAxonizStore((s) => s.setLlamacpp);
  const setActiveProvider = useAxonizStore((s) => s.setActiveProvider);
  const healthQ = useHealthQuery();
  const configQ = useConfigQuery();

  // Load CLI config on mount (once per authentication).
  useEffect(() => {
    if (!token) return;
    // Load from the CLI's canonical config: ~/.fraziym/axoniz/config.json
    // API keys are redacted by the GET /api/axoniz/config/cli endpoint.
    authedFetch("/api/axoniz/config/cli")
      .then(r => r.ok ? r.json() : null)
      .then((data) => {
        if (!data || data.error) return;
        // Extract provider config from CLI's schema:
        // data.llm.active_provider = "llamacpp"
        // data.llm.providers.{provider}.{model_path, base_url, api_key, model_name}
        const llm = data.llm;
        if (!llm) return;
        const activeProvider = llm.active_provider ?? "llamacpp";
        setActiveProvider(activeProvider);
        // Sync each provider's settings to the store
        const providers = llm.providers ?? {};
        for (const [id, cfg] of Object.entries(providers)) {
          const pc = cfg as { enabled?: boolean; base_url?: string; api_key?: string; model_name?: string; model_path?: string };
          // Only update if the provider has actual config (skip empty defaults)
          const baseUrl = pc.base_url ?? "";
          // "[REDACTED]" means a real key exists on disk — show empty in the
          // form so the user knows to re-enter, but DON'T overwrite the stored
          // key with "[REDACTED]" on the next save.
          const apiKey = pc.api_key === "[REDACTED]" ? "" : (pc.api_key ?? "");
          const model = pc.model_name ?? pc.model_path ?? "";
          if (baseUrl || apiKey || model) {
            setProvider(id as never, {
              enabled: id === activeProvider,
              baseUrl,
              apiKey,
              model,
            });
          }
        }
        // Sync llamacpp-specific settings
        const llamacppCfg = providers.llamacpp ?? {};
        setLlamacpp({
          modelPath: llamacppCfg.model_path ?? "",
          baseUrl: providers.llamacpp_server?.base_url ?? "http://localhost:8080",
          nCtx: llamacppCfg.n_ctx ?? 8192,
          nGpuLayers: llamacppCfg.n_gpu_layers ?? 0,
          nThreads: 8,
        });
        if (llamacppCfg.model_name || llamacppCfg.model_path) {
          setActiveModel(llamacppCfg.model_name ?? llamacppCfg.model_path ?? null);
        }
      })
      .catch((e) => {
        // Log the error so it's at least visible in the browser console.
        // A 401 here means the token is no longer valid — the boot guard
        // in page.tsx will redirect to /login on the next render.
        console.warn("[boot] /api/axoniz/config/cli failed:", e instanceof Error ? e.message : String(e));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Sync active model from config response (fires only when config changes)
  useEffect(() => {
    if (!token) return;
    if (configQ.data?.llm?.model) {
      setActiveModel(configQ.data.llm.model as string);
    }
  }, [token, configQ.data, setActiveModel]);

  // Sync data source tag from health response meta
  useEffect(() => {
    if (!token) return;
    const src = healthQ.data?.__source as "live" | "mock" | undefined;
    if (src === "live" || src === "mock") setDataSource(src);
  }, [token, healthQ.data, setDataSource]);
}
