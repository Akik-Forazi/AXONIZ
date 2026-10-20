"use client";

import { useState } from "react";
import { BrainCircuit, ChevronRight, ChevronDown, Search } from "lucide-react";
import { PageHeader, GlassCard, EmptyState, LoadingRow, StatTile } from "@/components/axoniz/page-primitives";
import { useMemoryQuery } from "@/components/axoniz/queries";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export default function PalacePage() {
  const { data: memory, isLoading } = useMemoryQuery();
  const [query, setQuery] = useState("");
  const [expandedWings, setExpandedWings] = useState<Set<string>>(new Set());
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set());

  const palace = memory?.palace ?? { wings: [] };
  const kg = memory?.knowledge_graph ?? { facts: [] };
  const wings = palace.wings ?? [];

  const filteredWings = query
    ? wings.filter((w: { name: string; rooms?: { name: string; drawers?: { name: string }[] }[] }) => {
        const q = query.toLowerCase();
        if (w.name.toLowerCase().includes(q)) return true;
        return (w.rooms ?? []).some((r: { name: string; drawers?: { name: string }[] }) =>
          r.name.toLowerCase().includes(q) ||
          (r.drawers ?? []).some((d: { name: string }) => d.name.toLowerCase().includes(q)),
        );
      })
    : wings;

  const toggle = (set: Set<string>, value: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value); else next.add(value);
    setter(next);
  };

  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="max-w-5xl mx-auto p-3 sm:p-4 lg:p-6 pb-16">
        <PageHeader
          title="Eternal Palace"
          description="Hierarchical long-term memory. Wings contain rooms contain drawers. The knowledge graph captures temporal facts."
        />

        {/* Stats */}
        {isLoading ? <LoadingRow count={3} /> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
            <StatTile label="Wings" value={wings.length} />
            <StatTile label="Drawers" value={palace.drawer_count ?? wings.reduce((a: number, w: { rooms?: { drawers?: unknown[] }[] }) => a + ((w.rooms ?? []).reduce((b: number, r: { drawers?: unknown[] }) => b + (r.drawers?.length ?? 0), 0)), 0)} />
            <StatTile label="KG facts" value={kg.facts?.length ?? 0} />
          </div>
        )}

        {/* Filter */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter wings, rooms, drawers…"
            className="pl-9 h-9"
          />
        </div>

        {/* Wings → Rooms → Drawers */}
        <h2 className="text-[13px] font-semibold uppercase tracking-widest text-muted-foreground font-mono mb-3">Palace Hierarchy</h2>
        {isLoading ? <LoadingRow count={2} /> : filteredWings.length === 0 ? (
          <EmptyState icon={BrainCircuit} title="Empty palace" hint="No memory wings recorded yet." />
        ) : (
          <div className="space-y-1.5 mb-6">
            {filteredWings.map((wing: { name: string; rooms?: { name: string; drawers?: { name: string; count?: number }[] }[] }) => {
              const wingKey = wing.name;
              const wingOpen = expandedWings.has(wingKey);
              return (
                <GlassCard key={wingKey} className="p-0 overflow-hidden">
                  <button
                    onClick={() => toggle(expandedWings, wingKey, setExpandedWings)}
                    className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-secondary/40 transition-colors text-left"
                  >
                    {wingOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    <span className="text-[13px] font-medium">{wing.name}</span>
                    <span className="text-[10px] text-muted-foreground font-mono ml-auto">{(wing.rooms ?? []).length} rooms</span>
                  </button>
                  {wingOpen && (wing.rooms ?? []).map((room: { name: string; drawers?: { name: string; count?: number }[] }) => {
                    const roomKey = `${wingKey}/${room.name}`;
                    const roomOpen = expandedRooms.has(roomKey);
                    return (
                      <div key={roomKey} className="pl-6">
                        <button
                          onClick={() => toggle(expandedRooms, roomKey, setExpandedRooms)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-secondary/40 transition-colors text-left"
                        >
                          {roomOpen ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                          <span className="text-[12px] font-mono">{room.name}</span>
                          <span className="text-[10px] text-muted-foreground font-mono ml-auto">{(room.drawers ?? []).length} drawers</span>
                        </button>
                        {roomOpen && (room.drawers ?? []).map((drawer: { name: string; count?: number }) => (
                          <div key={drawer.name} className="pl-12 py-1 text-[11px] font-mono text-muted-foreground">
                            {drawer.name} {typeof drawer.count === "number" && <span className="text-foreground/40">· {drawer.count}</span>}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </GlassCard>
              );
            })}
          </div>
        )}

        {/* Knowledge graph */}
        <h2 className="text-[13px] font-semibold uppercase tracking-widest text-muted-foreground font-mono mb-3">Knowledge Graph</h2>
        <GlassCard>
          {(kg.facts ?? []).length === 0 ? (
            <div className="text-[11px] text-muted-foreground italic py-2">No facts recorded.</div>
          ) : (
            <div className="space-y-1">
              {(kg.facts ?? []).map((f: { subject?: string; predicate?: string; object?: string; valid_from?: string }, i: number) => (
                <div key={i} className="text-[11px] font-mono py-1 border-b border-border last:border-0">
                  <span className="text-foreground">{f.subject}</span>
                  <span className="text-muted-foreground"> {f.predicate} </span>
                  <span className="text-foreground">{f.object}</span>
                  {f.valid_from && <span className="text-muted-foreground ml-2 text-[10px]">· {f.valid_from}</span>}
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </div>
    </ScrollArea>
  );
}
