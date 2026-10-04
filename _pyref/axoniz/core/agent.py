"""
BERU â€” The Ant King â€” Agent Core v7
=====================================
Phase 1: TrajectoryStore, ConfidenceScorer, SelfCorrector â€” wired into _exec()
Phase 2: SwarmOrchestrator â€” parallel sub-agent (shadow army) execution
Phase 3: ASTIndexer â€” real AST codebase understanding
Phase 4: axonizDaemon â€” background file watcher + scheduled tasks
Phase 5: PredictiveEngine â€” intent modeling from behavioral history
Phase 6+: Persona engine (beru.yaml), authority engine â€” integration with Jarvis arch
"""

import json
import os
import re
import threading
import time
from datetime import datetime
from typing import Callable, Iterator, List, Optional

from axoniz.core.history import ChatHistory
from axoniz.core.debug import debug, info, warn, error
from axoniz.core.extras import WorkspaceIndexer, GitTools, TokenCounter
from axoniz.tools.file_tools import FileTools
from axoniz.tools.shell_tools import ShellTools
from axoniz.tools.web_tools import WebTools
from axoniz.tools.code_tools import CodeTools
from axoniz.tools.axodex_tools import AxodexTools
from axoniz.tools.computer_tools import ComputerTools

# Unified memory â€” the brain
from axoniz.integrations.unified_memory import UnifiedMemory

# Phase 1 â€” Self-aware execution intelligence
from axoniz.core.intelligence import (
    TrajectoryStore, get_store,
    ConfidenceScorer, assess_risk,
    SelfCorrector, classify_error, ErrorType,
    # Phase 2
    SwarmOrchestrator, SwarmResult,
    # Phase 3
    ASTIndexer,
    # Phase 4
    axonizDaemon, ScheduledTask,
    # Phase 5
    PredictiveEngine,
    # Context Compression (Phase 6+)
    ContextCompressor,
    # Skill Distillation (Phase 11)
    SkillDistiller,
    # Reflex Engine
)
from axoniz.core.intelligence.reflex import ShadowGuardReflex

# backward-compat
from axoniz.core.memory import SemanticMemory as Memory   # noqa: F401

# â”€â”€ Phase 7: Authority + Workflows + Awareness + Voice + Goals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Lazy-imported to keep startup fast; only wired in when needed
_authority_engine = None
_workflow_engine  = None
_awareness_svc    = None
_tts_engine       = None
_goal_service     = None

def _get_authority():
    global _authority_engine
    if _authority_engine is None:
        try:
            from axoniz.core.authority import get_engine
            _authority_engine = get_engine()
        except Exception:
            _authority_engine = False
    return _authority_engine if _authority_engine is not False else None

def _get_workflows():
    global _workflow_engine
    if _workflow_engine is None:
        try:
            from axoniz.workflows.engine import get_workflow_engine
            _workflow_engine = get_workflow_engine()
        except Exception:
            _workflow_engine = False
    return _workflow_engine if _workflow_engine is not False else None

def _get_awareness():
    global _awareness_svc
    if _awareness_svc is None:
        try:
            from axoniz.awareness.service import get_awareness_service
            _awareness_svc = get_awareness_service()
        except Exception:
            _awareness_svc = False
    return _awareness_svc if _awareness_svc is not False else None

def _get_tts():
    global _tts_engine
    if _tts_engine is None:
        try:
            from axoniz.voice.tts import get_tts
            _tts_engine = get_tts()
        except Exception:
            _tts_engine = False
    return _tts_engine if _tts_engine is not False else None

def _get_goals():
    global _goal_service
    if _goal_service is None:
        try:
            from axoniz.goals.service import get_goal_service
            _goal_service = get_goal_service()
        except Exception:
            _goal_service = False
    return _goal_service if _goal_service is not False else None

# â”€â”€ Persona engine (BERU identity) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
from axoniz.core.persona import get_persona

# â”€â”€â”€ Fallback system prompt (used only if persona.yaml fails to load) â”€â”€â”€â”€â”€â”€â”€â”€â”€

_FALLBACK_SYSTEM_PROMPT = """You are FRAZIYM AI, a local-first AI agent.
Execute tasks with tools. Never guess. Read before editing. Verify after changes.
When done, call done() with a concise summary."""


