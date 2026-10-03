/**
 * axoniz/sidecar/client.ts
 * =========================
 * HTTP client for the Jarvis Go sidecar (if running).
 *
 * The Jarvis Go binary exposes a local REST API on localhost:5151 (default).
 * This client lets AXONIZ query it for:
 *   - System context (running processes, open files, active windows)
 *   - Hotkey events
 *   - Clipboard content
 *   - Screen text (via sidecar OCR)
 *   - Notifications
 *
 * If the sidecar is not running, all calls degrade gracefully — None or {}.
 *
 * Port of axoniz/sidecar/client.py
 *
 * Port notes: `urllib.request` → global `fetch` (every method is async);
 * `time.time()` → `Date.now()/1000`; the 30 s `is_alive()` cache is preserved.
 */
import { loadConfig } from "../core/config.js";
import { getLogger } from "../core/logger.js";

const logger = getLogger();

export const DEFAULT_HOST = "localhost";
export const DEFAULT_PORT = 5151;

export type JsonObject = Record<string, unknown>;

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * HTTP client for the Jarvis Go sidecar.
 * All methods are safe to call even when the sidecar is offline.
 */
export class SidecarClient {
  base_url: string;
  timeout: number;
  protected _alive: boolean | null = null;
  protected _last_check = 0;
  protected _check_interval = 30.0; // recheck every 30s

  constructor(host: string = DEFAULT_HOST, port: number = DEFAULT_PORT, timeout = 2.0) {
    this.base_url = `http://${host}:${port}`;
    this.timeout = timeout;
  }

  /** Check whether the sidecar is running. Cached for 30 s. */
  async is_alive(): Promise<boolean> {
    const now = Date.now() / 1000;
    if (this._alive !== null && now - this._last_check < this._check_interval) {
      return this._alive;
    }
    try {
      const res = await fetch(`${this.base_url}/health`, { signal: AbortSignal.timeout(this.timeout * 1000) });
      this._alive = res.status === 200;
    } catch {
      this._alive = false;
    }
    this._last_check = now;
    return this._alive;
  }

  /** GET request to the sidecar. Returns parsed JSON or null. */
  async _get(path: string): Promise<JsonObject | null> {
    if (!(await this.is_alive())) {
      return null;
    }
    try {
      const res = await fetch(`${this.base_url}${path}`, { signal: AbortSignal.timeout(this.timeout * 1000) });
      return JSON.parse(await res.text()) as JsonObject;
    } catch (e) {
      logger.debug(`Sidecar GET ${path} failed: ${errText(e)}`);
      return null;
    }
  }

