"use client";

import { useState } from "react";
import { GitBranch, Search, Boxes, Network, Activity, FileCode, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

interface SymbolNode {
  id: string;
  name: string;
  type: "function" | "class" | "method" | "interface" | "variable";
  file: string;
  line: number;
  callers: number;
  callees: number;
  flows: number;
}

const SAMPLE_SYMBOLS: SymbolNode[] = [
  { id: "1", name: "Agent.run()", type: "function", file: "src/core/agent.ts", line: 412, callers: 12, callees: 24, flows: 8 },
  { id: "2", name: "GoalLoop.run()", type: "function", file: "src/core/loop.ts", line: 88, callers: 4, callees: 16, flows: 3 },
  { id: "3", name: "_exec(name, args)", type: "method", file: "src/core/agent.ts", line: 612, callers: 8, callees: 19, flows: 5 },
  { id: "4", name: "SwarmOrchestrator", type: "class", file: "src/core/intelligence/swarm.ts", line: 42, callers: 3, callees: 28, flows: 4 },
  { id: "5", name: "TrajectoryStore.record()", type: "method", file: "src/core/intelligence/trajectory.ts", line: 124, callers: 9, callees: 6, flows: 6 },
  { id: "6", name: "AxodexIndexer.build()", type: "method", file: "src/core/intelligence/ast_index.ts", line: 78, callers: 2, callees: 11, flows: 2 },
  { id: "7", name: "UnifiedMemory.search()", type: "method", file: "src/integrations/unified_memory.ts", line: 312, callers: 14, callees: 9, flows: 7 },
  { id: "8", name: "ConfidenceScorer.gate()", type: "method", file: "src/core/intelligence/confidence.ts", line: 56, callers: 6, callees: 4, flows: 3 },
];

export function AxodexPage() {
  const [query, setQuery] = useState("");
  const filtered = SAMPLE_SYMBOLS.filter((s) =>
    !query || s.name.toLowerCase().includes(query.toLowerCase()) || s.file.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 h-10 border-b border-border flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur-sm z-10">
        <h2 className="text-[13px] font-medium flex items-center gap-2">
          <GitBranch className="w-3.5 h-3.5" />Axodex
        </h2>
        <span className="text-[11px] text-muted-foreground font-mono">
          4,843 symbols · 10,982 relationships · 300 execution flows
        </span>
      </div>

      <div className="p-4 space-y-4 max-w-5xl">
        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={FileCode} label="Symbols" value="4,843" />
          <StatCard icon={Network} label="Relationships" value="10,982" />
          <StatCard icon={Activity} label="Execution flows" value="300" />
          <StatCard icon={Boxes} label="Clusters" value="38" />
        </div>

        {/* Search */}
        <Card className="surface p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search symbols, files, or flows…"
              className="pl-9 h-9 bg-input border-border"
            />
          </div>
        </Card>

        {/* Symbol list */}
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            Top Symbols by Centrality
          </div>
          <div className="space-y-1">
            {filtered.map((s, i) => (
              <SymbolRow key={s.id} symbol={s} rank={i + 1} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Network; label: string; value: string }) {
  return (
    <Card className="surface p-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
        <Icon className="w-3 h-3" />{label}
      </div>
      <div className="text-xl font-semibold font-mono">{value}</div>
    </Card>
  );
}

function SymbolRow({ symbol, rank }: { symbol: SymbolNode; rank: number }) {
  return (
    <Card className="surface hoverable p-3 rounded-md">
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-6 h-6 rounded bg-secondary flex items-center justify-center text-[10px] font-mono text-muted-foreground">
          {rank}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[13px] text-foreground/90">{symbol.name}</span>
            <Badge variant="outline" className="h-4 px-1 text-[9px] border-border bg-secondary text-secondary-foreground">
              {symbol.type}
            </Badge>
          </div>
          <div className="text-[11px] text-muted-foreground/80 font-mono mt-0.5">
            {symbol.file}:{symbol.line}
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground font-mono">
            <span>{symbol.callers} callers</span>
            <span>{symbol.callees} callees</span>
            <span>{symbol.flows} flows</span>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1 text-muted-foreground">
          Impact <ArrowRight className="w-3 h-3" />
        </Button>
      </div>
    </Card>
  );
}