# â”€â”€â”€ Tool schemas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _make_tool_schemas() -> List[dict]:
    def fn(name, desc, props, req):
        return {"type": "function", "function": {
            "name": name, "description": desc,
            "parameters": {"type": "object", "properties": props, "required": req}
        }}
    S = {"type": "string"}
    I = {"type": "integer"}
    N = {"type": "number"}

    return [
        fn("file_read",    "Read a file with line numbers.",         {"path": S}, ["path"]),
        fn("file_write",   "Write/overwrite a file.",                {"path": S, "content": S}, ["path", "content"]),
        fn("file_edit",    "Find-and-replace inside a file.",        {"path": S, "old": S, "new": S}, ["path", "old", "new"]),
        fn("file_delete",  "Delete a file or directory.",            {"path": S}, ["path"]),
        fn("file_list",    "List directory contents.",               {"path": {"type":"string","default":"."}}, []),
        fn("file_search",  "Find files matching a glob pattern.",    {"path": {"type":"string","default":"."}, "pattern": S}, ["pattern"]),
        fn("file_append",  "Append text to end of file.",            {"path": S, "content": S}, ["path", "content"]),
        fn("shell_run",    "Run a shell/CMD command.",               {"command": S}, ["command"]),
        fn("shell_python", "Execute Python code, capture output.",   {"code": S}, ["code"]),
        fn("web_get",      "Fetch text content from a URL.",         {"url": S}, ["url"]),
        fn("web_search",   "Search the web via DuckDuckGo.",         {"query": S}, ["query"]),
        fn("code_lint",    "Lint a Python file with flake8.",        {"path": S}, ["path"]),
        fn("code_format",  "Format a Python file with black.",       {"path": S}, ["path"]),
        fn("code_tree",    "Show file/directory tree.",              {"path": {"type":"string","default":"."}}, []),
        fn("code_analyze", "List classes/functions in Python files.", {"path": {"type":"string","default":"."}}, []),
        fn("memory_save",  "Save key-value to persistent memory.",   {"key": S, "value": S}, ["key", "value"]),
        fn("memory_get",   "Get a value from persistent memory.",    {"key": S}, ["key"]),
        fn("memory_list",  "List all memory keys.",                  {}, []),
        fn("palace_search",
           "Semantic search across the palace. ALWAYS use before answering about past projects.",
           {"query": S, "wing": {"type":"string"}, "room": {"type":"string"}, "limit": I}, ["query"]),
        fn("palace_store",
           "Save content to palace. wing=domain, room=sub-topic.",
           {"wing": S, "room": S, "content": S}, ["wing", "room", "content"]),
        fn("palace_context", "Load palace overview. Call at session start.", {}, []),
        fn("palace_wings",   "List all palace wings.",               {}, []),
        fn("palace_rooms",   "List rooms inside a wing.",            {"wing": S}, []),
        fn("palace_check_dup", "Check if content already exists.",   {"content": S, "threshold": N}, ["content"]),
        fn("palace_delete",  "Delete a palace drawer by ID.",        {"drawer_id": S}, ["drawer_id"]),
        fn("palace_graph_traverse", "Walk palace graph from a room.",{"start_room": S, "max_hops": I}, ["start_room"]),
        fn("palace_find_tunnels",   "Find rooms bridging two wings.",{"wing_a": S, "wing_b": S}, []),
        fn("palace_graph_stats",    "Palace graph overview.",        {}, []),
        fn("kg_add",
           "Add temporal fact: subject â†’ predicate â†’ object.",
           {"subject": S, "predicate": S, "obj": S, "valid_from": {"type":"string"}, "source": {"type":"string"}},
           ["subject", "predicate", "obj"]),
        fn("kg_query",
           "Query knowledge graph for an entity.",
           {"entity": S, "as_of": {"type":"string"}, "direction": {"type":"string"}}, ["entity"]),
        fn("kg_invalidate",
           "Mark a fact as no longer true.",
           {"subject": S, "predicate": S, "obj": S, "ended": {"type":"string"}},
           ["subject", "predicate", "obj"]),
        fn("kg_timeline",   "Timeline of facts for an entity.",     {"entity": {"type":"string"}}, []),
        fn("kg_stats",      "Knowledge graph statistics.",          {}, []),
        fn("diary_write",   "Write a diary entry (AAAK format).",   {"entry": S, "topic": {"type":"string"}}, ["entry"]),
        fn("diary_read",    "Read recent diary entries.",           {"last_n": I}, []),
        fn("get_time",     "Get current date, time, day of week, or any time-related info.",
           {"query": {"type":"string","description":"What to return: time|date|datetime|day|year|all","default":"all"}}, []),
        fn("done",          "Call when the task is fully complete.",
           {"result": {"type":"string","description":"Full summary of everything accomplished"}}, ["result"]),
        fn("absolute_query",
           "Absolute search: Queries BOTH the current code graph (Axodex) and long-term semantic memory (Palace).",
           {"query": S}, ["query"]),
        # â”€â”€ Swarm (The Shadow Army) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        fn("swarm_spawn",
           "Decompose a complex task and execute it in parallel using a swarm of worker agents (Shadow Army).",
           {"task": S, "workers": {"type":"integer","default":4}}, ["task"]),
        fn("shadow_step",
           "Speculative Execution: Create a temporary shadow branch, execute a task, test it, and merge only if 100% successful.",
           {"task": S, "test_cmd": {"type":"string","description":"Command to run to verify success"}}, ["task"]),

        # â”€â”€ Axodex (The Marshal's Eye) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        fn("axodex_query",
           "Semantic search for concepts, functions, or execution flows in a million-line codebase.",
           {"query": S, "limit": I}, ["query"]),
        fn("axodex_context",
           "Get full graph context for a symbol: callers, callees, definitions, and execution flows.",
           {"name": S}, ["name"]),
        fn("axodex_smart_read",
           "Superior read: Get symbol definition AND its immediate graph neighbors for maximum architectural context.",
           {"symbol_name": S}, ["symbol_name"]),
        fn("axodex_impact",
           "Blast radius analysis: what will break if I change this symbol? Shows upstream callers.",
           {"target": S, "direction": {"type":"string","default":"upstream"}}, ["target"]),
        fn("axodex_detect_changes",
           "Verify which symbols and execution flows are affected by your current uncommitted edits.",
           {}, []),
        fn("axodex_status",
           "Check codebase index freshness, symbol count, and repo statistics.",
           {}, []),
        fn("axodex_analyze",
           "Force a full refresh of the codebase graph index.",
           {}, []),
        # â”€â”€ Git tools â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        fn("git_status",   "Git status of workspace.",                  {}, []),
        fn("git_diff",     "Git diff of changes.",                      {"path": {"type":"string"}}, []),
        fn("git_log",      "Recent git commits.",                       {"n": I}, []),
        fn("git_add",      "Stage files for commit.",                   {"path": {"type":"string","default":"."}}, []),
        fn("git_commit",   "Create a git commit.",                      {"message": S}, ["message"]),
        fn("git_branch",   "List git branches.",                        {}, []),
        fn("git_checkout", "Switch/create branch.",                     {"branch": S, "create": {"type":"boolean"}}, ["branch"]),
        fn("git_push",     "Push to remote.",                           {"remote": {"type":"string"}, "branch": {"type":"string"}}, []),
        fn("git_pull",     "Pull from remote.",                         {}, []),
        fn("git_stash",    "Stash uncommitted changes.",                 {}, []),
        # â”€â”€ Computer tools â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        fn("war_room",      "Summary of background daemon events, audits, and uncommitted changes.", {}, []),
        fn("mouse_move",   "Move mouse to (x, y) coordinates.",         {"x": I, "y": I}, ["x", "y"]),
        fn("mouse_click",  "Click at (x, y) or current position.",      {"x": I, "y": I, "button": {"type":"string","default":"left"}}, []),
        fn("key_type",     "Type text with the keyboard.",              {"text": S}, ["text"]),
        fn("key_press",    "Press a special key (enter, esc, ctrl).",   {"key": S}, ["key"]),
        fn("screen_size",  "Get screen resolution.",                    {}, []),
        fn("screen_capture","Take a screenshot.",                       {"filename": {"type":"string","default":"screenshot.png"}}, []),
        fn("screen_find",  "Find text coordinates on screen via OCR.",  {"text": S}, ["text"]),
        # â”€â”€ Goals (Phase 11) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        fn("goal_create",  "Create a new high-level objective.",        {"title": S, "description": S, "deadline": S, "priority": S}, ["title"]),
        fn("goal_list",    "List current objectives and their scores.", {"status": S}, []),
        fn("goal_kr_add",  "Add a Key Result to an objective.",         {"goal_id": S, "title": S, "target": S, "deadline": S}, ["goal_id", "title"]),
        fn("goal_action_add", "Add a daily action for a key result.",   {"kr_id": S, "title": S, "scheduled_date": S}, ["kr_id", "title"]),
        fn("goal_update_score", "Update progress score (0.0-1.0).",    {"goal_id": S, "score": N, "kr_id": S}, ["goal_id", "score"]),
        fn("goal_action_complete", "Mark a daily action as done.",     {"action_id": S}, ["action_id"]),
        fn("goal_report",  "Get a briefing on all active goals.",       {}, []),
    ]


TOOL_SCHEMAS = _make_tool_schemas()

# llama.cpp (and OpenAI-style backends) support native tool calling via function schemas.
# We'll rely on the backend to provide ToolCallResponse if it can, otherwise fallback to parsing.

