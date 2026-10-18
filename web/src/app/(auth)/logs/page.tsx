"use client";

/**
 * /logs — global log viewer.
 *
 * Shows recent log entries from the in-memory ring buffer (last 200).
 * For per-project logs, visit /projects/:id (the project page has a
 * logs section).
 *
 * The full log file is at ~/.axoniz/logs/YYYY-MM-DD.jsonl (global)
 * or ~/.axoniz/projects/:id/logs/YYYY-MM-DD.jsonl (project-scoped).
 *
 * Each entry is a single JSON line. Searchable, exportable via the CLI:
 *   axoniz logs --project foo --since 1h
 */
import { useState, useEffect, useCallback } from "react";
import { ScrollText, RefreshCw, Loader2, AlertTriangle, Info, AlertCircle, Bug } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface LogEntry {
  ts: number;
  level: "debug" | "info" | "warn" | "error";
  workflowId: string | null;
  projectId: string | null;
  runId: string;
  stepId: string | null;
  tool: string | null;
  event: string;
  message: string;
  data?: Record<string, unknown>;
  durationMs?: number;
}

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/axoniz/v2/logs?limit=200");
      const data = await r.json();
      setLogs((data.entries ?? []).reverse()); // newest first
    } catch {
      /* swallow */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Auto-refresh every 5s
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  const filtered = filter.trim()
    ? logs.filter(l =>
        l.message.toLowerCase().includes(filter.toLowerCase()) ||
        (l.workflowId ?? "").toLowerCase().includes(filter.toLowerCase()) ||
        (l.tool ?? "").toLowerCase().includes(filter.toLowerCase())
      )
    : logs;

  function levelIcon(level: LogEntry["level"]) {
    switch (level) {
      case "error": return <AlertCircle className="w-3 h-3 text-red-500" />;
      case "warn": return <AlertTriangle className="w-3 h-3 text-amber-500" />;
      case "info": return <Info className="w-3 h-3 text-blue-500" />;
      case "debug": return <Bug className="w-3 h-3 text-muted-foreground" />;
    }
  }

  function levelColor(level: LogEntry["level"]) {
    switch (level) {
      case "error": return "text-red-500";
      case "warn": return "text-amber-500";
      case "info": return "text-blue-500";
      case "debug": return "text-muted-foreground";
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 h-10 border-b border-border flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur-sm z-10">
        <h2 className="text-[13px] font-medium flex items-center gap-2">
          <ScrollText className="w-3.5 h-3.5" />Logs
        </h2>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter..."
            className="h-7 w-40 px-2 rounded-md border border-border bg-input text-[11px] placeholder:text-muted-foreground/60 focus:outline-none focus:border-ring"
          />
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={load} title="Refresh">
            <RefreshCw className="w-3 h-3" />
          </Button>
        </div>
      </div>

      <div className="p-4 max-w-4xl">
        {loading && logs.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />Loading...
          </div>
        ) : filtered.length === 0 ? (
          <Card className="surface p-6 text-center">
            <ScrollText className="w-8 h-8 mx-auto mb-2 text-muted-foreground/60" />
            <div className="text-[13px] text-muted-foreground">
              {logs.length === 0 ? "No logs yet." : "No logs match your filter."}
            </div>
            {logs.length === 0 && (
              <div className="text-[11px] text-muted-foreground/60 mt-1">
                Run a workflow or trigger an agent to generate log entries.
              </div>
            )}
          </Card>
        ) : (
          <div className="space-y-1 font-mono text-[11px]">
            {filtered.map((l, i) => (
              <div key={i} className="flex items-start gap-2 py-1 border-b border-border/40 last:border-b-0">
                <span className="text-muted-foreground/60 w-20 shrink-0">
                  {new Date(l.ts).toLocaleTimeString("en-US", { hour12: false })}
                </span>
                <span className="shrink-0 w-4">{levelIcon(l.level)}</span>
                <span className={`shrink-0 uppercase tracking-wide w-10 ${levelColor(l.level)}`}>{l.level}</span>
                <div className="flex-1 min-w-0">
                  <span className="text-foreground/90 break-words">{l.message}</span>
                  {l.workflowId && (
                    <Badge variant="outline" className="ml-2 text-[9px] px-1 py-0 h-4 align-middle">{l.workflowId}</Badge>
                  )}
                  {l.stepId && (
                    <span className="ml-2 text-muted-foreground/60">step={l.stepId}</span>
                  )}
                  {l.tool && (
                    <span className="ml-2 text-muted-foreground/60">tool={l.tool}</span>
                  )}
                  {l.durationMs !== undefined && (
                    <span className="ml-2 text-muted-foreground/60">{l.durationMs}ms</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
