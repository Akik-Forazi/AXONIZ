"use client";

import { Palette } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

export function AppearanceSettingsPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 h-10 border-b border-border flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur-sm z-10">
        <h2 className="text-[13px] font-medium flex items-center gap-2">
          <Palette className="w-3.5 h-3.5" />Appearance
        </h2>
      </div>
      <div className="p-4 max-w-2xl space-y-4">
        <Card className="surface p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13px] font-medium">Theme</div>
              <div className="text-[11px] text-muted-foreground/80 mt-0.5">Dark monochrome — the only theme AXONIZ ships with</div>
            </div>
            <Badge variant="outline" className="text-[10px] uppercase border-foreground/15 bg-foreground/5 text-foreground">Forced</Badge>
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-border">
            <div>
              <div className="text-[13px] font-medium">Reduced motion</div>
              <div className="text-[11px] text-muted-foreground/80 mt-0.5">Disables entrance animations and blink indicators</div>
            </div>
            <Switch defaultChecked={false} />
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-border">
            <div>
              <div className="text-[13px] font-medium">Compact density</div>
              <div className="text-[11px] text-muted-foreground/80 mt-0.5">Tighter spacing and smaller fonts</div>
            </div>
            <Switch defaultChecked />
          </div>
        </Card>
        <Card className="surface p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Color tokens</div>
          <div className="space-y-2 text-[11px] font-mono">
            <TokenRow name="--background" value="oklch(0.115 0 0)" />
            <TokenRow name="--card" value="oklch(0.165 0 0)" />
            <TokenRow name="--primary" value="oklch(0.98 0 0)" comment="pure white" />
            <TokenRow name="--accent" value="oklch(0.7 0.18 145)" comment="green — status only" />
            <TokenRow name="--destructive" value="oklch(0.62 0.22 16)" comment="red — destructive only" />
          </div>
        </Card>
      </div>
    </div>
  );
}

function TokenRow({ name, value, comment }: { name: string; value: string; comment?: string }) {
  return (
    <div className="flex items-center gap-2 py-1 border-b border-border last:border-b-0">
      <span className="text-muted-foreground w-32">{name}</span>
      <span className="text-foreground/90 flex-1">{value}</span>
      {comment && <span className="text-muted-foreground/60">{comment}</span>}
      <div className="w-4 h-4 rounded border border-border" style={{ background: `var(${name})` }} />
    </div>
  );
}
