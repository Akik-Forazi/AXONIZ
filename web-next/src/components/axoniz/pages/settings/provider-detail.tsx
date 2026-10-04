"use client";

import { useState, use } from "react";
import Link from "next/link";
import {
  ChevronLeft, Server, Cloud, Cpu, Loader2, CheckCircle2, AlertTriangle,
  ExternalLink, Save,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { axonizClient } from "@/lib/axoniz/client";
import {
  useAxonizStore,
  PROVIDER_CATALOG,
  type ProviderId,
} from "@/stores/axoniz-store";

interface ModelInfo {
  id: string;
  contextLength?: number;
  pricing?: { prompt?: number; completion?: number };
}

interface TestState {
  status: "idle" | "loading" | "ok" | "error";
  latencyMs?: number;
  models: ModelInfo[];
  error?: string;
}

export function ProviderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const providerId = id as ProviderId;

  const providers = useAxonizStore((s) => s.providers);
  const setProvider = useAxonizStore((s) => s.setProvider);
  const activeProvider = useAxonizStore((s) => s.activeProvider);
  const setActiveProvider = useAxonizStore((s) => s.setActiveProvider);
  const setActiveModel = useAxonizStore((s) => s.setActiveModel);
  const llamacpp = useAxonizStore((s) => s.llamacpp);
  const setLlamacpp = useAxonizStore((s) => s.setLlamacpp);

  const cfg = providers[providerId] ?? { enabled: false, baseUrl: "", apiKey: "", model: "" };
  const meta = PROVIDER_CATALOG.find((p) => p.id === providerId)!;
  const [test, setTest] = useState<TestState>({ status: "idle" });
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  async function runTest() {
    setTest({ status: "loading", models: [] });
    try {
      const result = await axonizClient.testProvider({
        provider: providerId,
        baseUrl: cfg.baseUrl || meta.defaultBaseUrl,
        apiKey: cfg.apiKey || undefined,
      });
      setTest({
        status: result.ok ? "ok" : "error",
        latencyMs: result.latencyMs,
        models: result.models ?? [],
        error: result.error,
      });
      if (result.ok) {
        toast.success(`${meta.name} reachable`, { description: `${(result.models ?? []).length} models · ${result.latencyMs}ms` });
      } else {
        toast.error(`${meta.name} test failed`, { description: result.error });
      }
    } catch (err) {
      setTest({ status: "error", error: err instanceof Error ? err.message : "Test failed" });
      toast.error("Test request failed");
    }
  }

  async function save() {
    setSaving(true);
    try {
      await axonizClient.saveConfig({ providers: { [providerId]: cfg } });
      toast.success("Saved", { description: `${meta.name} config persisted locally.` });
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  }

  function activate() {
    setActiveProvider(providerId);
    if (cfg.model) setActiveModel(cfg.model);
    toast.success(`Active provider: ${meta.name}`);
  }

  const isActive = activeProvider === providerId;
  const filteredModels = (test.models ?? []).filter((m) =>
    !query || m.id.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 h-10 border-b border-border flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur-sm z-10">
        <div className="flex items-center gap-2 text-[13px] font-medium">
          <Link href="/settings/providers" className="text-muted-foreground hover:text-foreground flex items-center gap-1">
            <ChevronLeft className="w-3.5 h-3.5" />Providers
          </Link>
          <span className="text-muted-foreground/40">/</span>
          <span>{meta.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={save} disabled={saving} size="sm" variant="secondary" className="h-7 text-[11px] gap-1.5">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}Save
          </Button>
          {!isActive && (
            <Button onClick={activate} size="sm" className="h-7 text-[11px]">Set as active</Button>
          )}
          {isActive && <Badge className="text-[10px] uppercase">Active</Badge>}
        </div>
      </div>

      <div className="p-4 max-w-3xl space-y-4">
        {/* Meta */}
        <Card className="surface p-4">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-9 h-9 rounded-md bg-secondary border border-border flex items-center justify-center">
              {meta.category === "local" ? <Cpu className="w-4 h-4" /> : <Cloud className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-[14px] font-medium">{meta.name}</h3>
                <Badge variant="outline" className="text-[9px] uppercase border-border bg-secondary text-secondary-foreground">{meta.category}</Badge>
              </div>
              <p className="text-[12px] text-muted-foreground mt-0.5 leading-snug">{meta.description}</p>
              {meta.docsUrl && (
                <a href={meta.docsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 mt-2 text-[11px] text-muted-foreground hover:text-foreground">
                  Documentation <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        </Card>

        {/* Config form */}
        {providerId === "llamacpp" ? (
          <Card className="surface p-4 space-y-3.5">
            <Field label="Model path" hint="Absolute path to the .gguf file in your Vault" value={llamacpp.modelPath} placeholder="~/.axoniz/models/your-model.gguf" onChange={(v) => setLlamacpp({ modelPath: v })} mono />
            <Field label="llama-server URL" hint="If running llama.cpp in server mode. Test connection hits /health." value={cfg.baseUrl} placeholder="http://localhost:8080" onChange={(v) => setProvider(providerId, { baseUrl: v })} mono />
            <div className="grid grid-cols-3 gap-3">
              <SliderCell label="Context" value={llamacpp.nCtx} min={1024} max={32768} step={1024} onChange={(v) => setLlamacpp({ nCtx: v })} format={(v) => `${(v / 1024).toFixed(0)}K`} />
              <SliderCell label="GPU layers" value={llamacpp.nGpuLayers} min={0} max={99} step={1} onChange={(v) => setLlamacpp({ nGpuLayers: v })} format={(v) => (v === 0 ? "CPU" : v >= 99 ? "Full" : `${v}`)} />
              <SliderCell label="Threads" value={llamacpp.nThreads} min={1} max={32} step={1} onChange={(v) => setLlamacpp({ nThreads: v })} format={(v) => `${v}`} />
            </div>
          </Card>
        ) : (
          <Card className="surface p-4 space-y-3.5">
            <Field label="Base URL" hint="Provider endpoint, no trailing slash" value={cfg.baseUrl} placeholder={meta.defaultBaseUrl} onChange={(v) => setProvider(providerId, { baseUrl: v })} mono />
            {meta.needsApiKey && (
              <Field label={meta.apiKeyLabel || "API key"} hint="Stored locally in your browser only — never sent anywhere except the provider's own endpoint" type="password" value={cfg.apiKey} placeholder={meta.apiKeyPlaceholder} onChange={(v) => setProvider(providerId, { apiKey: v })} />
            )}
            <Field label="Model" hint="Pick from the test results below or enter manually" value={cfg.model} placeholder={meta.popularModels[0] ?? ""} onChange={(v) => setProvider(providerId, { model: v })} mono />

            {meta.popularModels.length > 0 && (
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Popular models</Label>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {meta.popularModels.map((m) => (
                    <button
                      key={m}
                      onClick={() => setProvider(providerId, { model: m })}
                      className={`px-2 py-1 rounded-md border text-[11px] font-mono transition-colors ${
                        cfg.model === m
                          ? "border-foreground/20 bg-foreground/5 text-foreground"
                          : "border-border bg-secondary text-secondary-foreground hover:bg-secondary/80"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(meta.pricePerMTokIn > 0 || meta.pricePerMTokOut > 0) && (
              <div className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-[11px] text-muted-foreground">
                <span className="text-foreground/80 font-mono">${meta.pricePerMTokIn.toFixed(2)}</span> /MTok input
                <span className="mx-2 text-muted-foreground/40">·</span>
                <span className="text-foreground/80 font-mono">${meta.pricePerMTokOut.toFixed(2)}</span> /MTok output
                <span className="ml-2 text-muted-foreground/60">(used for per-task cost attribution)</span>
              </div>
            )}
          </Card>
        )}

        {/* Test connection */}
        <Card className="surface p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[13px] font-medium">Connection test</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Actually pings the endpoint and returns the real model list.</div>
            </div>
            <Button onClick={runTest} disabled={test.status === "loading"} variant="secondary" size="sm" className="h-8 text-[11px] gap-1.5">
              {test.status === "loading" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Server className="w-3 h-3" />}
              {test.status === "loading" ? "Testing" : "Test connection"}
            </Button>
          </div>

          {test.status === "ok" && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
                <span className="text-[12px]">Reachable · {test.latencyMs}ms · {test.models.length} models available</span>
              </div>
              {test.models.length > 0 && (
                <>
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter models…" className="h-8 bg-input border-border text-[12px] mb-2" />
                  <div className="border border-border rounded-md max-h-72 overflow-y-auto">
                    {filteredModels.slice(0, 50).map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setProvider(providerId, { model: m.id })}
                        className={`w-full text-left px-3 py-1.5 border-b border-border last:border-b-0 hover:bg-secondary transition-colors flex items-center gap-2 ${
                          cfg.model === m.id ? "bg-foreground/5" : ""
                        }`}
                      >
                        <span className="font-mono text-[11px] text-foreground/90 flex-1 truncate">{m.id}</span>
                        {m.contextLength && <span className="text-[10px] text-muted-foreground/70 font-mono">{Math.round(m.contextLength / 1024)}K</span>}
                        {m.pricing?.prompt !== undefined && m.pricing.prompt > 0 && (
                          <span className="text-[10px] text-muted-foreground/70 font-mono">${m.pricing.prompt.toFixed(2)}/M</span>
                        )}
                      </button>
                    ))}
                  </div>
                  {filteredModels.length > 50 && (
                    <div className="text-[10px] text-muted-foreground mt-1.5">
                      Showing 50 of {filteredModels.length}. Refine your filter to see more.
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {test.status === "error" && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-[11px] text-destructive font-mono break-words">
              {test.error}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Field({
  label, hint, value, placeholder, onChange, type = "text", mono = false,
}: {
  label: string; hint?: string; value: string; placeholder?: string;
  onChange: (v: string) => void; type?: "text" | "password"; mono?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <Input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={`h-8 bg-input border-border text-[13px] ${mono ? "font-mono" : ""}`} autoComplete="off" spellCheck={false} />
      {hint && <p className="text-[10px] text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

function SliderCell({ label, value, min, max, step, onChange, format }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="font-mono text-[13px] text-foreground/90">{format(value)}</div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer" />
    </div>
  );
}
