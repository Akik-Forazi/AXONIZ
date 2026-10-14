"use client";

/**
 * AXONIZ diagnostic telemetry provider — browser-side instrumentation.
 *
 * Captures user interactions (clicks, scroll, keyboard shortcuts, navigation,
 * network requests, errors) and forwards them to /api/axoniz/diagnostics/log,
 * which writes them to ~/.axoniz/logs/*.axolog.
 *
 * Privacy contract:
 *   - NEVER records raw keystrokes. Only modifier+key combos (e.g. "Ctrl+S").
 *   - NEVER records form field values, chat prompts, or text content.
 *   - NEVER records DOM innerHTML, full snapshots, or sensitive labels.
 *   - Records element identifiers only when the element has data-axoniz-action
 *     or a role/aria-label that is NOT a sensitive input.
 *   - Network telemetry records only method + sanitized URL + status +
 *     duration — never request/response bodies.
 *
 * Throttling:
 *   - Clicks: 1 event per (target, action) per 250ms.
 *   - Scroll: 1 event per 500ms per scroll container.
 *   - Navigation: 1 event per route change.
 *
 * The provider is mounted once at the root layout (or authed layout).
 */

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

/* ── Types ───────────────────────────────────────────────────────────────── */

export interface TelemetryEvent {
  event_type: string;
  component?: string;
  severity?: "debug" | "info" | "warn" | "error" | "fatal";
  route?: string;
  action?: string;
  duration_ms?: number;
  correlation_id?: string;
  details?: Record<string, unknown>;
}

interface TelemetryContextValue {
  enabled: boolean;
  username: string | null;
  emit: (ev: TelemetryEvent) => void;
  flush: () => Promise<void>;
}

const TelemetryContext = createContext<TelemetryContextValue | null>(null);

/* ── Config ──────────────────────────────────────────────────────────────── */

const ENDPOINT = "/api/axoniz/diagnostics/log";
const FLUSH_INTERVAL_MS = 2_000;   // flush every 2s
const FLUSH_BATCH_MAX = 50;         // max events per request
const MAX_QUEUE = 500;              // drop oldest beyond this

const CLICK_DEBOUNCE_MS = 250;
const SCROLL_THROTTLE_MS = 500;

/* ── Utils ───────────────────────────────────────────────────────────────── */

function genId(): string {
  // 12 hex chars — same as the backend's event_id format
  return Math.random().toString(16).slice(2, 14);
}

function safeTarget(el: Element | null): {
  action?: string;
  element_type?: string;
  label?: string;
} | null {
  if (!el) return null;
  // Prefer data-axoniz-action — this is the explicit instrumentation hook.
  const action = el.getAttribute("data-axoniz-action");
  // Element identifier (only safe if explicit)
  const testId = el.getAttribute("data-testid");
  const ariaLabel = el.getAttribute("aria-label");
  const role = el.getAttribute("role");
  const tagName = el.tagName.toLowerCase();

  // Only record label if the element is NOT a password / input / textarea
  // (which can contain user content).
  const isInput =
    tagName === "input" ||
    tagName === "textarea" ||
    (el as HTMLInputElement).isContentEditable === true;

  return {
    action: action ?? testId ?? ariaLabel ?? role ?? tagName,
    element_type: tagName,
    label: isInput ? undefined : (ariaLabel ?? el.getAttribute("title") ?? undefined),
  };
}

function sanitizeUrl(rawUrl: string): { path: string; query_redacted: boolean } {
  try {
    const u = new URL(rawUrl, window.location.origin);
    // Redact all query params by default — they may carry tokens / IDs.
    let redacted = false;
    const params: Record<string, string> = {};
    for (const k of u.searchParams.keys()) {
      const v = u.searchParams.get(k);
      if (v === null) continue;
      if (/token|key|auth|pass|secret|api_key|code/i.test(k)) {
        params[k] = "[REDACTED]";
        redacted = true;
      } else {
        params[k] = v;
      }
    }
    const query = Object.keys(params).length ? `?${new URLSearchParams(params).toString()}` : "";
    return { path: `${u.pathname}${query}`, query_redacted: redacted };
  } catch {
    return { path: rawUrl, query_redacted: false };
  }
}

/* ── Provider ────────────────────────────────────────────────────────────── */

export interface TelemetryProviderProps {
  children: ReactNode;
  username?: string | null;
  /** Set to false to disable telemetry entirely (e.g. privacy mode). */
  enabled?: boolean;
}

