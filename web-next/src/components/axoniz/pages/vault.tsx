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
  Play,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { authedFetch } from "@/lib/axoniz/client";
import { useModelsQuery, useConfigQuery, useSwitchModelMutation } from "../queries";
import { useAxonizStore } from "@/stores/axoniz-store";

/**
 * A single model entry returned by GET /api/axoniz/models (the catch-all
 * route's /models case). See scanModels() in [...path]/route.ts.
 * Fields: id (filename), name (clean display name), path (full filesystem
 * path), sizeBytes, size (string like "1.2 GB"), quant (e.g. "Q4_K_M" or null).
 */
type VaultModel = import("@/lib/axoniz/api-types").VaultModelEntry;

export function VaultPage() {
  const { data, isLoading, refetch, isFetching } = useModelsQuery();
  const { data: config } = useConfigQuery();
  const switchModel = useSwitchModelMutation();
  const activeModel = useAxonizStore((s) => s.activeModel);
  const setActiveModel = useAxonizStore((s) => s.setActiveModel);
  const setLlamacpp = useAxonizStore((s) => s.setLlamacpp);
  const llamacpp = useAxonizStore((s) => s.llamacpp);

  // The /models endpoint returns { items: [{ models: [...] }] } — each model
  // is an OBJECT (VaultModelEntry), not a string. The previous code assumed
  // a string and crashed on `name.match is not a function`.
  const models: VaultModel[] = data?.items?.[0]?.models ?? [];
  const active = activeModel ?? (config?.llm?.model as string | undefined) ?? null;

  async function handleSwitch(m: VaultModel) {
    if (m.id === active) return;
    try {
      // For llamacpp: persist modelPath + baseUrl, launch llama-server, then chat works.
      const res = await switchModel.mutateAsync(m.path ?? m.id);
      setLlamacpp({ modelPath: m.path ?? m.id, baseUrl: llamacpp.baseUrl || "http://localhost:8080" });
      setActiveModel(m.id);
      toast.success(`Active model: ${m.name}`, {
        description: res.status === "ok" ? "Persisted + will launch on next chat." : res.error,
      });
      // Try to launch llama-server with the new model.
      try {
        const launchRes = await authedFetch("/api/axoniz/models/launch", {
          method: "POST",
          body: JSON.stringify({
            modelPath: m.path,
            baseUrl: llamacpp.baseUrl || "http://localhost:8080",
            nCtx: llamacpp.nCtx,
            nGpuLayers: llamacpp.nGpuLayers,
            nThreads: llamacpp.nThreads,
          }),
        });
        const launchData = await launchRes.json();
        if (launchRes.ok && launchData.ok) {
          toast.success(`llama-server ready at ${launchData.baseUrl}`, {
            description: `PID ${launchData.pid ?? "?"} · ${m.name}`,
          });
        } else if (!launchRes.ok) {
          toast.error("llama-server launch failed", {
            description: launchData.error ?? "Unknown error",
          });
        }
      } catch (e) {
        // The model switch still succeeded; just warn that launch failed.
        toast.warning("Model switched but llama-server launch failed", {
          description: e instanceof Error ? e.message : String(e),
        });
      }
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
            Local GGUF armory — {models.length} model{models.length === 1 ? "" : "s"} indexed in {config?._models_dir ?? "~/.axoniz/models"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="h-8 gap-1.5"
          data-axoniz-action="vault-rescan"
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
          : models.length === 0
            ? (
              <div className="col-span-full p-8 rounded-md border border-border bg-secondary/30 text-[12px] text-muted-foreground">
                No .gguf models found in <code className="font-mono text-foreground/80">~/.axoniz/models/</code>.
                <br /><br />
                Place .gguf files (optionally in subdirectories) under that path, then click <strong>Rescan</strong>.
              </div>
            )
            : models.map((m, idx) => (
              <ModelCard
                key={m.path ?? m.id}
                model={m}
                active={m.id === active}
                onActivate={() => handleSwitch(m)}
                busy={switchModel.isPending}
                delay={idx * 30}
              />
            ))}
      </div>
    </div>
  );
}

function ModelCard({
  model,
  active,
  onActivate,
  busy,
  delay,
}: {
  model: VaultModel;
  active: boolean;
  onActivate: () => void;
  busy: boolean;
  delay: number;
}) {
  const [expanded, setExpanded] = useState(false);
  // Use the formatted display name (already a clean string) for parsing.
  const name = model.name ?? model.id ?? "";
  const quant = model.quant ?? extractQuant(name);
  const params = extractParams(name);
  const sizeGb = model.size ?? (params ? (params * (typeof quant === "string" ? 4 : (quant?.bits ?? 4)) * 0.13).toFixed(1) : null);
  const parentDir = model.path ? model.path.split(/[\\/]/).slice(-2, -1)[0] ?? "" : "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay / 1000, duration: 0.3 }}
    >
      <Card
        className={`surface hoverable p-4 h-full flex flex-col gap-2 cursor-pointer ${
          active ? "border-primary/40" : ""
        }`}
        onClick={() => setExpanded((e) => !e)}
        data-axoniz-action={`vault-model:${name.slice(0, 20)}`}
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
              {name}
            </div>
            <div className="text-[10px] text-muted-foreground/70 font-mono truncate">
              {parentDir ? `${parentDir}/` : ""}{model.id}
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
              {typeof quant === "string" ? quant : quant.label}
            </Badge>
          )}
          {sizeGb && (
            <Badge variant="outline" className="h-5 px-1.5 border-white/10 bg-white/5 font-mono gap-1">
              <HardDrive className="w-2.5 h-2.5" />
              {sizeGb}{typeof sizeGb === "string" && sizeGb.includes("GB") ? "" : " GB"}
            </Badge>
          )}
        </div>

        {expanded && model.path && (
          <div className="text-[10px] text-muted-foreground/60 font-mono break-all">
            {model.path}
          </div>
        )}

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
              data-axoniz-action="vault-load"
            >
              <Play className="w-3 h-3" />
              {busy ? "Loading…" : "Load & launch"}
            </Button>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

function extractQuant(name: string): { bits: number; label: string } | null {
  if (typeof name !== "string") return null;
  const m = name.match(/Q(\d)_(\w+)/);
  if (!m) return null;
  return { bits: Number(m[1]), label: `Q${m[1]}_${m[2]}` };
}
function extractParams(name: string): number | null {
  if (typeof name !== "string") return null;
  const m = name.match(/(\d+(?:\.\d+)?)B/i) ?? name.match(/-(\d+(?:\.\d+)?)-/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 100 ? n : null;
}

