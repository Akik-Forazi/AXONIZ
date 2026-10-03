/**
 * Generic MCP (Model Context Protocol) Client
 * ============================================
 * Speaks JSON-RPC 2.0 over HTTP to any MCP server.
 * Used to connect axoniz to any MCP-compatible tool server
 * (MemPalace, Goose extensions, browser, filesystem, etc.)
 *
 * Port of axoniz/integrations/mcp.py
 *
 * Port note: `@modelcontextprotocol/sdk` is NOT present in this workspace's
 * node_modules, and this port must not add dependencies — so, exactly like the
 * Python original, the transport is hand-rolled JSON-RPC 2.0 over HTTP (global
 * `fetch` replaces `urllib.request`). The public surface is unchanged; if the
 * SDK is installed later it can back `_rpc()` without touching callers.
 * `urllib.error.URLError` → `MCPConnectionError` (any transport or HTTP-status
 * failure), `RuntimeError("MCP error ...")` → a plain `Error`.
 */

export type MCPToolFn = (...args: any[]) => unknown;

export class MCPConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MCPConnectionError";
  }
}

function reasonOf(e: unknown): string {
  if (e instanceof Error) {
    const cause = (e as { cause?: unknown }).cause;
    if (cause instanceof Error && cause.message) return `${e.message} (${cause.message})`;
    return e.message;
  }
  return String(e);
}

export class MCPClient {
  protected static _id = 0;

  base_url: string;
  timeout: number;
  protected _initialized = false;
  protected _server_info: Record<string, unknown> = {};
  protected _tools_cache: Array<Record<string, unknown>> | null = null;

  constructor(baseUrl: string, timeout = 30) {
    this.base_url = baseUrl.replace(/\/+$/, "");
    this.timeout = timeout;
  }

  _next_id(): number {
    MCPClient._id += 1;
    return MCPClient._id;
  }

  async _rpc(method: string, params: unknown = null): Promise<Record<string, unknown>> {
    const payload = {
      jsonrpc: "2.0",
      id: this._next_id(),
      method,
      params: params ?? {},
    };
    const endpoint = `${this.base_url}/mcp`;

    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(Math.max(1, this.timeout) * 1000),
      });
    } catch (e) {
      throw new MCPConnectionError(`MCP server unreachable at ${this.base_url}: ${reasonOf(e)}`);
    }

    if (!res.ok) {
      throw new MCPConnectionError(
        `MCP server unreachable at ${this.base_url}: HTTP ${res.status} ${res.statusText}`,
      );
    }

    let resp: Record<string, unknown>;
    try {
      resp = JSON.parse(await res.text()) as Record<string, unknown>;
    } catch (e) {
      throw new MCPConnectionError(`MCP server unreachable at ${this.base_url}: ${reasonOf(e)}`);
    }

    const err = resp["error"] as Record<string, unknown> | undefined;
    if (err) {
      throw new Error(`MCP error ${String(err["code"])}: ${String(err["message"])}`);
    }
    return (resp["result"] ?? {}) as Record<string, unknown>;
  }

  /** Perform the MCP handshake. Call once before using tools. */
  async initialize(): Promise<Record<string, unknown>> {
    if (this._initialized) {
      return this._server_info;
    }
    const result = await this._rpc("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {}, resources: {}, prompts: {} },
      clientInfo: { name: "axoniz", version: "1.0.0" },
    });
    this._server_info = result;
    this._initialized = true;
    return result;
  }

  async is_available(): Promise<boolean> {
    try {
      await this.initialize();
      return true;
    } catch {
      return false;
    }
  }

  /** Return the list of available tools from the MCP server. */
  async list_tools(forceRefresh = false): Promise<Array<Record<string, unknown>>> {
    if (this._tools_cache !== null && !forceRefresh) {
      return this._tools_cache;
    }
    if (!this._initialized) {
      await this.initialize();
    }
    const result = await this._rpc("tools/list");
    const tools = (result["tools"] ?? []) as Array<Record<string, unknown>>;
    this._tools_cache = tools;
    return tools;
  }

  /** Call an MCP tool and return its text output. */
  async call_tool(name: string, args: Record<string, unknown> | null = null): Promise<string> {
    if (!this._initialized) {
      await this.initialize();
    }
    const result = await this._rpc("tools/call", {
      name,
      arguments: args ?? {},
    });
    // Extract text content from the MCP ContentBlock list
    const content = result["content"];
    if (Array.isArray(content)) {
      const parts: string[] = [];
      for (const block of content) {
        if (block && typeof block === "object") {
          const b = block as Record<string, unknown>;
          if (b["type"] === "text") {
            parts.push(String(b["text"] ?? ""));
          } else if (b["type"] === "image") {
            parts.push(`[image: ${String(b["url"] ?? "")}]`);
          }
        }
      }
      return parts.join("\n").trim();
    }
    return JSON.stringify(result);
  }

  async list_resources(): Promise<Array<Record<string, unknown>>> {
    if (!this._initialized) {
      await this.initialize();
    }
    const result = await this._rpc("resources/list");
    return (result["resources"] ?? []) as Array<Record<string, unknown>>;
  }

  async read_resource(uri: string): Promise<string> {
    if (!this._initialized) {
      await this.initialize();
    }
    const result = await this._rpc("resources/read", { uri });
    const contents = (result["contents"] ?? []) as Array<Record<string, unknown>>;
    if (contents.length > 0) {
      return String(contents[0]["text"] ?? JSON.stringify(contents[0]));
    }
    return JSON.stringify(result);
  }

  async list_prompts(): Promise<Array<Record<string, unknown>>> {
    if (!this._initialized) {
      await this.initialize();
    }
    const result = await this._rpc("prompts/list");
    return (result["prompts"] ?? []) as Array<Record<string, unknown>>;
  }

  /**
   * Dynamically build an axoniz tool map from discovered MCP tools.
   * Each MCP tool becomes an async callable.
   */
  async as_axoniz_tool_map(): Promise<Record<string, MCPToolFn>> {
    const tools = await this.list_tools();
    const toolMap: Record<string, MCPToolFn> = {};
    for (const t of tools) {
      const name = String(t["name"] ?? "");
      if (!name) continue;
      toolMap[name] = (...args: any[]) => {
        const kwargs = (args[0] ?? {}) as Record<string, unknown>;
        return this.call_tool(name, kwargs);
      };
    }
    return toolMap;
  }

  /** Convert MCP tool schemas to OpenAI function-calling format. */
  async as_axoniz_schemas(): Promise<Array<Record<string, unknown>>> {
    const tools = await this.list_tools();
    return tools.map((t) => ({
      type: "function",
      function: {
        name: String(t["name"] ?? ""),
        description: String(t["description"] ?? ""),
        parameters:
          (t["inputSchema"] as Record<string, unknown> | undefined) ?? {
            type: "object",
            properties: {},
            required: [],
          },
      },
    }));
  }

  async server_info(): Promise<Record<string, unknown>> {
    if (!this._initialized) {
      await this.initialize();
    }
    return this._server_info;
  }

  /* camelCase aliases */
  asAxonizToolMap(): Promise<Record<string, MCPToolFn>> {
    return this.as_axoniz_tool_map();
  }
  asAxonizSchemas(): Promise<Array<Record<string, unknown>>> {
    return this.as_axoniz_schemas();
  }
  serverInfo(): Promise<Record<string, unknown>> {
    return this.server_info();
  }
}

