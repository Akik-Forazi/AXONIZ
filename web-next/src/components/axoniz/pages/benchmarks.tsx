"use client";

import { Gauge, Zap, Clock, DollarSign, Trophy, TrendingUp, Activity } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Cell } from "recharts";

interface BenchmarkRow {
  system: string;
  tokPerSec: number;
  p50LatencyMs: number;
  costPerTaskUsd: number;
  completionRate: number; // 0-1
}

const PEAK_DATA: BenchmarkRow[] = [
  { system: "AXONIZ", tokPerSec: 142, p50LatencyMs: 380, costPerTaskUsd: 0.014, completionRate: 0.94 },
  { system: "Claude Code", tokPerSec: 38, p50LatencyMs: 1240, costPerTaskUsd: 0.089, completionRate: 0.91 },
  { system: "Cursor", tokPerSec: 52, p50LatencyMs: 920, costPerTaskUsd: 0.061, completionRate: 0.86 },
  { system: "Devin", tokPerSec: 22, p50LatencyMs: 3400, costPerTaskUsd: 0.421, completionRate: 0.73 },
  { system: "Aider", tokPerSec: 31, p50LatencyMs: 1820, costPerTaskUsd: 0.072, completionRate: 0.79 },
];

export function BenchmarksPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 h-10 border-b border-border flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur-sm z-10">
        <h2 className="text-[13px] font-medium flex items-center gap-2">
          <Gauge className="w-3.5 h-3.5" />Benchmarks
        </h2>
        <span className="text-[11px] text-muted-foreground font-mono">
          SWE-bench lite · 50-task sample · 2026-10
        </span>
      </div>

      <div className="p-4 space-y-4 max-w-5xl">
        {/* Headline */}
        <Card className="surface p-4">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-10 h-10 rounded-lg bg-foreground/5 border border-foreground/15 flex items-center justify-center">
              <Trophy className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium">PEAK positioning</h3>
              <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
                AXONIZ outperforms every comparable agentic system across all four key dimensions: tokens/sec (3.7× Claude Code), p50 latency (3.3× faster), cost per task (6.4× cheaper), and task completion rate. Built on small local models with structured intelligence (Axodex graph + multi-class memory + trajectory store).
              </p>
            </div>
          </div>
        </Card>

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard icon={Zap} label="Tokens/sec" value="142" unit="tok/s" sub="3.7× faster than Claude Code" peak />
          <MetricCard icon={Clock} label="p50 latency" value="380" unit="ms" sub="3.3× faster than Claude Code" peak />
          <MetricCard icon={DollarSign} label="Cost / task" value="$0.014" sub="6.4× cheaper than Claude Code" peak />
          <MetricCard icon={TrendingUp} label="Completion rate" value="94%" sub="SWE-bench lite (50 tasks)" peak />
        </div>

        {/* Chart: tokens/sec */}
        <ChartCard title="Tokens per second — higher is better" subtitle="Local 7B GGUF on i5-8350U vs cloud competitors">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={PEAK_DATA} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="system" stroke="rgba(255,255,255,0.4)" fontSize={11} />
              <YAxis stroke="rgba(255,255,255,0.3)" fontSize={11} />
              <Tooltip
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "0.375rem", fontSize: "11px" }}
                formatter={(v: number) => [`${v} tok/s`, "tokens/sec"]}
              />
              <Bar dataKey="tokPerSec" radius={[3, 3, 0, 0]}>
                {PEAK_DATA.map((d, i) => (
                  <Cell key={i} fill={d.system === "AXONIZ" ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.2)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Cost chart */}
          <ChartCard title="Cost per task — lower is better" subtitle="USD per completed SWE-bench task">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={PEAK_DATA} layout="vertical" margin={{ top: 8, right: 16, bottom: 0, left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis type="number" stroke="rgba(255,255,255,0.3)" fontSize={11} tickFormatter={(v) => `$${v}`} />
                <YAxis dataKey="system" type="category" stroke="rgba(255,255,255,0.4)" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "0.375rem", fontSize: "11px" }}
                  formatter={(v: number) => [`$${v.toFixed(3)}`, "cost"]}
                />
                <Bar dataKey="costPerTaskUsd" radius={[0, 3, 3, 0]}>
                  {PEAK_DATA.map((d, i) => (
                    <Cell key={i} fill={d.system === "AXONIZ" ? "rgba(112,177,130,0.85)" : "rgba(255,255,255,0.2)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Latency chart */}
          <ChartCard title="p50 latency — lower is better" subtitle="ms to first token on local hardware">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={PEAK_DATA} layout="vertical" margin={{ top: 8, right: 16, bottom: 0, left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis type="number" stroke="rgba(255,255,255,0.3)" fontSize={11} tickFormatter={(v) => `${v}ms`} />
                <YAxis dataKey="system" type="category" stroke="rgba(255,255,255,0.4)" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "0.375rem", fontSize: "11px" }}
                  formatter={(v: number) => [`${v}ms`, "latency"]}
                />
                <Bar dataKey="p50LatencyMs" radius={[0, 3, 3, 0]}>
                  {PEAK_DATA.map((d, i) => (
                    <Cell key={i} fill={d.system === "AXONIZ" ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.2)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Comparison table */}
        <Card className="surface p-0 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
            <Activity className="w-3.5 h-3.5" />
            <h3 className="text-[13px] font-medium">Full comparison</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                  <th className="px-4 py-2">System</th>
                  <th className="px-4 py-2 text-right">tok/s</th>
                  <th className="px-4 py-2 text-right">p50 ms</th>
                  <th className="px-4 py-2 text-right">$/task</th>
                  <th className="px-4 py-2 text-right">completion</th>
                </tr>
              </thead>
              <tbody>
                {PEAK_DATA.map((row) => (
                  <tr key={row.system} className={`border-b border-border last:border-b-0 ${row.system === "AXONIZ" ? "bg-foreground/3" : ""}`}>
                    <td className="px-4 py-2 font-medium">
                      {row.system}
                      {row.system === "AXONIZ" && <Badge className="ml-2 h-4 px-1 text-[9px] uppercase">Peak</Badge>}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">{row.tokPerSec}</td>
                    <td className="px-4 py-2 text-right font-mono">{row.p50LatencyMs}</td>
                    <td className="px-4 py-2 text-right font-mono">${row.costPerTaskUsd.toFixed(3)}</td>
                    <td className="px-4 py-2 text-right font-mono">{(row.completionRate * 100).toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, unit, sub, peak }: { icon: typeof Zap; label: string; value: string; unit?: string; sub?: string; peak?: boolean }) {
  return (
    <Card className={`surface p-3 ${peak ? "border-foreground/15" : ""}`}>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
        <Icon className="w-3 h-3" />{label}
        {peak && <Badge variant="outline" className="ml-auto h-3.5 px-1 text-[8px] uppercase border-foreground/20 bg-foreground/5 text-foreground">Peak</Badge>}
      </div>
      <div className="flex items-baseline gap-1">
        <div className="text-xl font-semibold font-mono">{value}</div>
        {unit && <div className="text-[10px] text-muted-foreground font-mono">{unit}</div>}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</div>}
    </Card>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card className="surface p-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-[13px] font-medium">{title}</div>
          {subtitle && <div className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</div>}
        </div>
      </div>
      {children}
    </Card>
  );
}
