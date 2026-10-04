"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  BrainCircuit,
  Search,
  Database,
  Network as NetworkIcon,
  Layers,
  Clock,
  ChevronRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemoryQuery } from "../queries";

export function PalaceSection() {
  const { data, isLoading } = useMemoryQuery();
  const [query, setQuery] = useState("");
  const [selectedWing, setSelectedWing] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);

  const palace = data?.palace as
    | {
        wings?: Array<{
          name: string;
          rooms?: Array<{
            name: string;
            drawers?: Array<{ name: string; count?: number }>;
          }>;
        }>;
        is_available?: boolean;
      }
    | undefined;
  const wings = palace?.wings ?? [];

  const filteredWings = useMemo(() => {
    if (!query) return wings;
    const q = query.toLowerCase();
    return wings
      .map((w) => ({
        ...w,
        rooms: w.rooms?.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            r.drawers?.some((d) => d.name.toLowerCase().includes(q)),
        ),
      }))
      .filter((w) => w.rooms && w.rooms.length > 0);
  }, [wings, query]);

  const kg = data?.knowledge_graph as
    | {
        facts?: number;
        subjects?: number;
        recent?: Array<{
          subject: string;
          predicate: string;
          object: string;
          valid_from?: number;
        }>;
      }
    | undefined;

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-5 py-4 border-b border-white/5">
        <h2 className="text-sm font-semibold tracking-tight flex items-center gap-2">
          <BrainCircuit className="w-4 h-4 text-primary" />
          Eternal Palace
        </h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Hierarchical semantic memory + temporal knowledge graph.
        </p>
      </div>

      {/* Stats */}
      <div className="p-5 grid grid-cols-3 gap-3">
        <StatCard
          label="Wings"
          value={wings.length}
          icon={Layers}
          loading={isLoading}
        />
        <StatCard
          label="Drawers"
          value={palace?.wings?.reduce(
            (sum, w) =>
              sum +
              (w.rooms?.reduce((s, r) => s + (r.drawers?.length ?? 0), 0) ?? 0),
            0,
          ) ?? 0}
          icon={Database}
          loading={isLoading}
        />
        <StatCard
          label="KG Facts"
          value={kg?.facts ?? 0}
          icon={NetworkIcon}
          loading={isLoading}
        />
      </div>

      {/* Search */}
      <div className="px-5 pb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter wings, rooms, drawers…"
            className="pl-9 h-10 bg-white/5 border-white/10"
          />
        </div>
      </div>

      {/* Wings & Rooms */}
      <div className="px-5 pb-5">
        <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
          Palace Layout — Wings · Rooms · Drawers
        </h3>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="surface p-3 h-16">
                <Skeleton className="h-4 w-1/3 mb-2" />
                <Skeleton className="h-3 w-1/2" />
              </Card>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredWings.map((w) => (
              <motion.div
                key={w.name}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="surface overflow-hidden">
                  <button
                    onClick={() =>
                      setSelectedWing(selectedWing === w.name ? null : w.name)
                    }
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left"
                  >
                    <Layers className="w-4 h-4 text-primary" />
                    <span className="font-medium text-sm">{w.name}</span>
                    <Badge
                      variant="outline"
                      className="ml-2 h-4 px-1 border-white/10 bg-white/5 text-[9px] text-muted-foreground font-mono"
                    >
                      {w.rooms?.length ?? 0} rooms
                    </Badge>
                    <ChevronRight
                      className={`w-4 h-4 ml-auto text-muted-foreground transition-transform ${
                        selectedWing === w.name ? "rotate-90" : ""
                      }`}
                    />
                  </button>
                  {selectedWing === w.name && w.rooms && (
                    <div className="border-t border-white/5 divide-y divide-white/5">
                      {w.rooms.map((r) => (
                        <div key={r.name} className="px-4 py-2.5">
                          <button
                            onClick={() =>
                              setSelectedRoom(
                                selectedRoom === r.name ? null : r.name,
                              )
                            }
                            className="w-full flex items-center gap-2 text-left"
                          >
                            <Database className="w-3 h-3 text-accent" />
                            <span className="text-xs font-medium">{r.name}</span>
                            <ChevronRight
                              className={`w-3 h-3 ml-auto text-muted-foreground transition-transform ${
                                selectedRoom === r.name ? "rotate-90" : ""
                              }`}
                            />
                          </button>
                          {selectedRoom === r.name && r.drawers && (
                            <div className="mt-2 ml-5 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                              {r.drawers.map((d) => (
                                <div
                                  key={d.name}
                                  className="flex items-center justify-between rounded-md px-2 py-1.5 surface hover:bg-white/5 transition-colors"
                                >
                                  <span className="font-mono text-[11px] truncate text-foreground/80">
                                    {d.name}
                                  </span>
                                  {d.count !== undefined && (
                                    <span className="text-[10px] font-mono text-muted-foreground/70">
                                      {d.count}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Recent KG facts */}
      {kg?.recent && kg.recent.length > 0 && (
        <div className="px-5 pb-5">
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            Knowledge Graph — Recent Facts
          </h3>
          <Card className="surface p-3 space-y-2">
            {kg.recent.map((f, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-xs font-mono"
              >
                <span className="text-primary/90">{f.subject}</span>
                <span className="text-muted-foreground/60">
                  →{f.predicate}→
                </span>
                <span className="text-foreground/80">{f.object}</span>
                {f.valid_from && (
                  <span className="ml-auto text-[10px] text-muted-foreground/60 inline-flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" />
                    {new Date(f.valid_from * 1000).toLocaleDateString()}
                  </span>
                )}
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  loading,
}: {
  label: string;
  value: number;
  icon: typeof Layers;
  loading: boolean;
}) {
  return (
    <Card className="surface p-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
        <Icon className="w-3 h-3" />
        {label}
      </div>
      {loading ? (
        <Skeleton className="h-6 w-16" />
      ) : (
        <div className="text-xl font-semibold font-mono">{value.toLocaleString()}</div>
      )}
    </Card>
  );
}
