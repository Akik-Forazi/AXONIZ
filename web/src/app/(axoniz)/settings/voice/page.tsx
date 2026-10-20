"use client";

import { Mic, Volume2, Ear, Sparkles } from "lucide-react";
import { PageHeader, GlassCard, StatusPill } from "@/components/axoniz/page-primitives";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function VoicePage() {
  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="max-w-3xl mx-auto p-3 sm:p-4 lg:p-6 pb-16">
        <PageHeader
          title="Voice"
          description="Wake-word loop, speech-to-text, and text-to-speech pipeline. Configuration lives in ~/.axoniz/config.json."
        />

        {/* Pipeline cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          <PipelineCard
            icon={Ear}
            label="Wake Word"
            value="axos"
            status="ok"
            detail="Local keyword detection · ~120ms response"
          />
          <PipelineCard
            icon={Mic}
            label="STT"
            value="moonshine-onnx"
            status="ok"
            detail="Streaming transcription · ~94ms p50"
          />
          <PipelineCard
            icon={Volume2}
            label="TTS"
            value="kokoro-v1.0.int8"
            status="ok"
            detail="Streaming speech synthesis · ~220ms p50"
          />
        </div>

        {/* Pipeline diagram */}
        <GlassCard className="mb-6">
          <h2 className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono mb-3">Pipeline</h2>
          <div className="flex items-center gap-2 text-[11px] font-mono overflow-x-auto">
            <PipelineNode label="Mic" />
            <Arrow />
            <PipelineNode label="Wake Word" />
            <Arrow />
            <PipelineNode label="VAD" />
            <Arrow />
            <PipelineNode label="STT" />
            <Arrow />
            <PipelineNode label="LLM" />
            <Arrow />
            <PipelineNode label="TTS" />
            <Arrow />
            <PipelineNode label="Speaker" />
          </div>
        </GlassCard>

        {/* Note */}
        <GlassCard>
          <div className="flex items-start gap-3">
            <Sparkles className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-[12px] font-medium mb-1">Notes</div>
              <div className="text-[11px] text-muted-foreground leading-relaxed">
                The voice loop runs as a sidecar daemon — independent from the main agent process.
                To start it: <code className="font-mono">axoniz voice</code>.
                Configuration keys live under <code className="font-mono">~/.axoniz/config.json</code> →{" "}
                <code className="font-mono">voice.*</code>.
              </div>
            </div>
          </div>
        </GlassCard>
      </div>
    </ScrollArea>
  );
}

function PipelineCard({
  icon: Icon, label, value, status, detail,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string; status: "ok" | "warn" | "error"; detail: string;
}) {
  return (
    <GlassCard>
      <div className="flex items-start gap-3 mb-2">
        <div className="w-9 h-9 rounded-lg glass-inset flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">{label}</div>
          <div className="text-[13px] font-mono font-medium mt-0.5 truncate">{value}</div>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground font-mono">{detail}</span>
        <StatusPill status={status} label={status === "ok" ? "ready" : status} />
      </div>
    </GlassCard>
  );
}

function PipelineNode({ label }: { label: string }) {
  return (
    <div className="px-2 py-1 rounded glass-inset flex-shrink-0">{label}</div>
  );
}

function Arrow() {
  return <span className="text-muted-foreground flex-shrink-0">→</span>;
}
