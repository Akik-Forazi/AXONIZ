"use client";

import Link from "next/link";
import { ChevronRight, Network, Cpu, Shield, Mic, Palette, User } from "lucide-react";
import { PageHeader, GlassCard } from "@/components/axoniz/page-primitives";
import { useAxonizStore } from "@/stores/axoniz-store";
import { ScrollArea } from "@/components/ui/scroll-area";

const CARDS = [
  { href: "/settings/providers", icon: Network, title: "Providers", desc: "Configure and test cloud + local LLM backends." },
  { href: "/settings/runtime", icon: Cpu, title: "Runtime", desc: "llama.cpp inference knobs — context, GPU layers, threads." },
  { href: "/settings/authority", icon: Shield, title: "Authority", desc: "Tool permission levels and capability matrix." },
  { href: "/settings/voice", icon: Mic, title: "Voice", desc: "Wake word, STT, and TTS pipeline." },
  { href: "/settings/appearance", icon: Palette, title: "Appearance", desc: "Theme, motion, density, design tokens." },
  { href: "/settings/session", icon: User, title: "Session", desc: "Operator info and vault paths." },
];

export default function SettingsIndexPage() {
  const providers = useAxonizStore((s) => s.providers);
  const configured = Object.values(providers).filter((p) => p.enabled || p.apiKey || p.model).length;

  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="max-w-4xl mx-auto p-3 sm:p-4 lg:p-6 pb-16">
        <PageHeader
          title="Settings"
          description={`${configured} of ${Object.keys(providers).length} providers configured.`}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {CARDS.map((c) => {
            const Icon = c.icon;
            return (
              <Link key={c.href} href={c.href}>
                <GlassCard className="h-full p-4 group" >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg glass-inset flex items-center justify-center flex-shrink-0 group-hover:bg-secondary transition-colors">
                      <Icon className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium mb-0.5">{c.title}</div>
                      <div className="text-[11px] text-muted-foreground leading-relaxed">{c.desc}</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
                  </div>
                </GlassCard>
              </Link>
            );
          })}
        </div>
      </div>
    </ScrollArea>
  );
}
