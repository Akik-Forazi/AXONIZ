/**
 * axoniz ↔ Goose Bridge
 * =====================
 * Connects to a running `goose serve` instance (or spawns one) and exposes
 * Goose's capabilities as axoniz tools.
 *
 * Goose serve API (default http://localhost:3000):
 *   POST /reply          — send a message, get SSE response
 *   GET  /sessions       — list sessions
 *   POST /sessions       — create session
 *   GET  /extensions     — list loaded MCP extensions
 *   GET  /health         — health check
 *
 * Port of axoniz/integrations/goose.py
 *
 * Port notes:
 *  - `urllib.request` → global `fetch`; the SSE body is consumed through the
 *    shared `httpStreamLines` helper from src/core/backend/types.ts.
 *  - `subprocess.Popen` → `node:child_process.spawn` with `stdio: "ignore"` and
 *    `detached`, exactly mirroring DEVNULL + daemon semantics.
 *  - `is_available()` / `health()` and every HTTP call are async (Python's
 *    blocking urlopen). `auto_start` therefore kicks off a fire-and-forget
 *    `_maybe_spawn()` from the constructor.
 *  - Error strings are preserved verbatim: "[Goose offline: ...]",
 *    "[Goose error: ...]", "[ERROR] Failed to create Goose session: ...",
 *    "[ERROR] Goose is not running. Start it with: goose serve".
 */
import { spawn, type ChildProcess } from "node:child_process";
import { ConnectionError, HttpStatusError, httpStreamLines } from "../core/backend/types.js";
import { toolArgs, optStr } from "../core/extras.js";

export type GooseToolFn = (...args: any[]) => Promise<string>;

function reasonOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Bridge between axoniz and a running Goose serve instance.
 *
 * Goose serve exposes a session-oriented chat endpoint plus session management.
 * axoniz uses it as a sub-agent for complex multi-step coding, research and
 * automation tasks.
 */
export class GooseBridge {
  static readonly DEFAULT_URL = "http://localhost:3000";

  base_url: string;
  auto_start: boolean;
  goose_bin: string;
  timeout: number;
  protected _proc: ChildProcess | null = null;
  protected _session_id: string | null = null;

  constructor(options: { base_url?: string | null; auto_start?: boolean; goose_bin?: string; timeout?: number } = {}) {
    this.base_url = (options.base_url ?? process.env["GOOSE_URL"] ?? GooseBridge.DEFAULT_URL).replace(/\/+$/, "");
    this.auto_start = options.auto_start ?? false;
    this.goose_bin = options.goose_bin ?? "goose";
    this.timeout = options.timeout ?? 120;

    if (this.auto_start) {
      void this._maybe_spawn();
    }
  }

  /* ── Health ───────────────────────────────────────────────────────────── */

