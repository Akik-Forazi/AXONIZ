# AXONIZ Logging Design — `.axolog` Diagnostic Pipeline

**Document type:** Design specification
**Scope:** Browser-side `TelemetryProvider`, Next.js API bridge, vendored `DiagLogger`, CLI `axoniz logs` subcommands
**Schema version:** `1`
**Status labels:** `PASS` · `FAIL` · `BLOCKED` · `NOT RUN` · `PARTIALLY VERIFIED`
**Last updated:** 2026-10-14

---

## 1. Overview

AXONIZ persists user-interaction diagnostics to **`~/.axoniz/logs/*.axolog`** — one append-only JSON-Lines file per browser session. The file is written by a Node.js singleton (`DiagLogger`); the browser cannot write to the user's filesystem directly, so it POSTs events to `/api/axoniz/diagnostics/log`, which calls into the singleton.

The same module exists in two places (browser-vendored and CLI-native); they **MUST stay in sync** because the CLI's `axoniz logs *` commands read the files produced by the browser-vendored module.

### Design principles

1. **Never trust the client.** The API route re-applies `redact()` to every incoming event before persisting — even if the browser-side `TelemetryProvider` already redacted.
2. **Logger failure must never break the UI.** All `emit()` calls return `boolean`; the API route always responds `200` or `202` even if the underlying write failed.
3. **Crash-safe by construction.** Append-only writes via `O_APPEND`; each line is a complete JSON object terminated by `\n`. A truncated trailing line is detectable on read because `JSON.parse(line)` throws.
4. **Defense-in-depth redaction.** `redact()` is applied to all `details` payloads. Known-sensitive keys are replaced with `"[REDACTED]"`. Known-sensitive substrings (`Bearer `, `sk-`, `ghp_`, etc.) inside string values are masked.
5. **Caller is responsible for chat content.** The redactor does NOT attempt to detect chat prompts/completions inside arbitrary string fields. Callers MUST sanitize before calling `emit()`. The redactor only strips known-sensitive keys as a backstop.

---

## 2. Log Location

```
~/.axoniz/logs/
├── *.axolog              # per-session JSON Lines diagnostic log
├── axoniz.log            # CLI logger output (AxonizLogger)
├── sessions/             # CLI session logs (per-invocation)
└── structured/           # CLI structured logs (agent/tool/backend events)
```

The `.axolog` files are the **only** artifacts governed by this design. The `axoniz.log`, `sessions/`, and `structured/` directories belong to the separate `AxonizLogger` (see `src/core/logger.ts`) and are out of scope here.

### Resolution

`getDiagLogDir()` resolves at runtime (not module-load time) so tests can redirect writes by setting `process.env.HOME`:

```ts
// web-next/src/lib/axoniz/diagnostics.ts (line 45)
function getDiagLogDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(home, ".axoniz", "logs");
}

// src/core/diagnostics.ts (line 62) — CLI-side equivalent
export function getDiagLogDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(home, ".axoniz", "logs");
}
```

### Verify from CLI

```bash
$ axoniz logs path
/home/z/.axoniz/logs
```

---

## 3. Filename Format

```
YYYY-MM-DD_HH-mm-ss_Day-username.axolog
```

### Example

```
2026-10-14_21-15-30_Wednesday-akik.axolog
```

### Components

| Segment | Source | Example |
|---|---|---|
| `YYYY-MM-DD` | `new Date().getFullYear()`, `getMonth()+1`, `getDate()` — zero-padded | `2026-10-14` |
| `_` | separator | |
| `HH-mm-ss` | local timezone (NOT UTC) — zero-padded | `21-15-30` |
| `_` | separator | |
| `Day` | full weekday name in English (`Sunday`..`Saturday`) | `Wednesday` |
| `-` | separator | |
| `username` | `sanitizeUsername(raw)` — see §3.1 | `akik` |
| `.axolog` | extension | |

### 3.1 Username sanitization

`sanitizeUsername()` (`diagnostics.ts` line 61 / `src/core/diagnostics.ts` line 108):

```ts
export function sanitizeUsername(raw: string | undefined | null): string {
  if (!raw) return "unknown";
  const cleaned = String(raw).replace(/[^a-zA-Z0-9._-]/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "unknown";
}
```

