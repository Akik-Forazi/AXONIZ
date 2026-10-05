"""
axoniz ↔ Goose Bridge
=====================
Connects to a running `goose serve` instance (or spawns one) and exposes
Goose's capabilities as axoniz tools.

Goose serve API (default http://localhost:3000):
  POST /reply          — send a message, get SSE response
  GET  /sessions       — list sessions
  POST /sessions       — create session
  GET  /extensions     — list loaded MCP extensions
  GET  /health         — health check

Usage:
    from axoniz.integrations.goose import GooseBridge
    bridge = GooseBridge()
    if bridge.is_available():
        result = bridge.ask("List all Python files in this project")
        print(result)

    # As axoniz tools:
    tools = bridge.as_tool_map()
    # tools["goose_ask"]("build a todo app")
    # tools["goose_session_list"]()
"""

import json
import os
import re
import subprocess
import threading
import time
import urllib.error
import urllib.request
from typing import Dict, Iterator, List, Optional


class GooseBridge:
    """
    Bridge between axoniz and a running Goose serve instance.

    Goose serve exposes an OpenAI-compatible chat endpoint plus
    session management. We use it as a sub-agent for complex
    multi-step coding, research, and automation tasks.
    """

    DEFAULT_URL = "http://localhost:3000"

    def __init__(
        self,
        base_url: str = None,
        auto_start: bool = False,
        goose_bin: str = "goose",
        timeout: int = 120,
    ):
        self.base_url  = (base_url or os.environ.get("GOOSE_URL", self.DEFAULT_URL)).rstrip("/")
        self.auto_start = auto_start
        self.goose_bin  = goose_bin
        self.timeout    = timeout
        self._proc: Optional[subprocess.Popen] = None
        self._session_id: Optional[str] = None

        if auto_start and not self.is_available():
            self._spawn()

    # ── Health ─────────────────────────────────────────────────────────────

    def is_available(self) -> bool:
        """True if goose serve is reachable."""
        try:
            req = urllib.request.Request(f"{self.base_url}/health")
            with urllib.request.urlopen(req, timeout=3) as r:
                return r.status == 200
        except Exception:
            return False

    def health(self) -> dict:
        try:
            req = urllib.request.Request(f"{self.base_url}/health")
            with urllib.request.urlopen(req, timeout=4) as r:
                return json.loads(r.read())
        except Exception as e:
            return {"status": "offline", "error": str(e), "url": self.base_url}

    # ── Session management ───────────────────────────────────────────────

    def create_session(self, name: str = None) -> str:
        """Create a new Goose session, return session_id."""
        payload = {}
        if name:
            payload["name"] = name
        try:
            data = json.dumps(payload).encode()
            req = urllib.request.Request(
                f"{self.base_url}/sessions",
                data=data,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=10) as r:
                result = json.loads(r.read())
                sid = result.get("id") or result.get("session_id") or result.get("name", "default")
                self._session_id = sid
                return sid
        except Exception as e:
            return f"[ERROR] Failed to create Goose session: {e}"

    def list_sessions(self) -> List[dict]:
        try:
            req = urllib.request.Request(f"{self.base_url}/sessions")
            with urllib.request.urlopen(req, timeout=5) as r:
                data = json.loads(r.read())
                return data if isinstance(data, list) else data.get("sessions", [])
        except Exception as e:
            return [{"error": str(e)}]

    def list_extensions(self) -> List[dict]:
        """List all loaded MCP extensions/tools in Goose."""
        try:
            req = urllib.request.Request(f"{self.base_url}/extensions")
            with urllib.request.urlopen(req, timeout=5) as r:
                data = json.loads(r.read())
                return data if isinstance(data, list) else data.get("extensions", [])
        except Exception as e:
            return [{"error": str(e)}]

    # ── Core ask / stream ─────────────────────────────────────────────────

    def ask(self, message: str, session_id: str = None) -> str:
        """
        Send a message to Goose and return the full response text.
        Uses the /reply endpoint (SSE streamed, we collect it all).
        """
        sid = session_id or self._session_id
        if not sid:
            sid = self.create_session("axoniz-bridge")

        full = []
        for chunk in self._stream_reply(message, sid):
            full.append(chunk)
        return "".join(full).strip()

    def ask_stream(self, message: str, session_id: str = None) -> Iterator[str]:
        """Stream tokens from Goose for live display."""
        sid = session_id or self._session_id
        if not sid:
            sid = self.create_session("axoniz-bridge")
        yield from self._stream_reply(message, sid)

    def _stream_reply(self, message: str, session_id: str) -> Iterator[str]:
        """
        POST /reply with SSE, yield content tokens.
        Goose SSE format: data: {"type":"Message","content":"..."}
        """
        payload = json.dumps({
            "session_id": session_id,
            "message": message,
        }).encode()
        req = urllib.request.Request(
            f"{self.base_url}/reply",
            data=payload,
            headers={
                "Content-Type":  "application/json",
                "Accept":        "text/event-stream",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                buf = b""
                for raw in r:
                    buf += raw
                    # Process complete SSE lines
                    while b"\n" in buf:
                        line, buf = buf.split(b"\n", 1)
                        line = line.strip()
                        if not line or line == b":":
                            continue
                        if line.startswith(b"data: "):
                            chunk_str = line[6:].decode("utf-8", errors="replace").strip()
                            if chunk_str == "[DONE]":
                                return
                            try:
                                ev = json.loads(chunk_str)
                                # Goose may use different event schemas
                                text = (
                                    ev.get("content")
                                    or ev.get("text")
                                    or ev.get("delta", {}).get("content", "")
                                    or ""
                                )
                                if text:
                                    yield text
                            except json.JSONDecodeError:
                                # Plain text chunk
                                yield chunk_str
        except urllib.error.URLError as e:
            yield f"[Goose offline: {e.reason}]"
        except Exception as e:
            yield f"[Goose error: {e}]"

    # ── MCP tool passthrough ──────────────────────────────────────────────

    def call_mcp_tool(self, tool_name: str, args: dict, session_id: str = None) -> str:
        """
        Call an MCP tool that Goose has loaded, via Goose's /mcp/call endpoint.
        Falls back to asking Goose to use the tool via natural language.
        """
        # Try direct MCP call endpoint first
        try:
            payload = json.dumps({"tool": tool_name, "args": args}).encode()
            req = urllib.request.Request(
                f"{self.base_url}/mcp/call",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=30) as r:
                result = json.loads(r.read())
                return json.dumps(result, indent=2, default=str)
        except Exception:
            pass

        # Fallback: ask Goose to use the tool naturally
        args_str = ", ".join(f"{k}={json.dumps(v)}" for k, v in args.items())
        prompt = f"Use the {tool_name} tool with these arguments: {args_str}. Return only the result."
        return self.ask(prompt, session_id)

    # ── axoniz tool map ──────────────────────────────────────────────────

    def as_tool_map(self) -> Dict[str, callable]:
        """
        Returns a dict of callable tools that can be injected into
        an axoniz Agent's _tool_map.
        """
        return {
            "goose_ask":              self._tool_ask,
            "goose_session_list":     self._tool_session_list,
            "goose_session_create":   self._tool_session_create,
            "goose_extensions_list":  self._tool_extensions_list,
            "goose_mcp_call":         self._tool_mcp_call,
            "goose_health":           self._tool_health,
        }

    def as_tool_schemas(self) -> List[dict]:
        """OpenAI-format tool schemas for injection into TOOL_SCHEMAS."""
        return [
            {
                "type": "function",
                "function": {
                    "name": "goose_ask",
                    "description": (
                        "Delegate a complex task to Goose AI agent. Goose is a powerful "
                        "agent that can install packages, run code, browse the web, edit "
                        "files, and use MCP extensions. Use for multi-step tasks requiring "
                        "autonomous execution."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "task": {"type": "string", "description": "The task to delegate to Goose"},
                            "session_id": {"type": "string", "description": "Optional session ID"},
                        },
                        "required": ["task"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "goose_session_list",
                    "description": "List all active Goose sessions.",
                    "parameters": {"type": "object", "properties": {}, "required": []},
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "goose_extensions_list",
                    "description": "List all MCP extensions loaded in Goose.",
                    "parameters": {"type": "object", "properties": {}, "required": []},
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "goose_mcp_call",
                    "description": "Call a specific MCP tool that Goose has loaded.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "tool_name": {"type": "string"},
                            "args": {"type": "object", "description": "Tool arguments"},
                        },
                        "required": ["tool_name", "args"],
                    },
                },
            },
        ]

    # ── Tool impl ─────────────────────────────────────────────────────────

    def _tool_ask(self, task: str, session_id: str = None) -> str:
        if not self.is_available():
            return "[ERROR] Goose is not running. Start it with: goose serve"
        return self.ask(task, session_id)

    def _tool_session_list(self) -> str:
        sessions = self.list_sessions()
        if not sessions:
            return "No Goose sessions found."
        return "Goose sessions:\n" + json.dumps(sessions, indent=2, default=str)

    def _tool_session_create(self, name: str = None) -> str:
        return f"Created Goose session: {self.create_session(name)}"

    def _tool_extensions_list(self) -> str:
        exts = self.list_extensions()
        if not exts:
            return "No Goose extensions loaded."
        return "Goose MCP extensions:\n" + json.dumps(exts, indent=2, default=str)

    def _tool_mcp_call(self, tool_name: str, args: dict) -> str:
        return self.call_mcp_tool(tool_name, args)

    def _tool_health(self) -> str:
        return json.dumps(self.health(), indent=2)

    # ── Auto-spawn ────────────────────────────────────────────────────────

    def _spawn(self):
        """Try to start goose serve in the background."""
        try:
            self._proc = subprocess.Popen(
                [self.goose_bin, "serve"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            # Wait up to 10s for it to come online
            for _ in range(20):
                time.sleep(0.5)
                if self.is_available():
                    print(f"  \033[92m[Goose]\033[0m serve started at {self.base_url}")
                    return
            print(f"  \033[93m[Goose]\033[0m serve did not start in time")
        except FileNotFoundError:
            print(f"  \033[93m[Goose]\033[0m binary '{self.goose_bin}' not found — install from https://github.com/aaif-goose/goose")

    def stop(self):
        if self._proc:
            self._proc.terminate()
            self._proc = None


# Module-level singleton
_bridge: Optional[GooseBridge] = None


def get_bridge(base_url: str = None, auto_start: bool = False) -> GooseBridge:
    global _bridge
    if _bridge is None:
        _bridge = GooseBridge(base_url=base_url, auto_start=auto_start)
    return _bridge