  /** POST request to the sidecar. */
  async _post(path: string, data: JsonObject): Promise<JsonObject | null> {
    if (!(await this.is_alive())) {
      return null;
    }
    try {
      const res = await fetch(`${this.base_url}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(this.timeout * 1000),
      });
      return JSON.parse(await res.text()) as JsonObject;
    } catch (e) {
      logger.debug(`Sidecar POST ${path} failed: ${errText(e)}`);
      return null;
    }
  }

  /* ── Context ─────────────────────────────────────────────────────────────── */

  /** Full system context from the sidecar. */
  async get_context(): Promise<JsonObject> {
    return (await this._get("/context")) ?? {};
  }

  /** Active window title. */
  async get_active_window(): Promise<string> {
    const r = await this._get("/window");
    return r ? String(r["title"] ?? "") : "";
  }

  /** Clipboard text content. */
  async get_clipboard(): Promise<string> {
    const r = await this._get("/clipboard");
    return r ? String(r["text"] ?? "") : "";
  }

  /** OCR'd screen text from the sidecar. */
  async get_screen_text(): Promise<string> {
    const r = await this._get("/screen/text");
    return r ? String(r["text"] ?? "") : "";
  }

  /** Running processes list. */
  async get_processes(): Promise<unknown[]> {
    const r = await this._get("/processes");
    return r ? ((r["processes"] as unknown[]) ?? []) : [];
  }

  /** CPU/RAM/disk from the sidecar (more accurate than pidusage on some platforms). */
  async get_system_metrics(): Promise<JsonObject> {
    return (await this._get("/metrics")) ?? {};
  }

  /* ── Actions ─────────────────────────────────────────────────────────────── */

  /** Ask the sidecar to show a system notification. */
  async send_notification(title: string, body: string, icon = ""): Promise<boolean> {
    const r = await this._post("/notify", { title, body, icon });
    return Boolean(r && r["ok"]);
  }

  /** Ask the sidecar to set the clipboard content. */
  async set_clipboard(text: string): Promise<boolean> {
    const r = await this._post("/clipboard", { text });
    return Boolean(r && r["ok"]);
  }

  /** Ask the sidecar to open a URL in the default browser. */
  async open_url(url: string): Promise<boolean> {
    const r = await this._post("/open", { url });
    return Boolean(r && r["ok"]);
  }

  /* ── Context block for the agent ─────────────────────────────────────────── */

  /** Compact context block to inject into the agent's system prompt. */
  async context_block(): Promise<string> {
    if (!(await this.is_alive())) {
      return "";
    }
    const ctx = await this.get_context();
    if (!ctx || Object.keys(ctx).length === 0) {
      return "";
    }
    const lines = ["[Sidecar context]"];
    if (ctx["window"]) {
      lines.push(`  Active: ${String(ctx["window"])}`);
    }
    if (Number(ctx["cpu_percent"] ?? 0) > 70) {
      lines.push(`  CPU: ${Math.round(Number(ctx["cpu_percent"]))}%`);
    }
    if (Number(ctx["ram_percent"] ?? 0) > 80) {
      lines.push(`  RAM: ${Math.round(Number(ctx["ram_percent"]))}%`);
    }
    return lines.join("\n");
  }

  async status(): Promise<{ alive: boolean; base_url: string }> {
    return {
      alive: await this.is_alive(),
      base_url: this.base_url,
    };
  }

  /* camelCase aliases */
  isAlive(): Promise<boolean> {
    return this.is_alive();
  }
  getContext(): Promise<JsonObject> {
    return this.get_context();
  }
  getActiveWindow(): Promise<string> {
    return this.get_active_window();
  }
  getClipboard(): Promise<string> {
    return this.get_clipboard();
  }
  getScreenText(): Promise<string> {
    return this.get_screen_text();
  }
  getProcesses(): Promise<unknown[]> {
    return this.get_processes();
  }
  getSystemMetrics(): Promise<JsonObject> {
    return this.get_system_metrics();
  }
  sendNotification(title: string, body: string, icon = ""): Promise<boolean> {
    return this.send_notification(title, body, icon);
  }
  setClipboard(text: string): Promise<boolean> {
    return this.set_clipboard(text);
  }
  openUrl(url: string): Promise<boolean> {
    return this.open_url(url);
  }
  contextBlock(): Promise<string> {
    return this.context_block();
  }
}

/* ── Singleton ───────────────────────────────────────────────────────────────── */

let _client: SidecarClient | null = null;

export function get_sidecar(host?: string | null, port?: number | null): SidecarClient {
  if (_client === null) {
    try {
      const cfg = loadConfig() as unknown as Record<string, unknown>;
      const scfg = (cfg["sidecar"] ?? {}) as Record<string, unknown>;
      _client = new SidecarClient(
        host ?? (scfg["host"] === undefined ? DEFAULT_HOST : String(scfg["host"])),
        port ?? (scfg["port"] === undefined ? DEFAULT_PORT : Number(scfg["port"])),
      );
    } catch {
      _client = new SidecarClient(host ?? DEFAULT_HOST, port ?? DEFAULT_PORT);
    }
  }
  return _client;
}

/**
 * Async convenience alias (additive, not in Python): returns the singleton as a
 * promise so callers can `await getSidecar()`.
 */
export async function getSidecar(host?: string | null, port?: number | null): Promise<SidecarClient> {
  return get_sidecar(host, port);
}
