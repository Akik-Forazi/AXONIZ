"use client";

import { useState } from "react";
import { Network, ChevronRight, Loader2, Check } from "lucide-react";
import Link from "next/link";
import { PageHeader, GlassCard, StatusPill } from "@/components/axoniz/page-primitives";
import { useAxonizStore, PROVIDER_CATALOG, type ProviderId } from "@/stores/axoniz-store";
import { testProvider, type ProviderTestResult } from "@/lib/axoniz/client";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function ProvidersPage() {
  const providers = useAxonizStore((s) => s.providers);
  const setActiveProvider = useAxonizStore((s) => s.setActiveProvider);
  const activeProvider = useAxonizStore((s) => s.activeProvider);

  const [testing, setTesting] = useState<ProviderId | null>(null);
  const [results, setResults] = useState<Partial<Record<ProviderId, ProviderTestResult>>>({});

  const runTest = async (id: ProviderId) => {
    const cfg = providers[id];
    const meta = PROVIDER_CATALOG.find((p) => p.id === id)!;
    setTesting(id);
    try {
      const result = await testProvider({
        provider: id,
        baseUrl: cfg.baseUrl || meta.defaultBaseUrl,
        apiKey: cfg.apiKey || undefined,
      });
      setResults((r) => ({ ...r, [id]: result }));
      if (result.ok) {
        toast.success(`${meta.name} reachable · ${result.latencyMs}ms · ${result.models.length} models`);
      } else {
        toast.error(`${meta.name}: ${result.error ?? "test failed"}`);
      }
    } catch (e) {
      setResults((r) => ({ ...r, [id]: { ok: false, latencyMs: 0, models: [], error: (e as Error).message } }));
      toast.error(`${meta.name} test failed`);
    } finally {
      setTesting(null);
    }
  };

  const localProviders = PROVIDER_CATALOG.filter((p) => p.category === "local");
  const cloudProviders = PROVIDER_CATALOG.filter((p) => p.category === "cloud");

  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="max-w-4xl mx-auto p-3 sm:p-4 lg:p-6 pb-16">
        <PageHeader title="Providers" description="Configure and test cloud + local LLM backends. Tests hit the live /models endpoint of each provider." />

        <h2 className="text-[13px] font-semibold uppercase tracking-widest text-muted-foreground font-mono mb-3">Local</h2>
        <div className="space-y-2 mb-6">
          {localProviders.map((p) => (
            <ProviderRow key={p.id} name={p.name} cfg={providers[p.id]} isActive={activeProvider === p.id}
              testing={testing === p.id} result={results[p.id]}
              onTest={() => runTest(p.id)} onActivate={() => setActiveProvider(p.id)}
              detailHref={`/settings/providers/${p.id}`} />
          ))}
        </div>

        <h2 className="text-[13px] font-semibold uppercase tracking-widest text-muted-foreground font-mono mb-3">Cloud</h2>
        <div className="space-y-2">
          {cloudProviders.map((p) => (
            <ProviderRow key={p.id} name={p.name} cfg={providers[p.id]} isActive={activeProvider === p.id}
              testing={testing === p.id} result={results[p.id]}
              onTest={() => runTest(p.id)} onActivate={() => setActiveProvider(p.id)}
              detailHref={`/settings/providers/${p.id}`} />
          ))}
        </div>
      </div>
    </ScrollArea>
  );
}

function ProviderRow({
  name, cfg, isActive, testing, result, onTest, onActivate, detailHref,
}: {
  name: string;
  cfg: { baseUrl: string; apiKey: string; model: string; enabled: boolean };
  isActive: boolean; testing: boolean;
  result?: ProviderTestResult;
  onTest: () => void; onActivate: () => void;
  detailHref?: string;
}) {
  return (
    <GlassCard className="p-0 overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        <Network className={cn("w-4 h-4 flex-shrink-0", isActive ? "text-accent" : "text-muted-foreground")} />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium">{name}</div>
          <div className="text-[10px] text-muted-foreground font-mono truncate">
            {cfg.model ? `model: ${cfg.model}` : "no model set"}
            {cfg.baseUrl ? ` · ${cfg.baseUrl}` : ""}
          </div>
        </div>
        {result && (
          <StatusPill status={result.ok ? "ok" : "error"} label={result.ok ? `${result.latencyMs}ms` : "fail"} />
        )}
        <Button variant="outline" size="sm" onClick={onTest} disabled={testing} className="press">
          {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
          Test
        </Button>
        <Button variant={isActive ? "default" : "outline"} size="sm" onClick={onActivate} disabled={isActive} className="press">
          {isActive ? <><Check className="w-3 h-3" /> Active</> : "Activate"}
        </Button>
        {detailHref && (
          <Link href={detailHref}>
            <Button variant="ghost" size="icon" className="h-7 w-7 press" aria-label={`Configure ${name}`}>
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        )}
      </div>
      {result?.models && result.models.length > 0 && (
        <div className="px-3 pb-3 flex items-center gap-1 flex-wrap">
          {result.models.slice(0, 6).map((m) => (
            <span key={m.id} className="text-[10px] px-1.5 py-0.5 rounded glass-inset font-mono">{m.id}</span>
          ))}
          {result.models.length > 6 && <span className="text-[10px] text-muted-foreground font-mono">+{result.models.length - 6} more</span>}
        </div>
      )}
    </GlassCard>
  );
}
