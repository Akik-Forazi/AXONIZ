"use client";

import { useEffect, useState } from "react";
import { Activity, Cpu, HardDrive, Clock, ExternalLink } from "lucide-react";
import Link from "next/link";
import { PageHeader, StatTile, GlassCard, StatusPill, LoadingRow } from "@/components/axoniz/page-primitives";
import { useSystemStatsQuery, useAgentStatsQuery } from "@/components/axoniz/queries";
import { getHealth, type AxonizHealth } from "@/lib/axoniz/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

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
        {hLoad ? <LoadingRow count={1} /> : (
          <GlassCard className="mb-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg glass-inset flex items-center justify-center flex-shrink-0">
                <Activity className={cn("w-4 h-4", online ? "text-accent" : "text-muted-foreground")} />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold truncate">
                  {health?.backend ?? "No AXONIZ engine connected"}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {health
                    ? <span className="font-mono truncate">{health.model ?? "no model"} · {health.loaded ? "loaded" : "not loaded"} · uptime {(health.uptime_s ?? 0).toFixed(0)}s · drawers {health.palace?.drawers ?? 0} · kg {health.palace?.kg_facts ?? 0}</span>
                    : "Start llama-server or build the CLI to see live health."}
                </div>
              </div>
            </div>
          </GlassCard>
        )}

        {/* Host telemetry */}
        {sLoad ? <LoadingRow count={4} /> : sysStats ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatTile label="CPU" value={sysStats.cpu_percent?.toFixed(0) ?? "—"} unit="%" hint={`${sysStats.cpu_cores ?? 0} cores`} />
            <StatTile label="Memory" value={sysStats.mem_percent?.toFixed(0) ?? "—"} unit="%" hint={`${((sysStats.mem_used_mb ?? 0) / 1024).toFixed(1)} / ${((sysStats.mem_total_mb ?? 0) / 1024).toFixed(1)} GB`} />
            <StatTile label="Disk" value={sysStats.disk_percent?.toFixed(0) ?? "—"} hint={sysStats.hostname ?? "—"} />
            <StatTile label="Uptime" value={((sysStats.uptime_s ?? 0) / 60).toFixed(0)} unit="min" hint={sysStats.platform ?? "—"} />
          </div>
        ) : (
          <GlassCard className="mb-6"><p className="text-[12px] text-muted-foreground">Host telemetry unavailable — the AXONIZ engine isn't reporting stats.</p></GlassCard>
        )}

        {/* Agent stats */}
        <h2 className="text-[13px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Agent Lifetime</h2>
        <div className="mb-6">
          {aLoad ? <LoadingRow count={1} /> : agentStats ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <StatTile label="Tool calls" value={agentStats.tool_calls ?? 0} />
              <StatTile label="Tasks done" value={agentStats.tasks_completed ?? 0} />
              <StatTile label="Messages" value={agentStats.messages_sent ?? 0} />
              <StatTile label="Tokens" value={((agentStats.tokens_in ?? 0) + (agentStats.tokens_out ?? 0)).toLocaleString()} hint={`${agentStats.tokens_in ?? 0} in · ${agentStats.tokens_out ?? 0} out`} />
            </div>
          ) : (
            <GlassCard><p className="text-[12px] text-muted-foreground">No lifetime stats yet — counters appear after your first agent run.</p></GlassCard>
          )}
        </div>

        {/* Raw payload — debug detail, collapsed by default */}
        <details className="group">
          <summary className="text-[13px] font-semibold uppercase tracking-widest text-muted-foreground mb-3 cursor-pointer select-none inline-flex items-center gap-1.5 hover:text-foreground transition-colors">
            Raw
            <span className="text-[10px] normal-case font-mono text-muted/70 group-open:hidden">show</span>
            <span className="text-[10px] normal-case font-mono text-muted/70 hidden group-open:inline">hide</span>
          </summary>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
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
        </details>

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