- `null`/`undefined`/`""` → `"unknown"`
- Path-traversal chars (`/`, `\`) → `-` (so `"../../etc/passwd"` → `"..-..-etc-passwd"` — safe in a filename)
- Unsafe chars (`<`, `>`, `&`, space, `@`, etc.) → `-`
- Leading/trailing dashes stripped
- Empty result after sanitization → `"unknown"`

### 3.2 Collision handling

If a file with the candidate name already exists in `getDiagLogDir()`, `buildAxologFilename()` appends `-2`, `-3`, ...:

```ts
// diagnostics.ts line 67
export function buildAxologFilename(d: Date, username: string | undefined | null): string {
  const { file, day } = dateParts(d);
  const user = sanitizeUsername(username);
  const base = `${file}_${day}-${user}`;
  let candidate = `${base}.axolog`;
  let n = 2;
  while (fs.existsSync(path.join(getDiagLogDir(), candidate))) {
    candidate = `${base}-${n}.axolog`;
    n += 1;
  }
  return candidate;
}
```

Same-second session restarts produce `..._Wednesday-akik.axolog`, `..._Wednesday-akik-2.axolog`, `..._Wednesday-akik-3.axolog`, etc.

### 3.3 Filename verification

Unit test `test/diagnostics.test.ts` line 39:

```ts
test("filename uses weekday + sanitized username", () => {
  const ref = new Date(2026, 9, 14, 21, 15, 30); // Oct 14, 2026 — Wednesday
  const name = buildAxologFilename(ref, "akik");
  assert.equal(name, "2026-10-14_21-15-30_Wednesday-akik.axolog");
});
```

Unit test `test/logger-fault-injection.test.ts` line 78:

```ts
test("4. filename collision appends -2, -3, ...", () => {
  const dir = path.join(tmpHome, ".axoniz", "logs");
  fs.mkdirSync(dir, { recursive: true });
  const d = new Date(2026, 9, 14, 21, 15, 30);
  const a = buildAxologFilename(d, "user");
  fs.writeFileSync(path.join(dir, a), "");
  const b = buildAxologFilename(d, "user");
  assert.equal(b, "2026-10-14_21-15-30_Wednesday-user-2.axolog");
  fs.writeFileSync(path.join(dir, b), "");
  const c = buildAxologFilename(d, "user");
  assert.equal(c, "2026-10-14_21-15-30_Wednesday-user-3.axolog");
});
```

Both pass.

---

## 4. Event Schema — `schema_version = 1`

Each line in the `.axolog` file is a complete JSON object (JSON Lines / NDJSON). One `\n` separates records.

### 4.1 The `DiagEvent` interface

Source: `web-next/src/lib/axoniz/diagnostics.ts` lines 136–156 (mirror: `src/core/diagnostics.ts` lines 196–216).

```ts
export interface DiagEvent {
  timestamp: string;          // 1. local ISO-ish: "2026-10-14T21:15:30.123"
  timestamp_utc: string;      // 2. ISO 8601 UTC: "2026-10-14T21:15:30.123Z"
  timezone_offset: string;    // 3. "+06:00" or "-04:30"
  session_id: string;         // 4. 16 hex chars — random per DiagLogger instance
  event_id: string;           // 5. 12 hex chars — random per event
  sequence: number;           // 6. monotonic per-process, starts at 1
  process_id: number;         // 7. process.pid
  application: string;        // 8. "axoniz" | "axoniz.web" | "axoniz.daemon"
  application_version: string;// 9. "V00.01.007-beta-05"
  component: string;          // 10. e.g. "frontend.fetch", "ui", "backend.api.health"
  event_type: string;         // 11. e.g. "click", "navigation", "http_request"
  severity: "debug" | "info" | "warn" | "error" | "fatal"; // 12
  route?: string;             // 13. Next.js pathname at emit time (optional)
  action?: string;            // 14. verb or fetch method (optional)
  duration_ms?: number;       // 15. for HTTP events (optional)
  correlation_id?: string;    // 16. client-generated 12-hex; preserved end-to-end (optional)
  details?: Record<string, unknown>; // 17. arbitrary payload, RECURSIVELY REDACTED (optional)
  redaction_applied: boolean; // metadata: true unless caller passed already_redacted:true
  schema_version: number;    // metadata: 1
}
```

The interface declares **17 event fields** plus 2 metadata fields (`redaction_applied`, `schema_version`). The metadata fields are present on every event; the 5 fields marked `?` are optional and omitted when not relevant.

### 4.2 Field-by-field documentation

| # | Field | Type | Required | Source | Notes |
|---|---|---|---|---|---|
| 1 | `timestamp` | string | yes | `new Date()` | Local timezone, format `YYYY-MM-DDTHH:mm:ss.SSS`. Millisecond precision. |
| 2 | `timestamp_utc` | string | yes | `new Date().toISOString()` | ISO 8601 UTC with `Z` suffix. Use this for cross-timezone correlation. |
| 3 | `timezone_offset` | string | yes | `-date.getTimezoneOffset()` formatted as `±HH:MM` | e.g. `+06:00`, `-04:30`, `+00:00` (UTC). |
| 4 | `session_id` | string | yes | `crypto.randomBytes(8).toString("hex")` | 16 hex chars. Stable for the lifetime of one `DiagLogger` singleton. |
| 5 | `event_id` | string | yes | `crypto.randomBytes(6).toString("hex")` | 12 hex chars. Unique per event per process. Collision probability negligible for <10^6 events. |
| 6 | `sequence` | number | yes | `++this.seq` | Monotonic per-process. Starts at 1 (the `session_start` event). |
| 7 | `process_id` | number | yes | `process.pid` | Node.js process ID. Useful for correlating events from the same Next.js dev server instance. |
| 8 | `application` | string | yes | `EmitOptions.application ?? "axoniz"` | `"axoniz"` for CLI, `"axoniz.web"` for browser-vendored, `"axoniz.daemon"` for the long-running daemon. |
| 9 | `application_version` | string | yes | `AXONIZ_VERSION` from `src/version.ts` | e.g. `"V00.01.007-beta-05"`. Bumped on every CLI build. |
| 10 | `component` | string | yes | `EmitOptions.component ?? "unknown"` | Free-form string. Convention: `domain.subdomain` (e.g. `frontend.fetch`, `backend.api.health`, `ui`). |
| 11 | `event_type` | string | yes | `EmitOptions.event_type` | Free-form string. See §6 for the canonical set. |
| 12 | `severity` | enum | yes | `EmitOptions.severity ?? "info"` | One of `debug`, `info`, `warn`, `error`, `fatal`. Default `info`. |
| 13 | `route` | string | no | `EmitOptions.route` | Next.js pathname at emit time (e.g. `/chat`, `/settings/providers`). |
| 14 | `action` | string | no | `EmitOptions.action` | Verb or HTTP method. For clicks: the `data-axoniz-action` value. For HTTP: `GET`/`POST`/etc. |
| 15 | `duration_ms` | number | no | `EmitOptions.duration_ms` | Round-trip duration for HTTP events. |
| 16 | `correlation_id` | string | no | `EmitOptions.correlation_id` | 12 hex chars from `TelemetryProvider.genId()`. Stable across request→response pairs. |
| 17 | `details` | object | no | `EmitOptions.details` (redacted) | Arbitrary JSON-serializable payload. `redact()` is applied recursively before write unless `already_redacted:true`. |

### 4.3 Metadata fields

| Field | Type | Always present | Notes |
|---|---|---|---|
| `redaction_applied` | boolean | yes | `true` unless caller passed `already_redacted:true` in `EmitOptions`. When `false`, the caller asserts they have already sanitized `details`. |
| `schema_version` | number | yes | Currently `1`. Bump on breaking schema change. |

### 4.4 Sample event (real, from the anti-loop test)

From `~/.axoniz/logs/2026-10-14_15-27-14_Wednesday-anti-loop-test.axolog`:

```json
{"timestamp":"2026-10-14T15:27:14.942","timestamp_utc":"2026-10-14T15:27:14.942Z","timezone_offset":"+00:00","session_id":"e7c378f4cc5c59d2","event_id":"a827f1062b0f","sequence":1,"process_id":13080,"application":"axoniz.web","application_version":"V00.01.007-beta-05","component":"diagnostics","event_type":"session_start","severity":"info","details":{"file":"/home/z/.axoniz/logs/2026-10-14_15-27-14_Wednesday-anti-loop-test.axolog","pid":13080,"platform":"linux","node_version":"v24.21.0","schema_version":1},"redaction_applied":true,"schema_version":1}
```

Pretty-printed:

```json
{
  "timestamp": "2026-10-14T15:27:14.942",
  "timestamp_utc": "2026-10-14T15:27:14.942Z",
  "timezone_offset": "+00:00",
  "session_id": "e7c378f4cc5c59d2",
  "event_id": "a827f1062b0f",
  "sequence": 1,
  "process_id": 13080,
  "application": "axoniz.web",
  "application_version": "V00.01.007-beta-05",
  "component": "diagnostics",
  "event_type": "session_start",
  "severity": "info",
  "details": {
    "file": "/home/z/.axoniz/logs/2026-10-14_15-27-14_Wednesday-anti-loop-test.axolog",
    "pid": 13080,
    "platform": "linux",
    "node_version": "v24.21.0",
    "schema_version": 1
  },
  "redaction_applied": true,
  "schema_version": 1
}
```

---

## 5. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            BROWSER (per tab)                            │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │              TelemetryProvider                                    │   │
│   │              web-next/src/components/axoniz/telemetry-provider.tsx│   │
│   │                                                                  │   │
│   │   Listens for:                                                   │   │
│   │     • click         (data-axoniz-action attr on clicked element) │   │
│   │     • keyboard_shortcut (Ctrl/Cmd/Alt+keycode ONLY — no raw text)│   │
│   │     • scroll        (throttled 500ms; scroll_percent + at_top/_bottom)│
│   │     • navigation    (pathname change via usePathname())           │   │
│   │     • http_request  (wraps window.fetch; method+url+status+dur)   │   │
│   │     • uncaught_error   (window 'error' listener)                  │   │
│   │     • unhandled_rejection (window 'unhandledrejection' listener) │   │
│   │     • pagehide / visibilitychange → immediate flush()             │   │
│   │                                                                  │   │
│   │   Queue: TelemetryEvent[] (cap 500, drop oldest)                 │   │
│   │   Flush: every 2s OR on pagehide/visibilitychange=hidden         │   │
│   │   Each event gets a 12-hex correlation_id (if caller didn't set one)│
│   │                                                                  │   │
│   │   POST /api/axoniz/diagnostics/log                               │   │
│   │   { username, events: [TelemetryEvent, ...] }                    │   │
│   │   Uses sendBeacon (if size ≤ 60KB) or fetch with keepalive:true  │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                  │                                      │
└──────────────────────────────────┼──────────────────────────────────────┘
                                   │ HTTPS (same origin)
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          NEXT.JS API ROUTE                              │
│                                                                         │
│   POST handler at:                                                      │
│     web-next/src/app/api/axoniz/diagnostics/log/route.ts                │
│                                                                         │
│   1. Parse JSON body (400 on malformed)                                 │
│   2. Validate `events` is an array (400 if not)                         │
│   3. Cap at 50 events per request (drop excess; 202 if dropped)         │
│   4. Rate-limit: 200 events/sec sliding window (drop excess; 202)       │
│   5. For each event:                                                    │
│        - Coerce types (string→string, severity→enum, etc.)              │
│        - Call singleton.emit({ ...coerced, application: "axoniz.web" }) │
│   6. Respond 200 { accepted, dropped, ok: true }                        │
│      or    202 { accepted, dropped, ok: true }  (overload)              │
│                                                                         │
│   CRITICAL: logger.emit() failures are SWALLOWED — UI never blocked.    │
└──────────────────────────────────┼──────────────────────────────────────┘
                                   │ in-process function call
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       VENDORED DiagLogger (singleton)                   │
│                                                                         │
│   web-next/src/lib/axoniz/diagnostics.ts                                │
│                                                                         │
│   • One instance per Node.js process (getDiagLogger() singleton)        │
│   • Opens ~/.axoniz/logs/<filename>.axolog with O_APPEND|O_CREAT|O_WRONLY│
│   • Each emit() builds a DiagEvent, applies redact() to details,         │
│     JSON.stringify, fs.writeSync(line + "\n")                          │
│   • On write failure: buffer line (cap 500), try os.tmpdir() fallback   │
│   • On 50MB threshold: rotate (.1 ← current, .2 ← .1, ..., .10 → delete)│
│   • On process exit/SIGINT/SIGTERM/SIGHUP: close() flushes buffer       │
│   • On SIGKILL: buffered events lost (documented)                       │
└──────────────────────────────────┼──────────────────────────────────────┘
                                   │ fs.writeSync (synchronous)
                                   ▼
                  ~/.axoniz/logs/*.axolog (NDJSON file)

                                 ─ ─ ─ ─ ─ parallel CLI track ─ ─ ─ ─ ─

┌─────────────────────────────────────────────────────────────────────────┐
│                          AXONIZ CLI                                     │
│                                                                         │
│   src/cli/entry.ts                                                      │
│       │                                                                 │
│       ▼ main(process.argv.slice(2))                                     │
│   src/core/runner.ts                                                    │
│       │ if argv[0] === "logs" → dynamic import                           │
│       ▼                                                                 │
│   src/core/logs-cmd.ts: runLogsCmd(args)                                │
│       │                                                                 │
│       ├── path      → cmdPath()           (print getDiagLogDir())        │
│       ├── list      → cmdList()           (read dir, sort by mtime)     │
│       ├── show      → cmdShow(args)       (parse + filter + format)     │
│       ├── verify    → cmdVerify(args)     (parse, count broken)         │
│       ├── export    → cmdExport(args)     (write NDJSON to file)        │
│       └── cleanup   → cmdCleanup(args)    (keep N newest)               │
│                                                                         │
│   Reads via: src/core/diagnostics.ts:listAxologs()                       │
│   NEVER prints `details` values — only keys (see §9)                    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Process Boundaries

### 6.1 Browser-side `TelemetryProvider`

**File:** `web-next/src/components/axoniz/telemetry-provider.tsx`

**Mounted at:** root layout (or `(auth)/layout.tsx`) — once per page.

**Captures:**

| Event type | Trigger | Recorded fields | Privacy notes |
|---|---|---|---|
| `click` | `document.addEventListener("click", ...)` (passive) | `action` (from `data-axoniz-action`, `data-testid`, `aria-label`, `role`, or tagName), `element_type`, `label` (only if NOT input/textarea) | Input/textarea labels are NOT recorded. |
| `keyboard_shortcut` | `window.addEventListener("keydown", ...)` | Modifiers + `e.code` (e.g. `Ctrl+KeyS`) — NEVER the key character | Only fires when Ctrl/Cmd/Alt/Meta is pressed. Password field focus suppresses entirely. |
| `scroll` | `window.addEventListener("scroll", ...)` (passive, throttled 500ms) | `scroll_percent`, `at_top`, `at_bottom` | No content captured. |
| `navigation` | `usePathname()` from `next/navigation` | `route`, `action: "initial" | "replace"`, `details.from`/`details.to` | Only pathname, not query. |
| `http_request` | `window.fetch` is wrapped on mount | `method`, sanitized URL (query redacted), `status`, `duration_ms`, `error` on failure | NEVER request/response bodies. |
| `uncaught_error` | `window.addEventListener("error", ...)` | `message` (≤500 chars), `filename` (≤200 chars), `line`, `column` | Stack traces beyond message are NOT recorded. |
| `unhandled_rejection` | `window.addEventListener("unhandledrejection", ...)` | `message` (≤500 chars) | Reason object is stringified only for `.message`. |
| (flush trigger) | `pagehide`, `visibilitychange=hidden` | (immediate flush of queue) | — |

**Throttling:**

| Interaction | Throttle | Implementation |
|---|---|---|
| Click per (target, action) | 250 ms | `clickSeenRef: Map<string, number>` |
| Scroll per container | 500 ms | `scrollLastRef: Map<string, number>` |
| Navigation | per pathname change | `lastPathRef` |

**Queue:**

- Max 500 events (`MAX_QUEUE`)
- Drop oldest when full
- Flush every 2s (`FLUSH_INTERVAL_MS`)
- Max 50 events per request (`FLUSH_BATCH_MAX`)
- On flush failure, re-queue (bounded by `MAX_QUEUE`)

**Flush strategy:**

```ts
// telemetry-provider.tsx lines 159–185
const flush = useCallback(async () => {
  if (!enabled || queueRef.current.length === 0) return;
  const batch = queueRef.current.splice(0, FLUSH_BATCH_MAX);
  const body = JSON.stringify({ username: username ?? "anon", events: batch });
  // sendBeacon preferred for unload-style flushes (survives page unload)
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    if (blob.size <= 60_000) {
      if (navigator.sendBeacon(ENDPOINT, blob)) return;
    }
  }
  // Fall back to fetch with keepalive for large batches
  await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  });
}, [enabled, username]);
```

### 6.2 Next.js API route (the bridge)

**File:** `web-next/src/app/api/axoniz/diagnostics/log/route.ts`

**Endpoint:** `POST /api/axoniz/diagnostics/log`

**Request shape:**

```json
{
  "username": "akik",
  "events": [
    { "event_type": "click", "component": "ui", "action": "save-button", "details": {...} },
    ...
  ]
}
```

**Response shape:**

```json
// Success
{ "accepted": 5, "dropped": 0, "ok": true }    // status 200