  /** True if goose serve is reachable. */
  async is_available(): Promise<boolean> {
    try {
      const res = await fetch(`${this.base_url}/health`, { signal: AbortSignal.timeout(3000) });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  async health(): Promise<Record<string, unknown>> {
    try {
      const res = await fetch(`${this.base_url}/health`, { signal: AbortSignal.timeout(4000) });
      return JSON.parse(await res.text()) as Record<string, unknown>;
    } catch (e) {
      return { status: "offline", error: reasonOf(e), url: this.base_url };
    }
  }

  /* ── Session management ─────────────────────────────────────────────── */

  /** Create a new Goose session, return session_id. */
  async create_session(name?: string | null): Promise<string> {
    const payload: Record<string, unknown> = {};
    if (name) payload["name"] = name;
    try {
      const res = await fetch(`${this.base_url}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
      const result = JSON.parse(await res.text()) as Record<string, unknown>;
      const sid = String(result["id"] ?? result["session_id"] ?? result["name"] ?? "default");
      this._session_id = sid;
      return sid;
    } catch (e) {
      return `[ERROR] Failed to create Goose session: ${reasonOf(e)}`;
    }
  }

  async list_sessions(): Promise<Array<Record<string, unknown>>> {
    try {
      const res = await fetch(`${this.base_url}/sessions`, { signal: AbortSignal.timeout(5000) });
      const data = JSON.parse(await res.text()) as unknown;
      return Array.isArray(data) ? (data as Array<Record<string, unknown>>) : ((data as Record<string, unknown>)["sessions"] as Array<Record<string, unknown>>) ?? [];
    } catch (e) {
      return [{ error: reasonOf(e) }];
    }
  }

  /** List all loaded MCP extensions/tools in Goose. */
  async list_extensions(): Promise<Array<Record<string, unknown>>> {
    try {
      const res = await fetch(`${this.base_url}/extensions`, { signal: AbortSignal.timeout(5000) });
      const data = JSON.parse(await res.text()) as unknown;
      return Array.isArray(data) ? (data as Array<Record<string, unknown>>) : ((data as Record<string, unknown>)["extensions"] as Array<Record<string, unknown>>) ?? [];
    } catch (e) {
      return [{ error: reasonOf(e) }];
    }
  }

  /* ── Core ask / stream ───────────────────────────────────────────────── */

  /**
   * Send a message to Goose and return the full response text.
   * Uses the /reply endpoint (SSE streamed; everything is collected).
   */
  async ask(message: string, sessionId?: string | null): Promise<string> {
    let sid = sessionId ?? this._session_id;
    if (!sid) {
      sid = await this.create_session("axoniz-bridge");
    }

    const full: string[] = [];
    for await (const chunk of this._stream_reply(message, sid)) {
      full.push(chunk);
    }
    return full.join("").trim();
  }

  /** Stream tokens from Goose for live display. */
  async *ask_stream(message: string, sessionId?: string | null): AsyncGenerator<string> {
    let sid = sessionId ?? this._session_id;
    if (!sid) {
      sid = await this.create_session("axoniz-bridge");
    }
    yield* this._stream_reply(message, sid);
  }

  /**
   * POST /reply with SSE, yielding content tokens.
   * Goose SSE format: `data: {"type":"Message","content":"..."}`
   */
  async *_stream_reply(message: string, sessionId: string): AsyncGenerator<string> {
    const payload = {
      session_id: sessionId,
      message,
    };
    try {
      const lines = httpStreamLines(
        `${this.base_url}/reply`,
        payload,
        { Accept: "text/event-stream" },
        this.timeout * 1000,
      );
      for await (const raw of lines) {
        const line = raw.trim();
        if (!line || line === ":") continue;
        if (!line.startsWith("data: ")) continue;
        const chunkStr = line.slice(6).trim();
        if (chunkStr === "[DONE]") return;
        try {
          const ev = JSON.parse(chunkStr) as Record<string, unknown>;
          // Goose may use different event schemas
          const delta = (ev["delta"] ?? {}) as Record<string, unknown>;
          const text = ev["content"] ?? ev["text"] ?? delta["content"] ?? "";
          if (text) {
            yield String(text);
          }
        } catch {
          // Plain text chunk
          yield chunkStr;
        }
      }
    } catch (e) {
      if (e instanceof ConnectionError || e instanceof HttpStatusError) {
        yield `[Goose offline: ${reasonOf(e)}]`;
      } else {
        yield `[Goose error: ${reasonOf(e)}]`;
      }
    }
  }

  /* ── MCP tool passthrough ────────────────────────────────────────────── */

  /**
   * Call an MCP tool that Goose has loaded, via Goose's /mcp/call endpoint.
   * Falls back to asking Goose to use the tool via natural language.
   */
  async call_mcp_tool(toolName: string, args: Record<string, unknown>, sessionId?: string | null): Promise<string> {
    // Try the direct MCP call endpoint first
    try {
      const res = await fetch(`${this.base_url}/mcp/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: toolName, args }),
        signal: AbortSignal.timeout(30_000),
      });
      const result = JSON.parse(await res.text()) as unknown;
      return JSON.stringify(result, null, 2);
    } catch {
      /* fall through to the natural-language path */
    }

