"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Anvil,
  Search,
  Download,
  Star,
  TrendingUp,
  Loader2,
  CheckCircle2,
  Filter,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { useModelSearchQuery, useDownloadsQuery, useStartDownloadMutation } from "../queries";
import type { HuggingFaceModel } from "@/lib/axoniz/api-types";

const QUICK_SEARCHES = [
  "Qwen2.5 Coder",
  "Llama 3.2 3B",
  "Phi-3.5 mini",
  "DeepSeek Coder V2",
  "Mistral 7B Instruct",
];

export function ForgeSection() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const { data, isLoading, isFetching } = useModelSearchQuery(submitted, !!submitted);
  const { data: downloads } = useDownloadsQuery();
  const startDownload = useStartDownloadMutation();
  const [activeRepo, setActiveRepo] = useState<string | null>(null);

  function submit(q: string) {
    setQuery(q);
    setSubmitted(q);
  }

  async function download(model: HuggingFaceModel) {
    setActiveRepo(model.id);
    // Pick a sensible default filename — in production, the backend would
    // enumerate the repo's files; the mock returns a placeholder.
    const filename = `${model.id.split("/")[1]?.toLowerCase() ?? "model"}-q4_k_m.gguf`;
    try {
      await startDownload.mutateAsync({
        repo_id: model.id,
        filename,
      });
      toast.success("Forge ignition", {
        description: `Queued ${filename} from ${model.id}.`,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setTimeout(() => setActiveRepo(null), 800);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-5 py-4 border-b border-white/5">
        <h2 className="text-sm font-semibold tracking-tight flex items-center gap-2">
          <Anvil className="w-4 h-4 text-primary" />
          The Forge
        </h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Search HuggingFace and forge new weights directly into the Vault.
        </p>
      </div>

      {/* Search */}
      <div className="p-5 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search HuggingFace — model name, author, or tag…"
            className="pl-9 h-11 bg-white/5 border-white/10"
            onKeyDown={(e) => {
              if (e.key === "Enter") submit(query);
            }}
          />
          <Button
            size="sm"
            onClick={() => submit(query)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8"
            disabled={isFetching || !query.trim()}
          >
            {isFetching ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              "Search"
            )}
          </Button>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
          <span className="text-muted-foreground/70 uppercase tracking-widest mr-1 inline-flex items-center gap-1">
            <Filter className="w-2.5 h-2.5" />
            Quick
          </span>
          {QUICK_SEARCHES.map((q) => (
            <button
              key={q}
              onClick={() => submit(q)}
              className="px-2 py-1 rounded-md surface hover:bg-white/5 text-foreground/70 hover:text-primary transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Active downloads */}
      {downloads && downloads.length > 0 && (
        <div className="px-5 pb-3">
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            Forge Activity
          </h3>
          <div className="space-y-1.5">
            {downloads.map((d) => (
              <Card
                key={`${d.repo_id}/${d.filename}`}
                className="surface p-3 flex items-center gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-xs truncate text-foreground/90">
                    {d.filename}
                  </div>
                  <div className="text-[10px] text-muted-foreground/70 truncate">
                    {d.repo_id}
                  </div>
                </div>
                {d.status === "completed" ? (
                  <Badge className="border-accent/30 bg-accent/10 text-accent gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Done
                  </Badge>
                ) : (
                  <div className="flex items-center gap-2 w-32">
                    <Progress value={d.progress * 100} className="h-1.5" />
                    <span className="text-[10px] font-mono text-muted-foreground w-8">
                      {Math.round(d.progress * 100)}%
                    </span>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      <div className="px-5 pb-5">
        {!submitted ? (
          <EmptyState />
        ) : isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="surface p-4 h-32">
                <Skeleton className="h-4 w-3/4 mb-2" />
                <Skeleton className="h-3 w-1/2 mb-4" />
                <Skeleton className="h-8 w-full" />
              </Card>
            ))}
          </div>
        ) : data && data.items.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {data.items.map((m, idx) => (
              <ModelResultCard
                key={m.id}
                model={m}
                onDownload={() => download(m)}
                busy={activeRepo === m.id}
                delay={idx * 25}
              />
            ))}
          </div>
        ) : (
          <div className="text-center text-sm text-muted-foreground py-12">
            No models matched "{submitted}".
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16 px-4">
      <div className="inline-flex w-14 h-14 rounded-2xl surface items-center justify-center mb-4">
        <Anvil className="w-6 h-6 text-primary" />
      </div>
      <h3 className="text-sm font-medium">Search to begin</h3>
      <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
        The Forge pulls GGUF-compatible weights from HuggingFace, validates their
        integrity, and stages them in the Vault.
      </p>
    </div>
  );
}

function ModelResultCard({
  model,
  onDownload,
  busy,
  delay,
}: {
  model: HuggingFaceModel;
  onDownload: () => void;
  busy: boolean;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay / 1000, duration: 0.25 }}
    >
      <Card className="surface hoverable p-4 h-full flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-mono text-foreground/90 truncate">
              {model.id}
            </div>
            <div className="text-[10px] text-muted-foreground/70 mt-0.5">
              by {model.author}
            </div>
          </div>
          {model.gated && (
            <Badge variant="outline" className="h-5 px-1.5 border-amber-500/30 bg-amber-500/10 text-primary text-[9px] uppercase">
              Gated
            </Badge>
          )}
        </div>

        {model.tags && model.tags.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {model.tags.slice(0, 4).map((t) => (
              <Badge
                key={t}
                variant="outline"
                className="h-4 px-1 border-white/10 bg-white/5 text-[9px] text-muted-foreground font-mono"
              >
                {t}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-auto">
          <span className="inline-flex items-center gap-1">
            <Download className="w-3 h-3" />
            {formatNumber(model.downloads)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Star className="w-3 h-3" />
            {model.likes}
          </span>
          {model.lastModified && (
            <span className="inline-flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              {new Date(model.lastModified).toLocaleDateString()}
            </span>
          )}
        </div>

        <Button
          size="sm"
          variant="secondary"
          onClick={onDownload}
          disabled={busy}
          className="h-7 text-[11px] gap-1.5 mt-1"
        >
          {busy ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Download className="w-3 h-3" />
          )}
          {busy ? "Queuing…" : "Forge"}
        </Button>
      </Card>
    </motion.div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}
