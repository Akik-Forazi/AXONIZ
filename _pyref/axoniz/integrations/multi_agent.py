"""
axoniz Multi-Agent Router
=========================
Routes tasks to the most capable agent:
  - axoniz (local, fast, direct tool execution)
  - Goose  (complex multi-step, MCP extensions, coding)
  - Claude (cloud, complex reasoning, long context)
  - Custom (any additional agent the user registers)

Usage:
    from axoniz.integrations.multi_agent import MultiAgentRouter
    router = MultiAgentRouter(axoniz_agent=agent)
    result = router.route("build a full REST API for a blog")
    # → routes to Goose if available, else axoniz
"""

import json
import re
from typing import Callable, Dict, List, Optional

from axoniz.core.debug import info, warn, debug


# ─── Routing rules ────────────────────────────────────────────────────────────

# Tasks matching these patterns route to Goose (complex multi-step code tasks)
GOOSE_PATTERNS = [
    r"build\s+(a\s+)?(full|complete|entire)",
    r"create\s+(a\s+)?(full\s+)?app",
    r"set\s+up\s+(a\s+)?project",
    r"install\s+and\s+configure",
    r"refactor\s+(entire|whole|all)",
    r"write\s+(all|every|complete)",
    r"multi.?step",
    r"end.?to.?end",
    r"production.?ready",
    r"deploy",
    r"docker",
    r"ci/?cd",
    r"test suite",
    r"benchmark",
]

# Tasks for Claude (cloud, high reasoning, long-form)
CLAUDE_PATTERNS = [
    r"explain\s+(in\s+)?detail",
    r"analyze\s+this\s+(document|paper|report|code)",
    r"summarize\s+(this\s+)?(long|entire|full)",
    r"write\s+(a\s+)?(formal|detailed|comprehensive)",
    r"research",
    r"compare\s+and\s+contrast",
    r"pros\s+and\s+cons",
]

# Memory-heavy tasks route to MemPalace search first
MEMORY_PATTERNS = [
    r"remember",
    r"recall",
    r"what\s+did\s+(?:we|i)",
    r"previous",
    r"last\s+time",
    r"history",
    r"past",
    r"context",
]


def _matches_any(text: str, patterns: List[str]) -> bool:
    t = text.lower()
    return any(re.search(p, t) for p in patterns)


# ─── Router ──────────────────────────────────────────────────────────────────

