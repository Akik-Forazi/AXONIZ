"""
AXONIZ Core Extras — features that make axoniz competitive
────────────────────────────────────────────────────────────
1. ContextCompressor  — summarizes long conversations to fit context
2. TaskPlanner        — breaks goals into verified sub-tasks (moltbot-style)
3. SelfEvaluator      — agent grades its own output and retries if low quality
4. TokenCounter       — estimates token usage without tiktoken
5. WorkspaceIndexer   — fast project-wide symbol/file index
6. GitTools           — git status, diff, commit, log (no subprocess wrapping needed)
"""

import os
import re
import json
import hashlib
import subprocess
from typing import List, Dict, Optional, Tuple
from datetime import datetime


# ══════════════════════════════════════════════════════════════════
#  1. TOKEN COUNTER — estimates without tiktoken
# ══════════════════════════════════════════════════════════════════

class TokenCounter:
    """Rough token estimator: ~4 chars per token (GPT convention)."""

    @staticmethod
    def count(text: str) -> int:
        return max(1, len(text) // 4)

    @staticmethod
    def count_messages(messages: List[Dict]) -> int:
        total = 0
        for m in messages:
            total += TokenCounter.count(m.get("content", "") or "")
            total += 4  # message overhead
        return total

    @staticmethod
    def fits(messages: List[Dict], max_tokens: int = 6000) -> bool:
        return TokenCounter.count_messages(messages) <= max_tokens


# ══════════════════════════════════════════════════════════════════
#  2. CONTEXT COMPRESSOR
#  Trims old messages when context window fills up.
#  Keeps: system prompt, last N turns, compresses middle.
# ══════════════════════════════════════════════════════════════════

class ContextCompressor:
    """
    Compresses long conversation histories to stay within context limits.
    Strategy:
      - Always keep system prompt (index 0)
      - Always keep last `keep_tail` messages verbatim
      - Summarize middle messages into a single summary message
    """

    def __init__(self, max_tokens: int = 6000, keep_tail: int = 6):
        self.max_tokens = max_tokens
        self.keep_tail  = keep_tail

    def compress(self, messages: List[Dict], llm=None) -> List[Dict]:
        """
        Compress messages if over budget.
        llm: optional backend with .chat(messages) for summarization.
        Returns compressed message list.
        """
        if TokenCounter.fits(messages, self.max_tokens):
            return messages

        system = [m for m in messages if m.get("role") == "system"]
        rest   = [m for m in messages if m.get("role") != "system"]

        if len(rest) <= self.keep_tail + 2:
            return messages  # not enough to compress

        head = rest[:-self.keep_tail]
        tail = rest[-self.keep_tail:]

        if llm and len(head) > 2:
            summary_text = self._summarize(head, llm)
        else:
            summary_text = self._extractive_summary(head)

        summary_msg = {
            "role": "system",
            "content": f"[CONTEXT SUMMARY — earlier conversation compressed]\n{summary_text}"
        }

        return system + [summary_msg] + tail

    def _summarize(self, messages: List[Dict], llm) -> str:
        """Use the LLM to summarize the messages."""
        transcript = "\n".join(
            f"{m['role'].upper()}: {(m.get('content') or '')[:500]}"
            for m in messages
        )
        prompt = [
            {"role": "system", "content": "Summarize the following conversation concisely, preserving key facts, decisions, and code produced. Be factual and brief."},
            {"role": "user",   "content": transcript[:4000]},
        ]
        try:
            resp = llm.chat(prompt)
            return resp if isinstance(resp, str) else str(resp)
        except Exception:
            return self._extractive_summary(messages)

    def _extractive_summary(self, messages: List[Dict]) -> str:
        """Fallback: extract key lines without LLM."""
        parts = []
        for m in messages:
            role    = m.get("role", "")
            content = (m.get("content") or "")[:200]
            if role == "user":
                parts.append(f"User said: {content}")
            elif role == "assistant" and "done" in content.lower():
                parts.append(f"Agent completed: {content[:150]}")
        return " | ".join(parts[:10]) or "Conversation history compressed."



# ══════════════════════════════════════════════════════════════════
#  3. SELF-EVALUATOR
#  Agent grades its own output (0-10) and retries if below threshold.
#  This is what makes Cline so reliable — it doesn't accept bad answers.
# ══════════════════════════════════════════════════════════════════

class SelfEvaluator:
    """
    After each agent response, optionally ask the same LLM to score it.
    If score < threshold, retry with a stronger prompt.
    Works best with reasoning models but helps all models.
    """

    EVAL_PROMPT = """You are a strict code and task reviewer.
Rate the following agent response on a scale of 0-10 based on:
- Completeness (did it fully address the task?)
- Correctness (is the code/answer correct?)
- Clarity (is it well-explained?)

Respond with ONLY a JSON object: {"score": 7, "reason": "brief explanation", "improvements": "what to fix"}
"""

    def __init__(self, threshold: float = 6.0, llm=None):
        self.threshold = threshold
        self.llm       = llm

    def evaluate(self, task: str, response: str) -> Dict:
        """Returns {"score": float, "reason": str, "pass": bool}"""
        if not self.llm:
            return {"score": 10.0, "reason": "no evaluator configured", "pass": True}
        try:
            msgs = [
                {"role": "system", "content": self.EVAL_PROMPT},
                {"role": "user",   "content": f"TASK:\n{task[:500]}\n\nRESPONSE:\n{response[:1500]}"},
            ]
            raw = self.llm.chat(msgs)
            raw = raw if isinstance(raw, str) else str(raw)
            match = re.search(r'\{.*\}', raw, re.DOTALL)
            if match:
                obj = json.loads(match.group())
                score = float(obj.get("score", 5))
                return {
                    "score":        score,
                    "reason":       obj.get("reason", ""),
                    "improvements": obj.get("improvements", ""),
                    "pass":         score >= self.threshold,
                }
        except Exception:
            pass
        return {"score": 5.0, "reason": "eval parse failed", "pass": True}

    def retry_prompt(self, task: str, response: str, reason: str) -> str:
        """Build a retry prompt when score is too low."""
        return (
            f"Your previous response was insufficient.\n"
            f"Issue: {reason}\n\n"
            f"Original task: {task}\n\n"
            f"Previous attempt (improve on this):\n{response[:800]}\n\n"
            f"Please provide a complete, corrected response."
        )


# ══════════════════════════════════════════════════════════════════
#  4. WORKSPACE INDEXER
#  Fast project-wide index of files, classes, functions, imports.
#  No LSP needed — pure Python AST.
# ══════════════════════════════════════════════════════════════════

class WorkspaceIndexer:
    """
    Indexes a workspace directory for fast symbol lookup.
    Extracts: file paths, Python classes/functions/imports, JS exports.
    Used for: "where is class Foo defined?", "list all API routes", etc.
    """

    def __init__(self, workspace: str):
        self.workspace = os.path.abspath(workspace)
        self._cache:  Dict[str, dict] = {}
        self._mtime:  Dict[str, float] = {}

    def index(self, max_files: int = 200) -> Dict:
        """Build/refresh index. Returns summary."""
        import ast
        result = {"files": 0, "classes": [], "functions": [], "imports": []}
        py_files = []
        for root, dirs, files in os.walk(self.workspace):
            dirs[:] = [d for d in dirs if d not in
                       {".git", "__pycache__", "node_modules", ".egg-info", "dist", "build", ".axoniz"}]
            for f in files:
                if f.endswith(".py"):
                    py_files.append(os.path.join(root, f))

        for fpath in py_files[:max_files]:
            mtime = os.path.getmtime(fpath)
            if fpath in self._cache and self._mtime.get(fpath) == mtime:
                cached = self._cache[fpath]
            else:
                cached = self._parse_python(fpath)
                self._cache[fpath]  = cached
                self._mtime[fpath]  = mtime

            result["files"] += 1
            rel = os.path.relpath(fpath, self.workspace)
            for cls in cached.get("classes", []):
                result["classes"].append({"name": cls, "file": rel})
            for fn in cached.get("functions", []):
                result["functions"].append({"name": fn, "file": rel})
            for imp in cached.get("imports", []):
                result["imports"].append({"module": imp, "file": rel})

        return result

    def _parse_python(self, fpath: str) -> dict:
        import ast
        result = {"classes": [], "functions": [], "imports": []}
        try:
            with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
                source = f.read()
            tree = ast.parse(source)
            for node in ast.walk(tree):
                if isinstance(node, ast.ClassDef):
                    result["classes"].append(node.name)
                elif isinstance(node, ast.FunctionDef):
                    result["functions"].append(node.name)
                elif isinstance(node, (ast.Import, ast.ImportFrom)):
                    if isinstance(node, ast.Import):
                        for alias in node.names:
                            result["imports"].append(alias.name)
                    else:
                        result["imports"].append(node.module or "")
        except Exception:
            pass
        return result

    def find_symbol(self, name: str) -> List[Dict]:
        """Find where a class/function is defined."""
        idx = self.index()
        results = []
        for entry in idx["classes"] + idx["functions"]:
            if name.lower() in entry["name"].lower():
                results.append(entry)
        return results

    def summary(self) -> str:
        """One-line project summary."""
        idx = self.index()
        return (
            f"Project: {os.path.basename(self.workspace)}  "
            f"| {idx['files']} Python files  "
            f"| {len(idx['classes'])} classes  "
            f"| {len(idx['functions'])} functions"
        )



# ══════════════════════════════════════════════════════════════════
#  5. GIT TOOLS
#  Built-in git operations — competitive with Cline's git integration
# ══════════════════════════════════════════════════════════════════

class GitTools:
    """Git operations for the agent. Requires git in PATH."""

    def __init__(self, workspace: str):
        self.workspace = os.path.abspath(workspace)

    def _git(self, *args, timeout: int = 15) -> str:
        try:
            result = subprocess.run(
                ["git"] + list(args),
                capture_output=True, text=True,
                cwd=self.workspace, timeout=timeout,
            )
            out = result.stdout.strip()
            err = result.stderr.strip()
            if result.returncode != 0 and err:
                return f"[git error] {err}"
            return out or "(no output)"
        except FileNotFoundError:
            return "[ERROR] git not found in PATH"
        except subprocess.TimeoutExpired:
            return f"[ERROR] git timed out"
        except Exception as e:
            return f"[ERROR] {e}"

    def status(self) -> str:
        return self._git("status", "--short", "--branch")

    def diff(self, path: str = None, staged: bool = False) -> str:
        args = ["diff"]
        if staged: args.append("--cached")
        if path:   args.append(path)
        out = self._git(*args)
        if len(out) > 6000:
            out = out[:6000] + "\n… [diff truncated]"
        return out

    def log(self, n: int = 10, oneline: bool = True) -> str:
        fmt = "--oneline" if oneline else "--format=%h %an %ar %s"
        return self._git("log", fmt, f"-{n}")

    def add(self, path: str = ".") -> str:
        return self._git("add", path)

    def commit(self, message: str) -> str:
        return self._git("commit", "-m", message)

    def branch(self) -> str:
        return self._git("branch", "-v")

    def checkout(self, branch: str, create: bool = False) -> str:
        args = ["checkout"]
        if create: args.append("-b")
        args.append(branch)
        return self._git(*args)

    def push(self, remote: str = "origin", branch: str = None) -> str:
        args = ["push", remote]
        if branch: args.append(branch)
        return self._git(*args, timeout=30)

    def pull(self) -> str:
        return self._git("pull", timeout=30)

    def stash(self) -> str:
        return self._git("stash")

    def stash_pop(self) -> str:
        return self._git("stash", "pop")

    def is_repo(self) -> bool:
        return os.path.exists(os.path.join(self.workspace, ".git"))

    def init(self) -> str:
        return self._git("init")

    def current_branch(self) -> str:
        return self._git("branch", "--show-current")

    def as_tool_map(self) -> Dict:
        return {
            "git_status":   self.status,
            "git_diff":     self.diff,
            "git_log":      self.log,
            "git_add":      self.add,
            "git_commit":   self.commit,
            "git_branch":   self.branch,
            "git_checkout": self.checkout,
            "git_push":     self.push,
            "git_pull":     self.pull,
            "git_stash":    self.stash,
        }


# ══════════════════════════════════════════════════════════════════
#  6. SMART PLANNER — competitive with OpenClaw's task decomposition
# ══════════════════════════════════════════════════════════════════

PLANNER_PROMPT = """You are a precise task planner for a coding agent.
Given a high-level goal, produce a step-by-step execution plan.

Rules:
- Each step must be a single, concrete, verifiable action
- Steps must be ordered by dependency
- Maximum 10 steps
- Each step has: id, action (what to do), verify (how to confirm it worked), tool_hint (which tool to use)

Respond ONLY with a JSON array:
[
  {"id": 1, "action": "Create src/ directory", "verify": "src/ exists", "tool_hint": "file_list"},
  {"id": 2, "action": "Write main.py with FastAPI skeleton", "verify": "main.py contains 'from fastapi'", "tool_hint": "file_write"}
]"""


class SmartPlanner:
    """Breaks a goal into verified steps. Uses the agent's LLM."""

    def __init__(self, llm=None):
        self.llm = llm

    def plan(self, goal: str, workspace_summary: str = "") -> List[Dict]:
        if not self.llm:
            return [{"id": 1, "action": goal, "verify": "task complete", "tool_hint": "done"}]
        context = f"Workspace: {workspace_summary}\n\nGoal: {goal}" if workspace_summary else f"Goal: {goal}"
        msgs = [
            {"role": "system", "content": PLANNER_PROMPT},
            {"role": "user",   "content": context},
        ]
        try:
            raw = self.llm.chat(msgs)
            raw = raw if isinstance(raw, str) else str(raw)
            match = re.search(r'\[[\s\S]*\]', raw)
            if match:
                return json.loads(match.group())
        except Exception:
            pass
        return [{"id": 1, "action": goal, "verify": "task complete", "tool_hint": "done"}]

    def format_plan(self, steps: List[Dict]) -> str:
        lines = [f"Plan ({len(steps)} steps):"]
        for s in steps:
            lines.append(f"  {s['id']}. {s['action']}")
            lines.append(f"     verify: {s['verify']}  |  tool: {s.get('tool_hint','?')}")
        return "\n".join(lines)

