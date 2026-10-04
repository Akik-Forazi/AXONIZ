"use client";

import { Shield } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function AuthoritySettingsPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 h-10 border-b border-border flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur-sm z-10">
        <h2 className="text-[13px] font-medium flex items-center gap-2">
          <Shield className="w-3.5 h-3.5" />Authority
        </h2>
      </div>
      <div className="p-4 max-w-2xl space-y-4">
        <Card className="surface p-4 space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Persona</div>
              <div className="font-mono text-sm">AXONIZ</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Authority level</div>
              <div className="font-mono text-sm">3 of 5</div>
            </div>
          </div>
          <p className="text-[12px] text-muted-foreground/80 leading-relaxed pt-2 border-t border-border">
            Authority level gates which tools the agent can invoke without asking.
            Level 1 = read-only. Level 3 = file edits + shell. Level 5 = destructive (rm, git push, package install).
            Configure in <code className="font-mono text-foreground/80">~/.axoniz/roles/axoniz.yaml</code>.
          </p>
        </Card>
        <Card className="surface p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Permission matrix</div>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="py-1.5">Capability</th>
                <th className="py-1.5 text-center">L1</th>
                <th className="py-1.5 text-center">L2</th>
                <th className="py-1.5 text-center">L3</th>
                <th className="py-1.5 text-center">L4</th>
                <th className="py-1.5 text-center">L5</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              <Row cap="read-fs" levels={[1,1,1,1,1]} current={3} />
              <Row cap="write-fs" levels={[0,1,1,1,1]} current={3} />
              <Row cap="exec-shell" levels={[0,0,1,1,1]} current={3} />
              <Row cap="git-write" levels={[0,0,0,1,1]} current={3} />
              <Row cap="pkg-install" levels={[0,0,0,0,1]} current={3} />
              <Row cap="cred-access" levels={[0,0,0,0,1]} current={3} />
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

function Row({ cap, levels, current }: { cap: string; levels: number[]; current: number }) {
  return (
    <tr className="border-t border-border">
      <td className="py-1.5">{cap}</td>
      {levels.map((v, i) => (
        <td key={i} className="py-1.5 text-center">
          {v === 1 ? (
            <span className={i + 1 <= current ? "text-foreground" : "text-muted-foreground/40"}>✓</span>
          ) : (
            <span className="text-muted-foreground/30">—</span>
          )}
        </td>
      ))}
    </tr>
  );
}
