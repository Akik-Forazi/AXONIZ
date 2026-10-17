"use client";

/**
 * Local Model Servers page — the MS_terminal in the site.
 *
 * Shows:
 *   - Status card: which provider is running, model name, PID, port,
 *     uptime, last exit code.
 *   - Start / Stop buttons for the chosen provider.
 *   - Live terminal output: streaming stdout/stderr from the running
 *     server process, captured by /api/axoniz/models/launch (via the
 *     ServerProcessManager singleton).
 *
 * The "terminal" is a plain <pre> with ANSI-stripping for color codes
 * (full ANSI-color rendering would need a 3rd-party dep — deferred).
 *
 * Live updates via SSE: /api/axoniz/models/logs/stream pushes each new
 * log line as it arrives from the spawned server process.
 */

import { useEffect, useState, useRef, useCallback } from "react";
import {
  Server, Play, Square, Loader2, Activity, Cpu, Clock, FileText,
  RefreshCw, AlertCircle, CheckCircle2, Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAxonizStore, PROVIDER_CATALOG, type ProviderId } from "@/stores/axoniz-store";
import { authedFetch, authedUrl } from "@/lib/axoniz/client";
import { toast } from "sonner";

interface ServerStatus {
  running: boolean;
  provider: string | null;
  modelPath: string | null;
  modelName: string | null;
  pid: number | null;
  baseUrl: string | null;
  port: number | null;
  startedAt: number | null;
  lastExitCode: number | null;
  args: string[];
}

interface LogLine {
  ts: number;
  stream: "stdout" | "stderr";
  text: string;
}

const LOCAL_PROVIDERS: ProviderId[] = ["llamacpp", "ollama", "lmstudio"];

/** Strip ANSI color/control codes for plain-text display. */
function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "").replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
}

