"use client";

import { useEffect, useRef } from "react";
import { Terminal, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAxonizWorkspaceStore, type TerminalLine } from "@/stores/axoniz-workspace-store";
import { cn } from "@/lib/utils";

export function TerminalPanel() {
  const lines = useAxonizWorkspaceStore((s) => s.terminalLines);
  const clear = useAxonizWorkspaceStore((s) => s.clearTerminal);
  const toggle = useAxonizWorkspaceStore((s) => s.toggleTerminalPanel);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [lines]);

  return (
    <div className="flex flex-col h-full min-h-0 glass-panel rounded-none border-l-0 border-b-0">
      <div className="flex items-center gap-2 px-3 h-8 border-b border-border flex-shrink-0">
        <Terminal className="w-3 h-3 text-muted-foreground" />
        <span className="text-[11px] font-mono font-medium uppercase tracking-wider">terminal</span>
        <span className="text-[10px] text-muted-foreground font-mono">· {lines.length} lines</span>
        <div className="ml-auto flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-6 w-6 press" onClick={clear} aria-label="Clear terminal">
            <Trash2 className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 press" onClick={toggle} aria-label="Hide terminal">
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-1 text-[11px] font-mono leading-relaxed min-h-0">
        {lines.length === 0 ? (
          <div className="text-muted-foreground italic px-1 py-1">
            Terminal output appears here when the agent runs commands.
          </div>
        ) : lines.map((l) => <TerminalLineRow key={l.id} line={l} />)}
      </div>
    </div>
  );
}

function TerminalLineRow({ line }: { line: TerminalLine }) {
  return (
    <div className={cn(
      "whitespace-pre-wrap break-words",
      line.kind === "command" && "text-foreground",
      line.kind === "stdout" && "text-foreground/80",
      line.kind === "stderr" && "text-destructive/80",
      line.kind === "error" && "text-destructive",
      line.kind === "success" && "text-accent",
      line.kind === "info" && "text-muted-foreground",
    )}>{line.text}</div>
  );
}
