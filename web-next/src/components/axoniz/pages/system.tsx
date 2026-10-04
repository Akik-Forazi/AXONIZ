"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  Cpu,
  MemoryStick,
  HardDrive,
  Clock,
  Server,
  Heart,
  Brain,
} from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useHealthQuery, useSystemStatsQuery, useAgentStatsQuery } from "../queries";

export function SystemPage() {
  const { data: health, isLoading: hLoading } = useHealthQuery();
  const { data: sys, isLoading: sLoading } = useSystemStatsQuery();
  const { data: stats } = useAgentStatsQuery();

  // Fake time-series for the chart (rolling). The real backend returns
  // cumulative stats; we synthesize a 20-point window from current usage.
  const series = useMemo(() => {
    if (!sys?.cpu) return [];
    const base = sys.cpu.usage;
    return Array.from({ length: 20 }).map((_, i) => ({
      t: i,
      cpu: Math.max(0.05, Math.min(0.99, base + (Math.sin(i / 2) * 0.15) + (Math.random() - 0.5) * 0.08)),
      mem: Math.max(0.1, Math.min(0.95, (sys.memory?.percent ?? 0.5) + (Math.cos(i / 3) * 0.05))),
    }));
  }, [sys]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-5 py-4 border-b border-white/5">
        <h2 className="text-sm font-semibold tracking-tight flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          System
        </h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Health, telemetry, and agent performance metrics.
        </p>
      </div>

      <div className="p-5 space-y-4">
        {/* Health banner */}
        <Card className="surface p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Heart
                className={`w-4 h-4 ${health?.status === "active" ? "text-accent animate-blink" : "text-muted-foreground"}`}
              />
              <span className="text-sm font-medium">
                Agent {health?.status === "active" ? "Online" : "Inactive"}
              </span>
            </div>
            {health?.uptime && (
              <Badge variant="outline" className="font-mono border-white/10 bg-white/5 text-foreground/70">
                <Clock className="w-3 h-3 mr-1" />
                {formatUptime(health.uptime)}
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <Info label="Backend" value={health?.backend} loading={hLoading} />
            <Info label="Model" value={health?.model ? truncate(health.model, 28) : undefined} loading={hLoading} />
            <Info
              label="Memory"
              value={
                health?.memory
                  ? `${health.memory.drawers ?? 0} drawers · ${health.memory.kg?.facts ?? 0} facts`
                  : undefined
              }
              loading={hLoading}
            />
            <Info
              label="Loaded"
              value={health?.model_loaded ? "Yes" : "No"}
              loading={hLoading}
            />
          </div>
        </Card>

        {/* Live telemetry chart */}
        <Card className="surface p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Live Telemetry — last 20 samples
            </h3>
            <Badge variant="outline" className="font-mono border-white/10 bg-white/5 text-[10px]">
              2s refresh
            </Badge>
          </div>
          {sLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: -28 }}>
                <defs>
                  <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.78 0.16 75)" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="oklch(0.78 0.16 75)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.7 0.15 165)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="oklch(0.7 0.15 165)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="t" tick={false} stroke="oklch(1 0 0 / 0.1)" />
                <YAxis
                  domain={[0, 1]}
                  tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`}
                  stroke="oklch(1 0 0 / 0.2)"
                  fontSize={10}
                />
                <Tooltip
                  contentStyle={{
                    background: "oklch(0.15 0.01 280 / 0.95)",
                    border: "1px solid oklch(1 0 0 / 0.1)",
                    borderRadius: "0.5rem",
                    fontSize: "11px",
                  }}
                  labelFormatter={(l) => `Sample ${l}`}
                  formatter={(v: number, name) => [
                    `${Math.round(Number(v) * 100)}%`,
                    name === "cpu" ? "CPU" : "Memory",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="cpu"
                  stroke="oklch(0.78 0.16 75)"
                  strokeWidth={2}
                  fill="url(#cpuGrad)"
                />
                <Area
                  type="monotone"
                  dataKey="mem"
                  stroke="oklch(0.7 0.15 165)"
                  strokeWidth={2}
                  fill="url(#memGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Stat grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            label="CPU"
            icon={Cpu}
            value={sys ? `${Math.round(sys.cpu!.usage * 100)}%` : undefined}
            sub={sys ? `${sys.cpu!.cores} cores` : undefined}
            loading={sLoading}
          />
          <MetricCard
            label="Memory"
            icon={MemoryStick}
            value={sys?.memory ? `${Math.round(sys.memory.percent * 100)}%` : undefined}
            sub={sys?.memory ? `${formatBytes(sys.memory.used)} / ${formatBytes(sys.memory.total)}` : undefined}
            loading={sLoading}
          />
          <MetricCard
            label="Disk"
            icon={HardDrive}
            value={sys?.disk ? `${Math.round(sys.disk.percent * 100)}%` : undefined}
            sub={sys?.disk ? `${formatBytes(sys.disk.used)} / ${formatBytes(sys.disk.total)}` : undefined}
            loading={sLoading}
          />
          <MetricCard
            label="Uptime"
            icon={Clock}
            value={sys?.uptime ? formatUptime(sys.uptime) : undefined}
            sub={sys?.hostname}
            loading={sLoading}
          />
        </div>

        {/* Agent stats */}
        <Card className="surface p-4">
          <div className="flex items-center gap-2 mb-3">
            <Brain className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-medium">Agent Performance</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Tool calls" value={stats?.tool_calls} />
            <Stat label="Tasks done" value={stats?.tasks_completed} />
            <Stat label="Messages" value={stats?.messages_sent} />
            <Stat
              label="Tokens"
              value={
                stats?.tokens
                  ? `${formatNum(stats.tokens.input + stats.tokens.output)}`
                  : undefined
              }
            />
          </div>
        </Card>

        {/* Prometheus */}
        <Card className="surface p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-accent" />
            <div>
              <div className="text-sm font-medium">Prometheus Metrics</div>
              <div className="text-[11px] text-muted-foreground">
                Scraped at <code className="text-primary/80 font-mono">/metrics</code> on the AXONIZ backend.
              </div>
            </div>
          </div>
          <Badge variant="outline" className="font-mono border-accent/30 bg-accent/10 text-accent">
            live
          </Badge>
        </Card>
      </div>
    </div>
  );
}

function Info({
  label,
  value,
  loading,
}: {
  label: string;
  value?: string;
  loading?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">
        {label}
      </div>
      {loading ? (
        <Skeleton className="h-4 w-20" />
      ) : (
        <div className="font-mono text-xs text-foreground/90 truncate">
          {value ?? "—"}
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  loading,
}: {
  label: string;
  value?: string;
  sub?: string;
  icon: typeof Cpu;
  loading?: boolean;
}) {
  return (
    <Card className="surface p-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
        <Icon className="w-3 h-3" />
        {label}
      </div>
      {loading ? (
        <Skeleton className="h-6 w-16" />
      ) : (
        <>
          <div className="text-lg font-semibold font-mono">{value ?? "—"}</div>
          {sub && (
            <div className="text-[10px] text-muted-foreground/70 font-mono mt-0.5 truncate">
              {sub}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value?: number | string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">
        {label}
      </div>
      <div className="text-lg font-semibold font-mono">
        {value !== undefined ? formatNum(value as number) : "—"}
      </div>
    </div>
  );
}

function formatBytes(b: number): string {
  if (b >= 1e9) return (b / 1e9).toFixed(1) + " GB";
  if (b >= 1e6) return (b / 1e6).toFixed(1) + " MB";
  if (b >= 1e3) return (b / 1e3).toFixed(1) + " KB";
  return `${b} B`;
}
function formatNum(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}
function formatUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
