"use client";

import { User, FolderTree, FileJson, LogOut, Folder } from "lucide-react";
import { PageHeader, GlassCard, StatTile } from "@/components/axoniz/page-primitives";
import { useAxonizStore } from "@/stores/axoniz-store";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

export default function SessionPage() {
  const username = useAxonizStore((s) => s.username);
  const logout = useAxonizStore((s) => s.logout);

  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="max-w-3xl mx-auto p-3 sm:p-4 lg:p-6 pb-16">
        <PageHeader title="Session" description="Operator info and vault filesystem paths." />

        {/* Operator */}
        <GlassCard className="mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1">
              <div className="text-[13px] font-medium">{username ?? "operator"}</div>
              <div className="text-[11px] text-muted-foreground font-mono">authenticated · local</div>
            </div>
          </div>
        </GlassCard>

        {/* Paths */}
        <h2 className="text-[13px] font-semibold uppercase tracking-widest text-muted-foreground font-mono mb-3">Vault Paths</h2>
        <div className="space-y-2 mb-6">
          <PathRow icon={FolderTree} label="Vault home" path="~/.axoniz" />
          <PathRow icon={Folder} label="Models directory" path="~/.axoniz/models" />
          <PathRow icon={Folder} label="History" path="~/.axoniz/history" />
          <PathRow icon={FileJson} label="Config file" path="~/.axoniz/config.json" />
          <PathRow icon={FileJson} label="Audit log" path="~/.axoniz/audit.jsonl" />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
          <StatTile label="Provider" value={username ? "operator" : "—"} />
          <StatTile label="Auth" value="local" />
          <StatTile label="Session" value="active" />
        </div>

        {/* Logout */}
        <Button variant="outline" size="sm" className="press" onClick={() => { logout(); toast.success("Session ended"); }}>
          <LogOut className="w-3.5 h-3.5" />
          End session
        </Button>
      </div>
    </ScrollArea>
  );
}

function PathRow({ icon: Icon, label, path }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; path: string;
}) {
  return (
    <GlassCard className="p-3">
      <div className="flex items-center gap-3">
        <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">{label}</div>
          <div className="text-[12px] font-mono truncate">{path}</div>
        </div>
      </div>
    </GlassCard>
  );
}
