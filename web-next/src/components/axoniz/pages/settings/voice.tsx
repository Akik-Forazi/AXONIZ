"use client";

import { Mic, Save } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAxonizStore } from "@/stores/axoniz-store";

export function VoiceSettingsPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 h-10 border-b border-border flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur-sm z-10">
        <h2 className="text-[13px] font-medium flex items-center gap-2">
          <Mic className="w-3.5 h-3.5" />Voice
        </h2>
      </div>
      <div className="p-4 max-w-2xl space-y-4">
        <Card className="surface p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13px] font-medium">Wake-word detection</div>
              <div className="text-[11px] text-muted-foreground/80 mt-0.5">OpenWakeWord — always-listening daemon</div>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="grid grid-cols-2 gap-4 pt-3 border-t border-border">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">TTS</div>
              <Badge variant="outline" className="font-mono text-[10px] border-border bg-secondary text-secondary-foreground">kokoro</Badge>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">STT</div>
              <Badge variant="outline" className="font-mono text-[10px] border-border bg-secondary text-secondary-foreground">moonshine</Badge>
            </div>
          </div>
        </Card>
        <Card className="surface p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Voice loop</div>
          <p className="text-[12px] text-muted-foreground/80 leading-relaxed">
            Wake → STT → Agent → TTS pipeline. Runs entirely locally on CPU. Wake word "axos" activates the daemon; speech is transcribed via Moonshine ONNX, dispatched to the active agent, response is synthesized via Kokoro.
          </p>
          <div className="mt-3 font-mono text-[11px] text-muted-foreground/70 bg-secondary/40 rounded p-2.5">
            <div>wake_word → "axos"</div>
            <div>stt_backend → moonshine-onnx (94ms median)</div>
            <div>tts_backend → kokoro-v1.0.int8 (220ms median)</div>
          </div>
        </Card>
      </div>
    </div>
  );
}
