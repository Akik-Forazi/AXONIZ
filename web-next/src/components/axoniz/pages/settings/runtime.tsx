"use client";

import { Cpu, Save, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAxonizStore } from "@/stores/axoniz-store";
import { axonizClient } from "@/lib/axoniz/client";

export function RuntimeSettingsPage() {
  const { llamacpp, setLlamacpp } = useAxonizStore();
  const save = async () => {
    try {
      await axonizClient.saveConfig({
        llm: { n_ctx: llamacpp.nCtx, n_gpu_layers: llamacpp.nGpuLayers, n_threads: llamacpp.nThreads },
      });
      toast.success("Runtime config saved");
    } catch {
      toast.error("Save failed");
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 h-10 border-b border-border flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur-sm z-10">
        <h2 className="text-[13px] font-medium flex items-center gap-2">
          <Cpu className="w-3.5 h-3.5" />Runtime
        </h2>
        <Button onClick={save} size="sm" variant="secondary" className="h-7 text-[11px] gap-1.5">
          <Save className="w-3 h-3" />Save
        </Button>
      </div>
      <div className="p-4 max-w-2xl space-y-4">
        <Card className="surface p-4 space-y-4">
          <div>
            <Label className="text-xs font-medium text-muted-foreground">Model path</Label>
            <input value={llamacpp.modelPath} onChange={(e) => setLlamacpp({ modelPath: e.target.value })} className="mt-1.5 w-full h-8 px-3 bg-input border border-border rounded-md text-[13px] font-mono" />
          </div>
          <Slider label="Context window" hint="Larger = longer conversations, more RAM. Match to your model's training context." value={llamacpp.nCtx} min={1024} max={32768} step={1024} onChange={(v) => setLlamacpp({ nCtx: v })} format={(v) => `${(v / 1024).toFixed(0)}K`} />
          <Slider label="GPU layers" hint="0 = CPU only, 99 = full offload. Most consumer GPUs can offload 20–40 layers of a 7B model." value={llamacpp.nGpuLayers} min={0} max={99} step={1} onChange={(v) => setLlamacpp({ nGpuLayers: v })} format={(v) => v === 0 ? "CPU only" : v >= 99 ? "Full GPU" : `${v}`} />
          <Slider label="Threads" hint="Match CPU core count for best throughput." value={llamacpp.nThreads} min={1} max={32} step={1} onChange={(v) => setLlamacpp({ nThreads: v })} format={(v) => `${v}`} />
        </Card>
      </div>
    </div>
  );
}

function Slider({ label, hint, value, min, max, step, onChange, format }: { label: string; hint: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
        <span className="font-mono text-[12px]">{format(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full mt-1.5 h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer" />
      <p className="text-[10px] text-muted-foreground/70 mt-1">{hint}</p>
    </div>
  );
}
