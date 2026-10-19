/**
 * GET /api/axoniz/diagnostics/read?session=<filename>[&tail=<n>][&severity=<level>]
 *
 * Reads the events from a specific .axolog session file. Mirrors the
 * CLI `axoniz logs show` command for the dashboard Diagnostics page/import_requests page.
 *
 * Query params:
 *   session  — filename (e.g. "2026-10-14_22-43-43_Wednesday-anon.axolog")
 *   tail     — last N events (default 200)
 *   severity — filter by severity (debug/info/warn/error/fatal)
 *   event_type — filter by event_type substring
 *
 * Response:
 *   200 { session, events: [...], totalLines, parsed, broken }
 *   400 { error: "session required" }
 *   404 { error: "session not found" }
 *
 * NEVER prints raw `details` values that might contain user content.
 * The Diagnostics page can show keys of `details` but not their values
 * (the redact() at write-time already replaced sensitive values with
 * "[REDACTED]" — but we still don't echo arbitrary detail content to
 * the page as defense in depth).
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { requireAuth } from "@/lib/axoniz/auth-guard";
import { axonizLocal } from "@/lib/axoniz/paths";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getDiagLogDir(): string {
  return path.join(axonizLocal(), "logs");
}

interface LogEvent {
  sequence?: number;
  timestamp?: string;
  timestamp_utc?: string;
  timezone_offset?: string;
  session_id?: string;
  event_id?: string;
  process_id?: number;
  application?: string;
  component?: string;
  event_type?: string;
  severity?: string;
  route?: string;
  action?: string;
  duration_ms?: number;
  correlation_id?: string;
  // details keys only — never values (defense in depth).
  detail_keys?: string[];
  redaction_applied?: boolean;
  schema_version?: number;
  __raw?: string;
  __parse_error?: string;
}

async function parseFile(
  filePath: string,
  tail?: number,
  severityFilter?: string,
  eventTypeFilter?: string,
): Promise<{ events: LogEvent[]; totalLines: number; parsed: number; broken: number }> {
  const events: LogEvent[] = [];
  let totalLines = 0;
  let parsed = 0;
  let broken = 0;

  const stream = fs.createReadStream(filePath, { encoding: "utf-8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    totalLines++;
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const evt = JSON.parse(trimmed) as Record<string, unknown>;
      parsed++;
      const detailKeys = evt.details && typeof evt.details === "object"
        ? Object.keys(evt.details as Record<string, unknown>).slice(0, 12)
        : [];
      const out: LogEvent = {
        sequence: typeof evt.sequence === "number" ? evt.sequence : undefined,
        timestamp: typeof evt.timestamp === "string" ? evt.timestamp : undefined,
        timestamp_utc: typeof evt.timestamp_utc === "string" ? evt.timestamp_utc : undefined,
        timezone_offset: typeof evt.timezone_offset === "string" ? evt.timezone_offset : undefined,
        session_id: typeof evt.session_id === "string" ? evt.session_id : undefined,
        event_id: typeof evt.event_id === "string" ? evt.event_id : undefined,
        process_id: typeof evt.process_id === "number" ? evt.process_id : undefined,
        application: typeof evt.application === "string" ? evt.application : undefined,
        component: typeof evt.component === "string" ? evt.component : undefined,
        event_type: typeof evt.event_type === "string" ? evt.event_type : undefined,
        severity: typeof evt.severity === "string" ? evt.severity : undefined,
        route: typeof evt.route === "string" ? evt.route : undefined,
        action: typeof evt.action === "string" ? evt.action : undefined,
        duration_ms: typeof evt.duration_ms === "number" ? evt.duration_ms : undefined,
        correlation_id: typeof evt.correlation_id === "string" ? evt.correlation_id : undefined,
        detail_keys: detailKeys,
        redaction_applied: typeof evt.redaction_applied === "boolean" ? evt.redaction_applied : undefined,
        schema_version: typeof evt.schema_version === "number" ? evt.schema_version : undefined,
      };
      // Apply filters.
      if (severityFilter && (out.severity ?? "info").toLowerCase() !== severityFilter) continue;
      if (eventTypeFilter && !(out.event_type ?? "").includes(eventTypeFilter)) continue;
      events.push(out);
    } catch (e) {
      broken++;
      events.push({
        __raw: trimmed.slice(0, 300),
        __parse_error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const sliced = tail && tail > 0 ? events.slice(-tail) : events;
  return { events: sliced, totalLines, parsed, broken };
}

export async function GET(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const session = url.searchParams.get("session");
  if (!session) {
    return NextResponse.json({ error: "session required" }, { status: 400 });
  }
  // Validate filename — only allow alphanumeric + dash + underscore + dot.
  if (!/^[\w.\-]+\.axolog$/.test(session)) {
    return NextResponse.json({ error: "invalid session filename" }, { status: 400 });
  }
  // No path traversal — session must be a bare filename.
  if (session.includes("/") || session.includes("\\") || session.includes("..")) {
    return NextResponse.json({ error: "path traversal denied" }, { status: 400 });
  }
  const dir = getDiagLogDir();
  const filePath = path.join(dir, session);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "session not found", path: filePath }, { status: 404 });
  }
  const tail = url.searchParams.get("tail");
  const tailN = tail ? parseInt(tail, 10) : 200;
  const severity = url.searchParams.get("severity")?.toLowerCase();
  const eventType = url.searchParams.get("event_type") ?? undefined;

  const { events, totalLines, parsed, broken } = await parseFile(filePath, tailN, severity, eventType);
  return NextResponse.json({ session, events, totalLines, parsed, broken });
}
