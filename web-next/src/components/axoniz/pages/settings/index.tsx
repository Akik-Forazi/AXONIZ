"use client";

import Link from "next/link";
import { Server, Cpu, Shield, Mic, Palette, User, ChevronRight, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAxonizStore, PROVIDER_CATALOG } from "@/stores/axoniz-store";

interface SettingsCard {
  route: string;
  icon: LucideIcon;
  title: string;
  description: string;
}

const CARDS: SettingsCard[] = [
  { route: "/settings/providers", icon: Server, title: "Providers", description: "Configure 14 inference endpoints — local and cloud." },
  { route: "/settings/runtime", icon: Cpu, title: "Runtime", description: "Context window, GPU layers, threads for llama.cpp." },
  { route: "/settings/authority", icon: Shield, title: "Authority", description: "Persona, authority level, permission gates." },
  { route: "/settings/voice", icon: Mic, title: "Voice", description: "TTS, STT, wake-word detection." },
  { route: "/settings/appearance", icon: Palette, title: "Appearance", description: "Theme, density, motion." },
  { route: "/settings/session", icon: User, title: "Session", description: "Operator info, vault paths, sign out." },
];

export function SettingsIndexPage({ activeTab }: { activeTab?: string }) {
  const providers = useAxonizStore((s) => s.providers);
  const enabledCount = Object.values(providers).filter((p) => p.enabled || p.baseUrl).length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 h-10 border-b border-border flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur-sm z-10">
        <h2 className="text-[13px] font-medium">Settings</h2>
        <span className="text-[11px] text-muted-foreground font-mono">
          {enabledCount} providers configured
        </span>
      </div>

      <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-w-5xl">
        {CARDS.map((card) => (
          <Link key={card.route} href={card.route}>
            <Card className={`surface hoverable p-4 h-full ${activeTab === card.route.split("/")[2] ? "border-foreground/15" : ""}`}>
              <div className="flex items-start gap-3">
                <div className="shrink-0 w-8 h-8 rounded-md bg-secondary border border-border flex items-center justify-center">
                  <card.icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium">{card.title}</div>
                  <div className="text-[11px] text-muted-foreground/80 mt-0.5 leading-snug">{card.description}</div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 mt-1.5" />
              </div>
              {card.route === "/settings/providers" && (
                <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-[9px] border-border bg-secondary text-secondary-foreground">
                    {PROVIDER_CATALOG.length} providers
                  </Badge>
                  <span className="text-[10px] text-muted-foreground/70">llama.cpp, LM Studio, Ollama, OpenAI, OpenRouter, Gemini, Anthropic, Groq, Together, Mistral, DeepSeek, Fireworks, Perplexity, Custom</span>
                </div>
              )}
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
