"use client";

import { useState } from "react";
import { Search, FileCode, GitBranch, Boxes } from "lucide-react";
import { PageHeader, GlassCard, StatTile, EmptyState } from "@/components/axoniz/page-primitives";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

// Axodex is the AXONIZ code-graph indexer. The backend endpoints for this
// don't exist yet in the proxy — the old UI had hardcoded sample symbols.
// We mirror that approach until real endpoints land.

const SAMPLE_SYMBOLS = [
  { name: "Agent.run", file: "src/core/agent.ts", line: 1284, callers: 12, callees: 8, flows: 3, kind: "method" },
  { name: "GoalLoop.runGoal", file: "src/core/agent.ts", line: 1681, callers: 4, callees: 11, flows: 2, kind: "method" },
  { name: "LoopEngine", file: "src/core/loop-engine.ts", line: 24, callers: 2, callees: 7, flows: 4, kind: "class" },
  { name: "SwarmOrchestrator", file: "src/core/swarm.ts", line: 18, callers: 1, callees: 14, flows: 5, kind: "class" },
  { name: "FileTools.read", file: "src/tools/file_tools.ts", line: 57, callers: 8, callees: 2, flows: 1, kind: "method" },
  { name: "FileTools.write", file: "src/tools/file_tools.ts", line: 100, callers: 6, callees: 2, flows: 1, kind: "method" },
  { name: "ShellTools.run", file: "src/tools/shell_tools.ts", line: 38, callers: 5, callees: 3, flows: 1, kind: "method" },
  { name: "AuthorityEngine.check", file: "src/core/authority.ts", line: 360, callers: 9, callees: 4, flows: 2, kind: "method" },
];

export default function AxodexPage() {
  const [query, setQuery] = useState("");
  const filtered = query
    ? SAMPLE_SYMBOLS.filter((s) =>
        s.name.toLowerCase().includes(query.toLowerCase()) ||
        s.file.toLowerCase().includes(query.toLowerCase()),
      )
    : SAMPLE_SYMBOLS;

  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="max-w-5xl mx-auto p-3 sm:p-4 lg:p-6 pb-16">
        <PageHeader
          title="Axodex"
          description="Code-graph symbol browser. Searchable index of every class, method, and call relationship in your workspace."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <StatTile label="Symbols" value="4,843" />
          <StatTile label="Relationships" value="10,982" />
          <StatTile label="Flows" value="300" />
          <StatTile label="Clusters" value="38" />
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter symbols by name or file…"
            className="pl-9 h-9"
          />
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={FileCode} title="No symbols found" hint="Adjust your search filter." />
        ) : (
          <div className="space-y-2">
            {filtered.map((s) => (
              <GlassCard key={`${s.name}-${s.file}`} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <FileCode className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="text-[12px] font-mono font-medium">{s.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded glass-inset font-mono">{s.kind}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono mt-1">
                      {s.file}:{s.line}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-mono flex-shrink-0">
                    <span title="Callers">{s.callers} in</span>
                    <span title="Callees">{s.callees} out</span>
                    <span title="Flows" className="flex items-center gap-1">
                      <GitBranch className="w-2.5 h-2.5" />
                      {s.flows}
                    </span>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        )}

        <div className="text-[10px] text-muted-foreground font-mono mt-6 leading-relaxed">
          Note: The axodex backend endpoints are not yet wired into the proxy.
          The symbols above are a sample slice. Run `axoniz axodex_query` in the CLI
          for live graph queries against your workspace.
        </div>
      </div>
    </ScrollArea>
  );
}