    // Fallback: ask Goose to use the tool naturally
    const argsStr = Object.entries(args)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(", ");
    const prompt = `Use the ${toolName} tool with these arguments: ${argsStr}. Return only the result.`;
    return await this.ask(prompt, sessionId);
  }

  /* ── axoniz tool map ────────────────────────────────────────────────── */

  /**
   * Callable tools that can be injected into an axoniz agent tool map.
   * Accepts the Python kwargs object the agent dispatches (`fn(args)`) as well
   * as plain positional arguments.
   */
  as_tool_map(): Record<string, GooseToolFn> {
    return {
      goose_ask: (...args: any[]) => {
        const a = toolArgs(args, ["task", "session_id"]);
        return this._tool_ask(String(a["task"] ?? ""), optStr(a["session_id"]));
      },
      goose_session_list: () => this._tool_session_list(),
      goose_session_create: (...args: any[]) => {
        const a = toolArgs(args, ["name"]);
        return this._tool_session_create(optStr(a["name"]));
      },
      goose_extensions_list: () => this._tool_extensions_list(),
      goose_mcp_call: (...args: any[]) => {
        const a = toolArgs(args, ["tool_name", "args"]);
        return this._tool_mcp_call(String(a["tool_name"] ?? ""), (a["args"] ?? {}) as Record<string, unknown>);
      },
      goose_health: () => this._tool_health(),
    };
  }

  /** OpenAI-format tool schemas for injection into TOOL_SCHEMAS. */
  as_tool_schemas(): Array<Record<string, unknown>> {
    return [
      {
        type: "function",
        function: {
          name: "goose_ask",
          description:
            "Delegate a complex task to Goose AI agent. Goose is a powerful " +
            "agent that can install packages, run code, browse the web, edit " +
            "files, and use MCP extensions. Use for multi-step tasks requiring " +
            "autonomous execution.",
          parameters: {
            type: "object",
            properties: {
              task: { type: "string", description: "The task to delegate to Goose" },
              session_id: { type: "string", description: "Optional session ID" },
            },
            required: ["task"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "goose_session_list",
          description: "List all active Goose sessions.",
          parameters: { type: "object", properties: {}, required: [] },
        },
      },
      {
        type: "function",
        function: {
          name: "goose_extensions_list",
          description: "List all MCP extensions loaded in Goose.",
          parameters: { type: "object", properties: {}, required: [] },
        },
      },
      {
        type: "function",
        function: {
          name: "goose_mcp_call",
          description: "Call a specific MCP tool that Goose has loaded.",
          parameters: {
            type: "object",
            properties: {
              tool_name: { type: "string" },
              args: { type: "object", description: "Tool arguments" },
            },
            required: ["tool_name", "args"],
          },
        },
      },
    ];
  }

  /* ── Tool impl ───────────────────────────────────────────────────────── */

  protected async _tool_ask(task: string, sessionId?: string | null): Promise<string> {
    if (!(await this.is_available())) {
      return "[ERROR] Goose is not running. Start it with: goose serve";
    }
    return await this.ask(task, sessionId);
  }

  protected async _tool_session_list(): Promise<string> {
    const sessions = await this.list_sessions();
    if (sessions.length === 0) {
      return "No Goose sessions found.";
    }
    return `Goose sessions:\n${JSON.stringify(sessions, null, 2)}`;
  }

  protected async _tool_session_create(name?: string | null): Promise<string> {
    return `Created Goose session: ${await this.create_session(name)}`;
  }

  protected async _tool_extensions_list(): Promise<string> {
    const exts = await this.list_extensions();
    if (exts.length === 0) {
      return "No Goose extensions loaded.";
    }
    return `Goose MCP extensions:\n${JSON.stringify(exts, null, 2)}`;
  }

  protected async _tool_mcp_call(toolName: string, args: Record<string, unknown>): Promise<string> {
    return await this.call_mcp_tool(toolName, args);
  }

  protected async _tool_health(): Promise<string> {
    return JSON.stringify(await this.health(), null, 2);
  }

  /* ── Auto-spawn ──────────────────────────────────────────────────────── */

  protected async _maybe_spawn(): Promise<void> {
    if (!(await this.is_available())) {
      await this._spawn();
    }
  }

  /** Try to start `goose serve` in the background. */
  async _spawn(): Promise<void> {
    try {
      this._proc = spawn(this.goose_bin, ["serve"], { stdio: "ignore", detached: true });
      this._proc.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "ENOENT") {
          console.log(
            `  \u001b[93m[Goose]\u001b[0m binary '${this.goose_bin}' not found — install from https://github.com/aaif-goose/goose`,
          );
        }
      });
      this._proc.unref();

      // Wait up to 10s for it to come online
      for (let i = 0; i < 20; i++) {
        await sleep(500);
        if (await this.is_available()) {
          console.log(`  \u001b[92m[Goose]\u001b[0m serve started at ${this.base_url}`);
          return;
        }
      }
      console.log(`  \u001b[93m[Goose]\u001b[0m serve did not start in time`);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        console.log(
          `  \u001b[93m[Goose]\u001b[0m binary '${this.goose_bin}' not found — install from https://github.com/aaif-goose/goose`,
        );
        return;
      }
      console.log(`  \u001b[93m[Goose]\u001b[0m spawn failed: ${reasonOf(e)}`);
    }
  }

  stop(): void {
    if (this._proc) {
      this._proc.kill();
      this._proc = null;
    }
  }

  /* camelCase aliases */
  isAvailable(): Promise<boolean> {
    return this.is_available();
  }
  createSession(name?: string | null): Promise<string> {
    return this.create_session(name);
  }
  listSessions(): Promise<Array<Record<string, unknown>>> {
    return this.list_sessions();
  }
  listExtensions(): Promise<Array<Record<string, unknown>>> {
    return this.list_extensions();
  }
  askStream(message: string, sessionId?: string | null): AsyncGenerator<string> {
    return this.ask_stream(message, sessionId);
  }
  callMcpTool(toolName: string, args: Record<string, unknown>, sessionId?: string | null): Promise<string> {
    return this.call_mcp_tool(toolName, args, sessionId);
  }
  asToolMap(): Record<string, GooseToolFn> {
    return this.as_tool_map();
  }
  asToolSchemas(): Array<Record<string, unknown>> {
    return this.as_tool_schemas();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    if (typeof t.unref === "function") t.unref();
  });
}

/* ── Module-level singleton ─────────────────────────────────────────────── */

let _bridge: GooseBridge | null = null;

export function get_bridge(baseUrl?: string | null, autoStart = false): GooseBridge {
  if (_bridge === null) {
    _bridge = new GooseBridge({ base_url: baseUrl ?? null, auto_start: autoStart });
  }
  return _bridge;
}

export const getBridge = get_bridge;
