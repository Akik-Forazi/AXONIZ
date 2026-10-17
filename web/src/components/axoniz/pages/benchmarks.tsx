"use client";

import { Gauge, Trophy, FlaskConical, Play } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function BenchmarksPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 h-10 border-b border-border flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur-sm z-10">
        <h2 className="text-[13px] font-medium flex items-center gap-2">
          <Gauge className="w-3.5 h-3.5" />Benchmarks
        </h2>
        <span className="text-[11px] text-muted-foreground font-mono">
          No benchmarks run yet
        </span>
      </div>
      <div className="p-4 space-y-4 max-w-5xl">
        <Card className="surface p-8 flex flex-col items-center justify-center text-center min-h-[300px]">
          <div className="w-14 h-14 rounded-xl bg-foreground/5 border border-foreground/15 flex items-center justify-center mb-4">
            <FlaskConical className="w-7 h-7 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-medium mb-2">No benchmark results yet</h3>
          <p className="text-[12px] text-muted-foreground max-w-md leading-relaxed mb-4">
            Benchmark results will appear here after you run <code className="px-1 py-0.5 rounded bg-muted font-mono text-[11px]">axoniz test</code> with a configured provider.
            Results include tokens/sec, p50 latency, cost per task, and SWE-bench completion rate —
            measured against your actual hardware and model, not fabricated.
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="text-[12px]" disabled>
              <Play className="w-3 h-3 mr-1.5" />
              Run benchmarks
            </Button>
            <span className="text-[10px] text-muted-foreground">
              Requires <code className="font-mono">axoniz --web</code> backend running
            </span>
          </div>
        </Card>
        <Card className="surface p-4">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-10 h-10 rounded-lg bg-foreground/5 border border-foreground/15 flex items-center justify-center">
              <Trophy className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium">Planned benchmarks</h3>
              <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
                When benchmark results are available, this page will show:
              </p>
              <ul className="text-[12px] text-muted-foreground mt-2 space-y-1 ml-4 list-disc">
                <li><strong className="text-foreground">Tokens/sec</strong> — throughput on your local hardware</li>
                <li><strong className="text-foreground">p50 latency</strong> — time to first token</li>
                <li><strong className="text-foreground">Cost per task</strong> — $0 for local models, API cost for cloud</li>
                <li><strong className="text-foreground">Completion rate</strong> — SWE-bench lite task success %</li>
              </ul>
              <p className="text-[11px] text-muted-foreground/70 mt-2">
                All measurements tagged with model name, hardware specs, and timestamp. No fabricated values.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