_TOOL_RE = re.compile(r'<tool>(.*?)</tool>', re.DOTALL)
_JSON_RE = re.compile(r'```(?:json)?\s*([\s\S]*?)```', re.DOTALL)


def _parse_fallback_calls(text: str) -> List[dict]:
    calls = []
    # 1. Primary: <tool>{...}</tool>
    for m in _TOOL_RE.finditer(text):
        content = m.group(1).strip()
        
        # Aggressive cleanup for 3B hallucinations (trailing commas, extra braces)
        content = re.sub(r',(\s*[}\]])', r'\1', content)
        
        # Handle extra trailing braces by balanced brace counting
        if content.startswith('{'):
            count = 0
            end_idx = -1
            for i, char in enumerate(content):
                if char == '{': count += 1
                elif char == '}': count -= 1
                if count == 0:
                    end_idx = i
                    break
            if end_idx != -1:
                content = content[:end_idx+1]

        try:
            obj  = json.loads(content)
            name = obj.get("name") or obj.get("tool") or obj.get("function")
            args = obj.get("args") or obj.get("arguments") or {}
            if isinstance(args, str):
                try: args = json.loads(args)
                except: args = {}
            if name:
                calls.append({"name": str(name), "args": dict(args)})
        except Exception:
            # Try a direct regex fallback for partial success
            fn_match = re.search(r'"(?:name|tool|function)"\s*:\s*"(\w+)"', content)
            if fn_match:
                name = fn_match.group(1)
                # Try to extract args via another regex if needed
                calls.append({"name": name, "args": {}})
    
    if calls: return calls
    for m in _JSON_RE.finditer(text):
        try:
            obj  = json.loads(m.group(1).strip())
            name = obj.get("name") or obj.get("tool")
            args = obj.get("args") or obj.get("arguments") or {}
            if name: calls.append({"name": str(name), "args": dict(args)})
        except Exception:
            pass
    if calls: return calls
    for m in re.finditer(r'\{[^{}]*"name"\s*:\s*"(\w+)"[^{}]*\}', text, re.DOTALL):
        try:
            obj  = json.loads(m.group())
            name = obj.get("name") or obj.get("tool")
            args = obj.get("args") or obj.get("arguments") or {}
            if isinstance(args, str):
                try: args = json.loads(args)
                except: args = {}
            if name: calls.append({"name": str(name), "args": dict(args)})
        except Exception:
            pass
    return calls


def _is_done(text: str) -> bool:
    t = text.lower()
    return any(s in t for s in [
        "task complete", "task is complete", "all done", "i have completed",
        "i've completed", "finished.", "the task has been", "<endofop>",
        "i have finished", "successfully completed", "no more steps",
        "everything is done", "task accomplished",
    ])


