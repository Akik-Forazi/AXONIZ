/**
 * axoniz Multi-Agent Router
 * =========================
 * Routes tasks to the most capable agent:
 *   - axoniz (local, fast, direct tool execution)
 *   - Goose  (complex multi-step, MCP extensions, coding)
 *   - Claude (cloud, complex reasoning, long context)
 *   - Custom (any additional agent the user registers)
 *
 * Port of axoniz/integrations/multi_agent.py
 *
 * Port notes:
 *  - `route()` / `route_stream()` are async (the ported agents stream/await).
 *  - `mempalace.search(task, top_k=3)` works because `PalaceLayer.search()`
 *    accepts an options object as its second argument, and because the bridge
 *    result is coerced to text here (Python interpolated the raw dict, which
 *    produced `<class 'dict'>`-style noise in the prompt prefix).
 *  - The Python regexes are all JS-compatible; matching is done on the
 *    lower-cased task exactly as in Python.
 */
import { info, warn, debug } from "../core/debug.js";

/* ─── Routing rules ──────────────────────────────────────────────────────── */

/** Tasks matching these patterns route to Goose (complex multi-step code tasks). */
export const GOOSE_PATTERNS: string[] = [
  "build\\s+(a\\s+)?(full|complete|entire)",
  "create\\s+(a\\s+)?(full\\s+)?app",
  "set\\s+up\\s+(a\\s+)?project",
  "install\\s+and\\s+configure",
  "refactor\\s+(entire|whole|all)",
  "write\\s+(all|every|complete)",
  "multi.?step",
  "end.?to.?end",
  "production.?ready",
  "deploy",
  "docker",
  "ci/?cd",
  "test suite",
  "benchmark",
];

/** Tasks for Claude (cloud, high reasoning, long-form). */
export const CLAUDE_PATTERNS: string[] = [
  "explain\\s+(in\\s+)?detail",
  "analyze\\s+this\\s+(document|paper|report|code)",
  "summarize\\s+(this\\s+)?(long|entire|full)",
  "write\\s+(a\\s+)?(formal|detailed|comprehensive)",
  "research",
  "compare\\s+and\\s+contrast",
  "pros\\s+and\\s+cons",
];

/** Memory-heavy tasks route to the memory bridge first. */
export const MEMORY_PATTERNS: string[] = [
  "remember",
  "recall",
  "what\\s+did\\s+(?:we|i)",
  "previous",
  "last\\s+time",
  "history",
  "past",
  "context",
];

export function _matches_any(text: string, patterns: string[]): boolean {
  const t = text.toLowerCase();
  return patterns.some((p) => new RegExp(p).test(t));
}

export const matchesAny = _matches_any;

/* ─── Collaborator shapes ────────────────────────────────────────────────── */

export type AnyIterable<T> = AsyncIterable<T> | Iterable<T>;

export interface RouterAgentLike {
  config: Record<string, unknown>;
  run(task: string): unknown;
  chat_stream?(message: string): AnyIterable<string>;
  chatStream?(message: string): AnyIterable<string>;
}

export interface GooseBridgeLike {
  is_available(): boolean | Promise<boolean>;
  ask(task: string): unknown;
  ask_stream?(task: string): AnyIterable<string>;
  askStream?(task: string): AnyIterable<string>;
}

export interface MemoryBridgeLike {
  is_available(): boolean | Promise<boolean>;
  search(query: string, options?: { top_k?: number; limit?: number }): unknown;
}

export type AgentSwitchCallback = (agent: string) => void;

/** Coerce whatever the memory bridge returned into a prompt-safe string. */
function searchResultToText(res: unknown): string {
  if (res === null || res === undefined) return "";
  if (typeof res === "string") return res;
  if (typeof res === "object") {
    const results = (res as { results?: unknown }).results;
    if (Array.isArray(results)) {
      const lines: string[] = [];
      for (const h of results) {
        if (h && typeof h === "object") {
          const hit = h as Record<string, unknown>;
          lines.push(`  [${String(hit["wing"] ?? "?")}/${String(hit["room"] ?? "?")}] ${String(hit["text"] ?? "")}`);
        } else {
          lines.push(`  ${String(h)}`);
        }
      }
      return lines.join("\n");
    }
  }
  return String(res);
}

