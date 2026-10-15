"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { axonizClient, authedFetch } from "@/lib/axoniz/client";
import type { HealthResponse } from "@/lib/axoniz/api-types";

/**
 * Health query. Polls every 30s (was 10s) and captures the x-axoniz-source
 * response header so boot.ts can read it WITHOUT issuing a duplicate fetch.
 * The header is attached to the returned data as the `__source` field.
 *
 * /health is NOT a protected route (it returns public system status), but
 * we still attach the Bearer header when one is set so the server-side
 * source detection works correctly.
 */
export function useHealthQuery() {
  return useQuery({
    queryKey: ["axoniz", "health"],
    queryFn: async () => {
      const res = await authedFetch("/api/axoniz/health", {
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error(`health failed: ${res.status}`);
      const data = (await res.json()) as HealthResponse & {
        __source?: "live" | "mock";
      };
      const src = res.headers.get("x-axoniz-source");
      if (src === "live" || src === "mock") data.__source = src;
      return data;
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

export function useSystemStatsQuery() {
  return useQuery({
    queryKey: ["axoniz", "system-stats"],
    queryFn: () => axonizClient.systemStats(),
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}

export function useAgentStatsQuery() {
  return useQuery({
    queryKey: ["axoniz", "agent-stats"],
    queryFn: () => axonizClient.agentStats(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useConfigQuery() {
  return useQuery({
    queryKey: ["axoniz", "config"],
    queryFn: () => axonizClient.getConfig(),
    staleTime: 60_000,
  });
}

export function useModelsQuery() {
  return useQuery({
    queryKey: ["axoniz", "models"],
    queryFn: () => axonizClient.listModels(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useBackendsQuery() {
  return useQuery({
    queryKey: ["axoniz", "backends"],
    queryFn: () => axonizClient.listBackends(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSwarmStatusQuery() {
  return useQuery({
    queryKey: ["axoniz", "swarm-status"],
    queryFn: () => axonizClient.swarmStatus(),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

export function useWarRoomQuery() {
  return useQuery({
    queryKey: ["axoniz", "war-room"],
    queryFn: () => axonizClient.warRoom(),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

export function useMemoryQuery() {
  return useQuery({
    queryKey: ["axoniz", "memory"],
    queryFn: () => axonizClient.memory(),
    staleTime: 60_000,
  });
}

export function useDownloadsQuery() {
  return useQuery({
    queryKey: ["axoniz", "downloads"],
    queryFn: () => axonizClient.listDownloads(),
    refetchInterval: 15_000,
    staleTime: 5_000,
  });
}

export function useModelSearchQuery(q: string, enabled: boolean) {
  return useQuery({
    queryKey: ["axoniz", "model-search", q],
    queryFn: () => axonizClient.searchModels(q),
    enabled,
    staleTime: 60 * 1000,
  });
}

export function useAbsoluteQueryMutation() {
  return useMutation({
    mutationFn: (q: string) => axonizClient.absoluteQuery(q),
  });
}

/* ---------- Write mutations ---------- */
export function useSwitchModelMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => axonizClient.switchModel(path),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["axoniz", "config"] });
      qc.invalidateQueries({ queryKey: ["axoniz", "health"] });
    },
  });
}

export function useSaveConfigMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      axonizClient.saveConfig(patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["axoniz", "config"] });
    },
  });
}

export function useStartDownloadMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ repo_id, filename }: { repo_id: string; filename: string }) =>
      axonizClient.startDownload(repo_id, filename),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["axoniz", "downloads"] });
    },
  });
}
