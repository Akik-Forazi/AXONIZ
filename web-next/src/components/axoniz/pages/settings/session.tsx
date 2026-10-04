"use client";

import { User, Power } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAxonizStore } from "@/stores/axoniz-store";

export function SessionSettingsPage() {
  const { username, logout } = useAxonizStore();
  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 h-10 border-b border-border flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur-sm z-10">
        <h2 className="text-[13px] font-medium flex items-center gap-2">
          <User className="w-3.5 h-3.5" />Session
        </h2>
      </div>
      <div className="p-4 max-w-2xl space-y-4">
        <Card className="surface p-4">
          <div className="grid grid-cols-2 gap-4 text-[12px]">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Operator</div>
              <div className="font-mono">{username ?? "—"}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Vault home</div>
              <div className="font-mono">~/.axoniz</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Models dir</div>
              <div className="font-mono">~/.axoniz/models</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Config file</div>
              <div className="font-mono">~/.axoniz/config.json</div>
            </div>
          </div>
          <Separator className="my-3 bg-border" />
          <Button variant="ghost" size="sm" onClick={logout} className="text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5 h-7 text-[11px]">
            <Power className="w-3 h-3" />End session
          </Button>
        </Card>
      </div>
    </div>
  );
}
