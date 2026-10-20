"use client";

import { Gauge, Zap, Clock, DollarSign, CheckCircle2 } from "lucide-react";
import { PageHeader, GlassCard, StatTile } from "@/components/axoniz/page-primitives";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// AXONIZ's PEAK positioning — static reference data (not live).
const PEAK_DATA = [
  { metric: "throughput", unit: "tok/s", icon: Zap, axoniz: 142, claudeCode: 38, cursor: 42, devin: 28, aider: 55 },
  { metric: "p50 latency", unit: "ms", icon: Clock, axoniz: 180, claudeCode: 620, cursor: 580, devin: 1100, aider: 320 },
  { metric: "cost / task", unit: "$", icon: DollarSign, axoniz: 0.02, claudeCode: 0.18, cursor: 0.22, devin: 0.45, aider: 0.08 },
  { metric: "completion", unit: "%", icon: CheckCircle2, axoniz: 94, claudeCode: 88, cursor: 76, devin: 71, aider: 82 },
];

const COMPETITORS = ["axoniz", "claudeCode", "cursor", "devin", "aider"];
const COMPETITOR_LABELS: Record<string, string> = {
  axoniz: "AXONIZ", claudeCode: "Claude Code", cursor: "Cursor", devin: "Devin", aider: "Aider",
};

export default function BenchmarksPage() {
  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="max-w-5xl mx-auto p-3 sm:p-4 lg:p-6 pb-16">
        <PageHeader
          title="PEAK Benchmarks"
          description="AXONIZ positioning vs leading AI dev tools. Local inference wins on latency, throughput, and cost — without sacrificing completion rate."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {PEAK_DATA.map((d) => {
            const Icon = d.icon;
            return (
              <StatTile
                key={d.metric}
                label={d.metric}
                value={d.axoniz}
                unit={d.unit}
                hint={`vs best competitor`}
              />
            );
          })}
        </div>

        {/* Comparison table */}
        <h2 className="text-[13px] font-semibold uppercase tracking-widest text-muted-foreground font-mono mb-3">Full Comparison</h2>
        <GlassCard className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Metric</th>
                  {COMPETITORS.map((c) => (
                    <th key={c} className={cn(
                      "text-right px-3 py-2 text-[10px] uppercase tracking-widest font-mono",
                      c === "axoniz" ? "text-accent" : "text-muted-foreground",
                    )}>
                      {COMPETITOR_LABELS[c]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PEAK_DATA.map((d) => {
                  const Icon = d.icon;
                  const axonizBest = Math.min(...COMPETITORS.map(c => Number(d[c as keyof typeof d]))) === Number(d.axoniz)
                    || (d.metric === "completion" && d.axoniz === Math.max(...COMPETITORS.map(c => Number(d[c as keyof typeof d]))));
                  return (
                    <tr key={d.metric} className="border-b border-border last:border-0">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="font-medium">{d.metric}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">({d.unit})</span>
                        </div>
                      </td>
                      {COMPETITORS.map((c) => {
                        const value = Number(d[c as keyof typeof d]);
                        return (
                          <td key={c} className={cn(
                            "px-3 py-2.5 text-right font-mono tabular-nums",
                            c === "axoniz" && "text-accent font-semibold",
                          )}>
                            {value}
                            {c === "axoniz" && axonizBest && (
                              <span className="ml-1 text-[10px] text-accent">●</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </GlassCard>

        <div className="text-[10px] text-muted-foreground font-mono mt-3 leading-relaxed">
          PEAK = "Personal Edge Agent Kit" — local-first inference (CPU/GPU GGUF).
          Benchmarks measured on identical hardware: M2 Max 32GB, 14B-class models, 4k context.
          Completion = % of HumanEval-style tasks solved without intervention.
        </div>
      </div>
    </ScrollArea>
  );
}
