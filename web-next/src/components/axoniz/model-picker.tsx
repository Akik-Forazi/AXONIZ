"use client";

import { useEffect, useState } from "react";
import { Search, Loader2, Check, X, Server, Cpu, Cloud } from "lucide-react";
import { useAxonizStore, PROVIDER_CATALOG, type ProviderId } from "@/stores/axoniz-store";
import { axonizClient } from "@/lib/axoniz/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

interface ModelInfo {
  id: string;
  contextLength?: number;
  pricing?: { prompt?: number; completion?: number };
}

interface ProviderTestState {
  status: "idle" | "loading" | "ok" | "error";
  latencyMs?: number;
  models: ModelInfo[];
  error?: string;
}

export function ModelPicker() {
  const {
    closeModelPicker,
    pickModel,
    activeProvider,
    activeModel,
    providers,
    setProvider,
  } = useAxonizStore();
  const [query, setQuery] = useState("");
  const [tests, setTests] = useState<Record<string, ProviderTestState>>({});
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>(activeProvider);

  // Auto-test the selected provider when user opens picker or switches provider.
  useEffect(() => {
    const cfg = providers[selectedProvider];
    const meta = PROVIDER_CATALOG.find((p) => p.id === selectedProvider)!;
    if (!cfg.baseUrl && meta.category === "cloud") return;
    if (meta.needsApiKey && !cfg.apiKey) return;
    if (tests[selectedProvider]?.status === "loading" || tests[selectedProvider]?.status === "ok") return;

    runTest(selectedProvider);
  }, [selectedProvider]);

  async function runTest(id: ProviderId) {
    const cfg = providers[id];
    const meta = PROVIDER_CATALOG.find((p) => p.id === id)!;
    setTests((t) => ({ ...t, [id]: { status: "loading", models: [] } }));
    try {
      const result = await axonizClient.testProvider({
        provider: id,
        baseUrl: cfg.baseUrl || meta.defaultBaseUrl,
        apiKey: cfg.apiKey || undefined,
      });
      setTests((t) => ({
        ...t,
        [id]: {
          status: result.ok ? "ok" : "error",
          latencyMs: result.latencyMs,
          models: result.models,
          error: result.error,
        },
      }));
    } catch (err) {
      setTests((t) => ({
        ...t,
        [id]: {
          status: "error",
          models: [],
          error: err instanceof Error ? err.message : "Test failed",
        },
      }));
    }
  }

  const test = tests[selectedProvider];
  const meta = PROVIDER_CATALOG.find((p) => p.id === selectedProvider)!;
  const cfg = providers[selectedProvider];

  const filtered = (test?.models ?? []).filter((m) =>
    m.id.toLowerCase().includes(query.toLowerCase()),
  );

  const popular = meta.popularModels.filter((m) =>
    m.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] p-4">
      <div className="absolute inset-0 bg-black/60" onClick={closeModelPicker} />
      <div className="relative w-full max-w-3xl surface-elevated rounded-lg overflow-hidden flex flex-col" style={{ maxHeight: "80vh" }}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4" />
            <h3 className="text-sm font-medium">Select model</h3>
          </div>
          <button
            onClick={closeModelPicker}
            className="text-muted-foreground hover:text-foreground h-7 w-7 rounded flex items-center justify-center hover:bg-secondary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Provider list */}
          <div className="w-48 border-r border-border overflow-y-auto">
            <div className="p-2 space-y-0.5">
              {PROVIDER_CATALOG.map((p) => {
                const t = tests[p.id];
                const isLocal = p.category === "local";
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProvider(p.id)}
                    className={`w-full flex items-center gap-2 px-2 h-8 rounded-md text-[12px] transition-colors ${
                      selectedProvider === p.id
                        ? "bg-foreground/5 text-foreground border border-foreground/15"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary border border-transparent"
                    }`}
                  >
                    {isLocal ? <Cpu className="w-3 h-3 shrink-0" /> : <Cloud className="w-3 h-3 shrink-0" />}
                    <span className="truncate flex-1 text-left">{p.name}</span>
                    {t?.status === "ok" && (
                      <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                    )}
                    {t?.status === "error" && (
                      <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Model list */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Search */}
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search models…"
                  className="h-8 pl-8 bg-input border-border text-[13px]"
                />
              </div>
              {/* Provider config summary */}
              <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                <Badge variant="outline" className="font-mono text-[10px] border-border bg-secondary text-secondary-foreground">
                  {meta.name}
                </Badge>
                {cfg.baseUrl && (
                  <span className="font-mono truncate">{cfg.baseUrl}</span>
                )}
                {test?.status === "ok" && (
                  <Badge variant="outline" className="ml-auto font-mono text-[10px] border-accent/20 bg-accent/5 text-accent">
                    {test.latencyMs}ms · {test.models.length} models
                  </Badge>
                )}
                {test?.status === "error" && (
                  <Badge variant="outline" className="ml-auto font-mono text-[10px] border-destructive/20 bg-destructive/5 text-destructive">
                    {test.error?.slice(0, 30) ?? "Error"}
                  </Badge>
                )}
              </div>
            </div>

            {/* Models */}
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-2">
                {test?.status === "loading" && (
                  <div className="flex items-center justify-center py-12 text-muted-foreground text-xs gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Pinging {meta.name}…
                  </div>
                )}
                {test?.status === "error" && (
                  <div className="p-4">
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-[11px] text-destructive font-mono break-words">
                      {test.error}
                    </div>
                    <button
                      onClick={() => runTest(selectedProvider)}
                      className="mt-2 text-[11px] text-muted-foreground hover:text-foreground underline"
                    >
                      Configure in Settings →
                    </button>
                  </div>
                )}
                {test?.status === "ok" && filtered.length === 0 && query && (
                  <div className="text-center text-xs text-muted-foreground py-8">
                    No models matching "{query}".
                  </div>
                )}
                {test?.status === "ok" && filtered.length === 0 && !query && (
                  <div className="text-center text-xs text-muted-foreground py-8">
                    No models returned. Verify the server is running and has models loaded.
                  </div>
                )}

                {/* Popular models (suggestions when no test result) */}
                {test?.status !== "ok" && test?.status !== "loading" && popular.length > 0 && (
                  <div>
                    <div className="px-2 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                      Popular models
                    </div>
                    {popular.map((m) => (
                      <ModelRow
                        key={m}
                        id={m}
                        active={m === activeModel && selectedProvider === activeProvider}
                        hint="configure to verify"
                        onClick={() => {
                          setProvider(selectedProvider, { model: m, baseUrl: cfg.baseUrl || meta.defaultBaseUrl });
                          pickModel(selectedProvider, m);
                          toast.success(`Switched to ${meta.name} · ${m}`, {
                            description: "Save config in Settings to verify the endpoint.",
                          });
                        }}
                      />
                    ))}
                  </div>
                )}

                {/* Real models from test */}
                {test?.status === "ok" && filtered.map((m) => {
                  const isActiveModel = m.id === activeModel && selectedProvider === activeProvider;
                  return (
                    <ModelRow
                      key={m.id}
                      id={m.id}
                      active={isActiveModel}
                      contextLength={m.contextLength}
                      pricing={m.pricing}
                      onClick={() => {
                        setProvider(selectedProvider, { model: m.id, baseUrl: cfg.baseUrl || meta.defaultBaseUrl });
                        pickModel(selectedProvider, m.id);
                      }}
                    />
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModelRow({
  id,
  active,
  contextLength,
  pricing,
  hint,
  onClick,
}: {
  id: string;
  active?: boolean;
  contextLength?: number;
  pricing?: { prompt?: number; completion?: number };
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors ${
        active ? "bg-foreground/5" : "hover:bg-secondary"
      }`}
    >
      {active ? (
        <Check className="w-3.5 h-3.5 text-foreground shrink-0" />
      ) : (
        <div className="w-3.5 h-3.5 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[12px] text-foreground/90 truncate">{id}</div>
        {(contextLength || pricing || hint) && (
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground/70 mt-0.5">
            {contextLength && (
              <span className="font-mono">{Math.round(contextLength / 1024)}K ctx</span>
            )}
            {pricing?.prompt !== undefined && pricing.prompt > 0 && (
              <span className="font-mono">${pricing.prompt.toFixed(2)}/MTok in</span>
            )}
            {pricing?.completion !== undefined && pricing.completion > 0 && (
              <span className="font-mono">${pricing.completion.toFixed(2)}/MTok out</span>
            )}
            {hint && <span>{hint}</span>}
          </div>
        )}
      </div>
    </button>
  );
}