function formatUptime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m${rs}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h${rm}m`;
}

export default function ServersPage() {
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [tick, setTick] = useState(0);  // forces uptime re-render every 1s

  const esRef = useRef<EventSource | null>(null);
  const termRef = useRef<HTMLDivElement>(null);
  const { activeProvider, llamacpp, providers } = useAxonizStore();

  const fetchStatus = useCallback(async () => {
    try {
      const r = await authedFetch("/api/axoniz/models/status");
      const data = await r.json();
      setStatus(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial status fetch.
  useEffect(() => { void fetchStatus(); }, [fetchStatus]);

  // Live uptime ticker (only when running).
  useEffect(() => {
    if (!status?.running) return;
    const i = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(i);
  }, [status?.running]);

  // SSE live tail of server logs.
  useEffect(() => {
    // Close any previous connection.
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    const es = new EventSource(authedUrl("/api/axoniz/models/logs/stream"));
    esRef.current = es;

    es.addEventListener("status", (e: MessageEvent) => {
      try { setStatus(JSON.parse(e.data) as ServerStatus); } catch { /* ignore */ }
    });
    es.addEventListener("log", (e: MessageEvent) => {
      try {
        const line = JSON.parse(e.data) as LogLine;
        setLogs(prev => {
          const next = [...prev, line];
          // Cap at 2000 lines in the UI to prevent memory growth.
          if (next.length > 2000) return next.slice(-2000);
          return next;
        });
      } catch { /* ignore */ }
    });
    es.onerror = () => {
      // EventSource auto-reconnects. Just mark a transient disconnect.
    };
    return () => {
      es.close();
      esRef.current = null;
    };
  }, []);

  // Auto-scroll to bottom on new logs.
  useEffect(() => {
    if (autoScroll && termRef.current) {
      termRef.current.scrollTop = termRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  async function startServer() {
    setActionPending("start");
    setError(null);
    try {
      // Use the llamacpp.modelPath from the store — set when user picks a model
      // in the Vault or ModelPicker.
      const modelPath = llamacpp.modelPath;
      if (!modelPath || modelPath === "~/.axoniz/models/Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf") {
        // The default placeholder — user hasn't picked a model yet.
        toast.error("No model selected", {
          description: "Open the Vault page and click 'Load & launch' on a model first.",
        });
        return;
      }
      const baseUrl = llamacpp.baseUrl || "http://localhost:8080";
      const r = await authedFetch("/api/axoniz/models/launch", {
        method: "POST",
        body: JSON.stringify({
          modelPath,
          baseUrl,
          provider: activeProvider,
          nCtx: llamacpp.nCtx,
          nGpuLayers: llamacpp.nGpuLayers,
          nThreads: llamacpp.nThreads,
        }),
      });
      const data = await r.json();
      if (r.ok && data.ok) {
        toast.success(`${activeProvider} server started`, {
          description: `PID ${data.pid} · ${baseUrl}`,
        });
        await fetchStatus();
      } else {
        const msg = data.error ?? `HTTP ${r.status}`;
        setError(msg);
        toast.error("Failed to start server", { description: msg });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error("Failed to start server", { description: msg });
    } finally {
      setActionPending(null);
    }
  }

  async function stopServer() {
    setActionPending("stop");
    setError(null);
    try {
      const r = await authedFetch("/api/axoniz/models/stop", { method: "POST" });
      const data = await r.json();
      if (r.ok && data.ok !== false) {
        toast.success("Server stopped", {
          description: data.was_running ? `Killed PID ${data.pid}` : "No server was running",
        });
        await fetchStatus();
      } else {
        const msg = data.error ?? `HTTP ${r.status}`;
        setError(msg);
        toast.error("Failed to stop server", { description: msg });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setActionPending(null);
    }
  }

  function clearLogs() {
    setLogs([]);
  }

  const uptimeMs = status?.running && status.startedAt ? Date.now() - status.startedAt : 0;
  // Reference tick to silence "unused var" lints — it forces the uptime re-render.
  void tick;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold tracking-tight flex items-center gap-2">
            <Server className="w-4 h-4 text-primary" />
            Local Model Servers
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Manage llama-server / ollama / lmstudio from the dashboard — see live logs as the model loads.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchStatus}
          data-axoniz-action="servers-refresh-status"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {error && (
        <div className="px-5 py-2 bg-destructive/5 border-b border-destructive/30 text-[11px] text-destructive flex items-center gap-2">
          <AlertCircle className="w-3 h-3 shrink-0" />
          {error}
        </div>
      )}

      {/* Status card */}
      <div className="px-5 py-3 border-b border-border bg-secondary/20">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" /> Loading status…
          </div>
        ) : status?.running ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <Stat label="Provider" value={status.provider ?? "-"} icon={<Server className="w-3 h-3" />} />
            <Stat label="Model" value={status.modelName ?? status.modelPath ?? "-"} icon={<Cpu className="w-3 h-3" />} truncate />
            <Stat label="PID" value={String(status.pid ?? "-")} icon={<Activity className="w-3 h-3" />} />
            <Stat label="Uptime" value={formatUptime(uptimeMs)} icon={<Clock className="w-3 h-3" />} />
            <Stat label="Base URL" value={status.baseUrl ?? "-"} icon={<FileText className="w-3 h-3" />} />
            <Stat label="Port" value={String(status.port ?? "-")} icon={<Server className="w-3 h-3" />} />
            <Stat label="Started" value={status.startedAt ? new Date(status.startedAt).toLocaleTimeString() : "-"} icon={<Clock className="w-3 h-3" />} />
            <Stat
              label="State"
              value={
                <Badge variant="outline" className="border-accent/30 text-accent text-[10px]">
                  <CheckCircle2 className="w-2.5 h-2.5 mr-1" /> running
                </Badge>
              }
              icon={<Activity className="w-3 h-3" />}
            />
          </div>
        ) : status?.lastExitCode !== null && status?.lastExitCode !== undefined ? (
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <Square className="w-3 h-3" />
            Server stopped — last exit code {status.lastExitCode}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <Server className="w-3 h-3" />
            No server running. Pick a model in the Vault and click "Load & launch" — or click Start below.
          </div>
        )}
        <div className="mt-3 flex items-center gap-2">
          <Button
            size="sm"
            variant="default"
            onClick={startServer}
            disabled={actionPending === "start" || status?.running === true}
            data-axoniz-action="servers-start"
            className="h-7 text-[11px] gap-1.5"
          >
            {actionPending === "start" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
            {actionPending === "start" ? "Starting…" : "Start server"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={stopServer}
            disabled={actionPending === "stop" || status?.running !== true}
            data-axoniz-action="servers-stop"
            className="h-7 text-[11px] gap-1.5"
          >
            {actionPending === "stop" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />}
            {actionPending === "stop" ? "Stopping…" : "Stop"}
          </Button>
          <Badge variant="outline" className="font-mono text-[10px] ml-2">
            provider: {activeProvider}
          </Badge>
          <label className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={e => setAutoScroll(e.target.checked)}
              className="w-3 h-3"
            />
            Auto-scroll
          </label>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearLogs}
            data-axoniz-action="servers-clear-logs"
            className="h-7 text-[11px] gap-1.5"
          >
            Clear
          </Button>
        </div>
      </div>

      {/* Terminal */}
      <div className="flex-1 min-h-0 flex flex-col bg-zinc-950">
        <div className="px-3 py-1.5 border-b border-zinc-800 flex items-center gap-2 text-[10px] text-zinc-400">
          <Terminal className="w-3 h-3" />
          <span className="font-mono uppercase tracking-widest">Server output</span>
          {status?.running && (
            <span className="ml-auto flex items-center gap-1 text-accent">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              live
            </span>
          )}
        </div>
        <div
          ref={termRef}
          className="flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed text-zinc-200"
        >
          {logs.length === 0 ? (
            <div className="text-zinc-500 text-center py-12">
              No output yet. Start a server to see its stdout/stderr here.
            </div>
          ) : (
            logs.map((line, i) => {
              const stripped = stripAnsi(line.text);
              const isErr = line.stream === "stderr";
              const isAxoniz = stripped.startsWith("[axoniz]");
              const ts = new Date(line.ts).toLocaleTimeString(undefined, { hour12: false });
              return (
                <div
                  key={`${line.ts}-${i}`}
                  className={`whitespace-pre-wrap break-all ${isErr ? "text-red-400" : isAxoniz ? "text-cyan-400" : "text-zinc-300"}`}
                >
                  <span className="text-zinc-600 mr-2 select-none">{ts}</span>
                  {stripped}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
  truncate,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  truncate?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1">
        {icon}
        {label}
      </span>
      <span className={`font-mono text-foreground/90 ${truncate ? "truncate" : ""}`}>
        {value}
      </span>
    </div>
  );
}
