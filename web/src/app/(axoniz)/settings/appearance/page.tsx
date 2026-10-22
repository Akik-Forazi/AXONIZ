"use client";

import { useTheme } from "next-themes";
import { Palette, Sun, Moon } from "lucide-react";
import { PageHeader, GlassCard } from "@/components/axoniz/page-primitives";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";

const TOKENS = [
  { name: "--background", light: "oklch(0.985 0 0)", dark: "oklch(0.115 0 0)" },
  { name: "--foreground", light: "oklch(0.18 0 0)", dark: "oklch(0.96 0 0)" },
  { name: "--card", light: "oklch(1 0 0 / 0.55)", dark: "oklch(0.165 0 0 / 0.65)" },
  { name: "--primary", light: "oklch(0.20 0 0)", dark: "oklch(0.98 0 0)" },
  { name: "--secondary", light: "oklch(0.94 0 0)", dark: "oklch(0.21 0 0 / 0.7)" },
  { name: "--accent", light: "oklch(0.55 0.14 145)", dark: "oklch(0.7 0.18 145)" },
  { name: "--destructive", light: "oklch(0.55 0.22 16)", dark: "oklch(0.62 0.22 16)" },
  { name: "--border", light: "oklch(0 0 0 / 0.07)", dark: "oklch(1 0 0 / 0.08)" },
];

export default function AppearancePage() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="max-w-3xl mx-auto p-3 sm:p-4 lg:p-6 pb-16">
        <PageHeader
          title="Appearance"
          description="Theme, motion, and design tokens. Toggle light/dark to see the workspace switch instantly."
        />

        {/* Theme switch */}
        <GlassCard className="mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg glass-inset flex items-center justify-center flex-shrink-0">
              {resolvedTheme === undefined
                ? <span className="w-4 h-4" />
                : isDark ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </div>
            <div className="flex-1">
              <div className="text-[13px] font-medium">Theme</div>
              <div className="text-[11px] text-muted-foreground">Light or dark mode — applied globally.</div>
            </div>
            <Switch
              checked={resolvedTheme === "dark"}
              onCheckedChange={(v) => setTheme(v ? "dark" : "light")}
              aria-label="Toggle dark theme"
            />
          </div>
        </GlassCard>

        {/* Motion preferences */}
        <GlassCard className="mb-4">
          <div className="flex items-center gap-3 mb-3">
            <Palette className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="text-[12px] font-medium">Motion & accessibility</span>
          </div>
          <div className="text-[11px] text-muted-foreground leading-relaxed">
            Reduced-motion preferences are honored automatically via{" "}
            <code className="font-mono">prefers-reduced-motion</code>.
            Spring animations (tool-call cards, fade-in messages) will be disabled.
          </div>
        </GlassCard>

        {/* Design tokens */}
        <h2 className="text-[13px] font-semibold uppercase tracking-widest text-muted-foreground font-mono mb-3">Design Tokens</h2>
        <GlassCard className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Token</th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Light</th>
                  <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Dark</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {TOKENS.map((t) => (
                  <tr key={t.name} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-mono text-[11px]">{t.name}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">{t.light}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">{t.dark}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <div className="w-4 h-4 rounded border border-border" style={{ background: t.light }} />
                        <div className="w-4 h-4 rounded border border-border" style={{ background: t.dark }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      </div>
    </ScrollArea>
  );
}
