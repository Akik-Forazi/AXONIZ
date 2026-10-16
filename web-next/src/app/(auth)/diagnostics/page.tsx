"use client";

/**
 * Diagnostics page — view .axolog events inline in the dashboard.
 *
 * Mirrors `axoniz logs list` + `axoniz logs show` but in the web UI.
 * Lets the user:
 *   - See all .axolog sessions (newest first)
 *   - Open any session and see its events
 *   - Filter by severity, event_type
 *   - Tail N events
 *
 * Privacy: this page never displays the VALUES of the `details` field —
 * only the KEYS (e.g. "url", "status", "duration_ms"). The values are
 * written to .axolog with redaction already applied at write time, but
 * we still don't echo them back here as defense in depth.
 */

import { useEffect, useState } from "react";
import { Loader2, FileText, Filter, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

import { authedFetch } from "@/lib/axoniz/client";
interface Session {
  name: string;
  path: string;
  sizeBytes: number;
  sizeStr: string;
  mtimeIso: string;
  mtimeStr: string;
}

interface LogEvent {
  sequence?: number;
  event_id?: string;
  timestamp_utc?: string;
  timezone_offset?: string;
  session_id?: string;
  application?: string;
  component?: string;
  event_type?: string;
  severity?: string;
  route?: string;
  action?: string;
  duration_ms?: number;
  correlation_id?: string;
  detail_keys?: string[];
  redaction_applied?: boolean;
  schema_version?: number;
  __raw?: string;
  __parse_error?: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  debug: "text-muted-foreground",
  info: "text-foreground",
  warn: "text-yellow-500",
  error: "text-red-500",
  fatal: "text-purple-500",
};

export default function DiagnosticsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [stats, setStats] = useState<{ totalLines: number; parsed: number; broken: number } | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [severity, setSeverity] = useState<string>("");
  const [eventType, setEventType] = useState<string>("");
  const [tail, setTail] = useState(200);
  const [error, setError] = useState<string | null>(null);

  async function loadSessions() {
    setLoadingSessions(true);
    setError(null);
    try {
      const r = await authedFetch("/api/axoniz/diagnostics/sessions");
      const data = await r.json();
      setSessions(data.sessions ?? []);
      if (data.sessions?.length > 0 && !selected) {
        setSelected(data.sessions[0].name);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingSessions(false);
    }
  }

  async function loadEvents() {
    if (!selected) return;
    setLoadingEvents(true);
    setError(null);
    try {
      const params = new URLSearchParams({ session: selected, tail: String(tail) });
      if (severity) params.set("severity", severity);
      if (eventType) params.set("event_type", eventType);
      const r = await authedFetch(`/api/axoniz/diagnostics/read?${params}`);
      const data = await r.json();
      if (r.ok) {
        setEvents(data.events ?? []);
        setStats({ totalLines: data.totalLines, parsed: data.parsed, broken: data.broken });
      } else {
        setError(data.error ?? "Failed to load");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingEvents(false);
    }
  }

  useEffect(() => { void loadSessions(); }, []);
  useEffect(() => { if (selected) void loadEvents(); }, [selected, severity, eventType, tail]);

  return (
    <div className="flex h-full">
      {/* Sessions sidebar */}
      <div className="w-72 border-r border-border overflow-y-auto bg-sidebar/30">
        <div className="px-3 py-2 border-b border-border flex items-center justify-between">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">Sessions</span>
          <button onClick={loadSessions} className="text-muted-foreground hover:text-foreground">
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
        {loadingSessions && (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-xs">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
          </div>
        )}
        {!loadingSessions && sessions.length === 0 && (
          <div className="p-3 text-xs text-muted-foreground">
            No .axolog sessions found.
            <br /><br />
            Sessions are created automatically when the dashboard starts. Use the app for a minute, then refresh.
          </div>
        )}
        {sessions.map(s => (
          <button
            key={s.name}
            onClick={() => setSelected(s.name)}
            data-axoniz-action={`select-session:${s.name.slice(0, 20)}`}
            className={`w-full text-left px-3 py-2 border-b border-border/50 hover:bg-secondary/40 ${
              selected === s.name ? "bg-secondary" : ""
            }`}
          >
            <div className="text-[11px] font-mono text-foreground/80 truncate">{s.name}</div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
              <span>{s.sizeStr}</span>
              <span>·</span>
              <span>{s.mtimeStr}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Events panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="border-b border-border px-3 py-2 flex items-center gap-2 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <select
            value={severity}
            onChange={e => setSeverity(e.target.value)}
            data-axoniz-action="filter-severity"
            className="bg-input border border-border rounded h-7 text-[11px] px-2"
          >
            <option value="">All severities</option>
            <option value="debug">debug</option>
            <option value="info">info</option>
            <option value="warn">warn</option>
            <option value="error">error</option>
            <option value="fatal">fatal</option>
          </select>
          <input
            type="text"
            placeholder="event_type filter…"
            value={eventType}
            onChange={e => setEventType(e.target.value)}
            data-axoniz-action="filter-event-type"
            className="bg-input border border-border rounded h-7 text-[11px] px-2 w-44"
          />
          <select
            value={String(tail)}
            onChange={e => setTail(parseInt(e.target.value, 10))}
            data-axoniz-action="filter-tail"
            className="bg-input border border-border rounded h-7 text-[11px] px-2"
          >
            <option value="50">Last 50</option>
            <option value="200">Last 200</option>
            <option value="500">Last 500</option>
            <option value="1000">Last 1000</option>
          </select>
          {stats && (
            <div className="ml-auto flex items-center gap-3 text-[10px] text-muted-foreground">
              <Badge variant="outline" className="font-mono text-[10px]">
                {events.length} shown
              </Badge>
              <Badge variant="outline" className="font-mono text-[10px]">
                {stats.totalLines} lines
              </Badge>
              {stats.broken === 0 ? (
                <Badge variant="outline" className="border-accent/30 text-accent text-[10px]">
                  <CheckCircle2 className="w-2.5 h-2.5 mr-1" />0 broken
                </Badge>
              ) : (
                <Badge variant="outline" className="border-destructive/30 text-destructive text-[10px]">
                  <AlertCircle className="w-2.5 h-2.5 mr-1" />{stats.broken} broken
                </Badge>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="px-3 py-2 bg-destructive/5 border-b border-destructive/30 text-[11px] text-destructive">
            {error}
          </div>
        )}

        {/* Event list */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="font-mono text-[11px]">
            {loadingEvents && (
              <div className="flex items-center justify-center py-8 text-muted-foreground text-xs">
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading events…
              </div>
            )}
            {!loadingEvents && events.length === 0 && (
              <div className="px-3 py-8 text-center text-muted-foreground text-xs">
                No events match the current filter.
              </div>
            )}
            {events.map((e, i) => (
              <EventRow key={e.event_id ?? e.sequence ?? i} ev={e} />
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

function EventRow({ ev }: { ev: LogEvent }) {
  if (ev.__raw) {
    return (
      <div className="px-3 py-1 border-b border-border/30 hover:bg-secondary/30">
        <span className="text-red-500">[BROKEN]</span>{" "}
        <span className="text-muted-foreground">{ev.__raw}</span>
      </div>
    );
  }
  const sev = (ev.severity ?? "info").toLowerCase();
  const sevColor = SEVERITY_COLORS[sev] ?? "text-foreground";
  const ts = ev.timestamp_utc ?? "?";
  const tsShort = ts.replace("T", " ").slice(0, 23);
  const comp = (ev.component ?? "").padEnd(18).slice(0, 18);
  const et = (ev.event_type ?? "").padEnd(18).slice(0, 18);
  const detailKeysStr = ev.detail_keys?.length ? `{${ev.detail_keys.join(",")}}` : "";

  return (
    <div className="px-3 py-1 border-b border-border/30 hover:bg-secondary/30 flex items-start gap-2">
      <span className="text-muted-foreground shrink-0">{tsShort}</span>
      <span className={`shrink-0 uppercase ${sevColor}`} style={{ width: "48px" }}>{sev}</span>
      <span className="text-muted-foreground/80 shrink-0">{comp}</span>
      <span className="text-foreground/80 shrink-0">{et}</span>
      {ev.route && (
        <span className="text-muted-foreground shrink-0">{ev.route}</span>
      )}
      {ev.action && (
        <span className="text-cyan-500/80 shrink-0">{ev.action}</span>
      )}
      {ev.duration_ms != null && (
        <span className="text-muted-foreground shrink-0">{ev.duration_ms}ms</span>
      )}
      {detailKeysStr && (
        <span className="text-muted-foreground/60 shrink-0">{detailKeysStr}</span>
      )}
    </div>
  );
}
