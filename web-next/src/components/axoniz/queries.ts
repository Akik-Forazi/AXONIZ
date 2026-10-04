"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { axonizClient } from "@/lib/axoniz/client";

/* ---------- Read queries ---------- */
export function useHealthQuery() {
  return useQuery({
    queryKey: ["axoniz", "health"],
    queryFn: () => axonizClient.health(),
    refetchInterval: 10_000,
  });
}

export function useSystemStatsQuery() {
  return useQuery({
    queryKey: ["axoniz", "system-stats"],
    queryFn: () => axonizClient.systemStats(),
    refetchInterval: 5_000,
  });
}

export function useAgentStatsQuery() {
  return useQuery({
    queryKey: ["axoniz", "agent-stats"],
    queryFn: () => axonizClient.agentStats(),
    refetchInterval: 15_000,
  });
}

export function useConfigQuery() {
  return useQuery({
    queryKey: ["axoniz", "config"],
    queryFn: () => axonizClient.getConfig(),
  });
}

export function useModelsQuery() {
  return useQuery({
    queryKey: ["axoniz", "models"],
    queryFn: () => axonizClient.listModels(),
    refetchInterval: 30_000,
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
    refetchInterval: 8_000,
  });
}

export function useWarRoomQuery() {
  return useQuery({
    queryKey: ["axoniz", "war-room"],
    queryFn: () => axonizClient.warRoom(),
    refetchInterval: 4_000,
  });
}

export function useMemoryQuery() {
  return useQuery({
    queryKey: ["axoniz", "memory"],
    queryFn: () => axonizClient.memory(),
  });
}

export function useDownloadsQuery() {
  return useQuery({
    queryKey: ["axoniz", "downloads"],
    queryFn: () => axonizClient.listDownloads(),
    refetchInterval: 2_500,
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