async function* toAsyncIterable(src: AnyIterable<string>): AsyncGenerator<string> {
  for await (const item of src as AsyncIterable<string>) {
    yield item;
  }
}

/* ─── Router ────────────────────────────────────────────────────────────── */

/**
 * Routes tasks to the best available agent.
 *
 * Priority order (configurable):
 *   1. Check memory patterns → inject recalled context first
 *   2. If Goose is available + matches goose patterns → delegate to Goose
 *   3. If Claude is available + matches claude patterns → delegate to Claude
 *   4. Default → axoniz local agent
 */
export class MultiAgentRouter {
  axoniz: RouterAgentLike | null;
  goose: GooseBridgeLike | null;
  mempalace: MemoryBridgeLike | null;
  on_token: ((token: string) => void) | null;
  on_agent_switch: AgentSwitchCallback | null;
  protected _custom_agents = new Map<string, (task: string) => unknown>();

  constructor(options: {
    axoniz_agent?: RouterAgentLike | null;
    goose_bridge?: GooseBridgeLike | null;
    mempalace_bridge?: MemoryBridgeLike | null;
    on_token?: ((token: string) => void) | null;
    on_agent_switch?: AgentSwitchCallback | null;
  } = {}) {
    this.axoniz = options.axoniz_agent ?? null;
    this.goose = options.goose_bridge ?? null;
    this.mempalace = options.mempalace_bridge ?? null;
    this.on_token = options.on_token ?? null;
    this.on_agent_switch = options.on_agent_switch ?? null;
  }

  /** Register a custom agent handler: `handler(task) -> string` */
  register(name: string, handler: (task: string) => unknown): this {
    this._custom_agents.set(name, handler);
    return this;
  }

  /**
   * Route a task to the best agent and return the result.
   *
   * mode: "auto" | "axoniz" | "goose" | "claude"
   */
  async route(task: string, mode = "auto"): Promise<string> {
    debug(`[Router] routing task=${task.slice(0, 80)} mode=${mode}`);

    const enrichedTask = (await this._memoryPrefix(task)) + task;

    if (mode === "goose" || (mode === "auto" && (await this._should_use_goose(task)))) {
      return await this._run_goose(enrichedTask);
    }

    if (mode === "claude" || (mode === "auto" && this._should_use_claude(task))) {
      return await this._run_claude(enrichedTask);
    }

    // Default: axoniz
    return await this._run_axoniz(enrichedTask);
  }

  /** Stream route — yields `[agent_name, token]` tuples. */
  async *route_stream(task: string, mode = "auto"): AsyncGenerator<[string, string]> {
    debug(`[Router] stream routing task=${task.slice(0, 80)} mode=${mode}`);

    const enrichedTask = (await this._memoryPrefix(task)) + task;

    if (mode === "goose" || (mode === "auto" && (await this._should_use_goose(task)))) {
      if (this.on_agent_switch) this.on_agent_switch("goose");
      for await (const t of this._stream_goose(enrichedTask)) yield ["goose", t];
    } else if (mode === "claude" || (mode === "auto" && this._should_use_claude(task))) {
      if (this.on_agent_switch) this.on_agent_switch("claude");
      for await (const t of this._stream_claude(enrichedTask)) yield ["claude", t];
    } else {
      if (this.on_agent_switch) this.on_agent_switch("axoniz");
      for await (const t of this._stream_axoniz(enrichedTask)) yield ["axoniz", t];
    }
  }

  /** Predict which agent would handle this task without running it. */
  async which_agent(task: string): Promise<string> {
    if (await this._should_use_goose(task)) return "goose";
    if (this._should_use_claude(task)) return "claude";
    return "axoniz";
  }

