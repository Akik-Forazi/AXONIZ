"use client";

import { useEffect } from "react";
import { useAxonizStore } from "@/stores/axoniz-store";
import { useHealthQuery, useConfigQuery } from "./queries";

/**
 * On mount (when authenticated), pulls health + config from the backend
 * (or mock) and populates the store with the active model name. Keeps the
 * sidebar / top bar in sync with backend state.
 */
export function useAxonizBoot() {
  const token = useAxonizStore((s) => s.token);
  const setActiveModel = useAxonizStore((s) => s.setActiveModel);
  const setDataSource = useAxonizStore((s) => s.setDataSource);
  const healthQ = useHealthQuery();
  const configQ = useConfigQuery();

  useEffect(() => {
    if (!token) return;
    // Watch config for the active model
    if (configQ.data?.llm?.model) {
      setActiveModel(configQ.data.llm.model as string);
    }
  }, [token, configQ.data, setActiveModel]);

  useEffect(() => {
    if (!token) return;
    // Use the source tag we attach via the proxy route.
    void (async () => {
      try {
        const r = await fetch("/api/axoniz/health");
        const src = r.headers.get("x-axoniz-source");
        if (src === "live" || src === "mock") setDataSource(src);
      } catch {
        /* ignore */
      }
    })();
  }, [token, setDataSource, healthQ.dataUpdatedAt]);
}
