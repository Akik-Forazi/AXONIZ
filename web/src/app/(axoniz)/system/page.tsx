"use client";

import { useEffect, useState } from "react";
import { Activity, Cpu, HardDrive, Clock, ExternalLink } from "lucide-react";
import Link from "next/link";
import { PageHeader, StatTile, GlassCard, StatusPill, LoadingRow } from "@/components/axoniz/page-primitives";
import { useSystemStatsQuery, useAgentStatsQuery } from "@/components/axoniz/queries";
import { getHealth, type AxonizHealth } from "@/lib/axoniz/client";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function SystemPage() {
  const [health, setHealth] = useState<AxonizHealth | null>(null);
  const [hLoad, setHLoad] = useState(true);
  const { data: sysStats, isLoading: sLoad } = useSystemStatsQuery();
  const { data: agentStats, isLoading: aLoad } = useAgentStatsQuery();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setHLoad(true);
      try {
        const h = await getHealth();
        if (!cancelled) setHealth(h);
      } catch {
        if (!cancelled) setHealth({ status: "offline" });
      } finally {
        if (!cancelled) setHLoad(false);
      }
    };
    void load();
    const id = setInterval(load, 10_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const online = health?.status === "active";

  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="max-w-5xl mx-auto p-3 sm:p-4 lg:p-6 pb-16">
        <PageHeader
          title="System"
          description="Live agent health, host telemetry, and lifetime counters."
          actions={<StatusPill status={online ? "ok" : "idle"} label={online ? "Online" : "Offline"} />}
        />

        {/* Health banner */}
        {hLoad ? <LoadingRow count={1} /> : health && (
          <GlassCard className="mb-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Activity className="w-4 h-4 text-primary" />
              </div>
              <div>
                <div className="text-[13px] font-semibold">
                  {health.backend ?? "—"} · {health.model ?? "—"} · {health.loaded ? "loaded" : "not loaded"}
                </div>
                <div className="text-[11px] text-muted-foreground font-mono">
                  uptime {(health.uptime_s ?? 0).toFixed(0)}s · drawers {health.palace?.drawers ?? 0} · kg {health.palace?.kg_facts ?? 0}
                </div>
              </div>
            </div>
          </GlassCard>
        )}

        {/* Host telemetry */}
        {sLoad ? <LoadingRow count={4} /> : sysStats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatTile label="CPU" value={sysStats.cpu_percent?.toFixed(0) ?? "—"} unit="%" hint={`${sysStats.cpu_cores ?? 0} cores`} />
            <StatTile label="Memory" value={sysStats.mem_percent?.toFixed(0) ?? "—"} unit="%" hint={`${((sysStats.mem_used_mb ?? 0) / 1024).toFixed(1)} / ${((sysStats.mem_total_mb ?? 0) / 1024).toFixed(1)} GB`} />
            <StatTile label="Disk" value={sysStats.disk_percent?.toFixed(0) ?? "—"} unit="%" hint={`${sysStats.hostname ?? "—"}`} />
            <StatTile label="Uptime" value={((sysStats.uptime_s ?? 0) / 60).toFixed(0)} unit="min" hint={sysStats.platform ?? "—"} />
          </div>
        )}

        {/* Agent stats */}
        <h2 className="text-[13px] font-semibold uppercase tracking-widest text-muted-foreground font-mono mb-3">Agent Lifetime</h2>
        {aLoad ? <LoadingRow count={4} /> : agentStats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatTile label="Tool calls" value={agentStats.tool_calls ?? 0} />
            <StatTile label="Tasks done" value={agentStats.tasks_completed ?? 0} />
            <StatTile label="Messages" value={agentStats.messages_sent ?? 0} />
            <StatTile label="Tokens" value={((agentStats.tokens_in ?? 0) + (agentStats.tokens_out ?? 0)).toLocaleString()} hint={`${agentStats.tokens_in ?? 0} in · ${agentStats.tokens_out ?? 0} out`} />
          </div>
        )}

        {/* Raw payload */}
        <h2 className="text-[13px] font-semibold uppercase tracking-widest text-muted-foreground font-mono mb-3">Raw</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <GlassCard>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono mb-2">health.json</div>
            <pre className="text-[11px] font-mono whitespace-pre-wrap break-words text-foreground/80 max-h-64 overflow-y-auto">
              {JSON.stringify(health, null, 2)}
            </pre>
          </GlassCard>
          <GlassCard>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono mb-2">system_stats.json</div>
            <pre className="text-[11px] font-mono whitespace-pre-wrap break-words text-foreground/80 max-h-64 overflow-y-auto">
              {JSON.stringify(sysStats, null, 2)}
            </pre>
          </GlassCard>
        </div>

        <div className="mt-6">
          <Link href="/api/axoniz/metrics" target="_blank" className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground font-mono">
              <ExternalLink className="w-3 h-3" />
              Open Prometheus /metrics
          </Link>
        </div>
      </div>
    </ScrollArea>
  );
}