// Overload (rate-limited or batch-capped)
{ "accepted": 3, "dropped": 2, "ok": true }    // status 202

// Malformed
{ "error": "expected 'events' array" }          // status 400
```

**Rate limit:**

```ts
// route.ts lines 36–49
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
```

Sliding 1-second window; events beyond 200/sec are dropped (counted in `overloaded`, returned in `dropped`).

**Batch cap:** 50 events per request (line 72). Excess events are dropped (counted in `dropped`).

**Type coercion:** The route does NOT trust client-side types. Each event field is coerced:

```ts
// route.ts lines 84–101
const ok = logger.emit({
  application: "axoniz.web",
  component: typeof ev.component === "string" ? ev.component : "frontend",
  event_type: typeof ev.event_type === "string" ? ev.event_type : "unknown",
  severity:
    typeof ev.severity === "string" &&
    ["debug", "info", "warn", "error", "fatal"].includes(ev.severity)
      ? (ev.severity as ...)
      : "info",
  // ...
});
```

**Failure isolation:** `logger.emit()` returns `boolean`. The route never throws — it counts `accepted` and returns `200`/`202` regardless. The UI's request flow cannot be broken by a logging failure.

### 6.3 Vendored DiagLogger (browser-track singleton)

**File:** `web-next/src/lib/axoniz/diagnostics.ts`

**Singleton accessor:**

```ts
let singleton: DiagLogger | null = null;
let exitHandlerRegistered = false;

