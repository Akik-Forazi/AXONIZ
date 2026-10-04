"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Boxes,
  Cpu,
  HardDrive,
  RefreshCw,
  Zap,
  Check,
  Activity,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useModelsQuery, useConfigQuery, useSwitchModelMutation } from "../queries";
import { useAxonizStore } from "@/stores/axoniz-store";

export function VaultSection() {
  const { data, isLoading, refetch, isFetching } = useModelsQuery();
  const { data: config } = useConfigQuery();
  const switchModel = useSwitchModelMutation();
  const activeModel = useAxonizStore((s) => s.activeModel);
  const setActiveModel = useAxonizStore((s) => s.setActiveModel);

  const models = data?.items?.[0]?.models ?? [];
  const active = activeModel ?? (config?.llm?.model as string | undefined) ?? null;

  async function handleSwitch(name: string) {
    if (name === active) return;
    try {
      const res = await switchModel.mutateAsync(name);
      setActiveModel(name);
      toast.success(`Active model: ${name}`, {
        description: res.status === "ok" ? "Model hot-swapped — KV cache reset." : res.error,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Switch failed");
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold tracking-tight flex items-center gap-2">
            <Boxes className="w-4 h-4 text-primary" />
            The Vault
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Local GGUF armory — {models.length} models indexed in {config?._models_dir ?? "~/.axoniz/models"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="h-8 gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Rescan
        </Button>
      </div>

      <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="surface p-4 h-32">
                <Skeleton className="h-4 w-3/4 mb-2" />
                <Skeleton className="h-3 w-1/2 mb-4" />
                <Skeleton className="h-8 w-full" />
              </Card>
            ))
          : models.map((name, idx) => (
              <ModelCard
                key={name}
                name={name}
                active={name === active}
                onActivate={() => handleSwitch(name)}
                busy={switchModel.isPending}
                delay={idx * 30}
              />
            ))}
      </div>
    </div>
  );
}

function ModelCard({
  name,
  active,
  onActivate,
  busy,
  delay,
}: {
  name: string;
  active: boolean;
  onActivate: () => void;
  busy: boolean;
  delay: number;
}) {
  const [expanded, setExpanded] = useState(false);
  // Naive size estimate from filename (e.g. Q4_K_M ≈ 4-bit, ~50% of params)
  const quant = extractQuant(name);
  const params = extractParams(name);
  const sizeGb = params ? (params * (quant?.bits ?? 4) * 0.13).toFixed(1) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay / 1000, duration: 0.3 }}
    >
      <Card
        className={`surface hoverable p-4 h-full flex flex-col gap-2 cursor-pointer ${
          active ? " border-primary/40" : ""
        }`}
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-start gap-2">
          <div
            className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${
              active ? "bg-primary/20" : "bg-white/5"
            }`}
          >
            <Cpu className={`w-4 h-4 ${active ? "text-primary" : "text-muted-foreground"}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-mono text-xs font-medium truncate text-foreground/90">
              {name.replace(/\.gguf$/, "")}
            </div>
            <div className="text-[10px] text-muted-foreground/70 font-mono truncate">
              .gguf
            </div>
          </div>
          {active && (
            <Badge className="h-5 px-1.5 border-primary/30 bg-primary/10 text-primary text-[9px] uppercase gap-1">
              <span className="w-1 h-1 rounded-full bg-primary animate-blink" />
              Active
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground">
          {params && (
            <Badge variant="outline" className="h-5 px-1.5 border-white/10 bg-white/5 font-mono">
              {params}B
            </Badge>
          )}
          {quant && (
            <Badge variant="outline" className="h-5 px-1.5 border-white/10 bg-white/5 font-mono">
              {quant.label}
            </Badge>
          )}
          {sizeGb && (
            <Badge variant="outline" className="h-5 px-1.5 border-white/10 bg-white/5 font-mono gap-1">
              <HardDrive className="w-2.5 h-2.5" />
              {sizeGb} GB
            </Badge>
          )}
        </div>

        <div className="mt-auto pt-2">
          {active ? (
            <Button
              size="sm"
              variant="ghost"
              disabled
              className="w-full h-7 text-[11px] gap-1"
            >
              <Check className="w-3 h-3" />
              Loaded
            </Button>
          ) : (
            <Button
              size="sm"
              variant={expanded ? "default" : "secondary"}
              onClick={(e) => {
                e.stopPropagation();
                onActivate();
              }}
              disabled={busy}
              className="w-full h-7 text-[11px] gap-1"
            >
              <Zap className="w-3 h-3" />
              Load
            </Button>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

function extractQuant(name: string): { bits: number; label: string } | null {
  const m = name.match(/Q(\d)_(\w+)/);
  if (!m) return null;
  return { bits: Number(m[1]), label: `Q${m[1]}_${m[2]}` };
}
function extractParams(name: string): number | null {
  const m = name.match(/(\d+(?:\.\d+)?)B/i) ?? name.match(/-(\d+(?:\.\d+)?)-/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 100 ? n : null;
}
