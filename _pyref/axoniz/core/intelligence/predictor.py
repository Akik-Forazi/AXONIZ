"""
axoniz.core.intelligence.predictor
=====================================
Phase 5 — Predictive Intelligence

You open a file, axoniz has already pre-loaded the related context,
run the relevant tests, and has a suggested answer before you type anything.

It studies your session history to know:
  - Where you get stuck
  - Which files break most
  - What patterns predict problems
  - What you're likely to ask next

This is not autocomplete. This is intent modeling from behavioral history.

Architecture:
  SessionAnalyzer    — mines trajectory + history for behavioral patterns
  PredictiveContext  — pre-loads context based on what file you opened
  IntentPredictor    — predicts likely next query from recent actions
  HotspotTracker     — tracks which files/symbols cause the most trouble
"""

import json
import os
import re
import threading
import time
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

from axoniz.core.debug import debug, info, warn
from axoniz.core.config import AXONIZ_HOME
from axoniz.core.intelligence.trajectory import TrajectoryStore, get_store


# ─── Session patterns ─────────────────────────────────────────────────────────

@dataclass
class BehaviorPattern:
    pattern_type: str      # stuck / error_loop / productive / exploratory
    frequency:    int
    files:        List[str]
    tools:        List[str]
    description:  str


@dataclass
class Hotspot:
    path:         str
    error_count:  int
    edit_count:   int
    last_touched: float
    typical_error: str
    risk_score:   float


@dataclass
class PredictedIntent:
    query:       str
    confidence:  float     # 0-1
    context:     str       # pre-loaded context to inject
    suggested:   str       # suggested first action
    reasoning:   str


# ─── Session Analyzer ─────────────────────────────────────────────────────────

class SessionAnalyzer:
    """
    Mines the trajectory database to extract behavioral patterns.
    Learns: where you get stuck, which tools fail most, which files cause pain.
    """

    def __init__(self, trajectory: TrajectoryStore):
        self.traj = trajectory

    def get_hotspots(self, limit: int = 10) -> List[Hotspot]:
        """Files that cause the most errors."""
        stats = self.traj.tool_stats()
        failures = self.traj.recent_failures(limit=100)

        # Count errors per file
        file_errors: Dict[str, int]  = defaultdict(int)
        file_tools:  Dict[str, str]  = defaultdict(str)

        for fail in failures:
            args = json.loads(fail.get("args_json", "{}") or "{}")
            fpath = args.get("path") or args.get("command", "")[:50]
            if fpath:
                file_errors[fpath] += 1
                file_tools[fpath]   = fail.get("tool_name", "")

        hotspots = []
        for fpath, count in sorted(file_errors.items(), key=lambda x: -x[1])[:limit]:
            hotspots.append(Hotspot(
                path=fpath,
                error_count=count,
                edit_count=0,   # would need richer tracking
                last_touched=time.time(),
                typical_error=file_tools.get(fpath, "unknown"),
                risk_score=min(1.0, count / 10),
            ))
        return hotspots

    def get_patterns(self) -> List[BehaviorPattern]:
        """Identify recurring behavior patterns from tool usage."""
        stats = self.traj.tool_stats()
        if not stats:
            return []

        patterns = []
        tool_counts = {s["tool_name"]: s["total"] for s in stats}
        fail_rates  = {s["tool_name"]: s["failures"]/max(s["total"],1) for s in stats}

        # Pattern: stuck in shell_run loops
        if tool_counts.get("shell_run", 0) > 10 and fail_rates.get("shell_run", 0) > 0.4:
            patterns.append(BehaviorPattern(
                pattern_type="error_loop",
                frequency=int(tool_counts.get("shell_run", 0)),
                files=[], tools=["shell_run"],
                description="Frequent shell_run failures — possibly environment/path issues",
            ))

        # Pattern: heavy file editing
        edit_total = tool_counts.get("file_edit", 0) + tool_counts.get("file_write", 0)
        if edit_total > 20:
            patterns.append(BehaviorPattern(
                pattern_type="productive",
                frequency=edit_total,
                files=[], tools=["file_edit", "file_write"],
                description=f"Heavy file editing — {edit_total} write operations",
            ))

        # Pattern: exploration (lots of reads, lists)
        explore = tool_counts.get("file_read", 0) + tool_counts.get("file_list", 0) + tool_counts.get("code_tree", 0)
        if explore > 15:
            patterns.append(BehaviorPattern(
                pattern_type="exploratory",
                frequency=explore,
                files=[], tools=["file_read", "file_list"],
                description=f"Exploration mode — {explore} read operations without many writes",
            ))

        return patterns

    def most_used_files(self, limit: int = 10) -> List[str]:
        """Files that appear most in tool call arguments."""
        # Populated as trajectory accumulates session data
        return []

    def summary(self) -> str:
        """One-paragraph behavioral summary."""
        stats    = self.traj.tool_stats()
        patterns = self.get_patterns()
        hotspots = self.get_hotspots(limit=3)

        if not stats:
            return "No behavioral data yet — session history will build over time."

        total_calls  = sum(s["total"] for s in stats)
        total_errors = sum(s["failures"] for s in stats)
        error_rate   = total_errors / max(total_calls, 1)

        top_tools = sorted(stats, key=lambda x: -x["total"])[:3]
        top_str   = ", ".join(f"{s['tool_name']}({s['total']})" for s in top_tools)

        parts = [
            f"Behavioral summary: {total_calls} tool calls, {error_rate:.0%} error rate.",
            f"Most used: {top_str}.",
        ]
        if patterns:
            parts.append(f"Patterns: {'; '.join(p.description for p in patterns[:2])}.")
        if hotspots:
            parts.append(f"Problem areas: {', '.join(os.path.basename(h.path) for h in hotspots[:3])}.")

        return " ".join(parts)