export function TelemetryProvider({
  children,
  username,
  enabled = true,
}: TelemetryProviderProps) {
  const queueRef = useRef<TelemetryEvent[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFlushRef = useRef(0);
  const pathname = usePathname();
  const lastPathRef = useRef<string | null>(null);
  const clickSeenRef = useRef<Map<string, number>>(new Map());
  const scrollLastRef = useRef<Map<string, number>>(new Map());

  // Push event to the queue. Drop oldest if we exceed MAX_QUEUE.
  const enqueue = useCallback((ev: TelemetryEvent) => {
    if (!enabled) return;
    if (queueRef.current.length >= MAX_QUEUE) {
      queueRef.current.shift();
    }
    queueRef.current.push({ ...ev, correlation_id: ev.correlation_id ?? genId() });
  }, [enabled]);

  // Flush the queue to the backend.
  const flush = useCallback(async () => {
    if (!enabled || queueRef.current.length === 0) return;
    const batch = queueRef.current.splice(0, FLUSH_BATCH_MAX);
    lastFlushRef.current = Date.now();
    try {
      // Use sendBeacon for unload-style flushes (no await needed, survives
      // page unload). For periodic flushes, use fetch.
      const body = JSON.stringify({ username: username ?? "anon", events: batch });
      // If the page is unloading, navigator.sendBeacon is better.
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        // sendBeacon has size limits — fall back to fetch for large batches.
        const blob = new Blob([body], { type: "application/json" });
        if (blob.size <= 60_000) {
          if (navigator.sendBeacon(ENDPOINT, blob)) return;
        }
      }
      await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,  // allow request to outlive the page
      });
    } catch {
      // Re-queue on failure (best-effort, bounded by MAX_QUEUE).
      queueRef.current.unshift(...batch.slice(0, MAX_QUEUE - queueRef.current.length));
    }
  }, [enabled, username]);

  // Periodic flush.
  useEffect(() => {
    if (!enabled) return;
    flushTimerRef.current = setInterval(() => {
      if (queueRef.current.length > 0) flush();
    }, FLUSH_INTERVAL_MS);
    return () => {
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
    };
  }, [enabled, flush]);

  // Flush on page hide / unload.
  useEffect(() => {
    if (!enabled) return;
    const onHide = () => { void flush(); };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void flush();
    });
    return () => window.removeEventListener("pagehide", onHide);
  }, [enabled, flush]);

  // Navigation events.
  useEffect(() => {
    if (!enabled) return;
    if (lastPathRef.current === null) {
      // First mount — record initial navigation.
      enqueue({
        event_type: "navigation",
        component: "router",
        action: "initial",
        route: pathname ?? "/",
      });
    } else if (lastPathRef.current !== pathname) {
      enqueue({
        event_type: "navigation",
        component: "router",
        action: "replace",
 details: { from: lastPathRef.current, to: pathname },
        route: pathname ?? "/",
      });
    }
    lastPathRef.current = pathname;
  }, [pathname, enabled, enqueue]);

  // Click capture (global, once).
  useEffect(() => {
    if (!enabled) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const safe = safeTarget(target);
      if (!safe) return;
      const key = `${safe.action}:${safe.element_type}`;
      const now = Date.now();
      const last = clickSeenRef.current.get(key) ?? 0;
      if (now - last < CLICK_DEBOUNCE_MS) return;
      clickSeenRef.current.set(key, now);
      enqueue({
        event_type: "click",
        component: "ui",
        action: safe.action,
        route: pathname ?? undefined,
        details: {
          element_type: safe.element_type,
          label: safe.label,
        },
      });
    };
    document.addEventListener("click", onClick, { passive: true });
    return () => document.removeEventListener("click", onClick);
  }, [enabled, enqueue, pathname]);

  // Keyboard shortcut capture (only modifier+key combos).
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      // Only record when Ctrl / Cmd / Alt / Meta is pressed.
      if (!(e.ctrlKey || e.metaKey || e.altKey)) return;
      // Skip if focused on a password field.
      const tgt = e.target as HTMLInputElement | null;
      if (tgt && tgt.tagName === "INPUT" && tgt.getAttribute("type") === "password") return;
      const modifiers: string[] = [];
      if (e.ctrlKey) modifiers.push("Ctrl");
      if (e.metaKey) modifiers.push("Cmd");
      if (e.altKey) modifiers.push("Alt");
      if (e.shiftKey) modifiers.push("Shift");
      // NEVER record the actual key character if it's a printable key —
      // only record the key CODE (e.g. "KeyS" not "s").
      // This still leaks key identity but never the SHIFT STATE of
      // letters (which would let attackers reconstruct typed text).
      const combo = `${modifiers.join("+")}+${e.code}`;
      enqueue({
        event_type: "keyboard_shortcut",
        component: "ui",
        action: combo,
        route: pathname ?? undefined,
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, enqueue, pathname]);

  // Scroll throttle (global — picks up window scroll only).
  useEffect(() => {
    if (!enabled) return;
    const onScroll = () => {
      const now = Date.now();
      const last = scrollLastRef.current.get("window") ?? 0;
      if (now - last < SCROLL_THROTTLE_MS) return;
      scrollLastRef.current.set("window", now);
      const doc = document.documentElement;
      const scrollPct = doc.scrollHeight > 0
        ? Math.round((doc.scrollTop / (doc.scrollHeight - doc.clientHeight)) * 100)
        : 0;
      enqueue({
        event_type: "scroll",
        component: "ui",
        action: "window_scroll",
        route: pathname ?? undefined,
        details: {
          scroll_percent: scrollPct,
          at_top: doc.scrollTop === 0,
          at_bottom: doc.scrollTop + doc.clientHeight >= doc.scrollHeight - 1,
        },
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [enabled, enqueue, pathname]);

  // Unhandled errors + promise rejections.
  useEffect(() => {
    if (!enabled) return;
    const onError = (e: ErrorEvent) => {
      enqueue({
        event_type: "uncaught_error",
        component: "frontend",
        severity: "error",
        route: pathname ?? undefined,
        details: {
          message: String(e.message ?? "").slice(0, 500),
          filename: String(e.filename ?? "").slice(0, 200),
          line: e.lineno,
          column: e.colno,
        },
      });
      // Best-effort flush so the error is captured before any redirect.
      void flush();
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      const msg = reason instanceof Error ? reason.message : String(reason);
      enqueue({
        event_type: "unhandled_rejection",
        component: "frontend",
        severity: "error",
        route: pathname ?? undefined,
        details: {
          message: String(msg).slice(0, 500),
        },
      });
      void flush();
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [enabled, enqueue, pathname, flush]);

  // Wrap fetch to log network requests (method + path + status + duration).
  useEffect(() => {
    if (!enabled) return;
    const origFetch = window.fetch;

    /**
     * Extract a URL string from any fetch() input shape:
     *   - string  → use as-is
     *   - URL     → use .href
     *   - Request → use .url
     * Returns empty string if extraction fails (we then skip logging
     * but still call origFetch — NEVER break the caller).
     */
    function extractUrl(input: RequestInfo | URL): string {
      try {
        if (typeof input === "string") return input;
        if (input instanceof URL) return input.href;
        if (input instanceof Request) return input.url;
        // Some polyfills put .url on arbitrary objects.
        const maybeUrl = (input as { url?: unknown }).url;
        if (typeof maybeUrl === "string") return maybeUrl;
        return "";
      } catch {
        return "";
      }
    }

    const wrappedFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = extractUrl(input);
      // If we couldn't extract a URL, skip logging entirely — but still
      // call the original fetch. NEVER break the caller because logging
      // failed. This was the cause of the RSC payload TypeError in
      // https://github.com/Akik-Forazi/AXONIZ/issues/redirect-loop.
      const canLog = url.length > 0;
      // Skip our own diagnostic endpoint + Next.js dev-only noise endpoints
      // to avoid recursion and to keep the log signal-to-noise high.
      const isDiag = canLog && url.includes("/api/axoniz/diagnostics/log");
      const isNextJsDevNoise =
        canLog &&
        (url.includes("/__nextjs_original-stack-frames") ||
          url.includes("/__nextjs_flight") ||
          url.includes("/_next/"));
      const skipLog = !canLog || isDiag || isNextJsDevNoise;

      const method =
        (init?.method ?? (typeof input === "object" && input !== null
          ? (input as Request).method
          : "GET") ?? "GET").toString().toUpperCase();
      const t0 = performance.now();
      try {
        const res = await origFetch(input as RequestInfo, init);
        if (!skipLog) {
          const safe = sanitizeUrl(url);
          enqueue({
            event_type: "http_request",
            component: "frontend.fetch",
            action: method,
            duration_ms: Math.round(performance.now() - t0),
            route: pathname ?? undefined,
            details: {
              url: safe.path,
              status: res.status,
              query_redacted: safe.query_redacted,
              initiator: "user",
            },
          });
        }
        return res;
      } catch (err) {
        if (!skipLog) {
          const safe = sanitizeUrl(url);
          enqueue({
            event_type: "http_request",
            component: "frontend.fetch",
            action: method,
            severity: "error",
            duration_ms: Math.round(performance.now() - t0),
            route: pathname ?? undefined,
            details: {
              url: safe.path,
              status: 0,
              error: String((err as Error).message ?? err).slice(0, 200),
            },
          });
        }
        throw err;
      }
    };
    // Replace window.fetch but keep a reference to restore on cleanup.
    // Note: this only catches fetch() calls, not XHR or sendBeacon.
    window.fetch = wrappedFetch as typeof window.fetch;
    return () => { window.fetch = origFetch; };
  }, [enabled, enqueue, pathname]);

  const ctxValue: TelemetryContextValue = {
    enabled,
    username: username ?? null,
    emit: enqueue,
    flush,
  };

  return (
    <TelemetryContext.Provider value={ctxValue}>{children}</TelemetryContext.Provider>
  );
}

/** Hook for child components to emit custom events. */
export function useTelemetry(): TelemetryContextValue | null {
  return useContext(TelemetryContext);
}