  /** Availability status of all connected agents. */
  async status(): Promise<Record<string, unknown>> {
    return {
      axoniz: Boolean(this.axoniz),
      goose: Boolean(this.goose && (await this.goose.is_available())),
      mempalace: Boolean(this.mempalace && (await this.mempalace.is_available())),
      custom: [...this._custom_agents.keys()],
    };
  }

  /* ── Routing decisions ───────────────────────────────────────────────── */

  protected async _should_use_goose(task: string): Promise<boolean> {
    if (!this.goose || !(await this.goose.is_available())) {
      return false;
    }
    return _matches_any(task, GOOSE_PATTERNS);
  }

  protected _should_use_claude(task: string): boolean {
    if (!this.axoniz) {
      return false;
    }
    const provider = String(this.axoniz.config["provider"] ?? "");
    if (provider !== "anthropic" && provider !== "claude") {
      return false;
    }
    return _matches_any(task, CLAUDE_PATTERNS);
  }

  /* ── Execution ───────────────────────────────────────────────────────── */

  protected async _memoryPrefix(task: string): Promise<string> {
    if (this.mempalace && (await this.mempalace.is_available())) {
      if (_matches_any(task, MEMORY_PATTERNS)) {
        const ctx = searchResultToText(this.mempalace.search(task, { top_k: 3 }));
        if (ctx && !ctx.includes("[MemPalace")) {
          return `[Relevant memory context]\n${ctx}\n\n`;
        }
      }
    }
    return "";
  }

  protected async _run_goose(task: string): Promise<string> {
    info("[Router] → Goose");
    try {
      return String(await this.goose!.ask(task));
    } catch (e) {
      warn(`[Router] Goose failed, falling back to axoniz: ${e instanceof Error ? e.message : String(e)}`);
      return await this._run_axoniz(task);
    }
  }

  protected async _run_axoniz(task: string): Promise<string> {
    info("[Router] → axoniz");
    if (this.axoniz) {
      return String(await this.axoniz.run(task));
    }
    return "[ERROR] No axoniz agent configured";
  }

  protected async _run_claude(task: string): Promise<string> {
    info("[Router] → Claude (via axoniz AnthropicBackend)");
    return await this._run_axoniz(task); // axoniz routes to Claude via its backend
  }

  protected async *_stream_goose(task: string): AsyncGenerator<string> {
    try {
      const stream = this.goose!.ask_stream ? this.goose!.ask_stream(task) : this.goose!.askStream!(task);
      yield* toAsyncIterable(stream);
    } catch {
      yield* this._stream_axoniz(task);
    }
  }

  /** Stream axoniz chat (not a full agent run, for simplicity). */
  protected async *_stream_axoniz(task: string): AsyncGenerator<string> {
    if (this.axoniz) {
      const fn = this.axoniz.chat_stream ?? this.axoniz.chatStream;
      if (fn) {
        yield* toAsyncIterable(fn.call(this.axoniz, task));
      }
    }
  }

  protected async *_stream_claude(task: string): AsyncGenerator<string> {
    yield* this._stream_axoniz(task);
  }

  /* camelCase aliases */
  routeStream(task: string, mode = "auto"): AsyncGenerator<[string, string]> {
    return this.route_stream(task, mode);
  }
  whichAgent(task: string): Promise<string> {
    return this.which_agent(task);
  }
}

/* ─── Global router factory ─────────────────────────────────────────────── */

let _router: MultiAgentRouter | null = null;

export async function get_router(axonizAgent?: RouterAgentLike | null): Promise<MultiAgentRouter> {
  if (_router === null) {
    const { GooseBridge } = await import("./goose.js");
    const { MemPalaceBridge } = await import("./mempalace.js");
    const goose = new GooseBridge();
    const mempalace = new MemPalaceBridge();
    _router = new MultiAgentRouter({
      axoniz_agent: axonizAgent ?? null,
      goose_bridge: goose,
      mempalace_bridge: mempalace,
    });
  } else if (axonizAgent && !_router.axoniz) {
    _router.axoniz = axonizAgent;
  }
  return _router;
}

export const getRouter = get_router;
