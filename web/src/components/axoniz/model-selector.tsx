"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X, Check, Cloud, HardDrive, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useAxonizStore, PROVIDER_CATALOG, type ProviderId,
} from "@/stores/axoniz-store";
import { cn } from "@/lib/utils";

export function ModelSelector() {
  const closeModelPicker = useAxonizStore((s) => s.closeModelPicker);
  const pickModel = useAxonizStore((s) => s.pickModel);
  const activeProvider = useAxonizStore((s) => s.activeProvider);
  const activeModel = useAxonizStore((s) => s.activeModel);
  const providers = useAxonizStore((s) => s.providers);
  const setProvider = useAxonizStore((s) => s.setProvider);

  const [query, setQuery] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>(activeProvider);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeModelPicker(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeModelPicker]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return PROVIDER_CATALOG;
    return PROVIDER_CATALOG.filter((p) =>
      p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) ||
      p.popularModels.some((m) => m.toLowerCase().includes(q)),
    );
  }, [query]);

  const selectedMeta = PROVIDER_CATALOG.find((p) => p.id === selectedProvider)!;
  const selectedCfg = providers[selectedProvider];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-background/40 backdrop-blur-md"
      onClick={closeModelPicker}>
      <div className="glass-overlay rounded-2xl w-full max-w-2xl h-[60vh] flex flex-col animate-fade-in"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-3 h-11 border-b border-border flex-shrink-0">
          <span className="text-[13px] font-semibold tracking-tight">Select Model</span>
          <span className="text-[10px] text-muted-foreground font-mono">· {PROVIDER_CATALOG.length} providers</span>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="relative">
              <Search className="w-3 h-3 text-muted-foreground absolute left-1.5 top-1/2 -translate-y-1/2" />
              <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search providers or models…"
                className="h-7 w-56 pl-7 text-[12px]" />
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={closeModelPicker} aria-label="Close">
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          <ScrollArea className="w-56 border-r border-border flex-shrink-0">
            <div className="py-1">
              {filtered.map((p) => {
                const Icon = p.category === "cloud" ? Cloud : p.id.startsWith("llama") ? Cpu : HardDrive;
                const isActive = p.id === selectedProvider;
                const isCurrent = p.id === activeProvider;
                return (
                  <button key={p.id} onClick={() => setSelectedProvider(p.id)}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-2 text-left transition-all press rounded mx-1",
                      isActive ? "glass-elevated text-foreground" : "hover:bg-secondary/40 text-foreground",
                    )}>
                    <Icon className={cn("w-3.5 h-3.5 flex-shrink-0", isActive ? "text-foreground" : "text-muted-foreground")} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-medium truncate">{p.name}</div>
                      <div className="text-[10px] text-muted-foreground font-mono truncate">{p.id}</div>
                    </div>
                    {isCurrent && <Check className="w-3 h-3 text-accent flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </ScrollArea>

          <ScrollArea className="flex-1 min-w-0">
            <div className="p-3">
              <div className="mb-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-[13px] font-semibold">{selectedMeta.name}</h3>
                  <Badge variant="outline" className="text-[10px] h-5 font-mono">{selectedMeta.category}</Badge>
                  {selectedMeta.needsApiKey && !selectedCfg.apiKey && (
                    <Badge variant="outline" className="text-[10px] h-5 font-mono text-amber-700 dark:text-amber-400 border-amber-500/30">
                      no API key
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{selectedMeta.description}</p>
              </div>

              {selectedMeta.needsApiKey && (
                <div className="mb-3">
                  <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono block mb-1">
                    {selectedMeta.apiKeyLabel}
                  </label>
                  <Input type="password" value={selectedCfg.apiKey}
                    onChange={(e) => setProvider(selectedProvider, { apiKey: e.target.value, enabled: !!e.target.value })}
                    placeholder={selectedMeta.apiKeyPlaceholder}
                    className="h-7 text-[12px] font-mono" />
                  <div className="text-[10px] text-muted-foreground mt-1">
                    Stored only in your browser localStorage. Never sent to AXONIZ servers.
                  </div>
                </div>
              )}

              <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono mb-1.5">Models</div>
              {selectedMeta.popularModels.length === 0 ? (
                <div className="text-[12px] text-muted-foreground italic py-2">
                  No popular models listed. Type a model id below to use it.
                </div>
              ) : (
                <ul className="space-y-0.5">
                  {selectedMeta.popularModels.map((m) => {
                    const isCurrent = selectedProvider === activeProvider && m === activeModel;
                    return (
                      <li key={m}>
                        <button onClick={() => pickModel(selectedProvider, m)}
                          className={cn(
                            "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left hover:bg-secondary/40 transition-all press",
                            isCurrent && "glass-elevated",
                          )}>
                          <span className="text-[12px] font-mono">{m}</span>
                          {isCurrent && <Check className="w-3 h-3 text-accent ml-auto" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="mt-3">
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono block mb-1">
                  Custom model id
                </label>
                <div className="flex items-center gap-1.5">
                  <Input value={selectedCfg.model}
                    onChange={(e) => setProvider(selectedProvider, { model: e.target.value })}
                    placeholder="e.g. glm-4.6"
                    className="h-7 text-[12px] font-mono" />
                  <Button size="sm" className="h-7"
                    onClick={() => pickModel(selectedProvider, selectedCfg.model || selectedMeta.popularModels[0] || "")}
                    disabled={!selectedCfg.model && selectedMeta.popularModels.length === 0}>
                    Use
                  </Button>
                </div>
              </div>

              {selectedMeta.pricePerMTokIn > 0 && (
                <div className="mt-3 text-[10px] text-muted-foreground font-mono">
                  ≈ ${selectedMeta.pricePerMTokIn.toFixed(2)} / MTok in · ${selectedMeta.pricePerMTokOut.toFixed(2)} / MTok out
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
