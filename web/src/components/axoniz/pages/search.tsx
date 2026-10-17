"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Search,
  Loader2,
  FileCode,
  Brain,
  FileText,
  Database,
  Zap,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAbsoluteQueryMutation } from "../queries";
import type { AbsoluteQueryHit } from "@/lib/axoniz/api-types";

const SAMPLE_QUERIES = [
  "agent loop",
  "auth JWT validation",
  "swarm orchestrator",
  "tool execution gate",
  "memory palace",
  "trajectory store",
];

export function AbsoluteSearchPage() {
  const [query, setQuery] = useState("");
  const search = useAbsoluteQueryMutation();
  const result = search.data?.result;

  async function submit(q?: string) {
    const term = (q ?? query).trim();
    if (!term) {
      toast.error("Enter a search term");
      return;
    }
    setQuery(term);
    try {
      await search.mutateAsync(term);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Query failed");
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-5 py-4 border-b border-white/5">
        <h2 className="text-sm font-semibold tracking-tight flex items-center gap-2">
          <Search className="w-4 h-4 text-primary" />
          Absolute Search
        </h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          One strike across the Axodex code graph and the Eternal Palace.
        </p>
      </div>

      {/* Search bar */}
      <div className="p-5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Symbol, file, memory key, or natural language…"
            className="pl-9 h-11 bg-white/5 border-white/10"
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
          <Button
            size="sm"
            onClick={() => submit()}
            disabled={search.isPending}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 gap-1.5"
          >
            {search.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5" />
            )}
            Strike
          </Button>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap mt-3 text-[10px]">
          <span className="text-muted-foreground/70 uppercase tracking-widest mr-1">
            Try
          </span>
          {SAMPLE_QUERIES.map((q) => (
            <button
              key={q}
              onClick={() => submit(q)}
              className="px-2 py-1 rounded-md surface hover:bg-white/5 text-foreground/70 hover:text-primary transition-colors"
              disabled={search.isPending}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {result?.summary && (
        <div className="px-5 pb-5">
          <Card className="surface p-3 mb-3">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
              Summary
            </div>
            <div className="text-sm text-foreground/90">{result.summary}</div>
          </Card>

          {result.code_matches && result.code_matches.length > 0 && (
            <div className="mb-3">
              <h3 className="text-[10px] uppercase tracking-widest text-primary/80 mb-2">
                Code Graph Hits
              </h3>
              <div className="space-y-2">
                {result.code_matches.map((hit, i) => (
                  <HitCard key={i} hit={hit} delay={i * 25} />
                ))}
              </div>
            </div>
          )}

          {result.memory_matches && result.memory_matches.length > 0 && (
            <div>
              <h3 className="text-[10px] uppercase tracking-widest text-accent mb-2">
                Memory Hits
              </h3>
              <div className="space-y-2">
                {result.memory_matches.map((hit, i) => (
                  <HitCard key={i} hit={hit} delay={i * 25 + 50} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!result && !search.isPending && (
        <div className="text-center py-16 px-4">
          <div className="inline-flex w-14 h-14 rounded-2xl surface items-center justify-center mb-4">
            <Zap className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-sm font-medium">Ready to strike</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            Absolute Search crosses the static code graph and the Eternal Palace
            in a single call — symbols, facts, decisions, files.
          </p>
        </div>
      )}
    </div>
  );
}

function HitCard({ hit, delay }: { hit: AbsoluteQueryHit; delay: number }) {
  const Icon =
    hit.type === "symbol"
      ? FileCode
      : hit.type === "memory"
        ? Brain
        : hit.type === "fact"
          ? Database
          : FileText;
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay / 1000, duration: 0.25 }}
    >
      <Card className="surface hoverable p-3">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="font-mono text-sm text-foreground/90 truncate">
                {hit.label}
              </span>
              <Badge
                variant="outline"
                className="h-4 px-1 border-accent/30 bg-accent/10 text-accent text-[9px] font-mono shrink-0"
              >
                {Math.round(hit.score * 100)}
              </Badge>
            </div>
            {hit.detail && (
              <div className="text-xs text-muted-foreground leading-snug mb-1">
                {hit.detail}
              </div>
            )}
            {hit.snippet && (
              <pre className="font-mono text-[11px] text-foreground/70 bg-black/30 rounded p-2 overflow-x-auto mt-1.5">
                {hit.snippet}
              </pre>
            )}
            {hit.location && (
              <div className="text-[10px] text-muted-foreground/60 font-mono mt-1.5 truncate">
                {hit.location}
              </div>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
