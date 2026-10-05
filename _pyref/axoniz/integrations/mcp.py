"""
Generic MCP (Model Context Protocol) Client
============================================
Speaks JSON-RPC 2.0 over HTTP to any MCP server.
Used to connect axoniz to any MCP-compatible tool server
(MemPalace, Goose extensions, browser, filesystem, etc.)

Usage:
    from axoniz.integrations.mcp import MCPClient
    client = MCPClient("http://localhost:3001")
    tools = client.list_tools()
    result = client.call_tool("read_file", {"path": "README.md"})
"""

import json
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional


class MCPClient:
    """
    JSON-RPC 2.0 MCP client. Connects to any MCP-compatible server.

    MCP spec: https://spec.modelcontextprotocol.io/
    Supported methods:
      initialize        → server handshake
      tools/list        → discover available tools
      tools/call        → invoke a tool
      resources/list    → list resources
      resources/read    → read a resource
      prompts/list      → list prompt templates
    """

    _id = 0

    def __init__(self, base_url: str, timeout: int = 30):
        self.base_url = base_url.rstrip("/")
        self.timeout  = timeout
        self._initialized = False
        self._server_info: dict = {}
        self._tools_cache: Optional[List[dict]] = None

    def _next_id(self) -> int:
        MCPClient._id += 1
        return MCPClient._id

    def _rpc(self, method: str, params: Any = None) -> dict:
        payload = json.dumps({
            "jsonrpc": "2.0",
            "id":      self._next_id(),
            "method":  method,
            "params":  params or {},
        }).encode()
        endpoint = f"{self.base_url}/mcp"
        req = urllib.request.Request(
            endpoint,
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                resp = json.loads(r.read())
                if "error" in resp:
                    raise RuntimeError(f"MCP error {resp['error'].get('code')}: {resp['error'].get('message')}")
                return resp.get("result", {})
        except urllib.error.URLError as e:
            raise ConnectionError(f"MCP server unreachable at {self.base_url}: {e.reason}")

    def initialize(self) -> dict:
        """Perform MCP handshake. Call once before using tools."""
        if self._initialized:
            return self._server_info
        result = self._rpc("initialize", {
            "protocolVersion": "2024-11-05",
            "capabilities": {"tools": {}, "resources": {}, "prompts": {}},
            "clientInfo": {"name": "axoniz", "version": "1.0.0"},
        })
        self._server_info  = result
        self._initialized  = True
        return result

    def is_available(self) -> bool:
        try:
            self.initialize()
            return True
        except Exception:
            return False

    def list_tools(self, force_refresh: bool = False) -> List[dict]:
        """Return list of available tools from the MCP server."""
        if self._tools_cache is not None and not force_refresh:
            return self._tools_cache
        if not self._initialized:
            self.initialize()
        result = self._rpc("tools/list")
        tools = result.get("tools", [])
        self._tools_cache = tools
        return tools

    def call_tool(self, name: str, arguments: dict = None) -> str:
        """Call an MCP tool and return its text output."""
        if not self._initialized:
            self.initialize()
        result = self._rpc("tools/call", {
            "name":      name,
            "arguments": arguments or {},
        })
        # Extract text content from MCP ContentBlock list
        content = result.get("content", [])
        if isinstance(content, list):
            parts = []
            for block in content:
                if isinstance(block, dict):
                    if block.get("type") == "text":
                        parts.append(block.get("text", ""))
                    elif block.get("type") == "image":
                        parts.append(f"[image: {block.get('url', '')}]")
            return "\n".join(parts).strip()
        return str(result)

    def list_resources(self) -> List[dict]:
        if not self._initialized:
            self.initialize()
        return self._rpc("resources/list").get("resources", [])

    def read_resource(self, uri: str) -> str:
        if not self._initialized:
            self.initialize()
        result = self._rpc("resources/read", {"uri": uri})
        contents = result.get("contents", [])
        if contents:
            return contents[0].get("text", str(contents[0]))
        return str(result)

    def list_prompts(self) -> List[dict]:
        if not self._initialized:
            self.initialize()
        return self._rpc("prompts/list").get("prompts", [])

    def as_axoniz_tool_map(self) -> Dict[str, callable]:
        """
        Dynamically build an axoniz tool_map from discovered MCP tools.
        Each MCP tool becomes a callable with (self, **kwargs) -> str.
        """
        tools = self.list_tools()
        tool_map = {}
        for t in tools:
            name = t.get("name", "")
            if not name:
                continue
            # Capture name in closure
            def make_caller(n):
                def caller(**kwargs):
                    return self.call_tool(n, kwargs)
                caller.__name__ = n
                return caller
            tool_map[name] = make_caller(name)
        return tool_map

    def as_axoniz_schemas(self) -> List[dict]:
        """Convert MCP tool schemas to OpenAI function-calling format."""
        tools = self.list_tools()
        schemas = []
        for t in tools:
            schema = {
                "type": "function",
                "function": {
                    "name":        t.get("name", ""),
                    "description": t.get("description", ""),
                    "parameters":  t.get("inputSchema", {
                        "type": "object", "properties": {}, "required": []
                    }),
                },
            }
            schemas.append(schema)
        return schemas

    def server_info(self) -> dict:
        if not self._initialized:
            self.initialize()
        return self._server_info


class MCPRegistry:
    """
    Manages multiple MCP server connections and merges their tools
    into a single unified tool_map + schema list for axoniz.

    Usage:
        registry = MCPRegistry()
        registry.add("mempalace", "http://localhost:8765")
        registry.add("filesystem", "http://localhost:3002")
        tool_map = registry.merged_tool_map()
        schemas  = registry.merged_schemas()
    """

    def __init__(self):
        self._clients: Dict[str, MCPClient] = {}

    def add(self, name: str, base_url: str, timeout: int = 30):
        self._clients[name] = MCPClient(base_url, timeout)
        return self

    def remove(self, name: str):
        self._clients.pop(name, None)

    def available_servers(self) -> List[str]:
        return [name for name, c in self._clients.items() if c.is_available()]

    def merged_tool_map(self) -> Dict[str, callable]:
        merged = {}
        for name, client in self._clients.items():
            try:
                if client.is_available():
                    merged.update(client.as_axoniz_tool_map())
            except Exception:
                pass
        return merged

    def merged_schemas(self) -> List[dict]:
        schemas = []
        for name, client in self._clients.items():
            try:
                if client.is_available():
                    schemas.extend(client.as_axoniz_schemas())
            except Exception:
                pass
        return schemas

    def call(self, tool_name: str, arguments: dict = None) -> str:
        """Call a tool on whichever server has it."""
        for client in self._clients.values():
            try:
                if not client.is_available():
                    continue
                tools = client.list_tools()
                if any(t.get("name") == tool_name for t in tools):
                    return client.call_tool(tool_name, arguments)
            except Exception:
                continue
        return f"[ERROR] Tool '{tool_name}' not found in any connected MCP server"


# Module-level shared registry
_registry = MCPRegistry()


def get_registry() -> MCPRegistry:
    return _registry
