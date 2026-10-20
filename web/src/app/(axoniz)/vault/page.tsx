"use client";

import { Boxes, RefreshCw, FileText, Check } from "lucide-react";
import { PageHeader, GlassCard, EmptyState, LoadingRow, StatusPill } from "@/components/axoniz/page-primitives";
import { useModelsQuery, useConfigQuery, useSwitchModelMutation } from "@/components/axoniz/queries";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function VaultPage() {
  const { data: models, isLoading, refetch } = useModelsQuery();
  const { data: config } = useConfigQuery();
  const switchModel = useSwitchModelMutation();

  const activePath = config?._models_dir ? `${config._models_dir}/${(config.llm?.model_name ?? "")}` : config?.llm?.model_path ?? "";

  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="max-w-5xl mx-auto p-3 sm:p-4 lg:p-6 pb-16">
        <PageHeader
          title="Vault"
          description="Local GGUF model armory. Rescan to discover new files in your models directory."
          actions={
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading} className="press">
              <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
              Rescan
            </Button>
          }
        />

        {config?._models_dir && (
          <div className="mb-4 text-[11px] text-muted-foreground font-mono">
            models dir · <code className="text-foreground/80">{config._models_dir}</code>
          </div>
        )}

        {isLoading ? (
          <LoadingRow count={3} />
        ) : !models?.models || models.models.length === 0 ? (
          <EmptyState icon={Boxes} title="No local models found" hint="Download models via the Forge, or place .gguf files in your models directory." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {models.models.map((m: { path: string; size: number; mtime?: number }) => {
              const name = m.path.split("/").pop() ?? m.path;
              const isActive = activePath && (m.path === activePath || m.path.endsWith(activePath));
              const paramMatch = name.match(/-(\d+[bB])-/);
              const quantMatch = name.match(/(Q[0-9]_[A-Z_0-9]+)/i);
              const sizeGb = (m.size / 1024 / 1024 / 1024).toFixed(2);
              return (
                <GlassCard key={m.path} className={cn(isActive && "ring-1 ring-accent/40")}>
                  <div className="flex items-start gap-3 mb-2">
                    <div className="w-8 h-8 rounded-lg glass-inset flex items-center justify-center flex-shrink-0">
                      <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-mono font-medium truncate" title={name}>{name}</div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {paramMatch && <StatusPill status="idle" label={paramMatch[1].toUpperCase()} />}
                        {quantMatch && <StatusPill status="idle" label={quantMatch[1].toUpperCase()} />}
                        <StatusPill status="idle" label={`${sizeGb} GB`} />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="text-[10px] text-muted-foreground font-mono truncate">
                      {m.path}
                    </div>
                    {isActive ? (
                      <span className="text-[10px] font-mono uppercase tracking-wider text-accent flex items-center gap-1 flex-shrink-0">
                        <Check className="w-3 h-3" /> Active
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 press"
                        disabled={switchModel.isPending}
                        onClick={() => {
                          switchModel.mutate({ path: m.path }, {
                            onSuccess: () => toast.success("Model switched"),
                            onError: (e) => toast.error(`Switch failed: ${e.message}`),
                          });
                        }}
                      >
                        Load
                      </Button>
                    )}
                  </div>
                </GlassCard>
              );
            })}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