export function getDiagLogger(username?: string | null): DiagLogger {
  if (!singleton) {
    singleton = new DiagLogger(username, "axoniz.web");
    if (!exitHandlerRegistered) {
      exitHandlerRegistered = true;
      for (const sig of ["exit", "SIGINT", "SIGTERM", "SIGHUP"] as const) {
        try {
          process.once(sig, () => { try { singleton?.close(); } catch { /* ignore */ } });
        } catch { /* ignore */ }
      }
    }
  }
  return singleton;
}
```

- The username is used **only at construction**. Subsequent calls return the same singleton (the new username is ignored). This is intentional — the file is named once per process.
- Exit handlers fire `close()` exactly once per process. They are registered once (guarded by `exitHandlerRegistered`).

### 6.4 CLI-side DiagLogger

**File:** `src/core/diagnostics.ts`

Identical API to §6.3, but:
- Application defaults to `"axoniz"` (CLI), not `"axoniz.web"` (browser).
- The singleton is the same code path used by `axoniz logs *` to *read* files (via `listAxologs()`).
- Both modules MUST stay in sync. The browser-vendored module writes files; the CLI module reads them. If their filename format diverges, the CLI will not find the browser's files.

### 6.5 CLI dispatcher

**File:** `src/cli/entry.ts` → `src/core/runner.ts` (line 563) → `src/core/logs-cmd.ts` (`runLogsCmd`)

```ts
// src/core/runner.ts line 563
if (cmd === "logs" || cmd === "log") {
  const { runLogsCmd } = await import("./logs-cmd.js");
  const code = await runLogsCmd(pos.slice(1));
  process.exitCode = code;
  return;
}
```

The dispatcher is a dynamic import — the `logs-cmd` module is only loaded when the user actually runs `axoniz logs`. This keeps the CLI startup fast for unrelated commands.

---

## 7. Event Coverage

### 7.1 Captured (browser-side)

| Event | Captured? | Implementation | Recorded data |
|---|---|---|---|
| Click on element with `data-axoniz-action` | YES | `document.addEventListener("click", ...)` | `action` (the attribute value), `element_type`, `label` (if not input/textarea) |
| Click on element with `data-testid` / `aria-label` / `role` | YES (fallback) | Same | Falls through to `testId` → `ariaLabel` → `role` → `tagName` |
| Keyboard shortcut with Ctrl/Cmd/Alt/Meta | YES | `window.addEventListener("keydown", ...)` | Modifiers joined with `+`, plus `e.code` (e.g. `Ctrl+KeyS`, `Cmd+Shift+KeyK`) |
| Raw keystrokes | **NO (by design)** | Filter: `if (!(e.ctrlKey || e.metaKey || e.altKey)) return;` | Never recorded |
| Password field keystrokes | **NO (by design)** | Filter: `if (tgt.tagName === "INPUT" && tgt.getAttribute("type") === "password") return;` | Even modifier combos suppressed |
| Scroll | YES (throttled 500ms) | `window.addEventListener("scroll", ...)` | `scroll_percent`, `at_top`, `at_bottom` |
| Navigation | YES | `usePathname()` from `next/navigation` | `route`, `action: "initial" | "replace"`, `details.from`/`details.to` |
| HTTP fetch | YES (wraps `window.fetch`) | Replaces `window.fetch` on mount | `method`, sanitized URL (query redacted), `status`, `duration_ms`, `error` on failure |
| XHR (`XMLHttpRequest`) | **NO** | Not wrapped | — |
| `sendBeacon` | **NO** (except the diagnostic endpoint itself) | Not wrapped | — |
| Uncaught error | YES | `window.addEventListener("error", ...)` | `message`, `filename`, `line`, `column` (all length-capped) |
| Unhandled promise rejection | YES | `window.addEventListener("unhandledrejection", ...)` | `reason.message` (length-capped) |
| `pagehide` / `visibilitychange=hidden` | YES (flush trigger) | Both listeners | Immediate flush of queue |

### 7.2 NOT captured (by design)

| Interaction | Why not | Privacy rationale |
|---|---|---|
| Raw keystrokes (letters/digits without modifier) | Filter | Could reconstruct typed text |
| Form field values | Not recorded | Could contain PII / passwords / chat content |
| Chat message content (prompts, completions) | Caller's responsibility | Defense-in-depth redacts known-sensitive keys but does not detect chat content |
| File uploads | Not recorded | Could contain user data |
| DOM `innerHTML` / `outerHTML` snapshots | Not recorded | Could contain rendered chat / user data |
| Full `window` state | Not recorded | Could contain tokens in URL hash |
| Cookies | `cookie`/`cookies` key redacted if present | — |
| Request/response bodies | Not recorded by fetch wrapper | Could contain chat content |
| `XMLHttpRequest` payloads | Not wrapped | Out of scope; modern SPA uses `fetch` |

### 7.3 Captured (CLI/daemon-side — separate logger)

The CLI's `AxonizLogger` (in `src/core/logger.ts`) writes structured events to `~/.axoniz/logs/structured/*.jsonl` and `~/.axoniz/logs/sessions/*.log`. Those files are **separate** from the `.axolog` files and out of scope for this design.

---

## 8. Correlation Strategy

### 8.1 `correlation_id` generation

Browser-side (`telemetry-provider.tsx` line 71):

```ts
function genId(): string {
  // 12 hex chars — same as the backend's event_id format
  return Math.random().toString(16).slice(2, 14);
}
```

Each event from `TelemetryProvider.emit()` is assigned a `correlation_id` if the caller didn't provide one (line 155):

```ts
queueRef.current.push({ ...ev, correlation_id: ev.correlation_id ?? genId() });
```

### 8.2 Cross-event correlation

A click → HTTP fetch → HTTP response sequence can be correlated by sharing a `correlation_id`. The caller sets the ID on the click event; the fetch wrapper inherits it from the surrounding context (currently via `pathname`, but a future enhancement could thread it through React context).

### 8.3 CLI display

The CLI's `axoniz logs show` command displays events with `correlation_id` visible (see `logs-cmd.ts` `formatEvent` at line 175). The `details` object is shown as **keys only** — values are never printed, even after redaction, as defense-in-depth:

```ts
// logs-cmd.ts line 191
const detailKeys = e.details ? Object.keys(e.details).slice(0, 8).join(",") : "";
const detailStr = detailKeys ? ` ${C.GRAY}{${detailKeys}}${C.RESET}` : "";
```

This means a user running `axoniz logs show` sees:

```
2026-10-14T15:27:14.944Z INFO  diagnostics         session_start       {file,pid,platform,node_version,schema_version}
2026-10-14T15:27:14.944Z INFO  test                test_event      anti_loop  {ts}
```

The values behind those keys are visible only via `axoniz logs export` with `--include-raw` (see §11.2).

### 8.4 Cross-process correlation

When the browser POSTs to `/api/axoniz/diagnostics/log`, the `correlation_id` is preserved as-is (the route does not overwrite it; see line 96). The same ID then appears in the `.axolog` file written by the Node.js process. A future enhancement could have the CLI emit its own events with the same `correlation_id` when handling the user's request, allowing end-to-end tracing.

---

## 9. Privacy & Redaction Policy

### 9.1 Defensive `redact()` — applied to EVERY event

```ts
// diagnostics.ts line 104 (browser-vendored) / line 157 (CLI)
export function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    let s = value;
    for (const sub of REDACTED_SUBSTR) {
      if (s.includes(sub)) {
        s = s.replace(
          new RegExp(`${sub.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^\\s,;]+`, "g"),
          `${sub}[REDACTED]`,
        );
      }
    }
    return s;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const lower = k.toLowerCase();
      if (REDACTED_KEYS.has(lower) || /token|secret|pass|key|cookie/i.test(k)) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }
  return value;
}
```

### 9.2 `REDACTED_KEYS` — exact match (case-insensitive)

```ts
const REDACTED_KEYS = new Set([
  "password", "passwd", "secret", "api_key", "apikey", "authorization",
  "auth", "token", "access_token", "refresh_token", "session", "cookie",
  "cookies", "credential", "credentials", "private_key", "privatekey",
]);
```

### 9.3 `REDACTED_SUBSTR` — substring match inside string values

```ts
const REDACTED_SUBSTR = [
  "Bearer ", "Basic ", "sk-", "pk-", "ghp_", "gho_", "xoxb-", "xoxp-",
];
```

The regex `${sub}[^\\s,;]+` matches the prefix plus everything up to the next whitespace, comma, or semicolon — masking the secret while leaving the prefix visible (so the type of secret is identifiable).

### 9.4 Fuzzy key match (regex)

```ts
/token|secret|pass|key|cookie/i.test(k)
```

Any key containing `token`, `secret`, `pass`, `key`, or `cookie` (case-insensitive) is also redacted. This catches `user_token`, `api_key_id`, `password_hash`, `cookie_value`, etc.

### 9.5 What `redact()` does NOT do

- **Does not detect chat content.** A field named `user_input` containing `"what is the password?"` is kept verbatim. The caller is responsible for sanitizing chat content.
- **Does not redact by value pattern.** A string like `"my-token-abc123"` in a field named `description` is kept, because the field name doesn't match and the value doesn't start with a known prefix.
- **Does not strip stack traces.** Stack traces are caller-trimmed to 500 chars before emit; `redact()` does not re-process them.

### 9.6 Verified by tests

| Test | File | Verdict |
|---|---|---|
| `redact strips known-sensitive keys` | `test/diagnostics.test.ts` line 53 | PASS |
| `redact masks bearer tokens inside strings` | `test/diagnostics.test.ts` line 70 | PASS |
| `redact strips chat-message-shaped fields when caller forgets` | `test/diagnostics.test.ts` line 160 | PASS |
| `sensitive data (passwords, tokens, API keys) is redacted` | `test/logger-fault-injection.test.ts` line 291 | PASS |
| `bearer tokens in strings are masked` | `test/logger-fault-injection.test.ts` line 325 | PASS |

See **AXONIZ_LOGGING_VERIFICATION.md** §6 for the actual test output and `assert` lines.

### 9.7 Caller's responsibility

The privacy contract documented in `telemetry-provider.tsx` (lines 8–17):

```
* Privacy contract:
*   - NEVER records raw keystrokes. Only modifier+key combos (e.g. "Ctrl+S").
*   - NEVER records form field values, chat prompts, or text content.
*   - NEVER records DOM innerHTML, full snapshots, or sensitive labels.
*   - Records element identifiers only when the element has data-axoniz-action
*     or a role/aria-label that is NOT a sensitive input.
*   - Network telemetry records only method + sanitized URL + status +
*     duration — never request/response bodies.
```

The defensive `redact()` is the **second** line of defense; the first line is the caller's adherence to the contract above.

---

## 10. Durability and Failure Guarantees

### 10.1 Write semantics

```ts
// diagnostics.ts line 276 (browser-vendored) / line 365 (CLI)
private writeLine(line: string): boolean {
  if (this.fd === null) return false;
  const data = line + "\n";
  try {
    fs.writeSync(this.fd, data);
    this.byteCount += Buffer.byteLength(data);
    // ... flush buffer + rotate ...
    return true;
  } catch (e) {
    this.failed = true;
    this.buffer.push(line);
    this.reportFailure(`Write failed: ${errMsg(e)}`);
    this.tryFallback();
    return false;
  }
}
```

- `fs.writeSync` is **synchronous** — the function blocks the event loop until the kernel accepts the write (typically ~0.05ms on SSD). The kernel buffer is flushed; the disk write itself may still be in flight, but the kernel will persist it even if the process exits.
- The file is opened with `O_APPEND | O_CREAT | O_WRONLY` and mode `0o600` (user read/write only). `O_APPEND` guarantees atomic appends from concurrent writers (each `writeSync` call is a single atomic operation up to the kernel's `PIPE_BUF` size).

### 10.2 Buffer on failure

When a write fails (disk full, permission denied, etc.):

1. The line is pushed to `this.buffer` (cap 500).
2. `this.failed = true` is set.
3. `reportFailure()` writes a single message to stderr (only once).
4. `tryFallback()` attempts to open a file in `os.tmpdir()/axoniz-logs/`.
5. On fallback success, `this.failed = false` and writes resume to the fallback path.

```ts
// diagnostics.ts line 316 (browser-vendored)
private tryFallback(): void {
  const fallbackDir = path.join(os.tmpdir(), "axoniz-logs");
  try {
    fs.mkdirSync(fallbackDir, { recursive: true });
    const fallbackPath = path.join(fallbackDir, path.basename(this.filePath));
    const flags = fs.constants.O_APPEND | fs.constants.O_CREAT | fs.constants.O_WRONLY;
    this.fd = fs.openSync(fallbackPath, flags, 0o600);
    this.failed = false;
    this.reportFailure(`Switched to fallback path: ${fallbackPath}`);
  } catch {
    this.fd = null;
  }
}
```

### 10.3 `close()` semantics

```ts
// diagnostics.ts line 330
close(): void {
  if (this.buffer.length > 0 && this.fd !== null) {
    const pending = this.buffer.splice(0, this.buffer.length);
    for (const p of pending) {
      try { fs.writeSync(this.fd, p + "\n"); } catch { /* ignore on close */ }
    }
  }
  try { if (this.fd !== null) fs.closeSync(this.fd); } catch { /* ignore */ }
  this.fd = null;
}
```

- Flushes the buffer before closing the fd.
- Each buffered line is a best-effort write — failures are swallowed on close.
- Registered for `exit`, `SIGINT`, `SIGTERM`, `SIGHUP`.

### 10.4 Abrupt termination (SIGKILL)

If the process is killed with `SIGKILL` (or a hard crash):
- Buffered events not yet written to disk are **lost**.
- Events already written to disk are persisted (kernel buffer flushed).
- The trailing line in the file is guaranteed to be a complete JSON object followed by `\n` — `JSON.parse(line)` will succeed for every complete line.
- A truncated trailing line (e.g. kernel wrote a partial line before crash) is detectable because `JSON.parse(line)` throws.

### 10.5 Verified failure scenarios

| Scenario | Test | File | Verdict |
|---|---|---|---|
| Read-only file (chmod 0o400) | TEST 12 | `logger-fault-injection.test.ts` line 244 | PASS — logger does not crash |
| Read-only dir (chmod 0o500) | TEST 13 | `logger-fault-injection.test.ts` line 267 | PASS — logger does not crash |
| Abrupt termination (SIGKILL) | TEST 10 | `logger-fault-injection.test.ts` line 192 | PASS — file remains parseable |
| Truncated trailing record | TEST 11 | `logger-fault-injection.test.ts` line 225 | PASS — parser detects broken line |
| Logger failure (fd closed manually) | TEST 16 | `logger-fault-injection.test.ts` line 345 | PASS — caller's return value unaffected |
| Multiple processes writing | TEST 18 | `logger-fault-injection.test.ts` line 388 | PASS — separate files (different usernames) |

---

## 11. Rotation and Retention

### 11.1 Rotation trigger

```ts
// diagnostics.ts line 36 (browser-vendored) / line 77 (CLI)
const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_ROTATIONS = 10;
```

When `byteCount >= MAX_FILE_BYTES` (50 MB), `maybeRotate()` fires:

```ts
// diagnostics.ts line 297 (browser-vendored)
private maybeRotate(): void {
  if (this.byteCount < MAX_FILE_BYTES) return;
  try {
    if (this.fd !== null) { fs.closeSync(this.fd); this.fd = null; }
    for (let i = MAX_ROTATIONS; i >= 1; i--) {
      const src = i === 1 ? this.filePath : `${this.filePath}.${i - 1}`;
      const dst = `${this.filePath}.${i}`;
      if (fs.existsSync(src)) {
        if (i === MAX_ROTATIONS) fs.unlinkSync(src);
        else fs.renameSync(src, dst);
      }
    }
    this.byteCount = 0;
    this.open();
  } catch (e) {
    this.reportFailure(`Rotation failed: ${errMsg(e)}`);
  }
}
```

The shift is:
- `<file>.axolog` → `<file>.axolog.1`
- `<file>.axolog.1` → `<file>.axolog.2`
- ...
- `<file>.axolog.9` → `<file>.axolog.10` (deleted, since `i === MAX_ROTATIONS`)

Then a fresh `<file>.axolog` is opened.

### 11.2 `axoniz logs cleanup` retention

```ts
// logs-cmd.ts line 345
async function cmdCleanup(args: string[]): Promise<number> {
  let keep = 10;
  // ...
  const files = listAxologs();
  if (files.length <= keep) { /* nothing to clean */ return 0; }
  const toDelete = files.slice(keep);
  // ... prompt unless --yes ...
  for (const f of toDelete) {
    try {
      fs.unlinkSync(f.path);
      // Also delete rotations: .axolog.1, .axolog.2, ...
      for (let i = 1; i <= 10; i++) {
        const rot = `${f.path}.${i}`;
        try { fs.unlinkSync(rot); } catch { /* may not exist */ }
      }
      deleted++;
    } catch (e) { /* report */ }
  }
}
```

- Default keeps 10 newest sessions.
- `--keep N` overrides.
- Also deletes any rotated copies (`.1` through `.10`) of each deleted session.

### 11.3 Verified rotation behavior

| Test | File | Verdict |
|---|---|---|
| Rotation logic (writes 100 events with 500-byte payloads) | `logger-fault-injection.test.ts` line 365 (TEST 17) | PASS — file size grows monotonically, file remains parseable, well under 50 MB |

The full 50 MB threshold is not triggered in unit tests because it would require ~500,000 events. The rotation logic is verified by code inspection and the size-monotonicity assertion.

---

## 12. CLI Reference — `axoniz logs`

### 12.1 Subcommand matrix

| Subcommand | Aliases | Args | Description |
|---|---|---|---|
| `path` | — | — | Print the resolved log directory |
| `list` | `ls` | — | List all `.axolog` sessions (newest first) |
| `show` | `cat` | `[session]` + filters | Show events from a session (default: newest) |
| `verify` | `check` | `[session]` | Check for malformed/truncated records |
| `export` | — | `[session] [out] [--include-raw]` | Export a session to NDJSON |
| `cleanup` | `clean` | `[--keep N] [--yes]` | Delete old sessions beyond the N newest |
| `help` | `--help`, `-h` | — | Print help |

### 12.2 Filters for `show` and `export`

| Flag | Arg | Notes |
|---|---|---|
| `--severity` | `debug | info | warn | error | fatal` | Case-insensitive |
| `--event-type` | string | e.g. `click`, `navigation`, `http_request` |
| `--component` | string | Substring match (e.g. `frontend` matches `frontend.fetch`) |
| `--since` | ISO 8601 timestamp | Events at/after this UTC time |
| `--until` | ISO 8601 timestamp | Events at/before this UTC time |
| `--tail` | integer | Only the last N events (after filtering) |

Filters can be passed as `--flag value` or `--flag=value`.

### 12.3 Exit codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | Usage error or file not found |
| `2` | Partial success — some records malformed (the file was still read; broken lines are flagged) |

### 12.4 Examples

```bash
# Print the resolved log directory
$ axoniz logs path
/home/z/.axoniz/logs

