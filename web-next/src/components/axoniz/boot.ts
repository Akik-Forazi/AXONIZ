"use client";

import { useEffect } from "react";
import { useAxonizStore } from "@/stores/axoniz-store";
import { useHealthQuery, useConfigQuery } from "./queries";

/**
 * On mount (when authenticated), pulls health + config from the backend
 * and populates the store with the active model name + data source tag.
 *
 * IMPORTANT: This hook MUST NOT issue its own fetch to /api/axoniz/health.
 * The useHealthQuery() above already polls that endpoint on a schedule.
 * Issuing a second fetch here caused duplicate network requests every
 * time the health query refetched (every 10s by default), contributing
 * to the rapid request pattern seen during the reload-loop bug.
 *
 * Instead, we read x-axoniz-source from the cached health response's
 * fetcher meta — see useHealthQuery implementation in ./queries.ts.
 */
export function useAxonizBoot() {
  const token = useAxonizStore((s) => s.token);
  const setActiveModel = useAxonizStore((s) => s.setActiveModel);
  const setDataSource = useAxonizStore((s) => s.setDataSource);
  const healthQ = useHealthQuery();
  const configQ = useConfigQuery();

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