# â”€â”€â”€ Agent â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class Agent:
    def __init__(self, **kwargs):
        _drop = {"web_port", "_home", "_models_dir"}
        self.config    = {k: v for k, v in kwargs.items() if k not in _drop}
        self.workspace = os.path.abspath(kwargs.get("workspace", "."))

        # Core tools
        self.file_tools  = FileTools(self.workspace)
        self.shell_tools = ShellTools(self.workspace)
        self.web_tools   = WebTools()
        self.code_tools  = CodeTools(self.workspace)
        self.computer_tools = ComputerTools(self.workspace)
        self.reflex      = ShadowGuardReflex(self)
        self.history     = ChatHistory()
        self.git_tools   = GitTools(self.workspace)
        self.indexer     = WorkspaceIndexer(self.workspace)
        self.ast_index   = ASTIndexer(self.workspace)
        self.axodex     = AxodexTools(self.workspace)
        
        # â”€â”€ Context Compression (Phase 6+) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        # Ported from Hermes: Iterative structured summarization
        self.compressor = ContextCompressor(
            model=self.config.get("model_name", "auto"),
            context_length=int(self.config.get("n_ctx", 32768)),
            threshold_percent=0.40, # Distill early to prevent drowning
            protect_first_n=1,      # Only protect system prompt
            protect_last_n=6,       # Keep last 3 turns
        )

        # Standby mode â€” don't load LLM weights on startup
        self.standby     = kwargs.get("standby", False)
        self._llm_loaded = False
        self.llm         = None

        # Unified memory (TF-IDF + Palace + KG + Diary)
        self.memory = UnifiedMemory(config={
            "agent_name": kwargs.get("agent_name", "beru"),
        })

        # â”€â”€ Persona (BERU identity + role system) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        self.persona = get_persona(kwargs.get("role", "beru"))

        # â”€â”€ Phase 1: Self-aware execution intelligence â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        self.trajectory = get_store()          # Behavioral experience recorder
        self.confidence = ConfidenceScorer(    # Risk gate before dangerous actions
            risk_threshold=float(kwargs.get("risk_threshold", 0.75)),
            trajectory_store=self.trajectory,
        )
        self.corrector  = SelfCorrector()      # Live error detection + guidance
        self._traj_session_id: Optional[str] = None  # Current trajectory session

        # â”€â”€ Phase 4: Background Daemon â€” ALWAYS ON â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        self.daemon = axonizDaemon(
            agent=self,
            workspace=self.workspace,
            on_event=self._on_daemon_event,
        )
        # Daemon is always started â€” it's the OS layer, not optional
        self.daemon.start()

        # â”€â”€ Phase 5: Predictive Engine â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        self.predictor = PredictiveEngine(self)

        # â”€â”€ Phase 11: Skill Distiller â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        self.distiller = SkillDistiller(self)

        # â”€â”€ Tool map â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        self._tool_map: dict = {
            "file_read":    self.file_tools.read,
            "file_write":   self.file_tools.write,
            "file_edit":    self.file_tools.edit,
            "file_delete":  self.file_tools.delete,
            "file_list":    self.file_tools.list_dir,
            "file_search":  self.file_tools.search,
            "file_append":  self.file_tools.append,
            "shell_run":    self.shell_tools.run,
            "shell_python": self.shell_tools.run_python,
            "web_get":      self.web_tools.get,
            "web_search":   self.web_tools.search,
            "war_room":     self._tool_war_room,
            "code_lint":    self.code_tools.lint,
            "code_format":  self.code_tools.format_code,
            "code_tree":    self.code_tools.tree,
            "code_analyze": self.code_tools.analyze,
            "done":         self._done,
            "get_time":     self._tool_get_time,
            "optimize_hardware": self._tool_optimize_hardware,
        }
        # Inject computer tools
        self._tool_map.update(self.computer_tools.as_tool_map())
        # Inject unified memory tools
        self._tool_map.update(self.memory.as_tool_map())
        self._tool_map.update({
            "absolute_query": self._tool_absolute_query,
        })
        # Inject git tools
        self._tool_map.update(self.git_tools.as_tool_map())
        # Inject Swarm tools (The Shadow Army)
        self._tool_map.update({
            "swarm_spawn": self._tool_swarm_spawn,
            "shadow_step": self._tool_shadow_step,
        })

        # Inject Axodex tools (The Marshal's Eye)
        self._tool_map.update({
            "axodex_query": self.axodex.query,
            "axodex_context": self.axodex.context,
            "axodex_smart_read": self.axodex.smart_read,
            "axodex_impact": self.axodex.impact,
            "axodex_detect_changes": self.axodex.detect_changes,
            "axodex_status": self.axodex.status,
            "axodex_analyze": self.axodex.analyze,
        })
        
        # Inject Goal tools (Phase 11)
        self._tool_map.update({
            "goal_create": self._tool_goal_create,
            "goal_list": self._tool_goal_list,
            "goal_kr_add": self._tool_goal_kr_add,
            "goal_action_add": self._tool_goal_action_add,
            "goal_update_score": self._tool_goal_update_score,
            "goal_action_complete": self._tool_goal_action_complete,
            "goal_report": self._tool_goal_report,
        })
        # Phase 2: Swarm is invoked explicitly via agent.swarm.run(), not as a tool

        # Callbacks
        self.on_step:        Optional[Callable] = None
        self.on_token:       Optional[Callable] = None
        self.on_thought:     Optional[Callable] = None
        self.on_tool_call:   Optional[Callable] = None
        self.on_tool_result: Optional[Callable] = None
        self.on_done:        Optional[Callable] = None

        self._finished     = False
        self._final_result = None
        self._abort_event: Optional[threading.Event] = None
        self._step_counter = 0

        if not self.standby:
            self._build_llm()
        
        # â”€â”€ Phase 7: Start workflow engine wired to this agent â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        try:
            wf = _get_workflows()
            if wf:
                wf.set_agent_callback(self.run)
                wf.start()
        except Exception:
            pass

        info(
            f"[BERU v7] ready | role={self.persona.role_id} | workspace={self.workspace} "
            f"| palace={self.memory.palace.is_available()} "
            f"| trajectory={os.path.exists(self.trajectory.db_path)} "
            f"| axodex=ready | daemon={'on' if self.daemon.is_running() else 'off'}"
        )

    # â”€â”€ Daemon event handler (Phase 4) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def _on_daemon_event(self, event):
        """Called by daemon when a file changes or a scheduled task fires."""
        kind = event.kind
        payload = event.payload
        if kind == "syntax_error":
            warn(f"[Daemon] Syntax error in {payload.get('file')}: {payload.get('error')}")
            if self.on_token:
                self.on_token(f"\n[âš¡ Daemon] Syntax error detected in {payload.get('file')}: {payload.get('error')}\n")
        elif kind == "git_uncommitted":
            debug(f"[Daemon] {payload.get('count')} uncommitted file(s)")
        elif kind == "daily_audit":
            info(f"[Daemon] Audit: {payload.get('files_checked')} files, {payload.get('syntax_errors')} errors")

    # â”€â”€ Phase 2: Swarm â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def run_swarm(self, task: str, max_workers: int = 4,
                  on_progress=None) -> str:
        """
        Run a task using the domain-expert swarm.
        Progress events are broadcast over the SSE broker so the UI can
        display live swarm status (phase transitions, model swaps, etc.).
        Returns merged result string.
        """
        try:
            from axoniz.web.server import _broker
            def _progress(event: dict):
                # Forward every swarm event to the SSE broker for UI display
                _broker.broadcast("swarm_event", event)
                # Also pipe to on_token for terminal display if set
                if self.on_token:
                    ev   = event.get("event", "")
                    name = event.get("model") or event.get("desc", "")
                    self.on_token(f"\n[âš¡ Swarm:{ev}] {name}\n" if name else f"\n[âš¡ Swarm] {ev}\n")
        except Exception:
            _progress = on_progress or self.on_token

        swarm = SwarmOrchestrator(
            agent=self,
            max_workers=max_workers,
            on_progress=_progress,
        )
        result = swarm.run(task)
        info(f"[Swarm] âœ“ Done: {result.total_ms}ms | {result.parallelism:.1f}x speedup | expert_mode={swarm._expert_mode}")
        return result.merged


    # â”€â”€ Abort â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def set_abort_event(self, ev: Optional[threading.Event]):
        self._abort_event = ev

    def _aborted(self) -> bool:
        return self._abort_event is not None and self._abort_event.is_set()

    def ensure_llm(self):
        """Ensure the LLM is loaded. Loads weights if in standby."""
        if self.llm is None or not self._llm_loaded:
            info("[Agent] Deploying heavy model weights...")
            self._build_llm()
            self._llm_loaded = True
            return True
        return False

    def unload_llm(self):
        """Unload LLM weights to free RAM (Phase 8)."""
        if self.llm:
            info("[Agent] Unloading model weights to free RAM...")
            try:
                self.llm.unload()
            except Exception: pass
            self.llm = None
            self._llm_loaded = False
            import gc
            gc.collect()
            return True
        return False

    def authority_summary(self) -> dict:
        """Expose authority engine state (Phase 7)."""
        ae = _get_authority()
        if not ae: return {"status": "disabled"}
        return {
            "status": "active",
            "summary": ae.summary(),
            "stats": ae.audit.stats(),
            "max_auto_level": ae.max_auto_level,
        }

    def authority_audit(self, limit: int = 20) -> List[dict]:
        ae = _get_authority()
        if not ae: return []
        return ae.audit.recent(limit)

    # â”€â”€ LLM backend â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def _build_llm(self):
        from axoniz.core.backend import get_backend
        # llama.cpp supports tool calling natively via model templates
        self._use_native = True 
        tools = TOOL_SCHEMAS
        self.llm = get_backend(self.config, tools=tools)
        self.backend = self.llm # Sovereign Alias
        self._llm_loaded = True
        info(f"[Agent] backend={type(self.llm).__name__}")

    def _rebuild_llm(self):
        self._build_llm()

    # â”€â”€ Done sentinel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def _tool_absolute_query(self, query: str) -> str:
        """Queries BOTH the code graph and semantic memory."""
        # 1. Code Graph
        ax_res = self.axodex.query(query)
        
        # If no index, suggest it
        if "[AXODEX ERROR] No index found" in ax_res:
             ax_res += "\nðŸ’¡ HINT: Call 'axodex_analyze' to build the first graph for this workspace."

        # 2. Semantic Memory
        pal_res = self.memory.palace.search(query, limit=5)
        pal_lines = []
        for h in pal_res.get("results", []):
            pal_lines.append(f"  [{h['wing']}/{h['room']}] {h['text'][:200]}")
            
        return (
            f"--- AXODEX (Code Graph) ---\n{ax_res}\n\n"
            f"--- MEMPALACE (Long-term) ---\n" + ("\n".join(pal_lines) if pal_lines else "No memory found.")
        )

    def _tool_swarm_spawn(self, task: str, workers: int = 4) -> str:
        """Decompose a complex task and execute it in parallel using a swarm of worker agents."""
        from axoniz.core.intelligence.swarm import SwarmOrchestrator
        swarm = SwarmOrchestrator(self, max_workers=workers)
        result = swarm.run(task)
        if result.success:
            return f"[SWARM SUCCESS] Parallelized task complete in {result.total_ms}ms ({result.parallelism}x speedup).\n\n{result.merged}"
        return f"[SWARM FAILED] Swarm could not complete task: {result.merged}"

    def _tool_shadow_step(self, task: str, test_cmd: str = "npm test") -> str:
        """Speculative execution in a shadow branch."""
        import random, string
        branch_id = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
        shadow_branch = f"shadow/{branch_id}"
        original_branch = self.git_tools.current_branch()
        
        info(f"[Shadow-Step] Stepping into shadow: {shadow_branch}")
        
        try:
            # 1. Create and checkout shadow branch
            self.git_tools.checkout(shadow_branch, create=True)
            
            # 2. Run the task
            # Use internal _run_native directly to avoid session reset
            res = self.run(task)
            
            # 3. Run verification
            test_res = self.shell_tools.run(test_cmd)
            
            if "failed" not in test_res.lower() and "error" not in test_res.lower():
                # Success: stay on branch or return and propose merge
                # We return to original to be safe, but keep the shadow branch
                self.git_tools.checkout(original_branch)
                return (
                    f"[SHADOW SUCCESS] Task completed and verified in {shadow_branch}.\n"
                    f"Tests: {test_res[:500]}\n"
                    f"Action: You can now 'git merge {shadow_branch}' to apply changes."
                )
            else:
                warn(f"[Shadow-Step] Shadow verification FAILED. Retracting to {original_branch}")
                self.git_tools.checkout(original_branch)
                return f"[SHADOW FAILED] Speculative execution failed tests:\n{test_res[:500]}"
                
        except Exception as e:
            error(f"[Shadow-Step] Shadow failed: {e}")
            try: self.git_tools.checkout(original_branch)
            except Exception: pass
            return f"[SHADOW ERROR] {e}"
        finally:
            # Ensure we are back on the original branch regardless
            try:
                if self.git_tools.current_branch() != original_branch:
                    self.git_tools.checkout(original_branch)
            except Exception: pass

    def _tool_war_room(self) -> str:
        """Summary of background daemon events, audits, and uncommitted changes."""
        st = self.daemon.status()
        events = self.daemon.get_recent_events(10)
        
        lines = [f"[War Room] Status: {'ACTIVE' if st['running'] else 'INACTIVE'}"]
        lines.append(f"  Pending lints: {st['pending_lint']}")
        
        if events:
            lines.append("  Recent background events:")
            for ev in events:
                ts = datetime.fromtimestamp(ev.ts).strftime("%H:%M:%S")
                lines.append(f"    [{ts}] {ev.kind}: {json.dumps(ev.payload)[:100]}...")
        else:
            lines.append("  No recent background events.")
            
        return "\n".join(lines)

    def _tool_get_time(self, query: str = "all") -> str:
        """Return current time/date info. Fast â€” no LLM needed."""
        from datetime import datetime
        now = datetime.now()
        q   = query.lower()
        if "time" in q and "date" not in q and q != "all":
            return now.strftime("%I:%M %p").lstrip("0")
        if "date" in q and "time" not in q:
            return now.strftime("%A, %B %d %Y")
        if "day" in q:
            return now.strftime("%A")
        if "year" in q:
            return str(now.year)
        return (
            f"{now.strftime('%A, %B %d %Y')}  "
            f"{now.strftime('%I:%M %p').lstrip('0')}  "
            f"(UTC offset: {now.astimezone().strftime('%z')})"
        )

    def _done(self, result: str = "") -> str:
        self._finished     = True
        self._final_result = result
        return f"[DONE] {result}"

    def _tool_optimize_hardware(self) -> str:
        """Benchmark and optimize the backend for local hardware."""
        from axoniz.core.optimizer import apply_optimizations
        try:
            optimized = apply_optimizations(self)
            return f"[OK] Hardware optimized: {json.dumps(optimized, indent=2)}"
        except Exception as e:
            return f"[ERROR] Optimization failed: {e}"

    # â”€â”€ Goal tools (Phase 11) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def _tool_goal_create(self, title: str, description: str = "", deadline: str = "", priority: str = "high") -> str:
        gs = _get_goals()
        if not gs: return "[ERROR] Goal service unavailable"
        g = gs.create_goal(title, description, deadline, priority)
        return f"[OK] Goal created: {g.title} (id={g.id})"

    def _tool_goal_list(self, status: str = "active") -> str:
        gs = _get_goals()
        if not gs: return "[ERROR] Goal service unavailable"
        goals = gs.list_goals(status)
        if not goals: return "No goals found."
        lines = []
        for g in goals:
            lines.append(f"[{g.id}] {g.title} | score: {g.score:.0%} | priority: {g.priority.value}")
        return "\n".join(lines)

    def _tool_goal_kr_add(self, goal_id: str, title: str, target: str = "", deadline: str = "") -> str:
        gs = _get_goals()
        if not gs: return "[ERROR] Goal service unavailable"
        kr = gs.add_key_result(goal_id, title, target, deadline)
        return f"[OK] Key Result added: {kr.title} (id={kr.id})"

    def _tool_goal_action_add(self, kr_id: str, title: str, scheduled_date: str = "") -> str:
        gs = _get_goals()
        if not gs: return "[ERROR] Goal service unavailable"
        da = gs.add_daily_action(kr_id, title, scheduled_date)
        return f"[OK] Daily Action added: {da.title} (id={da.id})"

    def _tool_goal_update_score(self, goal_id: str, score: float, kr_id: str = None) -> str:
        gs = _get_goals()
        if not gs: return "[ERROR] Goal service unavailable"
        res = gs.update_score(goal_id, score, kr_id)
        return f"[OK] {res}"

    def _tool_goal_action_complete(self, action_id: str) -> str:
        gs = _get_goals()
        if not gs: return "[ERROR] Goal service unavailable"
        res = gs.complete_action(action_id)
        return f"[OK] {res}"

    def _tool_goal_report(self) -> str:
        gs = _get_goals()
        if not gs: return "[ERROR] Goal service unavailable"
        return gs.daily_report()

    # â”€â”€ Tool execution â€” THE CORE OF PHASE 1 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def _exec(self, name: str, args: dict) -> str:
        """
        Execute a tool with:
          1. Confidence check (is this safe to run?)
          2. Timed execution
          3. Trajectory recording
          4. Self-correction analysis
        """
        if name not in self._tool_map:
            return f"[ERROR] Unknown tool '{name}'"

        # â”€â”€ 0. Authority engine gate (Phase 7) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        authority = _get_authority()
        if authority is not None and name not in ("done", "memory_get", "memory_list"):
            decision = authority.check(name, args, session_id=self._traj_session_id or "")
            if not decision.approved:
                blocked = f"[AUTHORITY BLOCKED] '{name}' denied: {decision.reason}"
                if self.on_tool_result:
                    self.on_tool_result(name, blocked)
                return blocked

        # â”€â”€ 1. Axodex Guard (Phase 3 - Superiority) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if name in ("file_edit", "file_write", "file_delete") and "path" in args:
            try:
                # Find symbol at the line being edited (rough approximation)
                # For now, let's just do an impact analysis on the file path itself if possible
                # or just note that we are guarding it.
                impact = self.axodex.impact(args["path"])
                if "[AXODEX ERROR]" not in impact:
                    debug(f"[Guard] Impact for {args['path']}: {impact[:100]}...")
                    # We don't block yet, but we ensure the agent has this in its trajectory
            except Exception: pass

        # â”€â”€ 1. Confidence / risk gate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        check = self.confidence.check(
            tool_name=name,
            args=args,
            task=self._current_task,
            session_id=self._traj_session_id or "",
        )
        if not check["allow"]:
            warning_msg = self.confidence.format_warning(check, name, args)
            blocked_msg = (
                f"[BLOCKED BY CONFIDENCE SCORER]\n{warning_msg}\n"
                f"Risk {check['risk']:.0%} exceeds threshold {self.confidence.risk_threshold:.0%}. "
                f"Choose a safer approach."
            )
            # Still record the attempt
            if self._traj_session_id:
                self.trajectory.record_step(
                    self._traj_session_id, self._step_counter,
                    name, args, blocked_msg,
                    success=False, duration_ms=0,
                    notes=f"BLOCKED: {check['reason']}"
                )
            if self.on_tool_result:
                self.on_tool_result(name, blocked_msg)
            return blocked_msg

        # â”€â”€ 2. Execute with timing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        t0 = time.time()
        try:
            raw = self._tool_map[name](**args)
            result = str(raw) if raw is not None else "OK"
            
            # â”€â”€ Phase 8: High-Precision Truncation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            if len(result) > 2000:
                result = (
                    f"{result[:1000]}\n\n"
                    f"... [TRUNCATED {len(result)-2000} characters to prevent context drowning] ...\n\n"
                    f"{result[-1000:]}\n"
                    f"HINT: Use 'axodex_smart_read' for architectural context or 'file_read' with line ranges."
                )
                
            success = True
        except TypeError as e:
            result  = f"[ERROR] Bad args for '{name}': {e}"
            success = False
        except Exception as e:
            result  = f"[ERROR] '{name}' failed: {e}"
            success = False
        duration_ms = int((time.time() - t0) * 1000)

        # â”€â”€ 3. Record to trajectory â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if self._traj_session_id:
            self.trajectory.record_step(
                session_id=self._traj_session_id,
                step_num=self._step_counter,
                tool_name=name,
                args=args,
                result=result,
                success=success,
                duration_ms=duration_ms,
            )
        self._step_counter += 1

        # â”€â”€ 4. Self-correction analysis â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        analysis = self.corrector.analyze(name, args, result, self._step_counter)
        if analysis["has_error"]:
            correction_msg = self.corrector.build_correction_message(analysis, name)
            # Append correction guidance to the result so the agent sees it
            result = f"{result}\n\n{correction_msg}"

        return result

    # â”€â”€ System prompt â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def _sys_prompt(self) -> str:
        from datetime import datetime as _dt
        now      = _dt.now()
        now_str  = now.strftime("%A, %B %d %Y â€” %I:%M %p").replace(" 0", " ")
        
        override = self.config.get("agent", {}).get("persona_override", "")
        if override:
            base = override
        else:
            try:
                base = self.persona.build_system_prompt(
                    workspace=self.workspace,
                    tool_names=list(self._tool_map.keys()),
                    session_id=self._traj_session_id or "",
                )
            except Exception:
                base = _FALLBACK_SYSTEM_PROMPT
            
        base += f"\n\nMARSHAL'S CLOCK: {now_str}\n"
        return base

    def _mem_fence(self, query: str) -> str:
        return self.memory.get_relevant_context(query)

    # â”€â”€ current task tracker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    @property
    def _current_task(self) -> str:
        return getattr(self, "_task_text", "")

    def chat(self, message: str) -> str:
        # Check for ShadowGuard Reflexes (Instant, no LLM)
        reflex_response = self.reflex.process(message)
        if reflex_response:
            info(f"[ShadowGuard] Reflex: {reflex_response}")
            if self.on_token: self.on_token(f"[ShadowGuard] {reflex_response}")
            self._speak(reflex_response)
            return reflex_response

        self.ensure_llm()
        self.history.append("user", message, mode="chat")
        self.history.append_session({"role": "user", "content": message})
        full = ""
        for tok in self.llm.stream_text(
            [{"role": "system", "content": self._sys_prompt()},
             {"role": "user",   "content": message}]
        ):
            full += tok
            if self.on_token: self.on_token(tok)
        self.history.append("assistant", full, mode="chat")
        self.history.append_session({"role": "assistant", "content": full})
        self.memory.sync_turn(message, full)
        self.memory.auto_extract_and_save(message, source="chat")
        return full

    def chat_stream(self, message: str) -> Iterator[str]:
        self.history.append("user", message, mode="chat")
        msgs = [{"role": "system", "content": self._sys_prompt()},
                {"role": "user",   "content": message}]
        full = ""
        for tok in self.llm.stream_text(msgs):
            if self._aborted(): break
            full += tok
            yield tok
        self.history.append("assistant", full, mode="chat")
        self.history.append_session({"role": "assistant", "content": full})
        self.memory.sync_turn(message, full)
        self.memory.auto_extract_and_save(message, source="chat")

    # â”€â”€ Agent run â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def marshal_scan(self) -> str:
        """The 'Marshal's Ritual': One-shot analysis of workspace health, index, and memory."""
        # 1. Axodex Status
        ax_status = self.axodex.status()
        if "[AXODEX ERROR] No index found" in ax_status:
            ax_state = "âš  UNINDEXED (Run 'axodex_analyze' for graph vision)"
        else:
            ax_state = f"âœ“ {ax_status[:60]}"

        # 2. Git Status
        git_res = self.git_tools.status()
        
        # 3. Palace Status
        pal_count = 0
        try:
            pal_count = len(self.memory.palace._db.get().get("ids", []))
        except:
            pass
        
        report = (
            f"[MARSHAL'S SCAN: {os.path.basename(self.workspace)}]\n"
            f"- Graph Vision: {ax_state}\n"
            f"- Tactical Memory: {pal_count} facts stored\n"
            f"- Workspace State: {git_res.splitlines()[0] if git_res else 'Ready'}\n"
        )
        return report

    def run(self, task: str) -> str:
        debug(f"run() task={task[:80]}")

        # â”€â”€ Step 0: Ritual â€” Proactive Awareness â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        scan_report = self.marshal_scan()
        debug(f"[Ritual] {scan_report.splitlines()[0]}")

        # Check for ShadowGuard Reflexes (Instant, no LLM)
        reflex_response = self.reflex.process(task)
        if reflex_response:
            info(f"[ShadowGuard] Reflex: {reflex_response}")
            if self.on_token: self.on_token(f"[ShadowGuard] {reflex_response}")
            self._speak(reflex_response)
            return reflex_response

        self._finished     = False
        self._final_result = None
        self._task_text    = task
        self._step_counter = 0
        self.corrector.reset()
        
        # â”€â”€ Phase 8: High-Precision History â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        # Capture task in history but keep session lean
        self.history.append("user", task, mode="agent")

        # Deploy model if needed
        self.ensure_llm()
        self.backend = self.llm # Sovereign Alias (Phase 8 compatibility)

        # Start trajectory session
        self._traj_session_id = self.trajectory.begin_session(
            task=task, workspace=self.workspace
        )

        # â”€â”€ Phase 8: Sovereign Injection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        # Instead of dumping everything in system prompt, we build a multi-stage context
        msgs = [{"role": "system", "content": self._sys_prompt()}]
        
        # Inject the Marshal's Scan â€” Absolute architectural awareness
        msgs.append({"role": "user", "content": f"OBSERVATION: {scan_report}\n\nUse your armory tools if more detail is needed."})
        msgs.append({"role": "assistant", "content": "Acknowledged. Marshal's scan completed. I have absolute awareness of the workspace state. Awaiting your command."})

        # Add the 'Project Atlas' as a one-time background observation
        atlas = self.axodex.status()
        if "[AXODEX ERROR]" not in atlas:
            msgs.append({"role": "user", "content": f"OBSERVATION (Project Atlas):\n{atlas}\n\nUse your armory tools to explore further."})
            msgs.append({"role": "assistant", "content": "Acknowledged. I have indexed the project structure. Awaiting task details."})
        
        # Add history if this is a continuation
        history_msgs = self.history.get_session()
        if history_msgs:
            msgs.extend(history_msgs)
        else:
            # If new session, add the specific task
            msgs.append({"role": "user", "content": task})

        if self._use_native:
            result = self._run_native(msgs)
        else:
            result = self._run_fallback(msgs)

        # End trajectory session
        self.trajectory.end_session(
            self._traj_session_id,
            outcome=result[:300] if result else "completed"
        )
        self._traj_session_id = None

        return result

    # â”€â”€ Native tool loop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def _run_native(self, messages: List[dict]) -> str:
        from axoniz.core.backend import ToolCallResponse, TextResponse
        max_steps = int(self.config.get("agent", {}).get("max_steps", self.config.get("max_steps", 30)))
        seen: List[tuple] = []

        for step in range(1, max_steps + 1):
            if self._aborted(): return "[Stopped by user]"
            if self.on_step: self.on_step(step, max_steps)

            # â”€â”€ Phase 8: Cognitive Distillation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            if len(self.history._session) > 8:
                debug("[Cognitive] Distilling history...")
                self.history.distill(self.backend)

            # â”€â”€ Context Compression (Phase 6+) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            cur_tokens = TokenCounter.count_messages(messages)
            if self.compressor.should_compress(cur_tokens):
                messages = self.compressor.compress(messages, agent=self)

            try: 
                response = self.llm.complete(messages)
            except Exception as e: 
                # API Error Classification (Hermes-style)
                from axoniz.core.intelligence.self_correction import classify_api_error, APIFailoverReason
                reason = classify_api_error(e)
                error(f"[Agent] API Error: {reason.value} | {e}")
                
                if reason == APIFailoverReason.CONTEXT_OVERFLOW:
                    # Force compression and retry
                    messages = self.compressor.compress(messages, agent=self)
                    try: response = self.llm.complete(messages)
                    except Exception: return f"[ERROR] Context overflow persistent after compression: {e}"
                else:
                    return f"[ERROR] Backend ({reason.value}): {e}"

            if isinstance(response, ToolCallResponse):
                for tc in response.calls:
                    if self._aborted(): return "[Stopped by user]"
                    name, args = tc.get("name", ""), tc.get("args", {})
                    sig = (name, json.dumps(args, sort_keys=True))
                    seen.append(sig)
                    if seen.count(sig) >= 5: return f"[ERROR] Loop on '{name}'."
                    if self.on_tool_call: self.on_tool_call(name, args)
                    result = self._exec(name, args)
                    if self.on_tool_result: self.on_tool_result(name, result)
                    if self._finished:
                        self._sync_done(self._final_result or result)
                        return self._final_result or result
                    messages.extend([
                        {"role": "assistant", "content": ""},
                        {"role": "tool", "name": name, "content": result},
                    ])
                continue

            elif isinstance(response, TextResponse):
                text = response.text or ""
                self.history.append("assistant", text, step=step)
                if self.on_token: self.on_token(text)
                if _is_done(text) or self._finished:
                    self._sync_done(self._final_result or text)
                    self._speak(self._final_result or text)
                    return self._final_result or text
                fb = _parse_fallback_calls(text)
                if fb:
                    messages.append({"role": "assistant", "content": text})
                    for fc in fb:
                        if self._aborted(): return "[Stopped by user]"
                        name, args = fc["name"], fc["args"]
                        if self.on_tool_call: self.on_tool_call(name, args)
                        result = self._exec(name, args)
                        if self.on_tool_result: self.on_tool_result(name, result)
                        if self._finished:
                            self._sync_done(self._final_result or result)
                            return self._final_result or result
                        messages.append({"role": "user", "content": f"Tool '{name}' returned:\n{result}"})
                    continue
                messages.append({"role": "assistant", "content": text})
                nudges = sum(1 for m in messages[-6:]
                             if m.get("role") == "user" and "continue" in m.get("content","").lower())
                if nudges >= 3: return text
                messages.append({"role": "user", "content": "Continue. Use a tool, or call done() if finished."})

        return "Reached maximum steps."

    # â”€â”€ Fallback text-parsing loop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def _run_fallback(self, messages: List[dict]) -> str:
        tool_names = ", ".join(s["function"]["name"] for s in TOOL_SCHEMAS)
        instructions = (
            "\n\nTo call a tool:\n"
            "<tool>{\"name\": \"tool_name\", \"args\": {\"param\": \"value\"}}</tool>\n\n"
            f"Tools: {tool_names}\n\n"
            "RULES:\n"
            "1. Session start: axodex_status â†’ palace_context â†’ kg_query('user') â†’ diary_read\n"
            "2. Code Intelligence: ALWAYS use axodex_context to understand symbols and flows.\n"
            "3. Safety: ALWAYS run axodex_impact BEFORE modifying any function or class.\n"
            "4. Verification: Run axodex_detect_changes BEFORE committing to verify blast radius.\n"
            "5. After tasks: palace_store + diary_write\n"
            "6. Finish: <tool>{\"name\": \"done\", \"args\": {\"result\": \"summary\"}}</tool>"
        )
        if messages and messages[0]["role"] == "system":
            messages[0]["content"] += instructions
        else:
            messages.insert(0, {"role": "system", "content": _FALLBACK_SYSTEM_PROMPT + instructions})

        max_steps = int(self.config.get("agent", {}).get("max_steps", self.config.get("max_steps", 30)))
        seen: List[tuple] = []
        nudge = 0

        for step in range(1, max_steps + 1):
            if self._aborted(): return "[Stopped by user]"
            if self.on_step: self.on_step(step, max_steps)

            # â”€â”€ Context Compression (Phase 6+) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            cur_tokens = TokenCounter.count_messages(messages)
            if self.compressor.should_compress(cur_tokens):
                messages = self.compressor.compress(messages, agent=self)

            tokens = []
            try:
                for tok in self.llm.stream_text(messages):
                    if self._aborted(): break
                    tokens.append(tok)
                    if self.on_token: self.on_token(tok)
            except Exception as e:
                return f"[ERROR] Stream: {e}"

            if self._aborted(): return "[Stopped by user]"
            full = "".join(tokens)
            self.history.append("assistant", full, step=step)

            calls = _parse_fallback_calls(full)
            if calls:
                nudge = 0
                messages.append({"role": "assistant", "content": full})
                for fc in calls:
                    if self._aborted(): return "[Stopped by user]"
                    name, args = fc["name"], fc["args"]
                    sig = (name, json.dumps(args, sort_keys=True))
                    seen.append(sig)
                    if seen.count(sig) >= 5: return f"[ERROR] Loop on '{name}'."
                    if self.on_tool_call: self.on_tool_call(name, args)
                    result = self._exec(name, args)
                    if self.on_tool_result: self.on_tool_result(name, result)
                    if self._finished:
                        self._sync_done(self._final_result or result)
                        return self._final_result or result
                    messages.append({
                        "role": "user",
                        "content": f"Tool '{name}' returned:\n{result}\n\nContinue or call done() if complete."
                    })
                continue

            if _is_done(full):
                self._sync_done(full)
                return full

            nudge += 1
            messages.append({"role": "assistant", "content": full})
            if nudge >= 4:
                warn("Model not calling tools after 4 nudges.")
                return full
            messages.append({"role": "user", "content": (
                "Use a tool to continue. Output a <tool> block, "
                "or call done() if fully complete."
            )})

        return "Reached maximum steps."

    # â”€â”€ Post-task sync â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def _speak(self, text: str):
        """Speak the first sentence of a response if TTS is enabled."""
        tts = _get_tts()
        if tts and tts.is_available:
            try:
                # Speak only first sentence â€” don't read walls of text
                first = text.split(".")[0][:120].strip()
                if first and len(first) > 10:
                    tts.speak_async(first)
            except Exception:
                pass

    def _sync_done(self, summary: str):
        if not summary or len(summary) < 20:
            return
        corr_summary = self.corrector.session_summary()
        ax_status    = self.axodex.status()
        
        # â”€â”€ Phase 4: Marshal's Archive â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        session_id = self._traj_session_id
        
        def _bg():
            # Store in palace
            archive_content = (
                f"TASK: {self._task_text}\n"
                f"SUMMARY: {summary}\n"
                f"ERRORS: {corr_summary}\n"
                f"ARCH_SCAN: {ax_status}"
            )
            self.memory.palace.store(
                wing="wing_axoniz", room="marshal-archives",
                content=archive_content,
                added_by="agent"
            )
            
            # â”€â”€ Phase 11: Trigger Skill Distillation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            proposal = self.distiller.analyze_session(session_id)
            if proposal:
                name = proposal.get('name') or proposal.get('title') or 'unnamed_skill'
                info(f"[Evolution] New skill proposed: {name}")
                # In a real scenario, we might ask for monarch approval here
                # For now, we forge it to demonstrate the loop
                self.distiller.distill(proposal)

        threading.Thread(target=_bg, daemon=True).start()

    # â”€â”€ Session management â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def reset(self):
        self._finished     = False
        self._final_result = None
        self._abort_event  = None
        self._traj_session_id = None
        self._step_counter = 0
        self.corrector.reset()
        self.history.clear_session()

    def run_goal(self, goal: str, max_cycles: int = 5, max_retries: int = 3) -> str:
        from axoniz.core.loop import LoopEngine
        return LoopEngine(self, max_cycles=max_cycles, max_retries=max_retries).run_goal(goal)

    def switch_model(self, model_name: str) -> str:
        self.config["model_name"] = model_name
        self._rebuild_llm()
        return f"[OK] Switched to {model_name}"

    def switch_backend(self, provider: str, **extra) -> str:
        self.config["provider"] = provider
        self.config["backend"]  = provider
        self.config.update(extra)
        self._rebuild_llm()
        return f"[OK] Switched to {provider}"

    def update_model_params(self, params: dict) -> str:
        self.config.update(params)
        self._rebuild_llm()
        return "[OK] Params updated."

    def load_model(self) -> str:
        if self.llm is None:
            self._build_llm()
        return self.llm.load()

    def health(self) -> dict:
        return self.llm.health_check()

    def generate_summary(self, prompt: str) -> str:
        """Helper for context compression â€” calls LLM with a summarization prompt."""
        self.ensure_llm()
        msgs = [{"role": "user", "content": prompt}]
        try:
            # Use a non-streaming completion for summary
            resp = self.llm.complete(msgs)
            from axoniz.core.backend import TextResponse
            if isinstance(resp, TextResponse):
                return resp.text
            return str(resp)
        except Exception as e:
            error(f"[Agent] generate_summary failed: {e}")
            return f"Error: {e}"

    def integration_status(self) -> dict:
        st = self.memory.palace.status()
        traj_stats = self.trajectory.tool_stats()
        ast_stats  = self.ast_index.stats()
        pred_stats = self.predictor.get_stats()
        return {
            "phase":            6,
            "palace_available": self.memory.palace.is_available(),
            "palace_drawers":   st.get("total_drawers", 0),
            "palace_wings":     st.get("wings", {}),
            "kg_stats":         self.memory.kg.stats(),
            "trajectory_tools": len(traj_stats),
            "risk_threshold":   self.confidence.risk_threshold,
            "ast_files":        ast_stats.get("files_indexed", 0),
            "ast_symbols":      ast_stats.get("symbols", 0),
            "daemon_running":   self.daemon.is_running(),
            "predictor_calls":  pred_stats.get("total_calls", 0),
            "predictor_errors": f"{pred_stats.get('error_rate',0):.0%}",
        }

    def _session_messages(self) -> List[dict]:
        return [{"role": "system", "content": self._sys_prompt()}]

