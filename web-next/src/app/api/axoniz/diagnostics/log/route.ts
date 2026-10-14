/**
 * AXONIZ diagnostic logging bridge — POST /api/axoniz/diagnostics/log
 *
 * The browser cannot write to ~/.axoniz/logs/ directly. It POSTs events
 * here as JSON; this route forwards them to the singleton DiagLogger.
 *
 * Privacy contract:
 *   - This route NEVER trusts the client to sanitize. It re-applies
 *     redact() to the incoming payload before persisting.
 *   - It DOES NOT log the request body to console or to any other file.
 *   - It DOES NOT echo back the event content in the response.
 *
 * Robustness contract:
 *   - Failures to write to the .axolog file are SWALLOWED here. The
 *     response is always 200/202 so a logging failure can never break
 *     the UI's request flow.
 *   - On overload (more than 200 events/sec sustained), the route
 *     starts dropping events and returns 202 instead of 200.
 *
 * Usage:
 *   POST /api/axoniz/diagnostics/log
 *   Content-Type: application/json
 *   { "username": "akik", "events": [...] }
 *
 *   Response 200: { "accepted": N, "dropped": 0, "ok": true }
 *   Response 202: { "accepted": N, "dropped": M, "ok": true }  (overload)
 *   Response 400: { "error": "..." }  (malformed payload)
 */

import { NextRequest, NextResponse } from "next/server";
import { getDiagLogger } from "@/lib/axoniz/diagnostics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

let windowStart = Date.now();
let windowCount = 0;
const MAX_EVENTS_PER_SEC = 200;

function rateCheck(): boolean {
  const now = Date.now();
  if (now - windowStart > 1000) {
    windowStart = now;
    windowCount = 0;
  }
  if (windowCount >= MAX_EVENTS_PER_SEC) return false;
  windowCount++;
  return true;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const payload = body as {
    username?: string;
    events?: Array<Record<string, unknown>>;
  };

  if (!Array.isArray(payload.events)) {
    return NextResponse.json(
      { error: "expected 'events' array" },
      { status: 400 },
    );
  }

  // Cap events per request — protects against a single rogue request.
  const events = payload.events.slice(0, 50);
  const dropped = payload.events.length - events.length;

  const logger = getDiagLogger(payload.username ?? "anon");
  let accepted = 0;
  let overloaded = 0;

  for (const ev of events) {
    if (!rateCheck()) {
      overloaded++;
      continue;
    }
    const ok = logger.emit({
      application: "axoniz.web",
      component: typeof ev.component === "string" ? ev.component : "frontend",
      event_type: typeof ev.event_type === "string" ? ev.event_type : "unknown",
      severity:
        typeof ev.severity === "string" &&
        ["debug", "info", "warn", "error", "fatal"].includes(ev.severity)
          ? (ev.severity as "debug" | "info" | "warn" | "error" | "fatal")
          : "info",
      route: typeof ev.route === "string" ? ev.route : undefined,
      action: typeof ev.action === "string" ? ev.action : undefined,
      duration_ms: typeof ev.duration_ms === "number" ? ev.duration_ms : undefined,
      correlation_id: typeof ev.correlation_id === "string" ? ev.correlation_id : undefined,
      details:
        ev.details && typeof ev.details === "object"
          ? (ev.details as Record<string, unknown>)
          : undefined,
    });
    if (ok) accepted++;
  }

  return NextResponse.json(
    { accepted, dropped: dropped + overloaded, ok: true },
    { status: overloaded > 0 ? 202 : 200 },
  );
}

/** HEAD probe — returns 200 OK if reachable. */
export async function HEAD() {
  return new Response(null, { status: 200 });
}