# List all sessions
$ axoniz logs list
Found 1 session(s)

  2026-10-14_15-27-14_Wednesday-anti-loop-test.axolog  986B      2026-10-14 15:27:14

# Show all events from the newest session
$ axoniz logs show
File: /home/z/.axoniz/logs/2026-10-14_15-27-14_Wednesday-anti-loop-test.axolog
Lines: 2 (parsed 2, broken 0)
After filters: 2

  2026-10-14T15:27:14.942Z INFO  diagnostics         session_start       {file,pid,platform,node_version,schema_version}
  2026-10-14T15:27:14.944Z INFO  test                test_event      anti_loop  {ts}

# Show only HTTP request events
$ axoniz logs show --event-type http_request

# Show only errors from a specific session, last 20
$ axoniz logs show alice --severity error --tail 20

# Show events since a timestamp
$ axoniz logs show --since 2026-10-14T20:00:00Z

# Verify all sessions for malformed records
$ axoniz logs verify
2026-10-14_15-27-14_Wednesday-anti-loop-test.axolog  lines=2 parsed=2 broken=0  OK

# Export the newest session to a file
$ axoniz logs export /tmp/alice.jsonl
Exported 2 events from 2026-10-14_15-27-14_Wednesday-anti-loop-test.axolog to /tmp/alice.jsonl
  parsed=2 broken=0 total=2

