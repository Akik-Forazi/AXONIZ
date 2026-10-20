"use client";

import { useState } from "react";
import { Anvil, Search, Download, Star, Clock } from "lucide-react";
import { PageHeader, GlassCard, EmptyState, LoadingRow, StatusPill } from "@/components/axoniz/page-primitives";
import { useModelSearchQuery, useDownloadsQuery, useStartDownloadMutation } from "@/components/axoniz/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const QUICK_SEARCHES = ["qwen-coder 7B", "llama 3.2 3B", "phi 3.5 mini", "gemma 2 9B", "mistral 7B"];

export default function ForgePage() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const { data: results, isLoading } = useModelSearchQuery(submitted, !!submitted);
  const { data: downloads } = useDownloadsQuery();
  const startDownload = useStartDownloadMutation();

  const submit = (q: string) => {
    if (!q.trim()) return;
    setQuery(q);
    setSubmitted(q.trim());
  };

  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="max-w-5xl mx-auto p-3 sm:p-4 lg:p-6 pb-16">
        <PageHeader
          title="Forge"
          description="Search HuggingFace for GGUF models and queue them for download into your local vault."
        />

        {/* Search */}
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit(query)}
              placeholder="Search HuggingFace for a model…"
              className="pl-9 h-10"
            />
          </div>
          <Button onClick={() => submit(query)} disabled={isLoading || !query.trim()} className="press">
            <Search className="w-4 h-4" />
            Search
          </Button>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap mb-6">
          {QUICK_SEARCHES.map((q) => (
            <button
              key={q}
              onClick={() => submit(q)}
              className="text-[11px] px-2.5 py-1 rounded-full glass-inset hover:bg-secondary/60 transition-colors font-mono press"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Active downloads */}
        {downloads?.downloads && downloads.downloads.length > 0 && (
          <div className="mb-6">
            <h2 className="text-[13px] font-semibold uppercase tracking-widest text-muted-foreground font-mono mb-3">Active Downloads</h2>
            <div className="space-y-2">
              {downloads.downloads.map((d: { repo_id: string; filename: string; progress: number; status: string }) => (
                <GlassCard key={`${d.repo_id}-${d.filename}`} className="p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[12px] font-mono truncate">{d.repo_id}/{d.filename}</span>
                    <StatusPill status={d.status === "completed" ? "ok" : "running"} label={d.status} />
                  </div>
                  <div className="h-1 rounded-full glass-inset overflow-hidden">
                    <div className="h-full bg-accent transition-all" style={{ width: `${d.progress}%` }} />
                  </div>
                </GlassCard>
              ))}
            </div>
          </div>
        )}

        {/* Search results */}
        {!submitted ? (
          <EmptyState icon={Anvil} title="Search for a model" hint="Type a model name above or pick a quick search to see HuggingFace results." />
        ) : isLoading ? (
          <LoadingRow count={4} />
        ) : !results?.results || results.results.length === 0 ? (
          <EmptyState icon={Anvil} title="No results" hint={`No HuggingFace models matched "${submitted}".`} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {results.results.map((m: {
              id: string; author?: string; downloads?: number; likes?: number;
              lastModified?: string; tags?: string[]; gated?: boolean;
            }) => (
              <GlassCard key={m.id}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium font-mono truncate">{m.id}</div>
                    {m.author && <div className="text-[10px] text-muted-foreground font-mono mt-0.5">by {m.author}</div>}
                  </div>
                  {m.gated && <StatusPill status="warn" label="gated" />}
                </div>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-mono mb-3 flex-wrap">
                  {typeof m.downloads === "number" && (
                    <span className="flex items-center gap-1"><Download className="w-3 h-3" />{(m.downloads / 1000).toFixed(1)}k</span>
                  )}
                  {typeof m.likes === "number" && (
                    <span className="flex items-center gap-1"><Star className="w-3 h-3" />{m.likes}</span>
                  )}
                  {m.lastModified && (
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(m.lastModified).toLocaleDateString()}</span>
                  )}
                </div>
                {m.tags && m.tags.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap mb-3">
                    {m.tags.slice(0, 5).map((t) => (
                      <span key={t} className="text-[10px] px-1.5 py-0.5 rounded glass-inset font-mono">{t}</span>
                    ))}
                  </div>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full press"
                  disabled={startDownload.isPending}
                  onClick={() => {
                    const filename = `${m.id.split("/").pop()}-q4_k_m.gguf`;
                    startDownload.mutate({ repo_id: m.id, filename }, {
                      onSuccess: () => toast.success(`Queued download of ${filename}`),
                      onError: (e) => toast.error(`Download failed: ${e.message}`),
                    });
                  }}
                >
                  <Download className="w-3.5 h-3.5" />
                  Forge Q4_K_M
                </Button>
              </GlassCard>
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
