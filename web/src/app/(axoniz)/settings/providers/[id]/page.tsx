"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { PageHeader, GlassCard, StatusPill } from "@/components/axoniz/page-primitives";
import { useAxonizStore, PROVIDER_CATALOG } from "@/stores/axoniz-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function ProviderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const providerId = id as Parameters<typeof useAxonizStore.getState>[0] extends never ? never : Parameters<typeof useAxonizStore.getState>[0];
  // Type-safe lookup using PROVIDER_CATALOG
  const meta = PROVIDER_CATALOG.find((p) => p.id === id);
  const providers = useAxonizStore((s) => s.providers);
  const setProvider = useAxonizStore((s) => s.setProvider);
  const llamacpp = useAxonizStore((s) => s.llamacpp);
  const setLlamacpp = useAxonizStore((s) => s.setLlamacpp);
  const setActiveProvider = useAxonizStore((s) => s.setActiveProvider);
  const setActiveModel = useAxonizStore((s) => s.setActiveModel);
  const activeProvider = useAxonizStore((s) => s.activeProvider);

  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; latencyMs?: number; error?: string; models?: string[] } | null>(null);

  if (!meta) {
    return (
      <ScrollArea className="flex-1 min-h-0">
        <div className="max-w-2xl mx-auto p-6">
          <PageHeader title="Unknown provider" description={`No provider catalog entry for id "${id}".`} />
        </div>
      </ScrollArea>
    );
  }

  const cfg = providers[meta.id as keyof typeof providers];
  const isLlamacpp = meta.id === "llamacpp";

  const save = async () => {
    try {
      await fetch("/api/axoniz/config/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          providers: { [meta.id]: { ...cfg } },
          ...(isLlamacpp ? { llm: { n_ctx: llamacpp.nCtx, n_gpu_layers: llamacpp.nGpuLayers, n_threads: llamacpp.nThreads } } : {}),
        }),
      });
      toast.success("Configuration saved");
    } catch (e) {
      toast.error(`Save failed: ${(e as Error).message}`);
    }
  };

  const test = async () => {
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch("/api/axoniz/providers/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: meta.id, baseUrl: cfg.baseUrl || meta.defaultBaseUrl, apiKey: cfg.apiKey || undefined }),
      });
      const data = await res.json();
      setResult({ ok: !!data.ok, latencyMs: data.latencyMs, error: data.error, models: data.models });
      if (data.ok) toast.success(`${meta.name} reachable`);
      else toast.error(`${meta.name}: ${data.error ?? "test failed"}`);
    } catch (e) {
      setResult({ ok: false, error: (e as Error).message });
      toast.error(`${meta.name} test failed`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="max-w-2xl mx-auto p-3 sm:p-4 lg:p-6 pb-16">
        <div className="flex items-center gap-2 mb-2">
          <Button variant="ghost" size="icon" className="h-7 w-7 press" onClick={() => router.push("/settings/providers")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <span className="text-[11px] text-muted-foreground font-mono">/ settings / providers / {meta.id}</span>
        </div>

        <PageHeader
          title={meta.name}
          description={meta.description}
          actions={activeProvider === meta.id ? <StatusPill status="ok" label="active" /> : undefined}
        />

        <div className="space-y-4">
          {/* Connection settings */}
          <GlassCard>
            <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono mb-3">Connection</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono block mb-1">Base URL</label>
                <Input
                  value={cfg.baseUrl}
                  onChange={(e) => setProvider(meta.id as never, { baseUrl: e.target.value })}
                  placeholder={meta.defaultBaseUrl}
                  className="h-8 font-mono text-[12px]"
                />
              </div>
              {meta.needsApiKey && (
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono block mb-1">{meta.apiKeyLabel}</label>
                  <Input
                    type="password"
                    value={cfg.apiKey}
                    onChange={(e) => setProvider(meta.id as never, { apiKey: e.target.value, enabled: !!e.target.value })}
                    placeholder={meta.apiKeyPlaceholder}
                    className="h-8 font-mono text-[12px]"
                  />
                </div>
              )}
              <div>
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono block mb-1">Model</label>
                <Input
                  value={cfg.model}
                  onChange={(e) => setProvider(meta.id as never, { model: e.target.value })}
                  placeholder="e.g. gpt-4o"
                  className="h-8 font-mono text-[12px]"
                />
                {meta.popularModels.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {meta.popularModels.map((m) => (
                      <button
                        key={m}
                        onClick={() => setProvider(meta.id as never, { model: m })}
                        className="text-[10px] px-1.5 py-0.5 rounded glass-inset hover:bg-secondary/60 transition-colors font-mono press"
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </GlassCard>

          {/* llama.cpp runtime knobs */}
          {isLlamacpp && (
            <GlassCard>
              <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono mb-3">llama.cpp runtime</h3>
              <div className="space-y-3">
                <SliderField label="Model path" value={llamacpp.modelPath} onChange={(v) => setLlamacpp({ modelPath: v })} />
                <RangeField label="Context window" value={llamacpp.nCtx} min={1024} max={32768} step={1024} unit="tokens" onChange={(v) => setLlamacpp({ nCtx: v })} />
                <RangeField label="GPU layers" value={llamacpp.nGpuLayers} min={0} max={99} step={1} unit="layers" onChange={(v) => setLlamacpp({ nGpuLayers: v })} />
                <RangeField label="Threads" value={llamacpp.nThreads} min={1} max={32} step={1} unit="threads" onChange={(v) => setLlamacpp({ nThreads: v })} />
              </div>
            </GlassCard>
          )}

          {/* Pricing */}
          {meta.pricePerMTokIn > 0 && (
            <GlassCard>
              <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono mb-2">Pricing</h3>
              <div className="text-[12px] font-mono">
                <span className="text-muted-foreground">in:</span> ${meta.pricePerMTokIn.toFixed(2)}/MTok ·{" "}
                <span className="text-muted-foreground">out:</span> ${meta.pricePerMTokOut.toFixed(2)}/MTok
              </div>
            </GlassCard>
          )}

          {/* Test result */}
          {result && (
            <GlassCard>
              <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono mb-2">Test Result</h3>
              {result.ok ? (
                <div>
                  <div className="text-[12px] mb-1">Reachable · {result.latencyMs ?? "?"}ms</div>
                  {result.models && result.models.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap mt-2">
                      {result.models.slice(0, 8).map((m) => (
                        <button key={m} onClick={() => setProvider(meta.id as never, { model: m })}
                          className="text-[10px] px-1.5 py-0.5 rounded glass-inset hover:bg-secondary/60 font-mono press">
                          {m}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-[12px] text-destructive">{result.error ?? "test failed"}</div>
              )}
            </GlassCard>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={test} disabled={testing} className="press">
              {testing && <Loader2 className="w-3 h-3 animate-spin" />}
              Test
            </Button>
            <Button size="sm" onClick={save} className="press">
              <Save className="w-3 h-3" />
              Save
            </Button>
            {activeProvider !== meta.id && (
              <Button variant="ghost" size="sm" onClick={() => { setActiveProvider(meta.id as never); setActiveModel(cfg.model); }} className="press">
                Set as active
              </Button>
            )}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}

function SliderField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono block mb-1">{label}</label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-8 font-mono text-[12px]" />
    </div>
  );
}

function RangeField({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">{label}</label>
        <span className="text-[11px] font-mono">{value} {unit}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full glass-inset appearance-none cursor-pointer accent-primary"
      />
    </div>
  );
}