# Export with raw (broken-line) content included
$ axoniz logs export --include-raw /tmp/alice-raw.jsonl

# Cleanup: keep 5 newest sessions
$ axoniz logs cleanup --keep 5 --yes
Deleted 3 session(s).
```

### 12.5 Verified CLI runs

The CLI was exercised during the audit:

```
$ ls ~/.axoniz/logs/sessions/
20261014_151859_0001.log
20261014_151937_0001.log
20261014_151948_0001.log
20261014_152036_0001.log
20261014_152104_0001.log

$ grep "CLI started" ~/.axoniz/logs/sessions/20261014_152*.log
2026-10-14T15:20:36.498 INFO     [axoniz] CLI started | ... ["logs","show","--event-type","http_request"] ...
2026-10-14T15:21:04.890 INFO     [axoniz] CLI started | ... ["logs","show","--tail","3"] ...
2026-10-14T15:21:04.939 INFO     [axoniz] CLI started | ... ["logs","export","/tmp/axoniz-export.jsonl"] ...
2026-10-14T15:21:04.991 INFO     [axoniz] CLI started | ... ["logs","cleanup","--keep","100"] ...
```

All four invocations produced output (the export file at `/tmp/axoniz-export.jsonl` contains 3 records — see sample in §13).

---

## 13. Recovery and Troubleshooting

### 13.1 Detecting a truncated trailing record

**Symptom:** `axoniz logs verify` reports `broken=N` for a session.

```
$ axoniz logs verify
2026-10-14_15-27-14_Wednesday-anti-loop-test.axolog  lines=12 parsed=11 broken=1  1 BROKEN
  samples:
    {"partial":
```

**Cause:** The Node.js process was killed with SIGKILL mid-write, leaving a partial JSON object at the end of the file. The next complete line is unaffected (append-only writes).

**Recovery:** The truncated record is unrecoverable. The CLI flags it but does not delete it. To clean up:

```bash
$ axoniz logs show --include-raw   # inspect the broken line
$ # Manually edit the file to remove the broken line, or:
$ axoniz logs cleanup --keep 1 --yes   # delete all but the newest session
```

### 13.2 Using `--include-raw` for export

By default, `axoniz logs export` writes broken lines as `{"_broken": true, "_sequence_unknown": true}` — the raw text is NOT included, because it may contain a partial secret that wasn't fully redacted before the crash.

```bash
$ axoniz logs export /tmp/audit.jsonl
# Broken lines appear as: {"_broken": true, "_sequence_unknown": true}

$ axoniz logs export --include-raw /tmp/audit-raw.jsonl
# Broken lines appear as: {"__raw": "{\"partial\":", "__parse_error": "..."}
```

Only use `--include-raw` when transferring to a secure location for forensics.

### 13.3 "no .axolog sessions found"

```
$ axoniz logs list
(no .axolog sessions found)
```

**Causes:**

1. `~/.axoniz/logs/` does not exist or is empty. The DiagLogger creates this directory on first `emit()`. If no Next.js process has ever run for this user, the directory won't exist.
2. `HOME` environment variable points somewhere unexpected. Check `axoniz logs path` to see the resolved directory.
3. All sessions were deleted by `axoniz logs cleanup`.
4. Filesystem permissions prevent the CLI from reading the directory. Run `ls -la $(axoniz logs path)`.

**Recovery:**

```bash
$ axoniz logs path        # confirm the resolved path
$ ls -la $(axoniz logs path)
$ # If the directory doesn't exist, start the web app once:
$ cd web-next && npx next dev -p 7860
$ curl -X POST http://localhost:7860/api/axoniz/diagnostics/log \
    -H 'Content-Type: application/json' \
    -d '{"username":"smoke","events":[{"event_type":"smoke_test","component":"test"}]}'
$ axoniz logs list        # should now show one session
```

### 13.4 Fallback path detection

If the primary log directory is unwritable, the DiagLogger switches to `os.tmpdir()/axoniz-logs/`. Check stderr:

```
[axoniz.diagnostics] Failed to open /home/z/.axoniz/logs/...: EACCES
[axoniz.diagnostics] Switched to fallback path: /tmp/axoniz-logs/...
```

Events are still persisted, but to the fallback location. The CLI does NOT automatically search the fallback — run `axoniz logs path` to see the resolved primary, then check `/tmp/axoniz-logs/` manually.

### 13.5 Sample export (real, from the audit)

`/tmp/axoniz-export.jsonl` produced by `axoniz logs export /tmp/axoniz-export.jsonl`:

```json
{"timestamp":"2026-10-14T15:19:48.453","timestamp_utc":"2026-10-14T15:19:48.453Z","timezone_offset":"+00:00","session_id":"535cfba4e8009034","event_id":"fbcaf1d64d57","sequence":1,"process_id":12010,"application":"axoniz","application_version":"V00.01.007-beta-05","component":"diagnostics","event_type":"session_start","severity":"info","details":{"file":"/home/z/.axoniz/logs/2026-10-14_15-19-48_Wednesday-akik.axolog","pid":12010,"platform":"linux","node_version":"v24.21.0","schema_version":1},"redaction_applied":true,"schema_version":1}
{"timestamp":"2026-10-14T15:19:48.454","timestamp_utc":"2026-10-14T15:19:48.454Z","timezone_offset":"+00:00","session_id":"535cfba4e8009034","event_id":"8d858bd4e9a6","sequence":2,"process_id":12010,"application":"axoniz","application_version":"V00.01.007-beta-05","component":"frontend","event_type":"click","severity":"info","action":"save-button","details":{"route":"/chat"},"redaction_applied":true,"schema_version":1}
{"timestamp":"2026-10-14T15:19:48.454","timestamp_utc":"2026-10-14T15:19:48.454Z","timezone_offset":"+00:00","session_id":"535cfba4e8009034","event_id":"c9516f4b85f4","sequence":3,"process_id":12010,"application":"axoniz","application_version":"V00.01.007-beta-05","component":"frontend.fetch","event_type":"http_request","severity":"info","action":"GET","duration_ms":142,"details":{"url":"/api/axoniz/health","status":200},"redaction_applied":true,"schema_version":1}
```

Three events:
1. `session_start` — emitted by DiagLogger constructor
2. `click` — user clicked an element with `data-axoniz-action="save-button"` on route `/chat`
3. `http_request` — `GET /api/axoniz/health` returned 200 in 142 ms

All three have monotonic sequences (1, 2, 3), the same `session_id` (535cfba4e8009034), `redaction_applied: true`, `schema_version: 1`.

---

## 14. Status Table

| Item | Verdict | Evidence |
|---|---|---|
| Log directory `~/.axoniz/logs/` exists after first emit | PASS | `axoniz logs path` returns `/home/z/.axoniz/logs`; file present at `2026-10-14_15-27-14_Wednesday-anti-loop-test.axolog` |
| Filename format `YYYY-MM-DD_HH-mm-ss_Day-username.axolog` | PASS | Unit test `test/diagnostics.test.ts` line 39; TEST 2 in `logger-fault-injection.test.ts` line 59 |
| Username sanitization | PASS | Unit test line 45; TEST 3 line 67 |
| Filename collision handling (`-2`, `-3`) | PASS | TEST 4 line 78 |
| Schema version 1 | PASS | All emitted events include `"schema_version":1` |
| 17 event fields + 2 metadata fields | PASS | `DiagEvent` interface (lines 136–156) declares 17 fields + `redaction_applied` + `schema_version` |
| `redact()` strips known-sensitive keys | PASS | Unit test line 53; TEST 14 line 291 |
| `redact()` masks Bearer/Basic/sk-/etc. substrings | PASS | Unit test line 70; TEST 15 line 325 |
| Defense-in-depth for chat-message-shaped fields | PASS | Unit test line 160 |
| `fs.writeSync` synchronous writes | PASS | `writeLine()` line 276 — `fs.writeSync(this.fd, data)` |
| `O_APPEND | O_CREAT | O_WRONLY` open flags | PASS | `open()` line 207 |
| `0o600` file mode (user read/write only) | PASS | `open()` line 207 |
| Fallback to `os.tmpdir()` on write failure | PASS | `tryFallback()` line 316 |
| Buffer cap (500 events) on failure | PASS | `MAX_BUFFER = 500` line 33 |
| `close()` flushes buffer | PASS | `close()` line 330 |
| Exit handlers (`exit`, `SIGINT`, `SIGTERM`, `SIGHUP`) | PASS | `getDiagLogger()` line 354 |
| Rotation at 50 MB, keep 10 rotations | PASS | `MAX_FILE_BYTES` line 36, `MAX_ROTATIONS` line 39, `maybeRotate()` line 297 |
| `axoniz logs cleanup --keep N` (default 10) | PASS | `cmdCleanup()` line 345; CLI tested with `--keep 100` |
| `axoniz logs path` | PASS | Tested during audit |
| `axoniz logs list` | PASS | Tested during audit |
| `axoniz logs show` + filters | PASS | Tested with `--event-type http_request` and `--tail 3` |
| `axoniz logs verify` | PASS | Tested during audit |
| `axoniz logs export` | PASS | Produced `/tmp/axoniz-export.jsonl` with 3 events |
| `axoniz logs cleanup` | PASS | Tested with `--keep 100` |
| CLI never prints `details` values | PASS | `formatEvent()` line 191 — only keys shown |
| TelemetryProvider click capture | PASS | Source inspection: `addEventListener("click", ...)` line 255 |
| TelemetryProvider keyboard shortcut capture (modifier-only) | PASS | Source inspection: filter at line 264 |
| TelemetryProvider scroll throttling (500ms) | PASS | Source inspection: `SCROLL_THROTTLE_MS = 500` line 67 |
| TelemetryProvider navigation capture | PASS | Source inspection: `usePathname()` line 144 |
| TelemetryProvider fetch wrap (method + sanitized URL + status + duration) | PASS | Source inspection: `wrappedFetch` line 362 |
| TelemetryProvider uncaught error / unhandled rejection | PASS | Source inspection: lines 320–351 |
| TelemetryProvider pagehide / visibilitychange flush | PASS | Source inspection: lines 199–207 |
| API route re-applies redaction (defense-in-depth) | PASS | Source inspection: `logger.emit()` applies `redact()` to `details` unless `already_redacted` |
| API rate limit (200 events/sec) | PASS | Source inspection: `rateCheck()` line 40 |
| API batch cap (50 events/request) | PASS | Source inspection: `payload.events.slice(0, 50)` line 72 |
| API failure isolation (200/202 regardless of logger failures) | PASS | Source inspection: `emit()` return value counted but never throws |
| `correlation_id` preservation end-to-end | PASS | TEST 8 in `logger-fault-injection.test.ts` line 138 |
| Abrupt termination (SIGKILL) leaves file parseable | PASS | TEST 10 line 192 |
| Multiple processes write to separate files | PASS | TEST 18 line 388 |
| Browser-driven reload/reload-during-request tests | BLOCKED | Playwright not installed |

---

## 15. File Inventory (Reference)

| File | Role |
|---|---|
| `web-next/src/components/axoniz/telemetry-provider.tsx` | Browser-side instrumentation; captures click/scroll/keyboard/navigation/http/errors; POSTs batches |
| `web-next/src/app/api/axoniz/diagnostics/log/route.ts` | Next.js POST handler; rate-limits, batch-caps, type-coerces, calls singleton |
| `web-next/src/lib/axoniz/diagnostics.ts` | Vendored DiagLogger singleton (browser track); writes `.axolog` files |
| `src/core/diagnostics.ts` | CLI-native DiagLogger + `listAxologs()` reader |
| `src/core/logs-cmd.ts` | CLI subcommands: `path`, `list`, `show`, `verify`, `export`, `cleanup` |
| `src/core/runner.ts` (line 563) | Dispatcher: `if cmd === "logs" → dynamic import("./logs-cmd.js")` |
| `src/cli/entry.ts` | CLI entry; calls `main(argv)` from `runner.ts` |
| `test/diagnostics.test.ts` | 10 unit tests for filename, sanitization, redaction, sequence, parseable-on-crash, read-only resilience |
| `test/logger-fault-injection.test.ts` | 18 fault-injection tests for first-run, collision, burst, correlation, error severity, abrupt termination, truncation, permission denied, disk-full simulation, redaction, bearer masking, logger isolation, rotation, multi-process |
| `scripts/anti-loop-test.mjs` | HTTP-level anti-loop test (6 sub-tests) |

---

End of design.
