"use client";

import { Shield, Lock, FileText, Pencil, Terminal, GitBranch, Package, Key } from "lucide-react";
import { PageHeader, GlassCard, StatTile, StatusPill } from "@/components/axoniz/page-primitives";
import { ScrollArea } from "@/components/ui/scroll-area";

const CAPABILITIES = [
  { icon: FileText, name: "read-fs", level: 1, desc: "Read files in the workspace" },
  { icon: Pencil, name: "write-fs", level: 2, desc: "Create or modify files" },
  { icon: Terminal, name: "exec-shell", level: 3, desc: "Run arbitrary shell commands" },
  { icon: GitBranch, name: "git-write", level: 2, desc: "git commit, push, pull" },
  { icon: Package, name: "pkg-install", level: 4, desc: "Install / uninstall packages" },
  { icon: Key, name: "cred-access", level: 5, desc: "Read credentials / .env / secrets" },
];

const LEVEL_LABELS = ["SAFE", "READ", "WRITE", "EXECUTE", "SYSTEM", "DANGEROUS"];

export default function AuthorityPage() {
  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="max-w-4xl mx-auto p-3 sm:p-4 lg:p-6 pb-16">
        <PageHeader
          title="Authority"
          description="Tool permission matrix. Config lives in ~/.axoniz/roles/axoniz.yaml — this view is read-only."
          actions={<StatusPill status="ok" label="Level 3 of 5" />}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
          <StatTile label="Persona" value="AXONIZ" />
          <StatTile label="Max Auto Level" value="3 / 5" hint="EXECUTE" />
          <StatTile label="Hardcoded Escalations" value="6" hint="path + command patterns" />
        </div>

        {/* Level legend */}
        <GlassCard className="mb-6">
          <h2 className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono mb-3">Authority levels</h2>
          <div className="space-y-1">
            {LEVEL_LABELS.map((label, idx) => (
              <div key={idx} className="flex items-center gap-3 text-[12px] font-mono">
                <span className="w-6 text-right text-muted-foreground">{idx}</span>
                <span className={idx <= 3 ? "text-foreground" : "text-destructive"}>{label}</span>
                <span className="text-muted-foreground text-[11px]">
                  {idx === 0 && "· no approval needed (safe tools)"}
                  {idx === 1 && "· auto-approve (read-only)"}
                  {idx === 2 && "· auto-approve (write)"}
                  {idx === 3 && "· auto-approve (execute) — current limit"}
                  {idx === 4 && "· requires approval"}
                  {idx === 5 && "· always blocked"}
                </span>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Capability matrix */}
        <h2 className="text-[13px] font-semibold uppercase tracking-widest text-muted-foreground font-mono mb-3">Capability Matrix</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CAPABILITIES.map((c) => {
            const Icon = c.icon;
            const approved = c.level <= 3;
            return (
              <GlassCard key={c.name} className="p-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg glass-inset flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-mono font-medium">{c.name}</span>
                      <StatusPill status={approved ? "ok" : "warn"} label={`L${c.level}`} />
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{c.desc}</div>
                  </div>
                  {approved ? (
                    <Lock className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                  ) : (
                    <Shield className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                  )}
                </div>
              </GlassCard>
            );
          })}
        </div>
      </div>
    </ScrollArea>
  );
}