/**
 * Manages multiple MCP server connections and merges their tools into a single
 * unified tool map + schema list for axoniz.
 */
export class MCPRegistry {
  protected _clients = new Map<string, MCPClient>();

  add(name: string, baseUrl: string, timeout = 30): this {
    this._clients.set(name, new MCPClient(baseUrl, timeout));
    return this;
  }

  remove(name: string): void {
    this._clients.delete(name);
  }

  async available_servers(): Promise<string[]> {
    const names: string[] = [];
    for (const [name, client] of this._clients) {
      if (await client.is_available()) names.push(name);
    }
    return names;
  }

  async merged_tool_map(): Promise<Record<string, MCPToolFn>> {
    const merged: Record<string, MCPToolFn> = {};
    for (const client of this._clients.values()) {
      try {
        if (await client.is_available()) {
          Object.assign(merged, await client.as_axoniz_tool_map());
        }
      } catch {
        /* skip unreachable servers */
      }
    }
    return merged;
  }

  async merged_schemas(): Promise<Array<Record<string, unknown>>> {
    const schemas: Array<Record<string, unknown>> = [];
    for (const client of this._clients.values()) {
      try {
        if (await client.is_available()) {
          schemas.push(...(await client.as_axoniz_schemas()));
        }
      } catch {
        /* skip unreachable servers */
      }
    }
    return schemas;
  }

  /** Call a tool on whichever server has it. */
  async call(toolName: string, args: Record<string, unknown> | null = null): Promise<string> {
    for (const client of this._clients.values()) {
      try {
        if (!(await client.is_available())) continue;
        const tools = await client.list_tools();
        if (tools.some((t) => t["name"] === toolName)) {
          return await client.call_tool(toolName, args);
        }
      } catch {
        continue;
      }
    }
    return `[ERROR] Tool '${toolName}' not found in any connected MCP server`;
  }

  /* camelCase aliases */
  availableServers(): Promise<string[]> {
    return this.available_servers();
  }
  mergedToolMap(): Promise<Record<string, MCPToolFn>> {
    return this.merged_tool_map();
  }
  mergedSchemas(): Promise<Array<Record<string, unknown>>> {
    return this.merged_schemas();
  }
}

/* Module-level shared registry */
const _registry = new MCPRegistry();

export function get_registry(): MCPRegistry {
  return _registry;
}

export const getRegistry = get_registry;
