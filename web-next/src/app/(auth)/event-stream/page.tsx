"use client";

/**
 * /event-stream — the global Event Stream page.
 *
 * Replaces the old EventRail side panel (which was rendered persistently
 * in the auth layout and took screen space on every page). Now the
 * stream lives on its own dedicated page, and the EventSource connection
 * is owned by EventStreamProvider (singleton, survives navigation).
 *
 * This page just reads `railEvents` from the store and renders them —
 * no local state, no EventSource, no lifecycle. The connection itself
 * is opened once in the layout's <EventStreamProvider /> and keeps
 * streaming events even when the user is on a different page.
 */
import { useAxonizStore } from "@/stores/axoniz-store";
import {
  Wrench, Brain, Cpu, AlertTriangle, CheckCircle2, Terminal,
  Trash2, Loader2, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { AxonizSseEvent } from "@/lib/axoniz/api-types";

export default function EventStreamPage() {
  const events = useAxonizStore((s) => s.railEvents);
  const connected = useAxonizStore((s) => s.railConnected);
  const dataSource = useAxonizStore((s) => s.dataSource);
  const clear = useAxonizStore((s) => s.clearRailEvents);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-primary" />
          <h1 className="text-sm font-semibold">Event Stream</h1>
          <span
            className={`ml-2 px-1.5 py-0.5 rounded text-[10px] uppercase font-mono ${
              connected
                ? "bg-accent/15 text-accent"
                : "bg-primary/15 text-primary"
            }`}
          >
            {connected ? "Connected" : "Reconnecting…"}
          </span>
          <span className="text-[10px] text-muted-foreground/60 uppercase font-mono ml-1">
            source: {dataSource}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-muted-foreground/70 font-mono">
            {events.length} event{events.length === 1 ? "" : "s"} (capped at 200)
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[11px] gap-1.5 text-muted-foreground hover:text-destructive"
            onClick={clear}
            disabled={events.length === 0}
          >
            <Trash2 className="w-3 h-3" />
            Clear
          </Button>
        </div>
      </div>

      {/* Event list */}
      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full">
          <div className="p-3 space-y-1 max-w-4xl mx-auto">
            {events.length === 0 ? (
              <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground justify-center">
                {connected ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Waiting for events…</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <span>Reconnecting to backend…</span>
                  </>
                )}
              </div>
            ) : (
              events.map(({ id, ev }) => <EventRow key={id} ev={ev} />)
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

function EventRow({ ev }: { ev: AxonizSseEvent }) {
  const cfg = rowConfig(ev);
  const Icon = cfg.icon;
  return (
    <div className="rounded px-3 py-2 hover:bg-secondary/60 transition-colors border border-transparent hover:border-border">
      <div className="flex items-start gap-2.5">
        <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${cfg.color}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-medium">
              {cfg.label}
            </span>
            <span className="text-[10px] text-muted-foreground/50 font-mono">
              {new Date((ev.ts ?? Date.now() / 1000) * 1000).toLocaleTimeString()}
            </span>
          </div>
          <div className="text-[12px] text-foreground/85 break-words leading-snug">
            {cfg.body}
          </div>
        </div>
      </div>
    </div>
  );
}

function rowConfig(ev: AxonizSseEvent): {
  icon: LucideIcon;
  label: string;
  body: string;
  color: string;
} {
  switch (ev.type) {
    case "token":
      return { icon: Cpu, label: "Token", body: (ev as { value?: string }).value ?? "", color: "text-primary" };
    case "tool_call":
      return {
        icon: Wrench,
        label: "Tool call",
        body: (ev as { tool?: string }).tool ?? "",
        color: "text-accent",
      };
    case "tool_result":
      return {
        icon: (ev as { success?: boolean }).success ? CheckCircle2 : AlertTriangle,
        label: "Result",
        body: (ev as { result?: string }).result ?? "",
        color: (ev as { success?: boolean }).success ? "text-accent" : "text-destructive",
      };
    case "thought":
      return {
        icon: Brain,
        label: "Thought",
        body: (ev as { value?: string }).value ?? "",
        color: "text-muted-foreground",
      };
    case "swarm":
      return {
        icon: Cpu,
        label: `Swarm · ${(ev as { phase?: string }).phase ?? ""}`,
        body: (ev as { detail?: string }).detail ?? (ev as { status?: string }).status ?? "",
        color: "text-primary",
      };
    case "memory":
      return {
        icon: Brain,
        label: `Memory · ${(ev as { action?: string }).action ?? ""}`,
        body: (ev as { key?: string }).key ?? "",
        color: "text-accent",
      };
    case "error":
      return {
        icon: AlertTriangle,
        label: "Error",
        body: (ev as { error?: string }).error ?? "",
        color: "text-destructive",
      };
    case "done":
      return {
        icon: CheckCircle2,
        label: "Done",
        body: (ev as { summary?: string }).summary ?? "Task complete",
        color: "text-accent",
      };
    default:
      return {
        icon: Terminal,
        label: ev.type,
        body: JSON.stringify(ev).slice(0, 200),
        color: "text-muted-foreground",
      };
  }
}
