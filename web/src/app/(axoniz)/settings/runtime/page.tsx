"use client";

import { useState } from "react";
import { Save, Cpu } from "lucide-react";
import { PageHeader, GlassCard } from "@/components/axoniz/page-primitives";
import { useAxonizStore } from "@/stores/axoniz-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

export default function RuntimePage() {
  const llamacpp = useAxonizStore((s) => s.llamacpp);
  const setLlamacpp = useAxonizStore((s) => s.setLlamacpp);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await fetch("/api/axoniz/config/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          llm: { n_ctx: llamacpp.nCtx, n_gpu_layers: llamacpp.nGpuLayers, n_threads: llamacpp.nThreads, model_path: llamacpp.modelPath },
        }),
      });
      toast.success("Runtime config saved");
    } catch (e) {
      toast.error(`Save failed: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="max-w-2xl mx-auto p-3 sm:p-4 lg:p-6 pb-16">
        <PageHeader title="Runtime" description="llama.cpp inference knobs — context window, GPU layers, threads." />
        <GlassCard className="mb-4">
          <div className="flex items-center gap-2 mb-4">
            <Cpu className="w-4 h-4 text-muted-foreground" />
            <span className="text-[12px] font-medium">Inference parameters</span>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono block mb-1">Model path</label>
              <Input value={llamacpp.modelPath} onChange={(e) => setLlamacpp({ modelPath: e.target.value })} className="h-8 font-mono text-[12px]" />
            </div>
            <Range label="Context window" value={llamacpp.nCtx} min={1024} max={32768} step={1024} unit="tokens" onChange={(v) => setLlamacpp({ nCtx: v })} />
            <Range label="GPU layers" value={llamacpp.nGpuLayers} min={0} max={99} step={1} unit="layers" onChange={(v) => setLlamacpp({ nGpuLayers: v })} hint="0 = CPU only · 99 = full offload" />
            <Range label="Threads" value={llamacpp.nThreads} min={1} max={32} step={1} unit="threads" onChange={(v) => setLlamacpp({ nThreads: v })} />
          </div>
        </GlassCard>
        <Button onClick={save} disabled={saving} className="press">
          <Save className="w-3 h-3" />
          {saving ? "Saving…" : "Save runtime config"}
        </Button>
      </div>
    </ScrollArea>
  );
}

function Range({ label, value, min, max, step, unit, onChange, hint }: {
  label: string; value: number; min: number; max: number; step: number; unit: string;
  onChange: (v: number) => void; hint?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">{label}</label>
        <span className="text-[11px] font-mono">{value} {unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full glass-inset appearance-none cursor-pointer accent-primary" />
      {hint && <div className="text-[10px] text-muted-foreground font-mono mt-1">{hint}</div>}
    </div>
  );
}
