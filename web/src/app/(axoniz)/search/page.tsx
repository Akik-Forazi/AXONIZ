"use client";

import { useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import { PageHeader, GlassCard, EmptyState, LoadingRow } from "@/components/axoniz/page-primitives";
import { useAbsoluteQueryMutation } from "@/components/axoniz/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const SAMPLES = ["agent loop", "auth JWT validation", "tool registry", "memory palace"];

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const absoluteQuery = useAbsoluteQueryMutation();

  const submit = (q: string) => {
    if (!q.trim()) return;
    setQuery(q);
    absoluteQuery.mutate(q);
  };

  const data = absoluteQuery.data;
  const codeMatches = (data?.code_matches ?? []) as {
    type?: string; label?: string; score?: number; detail?: string;
    snippet?: string; location?: string;
  }[];
  const memoryMatches = (data?.memory_matches ?? []) as {
    type?: string; label?: string; score?: number; detail?: string;
    snippet?: string; location?: string;
  }[];

  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="max-w-3xl mx-auto p-3 sm:p-4 lg:p-6 pb-16">
        <PageHeader
          title="Absolute Search"
          description="Unified query across the Axodex code graph and Eternal Palace memory."
        />

        {/* Search */}
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit(query)}
              placeholder="Query code symbols + memory…"
              className="pl-9 h-10"
            />
          </div>
          <Button onClick={() => submit(query)} disabled={absoluteQuery.isPending || !query.trim()} className="press">
            <SearchIcon className="w-4 h-4" />
            Search
          </Button>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap mb-6">
          {SAMPLES.map((s) => (
            <button
              key={s}
              onClick={() => submit(s)}
              className="text-[11px] px-2.5 py-1 rounded-full glass-inset hover:bg-secondary/60 transition-colors font-mono press"
            >
              {s}
            </button>
          ))}
        </div>

        {!data && absoluteQuery.isPending && <LoadingRow count={3} />}
        {!data && !absoluteQuery.isPending && (
          <EmptyState icon={SearchIcon} title="Search across code + memory" hint="Type a query above to search symbols, files, and palace entries." />
        )}

        {data && (
          <>
            {data.summary && (
              <GlassCard className="mb-4">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono mb-1">Summary</div>
                <div className="text-[12px] leading-relaxed">{data.summary}</div>
              </GlassCard>
            )}

            {/* Code matches */}
            <h2 className="text-[13px] font-semibold uppercase tracking-widest text-muted-foreground font-mono mb-3">Code Graph</h2>
            {codeMatches.length === 0 ? (
              <div className="text-[11px] text-muted-foreground italic mb-4">No code matches.</div>
            ) : (
              <div className="space-y-2 mb-6">
                {codeMatches.map((hit, i) => (
                  <HitRow key={i} hit={hit} />
                ))}
              </div>
            )}

            {/* Memory matches */}
            <h2 className="text-[13px] font-semibold uppercase tracking-widest text-muted-foreground font-mono mb-3">Memory Palace</h2>
            {memoryMatches.length === 0 ? (
              <div className="text-[11px] text-muted-foreground italic">No memory matches.</div>
            ) : (
              <div className="space-y-2">
                {memoryMatches.map((hit, i) => (
                  <HitRow key={i} hit={hit} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </ScrollArea>
  );
}

function HitRow({ hit }: { hit: { type?: string; label?: string; score?: number; detail?: string; snippet?: string; location?: string } }) {
  return (
    <GlassCard className="p-3">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-mono font-medium truncate">{hit.label ?? "—"}</div>
          {hit.location && <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{hit.location}</div>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {hit.type && <span className="text-[10px] px-1.5 py-0.5 rounded glass-inset font-mono">{hit.type}</span>}
          {typeof hit.score === "number" && (
            <span className="text-[10px] font-mono text-accent">{(hit.score * 100).toFixed(0)}%</span>
          )}
        </div>
      </div>
      {hit.detail && <div className="text-[11px] text-foreground/80 mb-1">{hit.detail}</div>}
      {hit.snippet && (
        <pre className="text-[10px] font-mono glass-inset p-2 rounded mt-1.5 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
          {hit.snippet}
        </pre>
      )}
    </GlassCard>
  );
}