# ─── Predictive Context ───────────────────────────────────────────────────────

class PredictiveContext:
    """
    When you open a file, pre-load all related context:
    - What the file contains (AST symbols)
    - What imports it (who depends on it)
    - Recent errors in this file
    - Related palace memories

    This context is ready before you even ask your first question.
    """

    def __init__(self, agent):
        self.agent = agent
        self._cache: Dict[str, Tuple[str, float]] = {}   # path → (context, timestamp)
        self._cache_ttl = 60.0   # seconds

    def preload_file(self, file_path: str) -> str:
        """
        Pre-load context for a file. Returns context string.
        Runs in background so it doesn't block.
        """
        now = time.time()
        cached = self._cache.get(file_path)
        if cached and (now - cached[1]) < self._cache_ttl:
            return cached[0]

        context = self._build_context(file_path)
        self._cache[file_path] = (context, now)
        return context

    def preload_async(self, file_path: str):
        """Fire-and-forget background preload."""
        t = threading.Thread(
            target=self.preload_file, args=(file_path,), daemon=True
        )
        t.start()

    def _build_context(self, file_path: str) -> str:
        parts = []

        # AST context
        if hasattr(self.agent, "ast_index"):
            try:
                ctx = self.agent.ast_index.get_file_context(file_path)
                if ctx:
                    parts.append(ctx)
            except Exception:
                pass

        # Recent failures in this file
        failures = self.agent.trajectory.recent_failures(limit=20)
        file_failures = [
            f for f in failures
            if file_path in (f.get("args_json") or "")
        ]
        if file_failures:
            parts.append(
                f"Recent errors in this file ({len(file_failures)}):\n" +
                "\n".join(f"  {f['tool_name']}: {f.get('result_head','')[:80]}"
                          for f in file_failures[:3])
            )

        # Palace search for this file
        if self.agent.memory.palace.is_available():
            rel = os.path.basename(file_path)
            r = self.agent.memory.palace.search(rel, limit=2)
            hits = r.get("results", [])
            if hits:
                parts.append(
                    "Related memory:\n" +
                    "\n".join(f"  {h['text'][:150]}" for h in hits)
                )

        return "\n\n".join(parts) if parts else ""

    def get_ready_context(self, file_path: str) -> str:
        """Get cached context if available (never blocks)."""
        cached = self._cache.get(file_path)
        if cached:
            return cached[0]
        return ""


# ─── Intent Predictor ─────────────────────────────────────────────────────────

class IntentPredictor:
    """
    Predicts what you're likely to ask next, based on:
    - What file you just opened
    - Recent tool call sequence
    - Session history patterns
    - Time of day / working patterns

    No model needed — pure rule-based pattern matching over trajectory.
    Fast enough to run synchronously.
    """

    # Common sequences → predicted next intent
    SEQUENCE_RULES: List[Tuple[List[str], str, str]] = [
        # [recent tools] → predicted query, suggested action
        (["file_read", "file_read"],
         "Understand how these files relate to each other",
         "code_analyze to map the structure"),

        (["file_write", "shell_run"],
         "Test if the code you wrote works",
         "shell_python to run tests"),

        (["shell_run", "shell_run", "shell_run"],
         "Debugging a command that keeps failing",
         "file_read to check the script for the issue"),

        (["file_edit", "file_edit", "file_edit"],
         "Refactoring a file — check for consistency",
         "code_lint to find remaining issues"),

        (["web_search", "file_write"],
         "Implementing something from research",
         "shell_python to test the implementation"),

        (["code_tree", "file_read"],
         "Exploring a new codebase",
         "code_analyze to understand the structure"),

        (["file_delete", "file_write"],
         "Replacing a file — check nothing else broke",
         "ast_find_callers to check dependencies"),
    ]

    def __init__(self, trajectory: TrajectoryStore):
        self.traj = trajectory

    def predict(self, session_id: str, recent_n: int = 5) -> Optional[PredictedIntent]:
        """Predict likely next intent from recent tool sequence."""
        recent = self.traj.get_session_steps(session_id)[-recent_n:]
        if not recent:
            return None

        recent_tools = [s["tool_name"] for s in recent]

        # Try sequence rules
        for rule_seq, query, suggestion in self.SEQUENCE_RULES:
            if len(recent_tools) >= len(rule_seq):
                tail = recent_tools[-len(rule_seq):]
                if tail == rule_seq:
                    return PredictedIntent(
                        query=query,
                        confidence=0.7,
                        context="",
                        suggested=suggestion,
                        reasoning=f"You just ran: {' → '.join(rule_seq)}",
                    )

        # Fallback: last tool failed → predict retry
        last = recent[-1]
        if last["success"] == 0:
            return PredictedIntent(
                query=f"Fix the error in {last['tool_name']}",
                confidence=0.8,
                context=f"Last error: {last.get('result_head','')[:200]}",
                suggested="Read the error and fix the issue",
                reasoning="Last tool call failed",
            )

        return None

    def preload_suggestion(self, session_id: str) -> str:
        """Return a pre-loaded suggestion string for the UI."""
        pred = self.predict(session_id)
        if not pred:
            return ""
        return (
            f"💡 Predicted: {pred.query}\n"
            f"   Suggested action: {pred.suggested}\n"
            f"   (because: {pred.reasoning})"
        )


