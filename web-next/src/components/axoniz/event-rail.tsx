"use client";

import { useEffect, useRef, useState } from "react";
import {
  Wrench,
  Brain,
  Cpu,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import type { AxonizSseEvent } from "@/lib/axoniz/api-types";
import { axonizClient } from "@/lib/axoniz/client";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAxonizStore } from "@/stores/axoniz-store";

interface RailEvent {
  id: number;
  ev: AxonizSseEvent;
}

export function EventRail() {
  const [events, setEvents] = useState<RailEvent[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const idRef = useRef(0);
  const dataSource = useAxonizStore((s) => s.dataSource);
  const setDataSource = useAxonizStore((s) => s.setDataSource);

  useEffect(() => {
    let cancelled = false;
    let es: EventSource | null = null;

    async function start() {
      const url = axonizClient.streamUrl();
      es = new EventSource(url);

      const pushEvent = (ev: AxonizSseEvent) => {
        if (cancelled) return;
        setEvents((prev) => {
          const next = [...prev, { id: ++idRef.current, ev }];
          return next.slice(-80);
        });
      };

      const handle = (type: string) => (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          pushEvent({ type, ...data, ts: data.ts ?? Date.now() / 1000 });
        } catch {
          /* ignore */
        }
      };

      const types = [
        "token", "tool_call", "tool_result", "thought", "swarm",
        "memory", "error", "done", "health",
      ];
      types.forEach((t) => es?.addEventListener(t, handle(t)));
      es.addEventListener("message", handle("message"));
      es.onerror = () => {
        /* EventSource auto-reconnects */
      };
    }

    void (async () => {
      try {
        await start();
      } catch {
        /* swallow */
      }
    })();

    return () => {
      cancelled = true;
      es?.close();
    };
  }, []);

  // Pull source tag once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(axonizClient.streamUrl(), { method: "GET" });
        const src = r.headers.get("x-axoniz-source");
        if (!cancelled && src) {
          setDataSource(src as "mock" | "live");
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setDataSource]);

  return (
    <aside
      className="hidden lg:flex sticky top-12 self-start h-[calc(100vh-3rem)] border-l border-border bg-sidebar flex-col transition-[width] duration-200"
      style={{ width: collapsed ? 32 : 288 }}
    >
      <div className="flex items-center justify-between px-3 h-9 border-b border-border shrink-0">
        {!collapsed && (
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
            <Terminal className="w-3 h-3" />
            Event Stream
            <span
              className={`ml-1 px-1 py-0.5 rounded text-[9px] uppercase font-mono ${
                dataSource === "live"
                  ? "bg-accent/15 text-accent"
                  : "bg-primary/15 text-primary"
              }`}
            >
              {dataSource === "live" ? "LIVE" : "DEMO"}
            </span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed((c) => !c)}
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
        >
          {collapsed ? (
            <ChevronLeft className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </Button>
      </div>

      {!collapsed && (
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-1.5 space-y-1">
            {events.length === 0 && (
              <div className="text-[11px] text-muted-foreground/60 p-3 text-center">
                Connecting…
              </div>
            )}
            {events.map(({ id, ev }) => (
              <EventRow key={id} ev={ev} />
            ))}
          </div>
        </ScrollArea>
      )}
    </aside>
  );
}

function EventRow({ ev }: { ev: AxonizSseEvent }) {
  const cfg = rowConfig(ev);
  const Icon = cfg.icon;
  return (
    <div className="rounded px-2.5 py-1.5 hover:bg-secondary/60 transition-colors">
      <div className="flex items-start gap-2">
        <Icon className={`w-3 h-3 mt-0.5 shrink-0 ${cfg.color}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground/80 font-medium">
              {cfg.label}
            </span>
            <span className="text-[9px] text-muted-foreground/50 font-mono">
              {new Date((ev.ts ?? Date.now() / 1000) * 1000).toLocaleTimeString()}
            </span>
          </div>
          <div className="text-[11px] text-foreground/80 break-words leading-snug mt-0.5">
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
        body: JSON.stringify(ev).slice(0, 80),
        color: "text-muted-foreground",
      };
    }
  }
