"use client";

import { useState } from "react";
import Link from "next/link";
import { Cloud, Cpu, ChevronRight, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { axonizClient } from "@/lib/axoniz/client";
import { useAxonizStore, PROVIDER_CATALOG, type ProviderId } from "@/stores/axoniz-store";

export function ProvidersListPage() {
  const providers = useAxonizStore((s) => s.providers);
  const activeProvider = useAxonizStore((s) => s.activeProvider);
  const setActiveProvider = useAxonizStore((s) => s.setActiveProvider);
  const [tests, setTests] = useState<Record<string, { status: "idle" | "loading" | "ok" | "error"; latencyMs?: number; error?: string; modelCount?: number }>>({});

  async function quickTest(id: ProviderId) {
    const cfg = providers[id];
    const meta = PROVIDER_CATALOG.find((p) => p.id === id)!;
    if (meta.needsApiKey && !cfg.apiKey) {
      toast.error(`${meta.name} needs an API key`, { description: "Open the provider to configure it." });
      return;
    }
    setTests((t) => ({ ...t, [id]: { status: "loading" } }));
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
          error: result.error,
          modelCount: (result.models ?? []).length,
        },
      }));
    } catch (err) {
      setTests((t) => ({ ...t, [id]: { status: "error", error: err instanceof Error ? err.message : "Failed" } }));
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 h-10 border-b border-border flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur-sm z-10">
        <h2 className="text-[13px] font-medium">Providers</h2>
        <span className="text-[11px] text-muted-foreground font-mono">
          {PROVIDER_CATALOG.length} supported
        </span>
      </div>

      <div className="p-4 max-w-4xl">
        <SectionLabel>Local</SectionLabel>
        <div className="space-y-1 mb-4">
          {PROVIDER_CATALOG.filter((p) => p.category === "local").map((meta) => (
            <ProviderRow
              key={meta.id}
              meta={meta}
              cfg={providers[meta.id]}
              isActive={activeProvider === meta.id}
              test={tests[meta.id]}
              onActivate={() => setActiveProvider(meta.id)}
              onTest={() => quickTest(meta.id)}
            />
          ))}
        </div>

        <SectionLabel>Cloud</SectionLabel>
        <div className="space-y-1">
          {PROVIDER_CATALOG.filter((p) => p.category === "cloud").map((meta) => (
            <ProviderRow
              key={meta.id}
              meta={meta}
              cfg={providers[meta.id]}
              isActive={activeProvider === meta.id}
              test={tests[meta.id]}
              onActivate={() => setActiveProvider(meta.id)}
              onTest={() => quickTest(meta.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">{children}</div>;
}

interface MetaLike {
  id: string;
  name: string;
  category: string;
  description: string;
  defaultBaseUrl: string;
  needsApiKey: boolean;
  popularModels: string[];
}

function ProviderRow({ meta, cfg, isActive, test, onActivate, onTest }: {
  meta: MetaLike;
  cfg: { enabled: boolean; baseUrl: string; apiKey: string; model: string };
  isActive: boolean;
  test?: { status: string; latencyMs?: number; error?: string; modelCount?: number };
  onActivate: () => void;
  onTest: () => void;
}) {
  const isConfigured = !!cfg.baseUrl || !!cfg.apiKey || !!cfg.model;
  const t = test as { status: string; latencyMs?: number; error?: string; modelCount?: number } | undefined;
  const href = `/settings/providers/${meta.id}`;

  return (
    <Card className={`surface hoverable p-3 ${isActive ? "border-foreground/15" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-8 h-8 rounded-md bg-secondary border border-border flex items-center justify-center">
          {meta.category === "local" ? <Cpu className="w-4 h-4" /> : <Cloud className="w-4 h-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link href={href} className="text-[13px] font-medium hover:underline">{meta.name}</Link>
            {isActive && <Badge className="text-[9px] uppercase h-4 px-1">Active</Badge>}
            {isConfigured && !isActive && <Badge variant="outline" className="text-[9px] uppercase h-4 px-1 border-border bg-secondary text-secondary-foreground">Configured</Badge>}
            {t?.status === "ok" && (
              <Badge variant="outline" className="text-[9px] uppercase h-4 px-1 border-accent/30 bg-accent/10 text-accent gap-1">
                <CheckCircle2 className="w-2.5 h-2.5" />{t.latencyMs}ms
              </Badge>
            )}
            {t?.status === "error" && (
              <Badge variant="outline" className="text-[9px] uppercase h-4 px-1 border-destructive/30 bg-destructive/10 text-destructive gap-1">
                <AlertTriangle className="w-2.5 h-2.5" />Fail
              </Badge>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground/80 mt-0.5 leading-snug">{meta.description}</div>
          <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground/70 font-mono">
            {cfg.baseUrl && <span className="truncate">{cfg.baseUrl}</span>}
            {cfg.model && <span>· {cfg.model}</span>}
            {!cfg.baseUrl && !cfg.apiKey && <span className="text-muted-foreground/50">Not configured</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button onClick={onTest} disabled={t?.status === "loading"} variant="ghost" size="sm" className="h-7 text-[10px] text-muted-foreground hover:text-foreground">
            {t?.status === "loading" ? <Loader2 className="w-3 h-3 animate-spin" /> : "Test"}
          </Button>
          {!isActive && (
            <Button onClick={onActivate} variant="ghost" size="sm" className="h-7 text-[10px] text-muted-foreground hover:text-foreground">Activate</Button>
          )}
          <Link href={href} className="inline-flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-foreground">
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </Card>
  );
}
