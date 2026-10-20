"use client";

import { Network, Users, GitBranch } from "lucide-react";
import { PageHeader, GlassCard, EmptyState, LoadingRow, StatTile, StatusPill } from "@/components/axoniz/page-primitives";
import { useSwarmStatusQuery, useWarRoomQuery } from "@/components/axoniz/queries";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function WarRoomPage() {
  const { data: swarm, isLoading: sLoad } = useSwarmStatusQuery();
  const { data: warRoom, isLoading: wLoad } = useWarRoomQuery();

  const workers = warRoom?.workers ?? [];

  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="max-w-5xl mx-auto p-3 sm:p-4 lg:p-6 pb-16">
        <PageHeader
          title="War Room"
          description="Multi-agent swarm orchestrator. Decompose → worker dispatch → critic merge."
          actions={swarm?.mode && <StatusPill status="running" label={swarm.mode} />}
        />

        {/* Stats */}
        {(sLoad || wLoad) ? <LoadingRow count={3} /> : swarm && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
            <StatTile label="Mission" value={swarm.task_name ?? "idle"} />
            <StatTile label="Workers" value={swarm.worker_count ?? 0} hint={`${swarm.workers_ready ?? 0} ready`} />
            <StatTile label="Progress" value={swarm.progress_pct?.toFixed(0) ?? "0"} unit="%" />
          </div>
        )}

        {/* Phase models */}
        {swarm?.phase_models && Object.keys(swarm.phase_models).length > 0 && (
          <GlassCard className="mb-4">
            <h2 className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono mb-2">Phase Models</h2>
            <div className="flex items-center gap-2 flex-wrap">
              {Object.entries(swarm.phase_models).map(([phase, model]) => (
                <div key={phase} className="flex items-center gap-1.5 text-[11px] font-mono">
                  <span className="text-muted-foreground">{phase}:</span>
                  <span className="text-foreground">{String(model)}</span>
                </div>
              ))}
            </div>
          </GlassCard>
        )}

        {/* Workers */}
        <h2 className="text-[13px] font-semibold uppercase tracking-widest text-muted-foreground font-mono mb-3">Workers</h2>
        {wLoad ? <LoadingRow count={3} /> : workers.length === 0 ? (
          <EmptyState icon={Users} title="No active workers" hint="Spawn a swarm by submitting a goal to the Agent page." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {workers.map((w: {
              id: string; role: string; status: string; subtask?: string;
              model?: string; result_score?: number;
            }) => (
              <GlassCard key={w.id}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg glass-inset flex items-center justify-center">
                      <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <span className="text-[12px] font-mono">{w.id}</span>
                  </div>
                  <StatusPill
                    status={w.status === "working" ? "running" : w.status === "done" ? "ok" : "idle"}
                    label={w.status}
                  />
                </div>
                <div className="text-[11px] text-foreground mb-1">{w.subtask ?? "—"}</div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                  <span>{w.role}</span>
                  <span>{w.model ?? "—"}</span>
                  {typeof w.result_score === "number" && <span>score {(w.result_score * 100).toFixed(0)}%</span>}
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
