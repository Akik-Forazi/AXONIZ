"use client";

import { useEffect } from "react";
import { useAxonizStore } from "@/stores/axoniz-store";
import { useHealthQuery, useConfigQuery } from "./queries";

/**
 * On mount (when authenticated), pulls health + config from the backend
 * and populates the store with the active model name + data source tag.
 *
 * ALSO loads the persistent DB config from ~/.axoniz/db/config.json
 * (via GET /api/axoniz/db/config) and syncs provider API keys + models
 * + llamacpp settings into the store. This way, keys saved in the DB
 * survive browser cache clears and are shared across browsers.
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

  // Load DB config on mount (once per authentication).
  useEffect(() => {
    if (!token) return;
    fetch("/api/axoniz/db/config")
      .then(r => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return;
        // Sync provider configs from DB → store.
        if (data.providers) {
          for (const [id, cfg] of Object.entries(data.providers)) {
            const pc = cfg as { enabled?: boolean; baseUrl?: string; apiKey?: string; model?: string };
            if (pc.apiKey || pc.baseUrl || pc.model) {
              setProvider(id as never, {
                enabled: pc.enabled ?? false,
                baseUrl: pc.baseUrl ?? "",
                apiKey: pc.apiKey ?? "",
                model: pc.model ?? "",
              });
            }
          }
        }
        // Sync llamacpp settings from DB → store.
        if (data.llamacpp) {
          setLlamacpp(data.llamacpp);
        }
        // Sync active provider + model from DB → store.
        if (data.activeProvider) {
          setActiveProvider(data.activeProvider);
        }
        if (data.activeModel) {
          setActiveModel(data.activeModel);
        }
      })
      .catch(() => { /* DB not yet created — defaults are fine */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Sync active model from config response (fires only when config changes)
  useEffect(() => {
    if (!token) return;
    if (configQ.data?.llm?.model) {
      setActiveModel(configQ.data.llm.model as string);
    }
  }, [token, configQ.data, setActiveModel]);

  // Sync data source tag from health response meta (fires only when health
  // response changes — not on every render, not via a duplicate fetch)
  useEffect(() => {
    if (!token) return;
    const src = healthQ.data?.__source as "live" | "mock" | undefined;
    if (src === "live" || src === "mock") setDataSource(src);
  }, [token, healthQ.data, setDataSource]);
}