class MultiAgentRouter:
    """
    Routes tasks to the best available agent.

    Priority order (configurable):
      1. Check memory patterns → inject MemPalace context first
      2. If Goose available + matches goose patterns → delegate to Goose
      3. If Claude available + matches claude patterns → delegate to Claude
      4. Default → axoniz local agent

    All agents stream tokens to the same on_token callback so the UI
    gets a unified live stream regardless of which agent is running.
    """

    def __init__(
        self,
        axoniz_agent=None,
        goose_bridge=None,
        mempalace_bridge=None,
        on_token: Callable = None,
        on_agent_switch: Callable = None,
    ):
        self.axoniz    = axoniz_agent
        self.goose     = goose_bridge
        self.mempalace = mempalace_bridge
        self.on_token  = on_token
        self.on_agent_switch = on_agent_switch
        self._custom_agents: Dict[str, Callable] = {}

    def register(self, name: str, handler: Callable):
        """Register a custom agent handler: handler(task: str) -> str"""
        self._custom_agents[name] = handler
        return self

    def route(self, task: str, mode: str = "auto") -> str:
        """
        Route a task to the best agent and return the result.

        mode:
          "auto"      — smart routing based on task content
          "axoniz"    — always use axoniz
          "goose"     — always use Goose
          "claude"    — always use Claude (via axoniz's AnthropicBackend)
        """
        debug(f"[Router] routing task={task[:80]} mode={mode}")

        # Inject MemPalace context if relevant
        context_prefix = ""
        if self.mempalace and self.mempalace.is_available():
            if _matches_any(task, MEMORY_PATTERNS):
                ctx = self.mempalace.search(task, top_k=3)
                if ctx and "[MemPalace" not in ctx:
                    context_prefix = f"[Relevant memory context]\n{ctx}\n\n"

        enriched_task = context_prefix + task

        if mode == "goose" or (mode == "auto" and self._should_use_goose(task)):
            return self._run_goose(enriched_task)

        if mode == "claude" or (mode == "auto" and self._should_use_claude(task)):
            return self._run_claude(enriched_task)

        # Default: axoniz
        return self._run_axoniz(enriched_task)

    def route_stream(self, task: str, mode: str = "auto"):
        """Stream route — yields (agent_name, token) tuples."""
        debug(f"[Router] stream routing task={task[:80]} mode={mode}")

        context_prefix = ""
        if self.mempalace and self.mempalace.is_available():
            if _matches_any(task, MEMORY_PATTERNS):
                ctx = self.mempalace.search(task, top_k=3)
                if ctx and "[MemPalace" not in ctx:
                    context_prefix = f"[Relevant memory context]\n{ctx}\n\n"

        enriched_task = context_prefix + task

        if mode == "goose" or (mode == "auto" and self._should_use_goose(task)):
            if self.on_agent_switch:
                self.on_agent_switch("goose")
            yield from (("goose", t) for t in self._stream_goose(enriched_task))
        elif mode == "claude" or (mode == "auto" and self._should_use_claude(task)):
            if self.on_agent_switch:
                self.on_agent_switch("claude")
            yield from (("claude", t) for t in self._stream_claude(enriched_task))
        else:
            if self.on_agent_switch:
                self.on_agent_switch("axoniz")
            yield from (("axoniz", t) for t in self._stream_axoniz(enriched_task))

    def which_agent(self, task: str) -> str:
        """Predict which agent would handle this task without running it."""
        if self._should_use_goose(task): return "goose"
        if self._should_use_claude(task): return "claude"
        return "axoniz"

    def status(self) -> dict:
        """Return availability status of all connected agents."""
        return {
            "axoniz":    bool(self.axoniz),
            "goose":     bool(self.goose and self.goose.is_available()),
            "mempalace": bool(self.mempalace and self.mempalace.is_available()),
            "custom":    list(self._custom_agents.keys()),
        }

    # ── Routing decisions ─────────────────────────────────────────────────

    def _should_use_goose(self, task: str) -> bool:
        if not self.goose or not self.goose.is_available():
            return False
        return _matches_any(task, GOOSE_PATTERNS)

    def _should_use_claude(self, task: str) -> bool:
        if not self.axoniz:
            return False
        provider = self.axoniz.config.get("provider", "")
        if provider not in ("anthropic", "claude"):
            return False
        return _matches_any(task, CLAUDE_PATTERNS)

    # ── Execution ─────────────────────────────────────────────────────────

    def _run_goose(self, task: str) -> str:
        info("[Router] → Goose")
        try:
            return self.goose.ask(task)
        except Exception as e:
            warn(f"[Router] Goose failed, falling back to axoniz: {e}")
            return self._run_axoniz(task)

    def _run_axoniz(self, task: str) -> str:
        info("[Router] → axoniz")
        if self.axoniz:
            return self.axoniz.run(task)
        return "[ERROR] No axoniz agent configured"

    def _run_claude(self, task: str) -> str:
        info("[Router] → Claude (via axoniz AnthropicBackend)")
        return self._run_axoniz(task)  # axoniz routes to Claude via its backend

    def _stream_goose(self, task: str):
        try:
            yield from self.goose.ask_stream(task)
        except Exception as e:
            yield from self._stream_axoniz(task)

    def _stream_axoniz(self, task: str):
        """Stream axoniz chat (not full agent run, for simplicity)."""
        if self.axoniz:
            yield from self.axoniz.chat_stream(task)

    def _stream_claude(self, task: str):
        yield from self._stream_axoniz(task)


# ─── Global router factory ─────────────────────────────────────────────────

_router: Optional[MultiAgentRouter] = None


def get_router(axoniz_agent=None) -> MultiAgentRouter:
    global _router
    if _router is None:
        from axoniz.integrations.goose import GooseBridge
        from axoniz.integrations.mempalace import MemPalaceBridge
        goose = GooseBridge()
        mempalace = MemPalaceBridge()
        _router = MultiAgentRouter(
            axoniz_agent=axoniz_agent,
            goose_bridge=goose,
            mempalace_bridge=mempalace,
        )
    elif axoniz_agent and not _router.axoniz:
        _router.axoniz = axoniz_agent
    return _router