# ─── Hotspot Tracker ──────────────────────────────────────────────────────────

class HotspotTracker:
    """
    Tracks which files and functions cause the most problems over time.
    Feeds into the predictive system to pre-load context for problem areas.
    """

    def __init__(self, trajectory: TrajectoryStore):
        self.traj = trajectory
        self._hotspots: List[Hotspot] = []
        self._last_update = 0.0

    def get_hotspots(self, refresh: bool = False) -> List[Hotspot]:
        now = time.time()
        if refresh or (now - self._last_update > 60):
            analyzer = SessionAnalyzer(self.traj)
            self._hotspots   = analyzer.get_hotspots()
            self._last_update = now
        return self._hotspots

    def is_hotspot(self, file_path: str) -> bool:
        for h in self.get_hotspots():
            if file_path in h.path or h.path in file_path:
                return True
        return False

    def format(self) -> str:
        hotspots = self.get_hotspots()
        if not hotspots:
            return "No problem files identified yet."
        lines = ["Problem files (by error frequency):"]
        for h in hotspots[:5]:
            lines.append(
                f"  {os.path.basename(h.path)}: "
                f"{h.error_count} errors, "
                f"risk={h.risk_score:.0%}"
            )
        return "\n".join(lines)


# ─── Predictive Engine (top-level) ────────────────────────────────────────────

class PredictiveEngine:
    """
    Combines all prediction components into one object wired into the Agent.

    At every turn:
    1. Prefetch context for recently accessed files
    2. Predict likely next intent
    3. Track hotspots
    4. Inject everything into the system prompt silently
    """

    def __init__(self, agent):
        self.agent     = agent
        self.analyzer  = SessionAnalyzer(agent.trajectory)
        self.predictor = IntentPredictor(agent.trajectory)
        self.hotspots  = HotspotTracker(agent.trajectory)
        self.ctx_cache = PredictiveContext(agent)

    def on_task_start(self, task: str, session_id: str) -> str:
        """
        Called at the start of each agent run.
        Returns a context block to inject into the system prompt.
        """
        parts = []

        # Behavioral summary
        summary = self.analyzer.summary()
        if summary and "No behavioral data" not in summary:
            parts.append(f"[BEHAVIORAL CONTEXT]\n{summary}")

        # Intent prediction
        if session_id:
            pred = self.predictor.predict(session_id)
            if pred and pred.confidence > 0.6:
                parts.append(
                    f"[PREDICTED NEXT STEP]\n"
                    f"{pred.query}\n"
                    f"Suggested: {pred.suggested}"
                )

        # Hotspot warning
        hotspot_str = self.hotspots.format()
        if "No problem files" not in hotspot_str:
            parts.append(f"[PROBLEM FILES]\n{hotspot_str}")

        return "\n\n".join(parts)

    def on_file_open(self, file_path: str) -> str:
        """Pre-load context when user mentions a file."""
        return self.ctx_cache.preload_file(file_path)

    def on_file_mention(self, text: str):
        """Scan text for file paths and preload them in background."""
        paths = re.findall(r'[\w/\\\-\.]+\.py', text)
        for p in paths[:3]:
            self.ctx_cache.preload_async(p)

    def get_stats(self) -> dict:
        stats = self.agent.trajectory.tool_stats()
        patterns = self.analyzer.get_patterns()
        return {
            "total_calls":  sum(s["total"] for s in stats),
            "error_rate":   sum(s["failures"] for s in stats) / max(sum(s["total"] for s in stats), 1),
            "patterns":     [p.pattern_type for p in patterns],
            "hotspot_count": len(self.hotspots.get_hotspots()),
        }
