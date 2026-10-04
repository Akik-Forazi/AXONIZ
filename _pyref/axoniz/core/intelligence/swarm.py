"""
axoniz.core.intelligence.swarm
================================
Dynamic Domain-Expert Swarm — Sequential Model Swapping

The Swarm decomposes any complex task into phases and assigns a
dedicated, domain-expert model for each phase:

  Decomposer  → breaks the task into atomic sub-tasks (reasoning model)
  Worker      → executes each sub-task using tools (coding/execution model)
  Critic      → validates each result before accepting (debugging model)
  Merger      → synthesises all results into a final answer (language model)

Models are loaded sequentially and unloaded from RAM between phases
to stay within the memory constraints of the host machine.
Model paths are configured in ~/.axoniz/config.json under `swarm_models`.
If no swarm models are configured, the active main model is used for all
phases (standard behaviour).

Architecture:
  SwarmOrchestrator  → drives phase transitions + model hot-swapping
  SwarmWorker        → executes a single sub-task with tool access
  SwarmCritic        → scores + validates a worker result
  SwarmMerger        → combines all valid results

Usage (from Agent):
    from axoniz.core.intelligence.swarm import SwarmOrchestrator
    swarm = SwarmOrchestrator(agent)
    result = swarm.run("implement a memory-safe ring buffer in C")
"""

import json
import queue
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed, Future
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Tuple

from axoniz.core.debug import debug, info, warn, error

# Global lock: only one model swap may happen at a time
_MODEL_SWAP_LOCK = threading.Lock()


# ─── Data types ───────────────────────────────────────────────────────────────

@dataclass
class SubTask:
    id:          int
    description: str
    depends_on:  List[int] = field(default_factory=list)
    priority:    int       = 5
    tool_hint:   str       = ""
    verify:      str       = ""
    status:      str       = "pending"   # pending / running / done / failed / rejected
    result:      str       = ""
    score:       float     = 0.0
    duration_ms: int       = 0
    worker_id:   int       = 0


@dataclass
class SwarmResult:
    task:        str
    sub_tasks:   List[SubTask]
    merged:      str
    success:     bool
    total_ms:    int
    parallelism: float   # actual speedup achieved


# ─── Decomposer ───────────────────────────────────────────────────────────────

DECOMPOSE_PROMPT = """Decompose a task into independent parallel sub-tasks.

Rules:
1. Maximize parallelism — only use depends_on for true sequential dependencies
2. Each sub-task is atomic and self-contained
3. Max 8 sub-tasks
4. tool_hint: primary tool (file_write, shell_run, etc.)
5. verify: one-line success check

Respond ONLY with JSON array:
[
  {"id": 1, "description": "...", "depends_on": [], "priority": 8, "tool_hint": "file_write", "verify": "..."},
  ...
]"""

CRITIC_PROMPT = """Review a worker's sub-task result.
Respond ONLY with JSON:
{"score": 8.5, "pass": true, "issues": [], "fix_hint": ""}
score: 0-10 (pass if >= 6.0)
issues: list of problems found
fix_hint: how to fix if score < 6.0"""

MERGE_PROMPT = """Synthesize multiple parallel worker outputs into one coherent response.
Be brief and structured. No extra commentary."""


# ─── Worker ───────────────────────────────────────────────────────────────────

class SwarmWorker:
    """
    A lightweight execution unit that runs a single sub-task.
    Uses a shared tool_map from the parent agent — no separate LLM needed.

    Two execution modes depending on whether the loaded model supports tool calling:
      - Tool mode  (tool_capable=True):  full tool loop, can read/write files, run shell, etc.
      - Text mode  (tool_capable=False): receives pre-fetched file content in the prompt,
                                         produces pure text output (code, summary, critique).
                                         No tool calls attempted — avoids hallucinated JSON.
    """

    def __init__(
        self,
        worker_id:    int,
        tool_map:     Dict[str, Callable],
        llm:          Any,
        workspace:    str,
        max_steps:    int = 8,
        on_progress:  Optional[Callable] = None,
        tool_capable: bool = True,
    ):
        self.id           = worker_id
        self.tool_map     = tool_map
        self.llm          = llm
        self.workspace    = workspace
        self.max_steps    = max_steps
        self.on_progress  = on_progress
        self.tool_capable = tool_capable

    def execute(self, sub_task: SubTask, context: str = "") -> SubTask:
        """Execute a sub-task, update it in-place, return it."""
        sub_task.status    = "running"
        sub_task.worker_id = self.id
        t0 = time.time()

        prompt = self._build_prompt(sub_task, context)
        # Route to the right execution mode based on model capability
        if self.tool_capable:
            result = self._run_with_tools(prompt)
        else:
            result = self._run_text_only(prompt, sub_task)

        sub_task.result      = result
        sub_task.duration_ms = int((time.time() - t0) * 1000)
        sub_task.status      = "done" if result and "[ERROR]" not in result[:50] else "failed"

        if self.on_progress:
            self.on_progress({
                "event":  "worker_done",
                "worker": self.id,
                "task_id": sub_task.id,
                "status": sub_task.status,
                "ms":     sub_task.duration_ms,
            })

        return sub_task

    def _build_prompt(self, sub_task: SubTask, context: str) -> str:
        lines = [
            f"PARALLEL WORKER TASK #{sub_task.id}:",
            f"{sub_task.description}",
            "",
            f"Success criterion: {sub_task.verify or 'task complete'}",
            f"Primary tool: {sub_task.tool_hint or 'any'}",
        ]
        if context:
            lines.append(f"\nCONTEXT FROM OTHER WORKERS:\n{context[:800]}")
        lines.append(
            "\nExecute this task efficiently. "
            "Use tools to complete it. "
            "Call done() with a clear summary when finished."
        )
        return "\n".join(lines)

    def _build_text_prompt(self, sub_task: SubTask, context: str) -> str:
        """Prompt for text-only models: pre-fetch relevant file content so the
        model never needs to call a tool to read the workspace."""
        # Pre-fetch file content referenced in the task description
        file_content_block = self._prefetch_relevant_files(sub_task.description)

        lines = [
            f"TASK: {sub_task.description}",
            f"SUCCESS CRITERION: {sub_task.verify or 'task complete'}",
        ]
        if file_content_block:
            lines.append(f"\nRELEVANT FILE CONTENT:\n{file_content_block}")
        if context:
            lines.append(f"\nCONTEXT FROM OTHER WORKERS:\n{context[:600]}")
        lines.append(
            "\nProvide your complete output below. "
            "Do NOT attempt to call any tools or functions. "
            "Write your full answer as plain text or code."
        )
        return "\n".join(lines)

    def _prefetch_relevant_files(self, description: str) -> str:
        """Extract file paths mentioned in the task description and read them
        so a text-only model has the content it needs inline."""
        import re
        # Match common file path patterns in the task description
        patterns = [
            r'[\w./\\-]+\.py',
            r'[\w./\\-]+\.ts',
            r'[\w./\\-]+\.js',
            r'[\w./\\-]+\.json',
            r'[\w./\\-]+\.yaml',
            r'[\w./\\-]+\.md',
        ]
        found_paths = []
        for pat in patterns:
            found_paths.extend(re.findall(pat, description))

        blocks = []
        for path in found_paths[:3]:  # cap at 3 files to stay within context
            full_path = os.path.join(self.workspace, path) if not os.path.isabs(path) else path
            if os.path.exists(full_path):
                try:
                    with open(full_path, "r", encoding="utf-8", errors="replace") as f:
                        content = f.read(3000)  # first 3000 chars
                    blocks.append(f"--- {path} ---\n{content}")
                except Exception:
                    pass
        return "\n\n".join(blocks)

    def _run_with_tools(self, prompt: str) -> str:
        """
        Tool-capable execution: full tool loop with <tool> parsing.
        Used for Gemma 1B, Nemotron 4B and any other model that passed
        tool-calling validation.
        """
        tool_names = ", ".join(k for k in self.tool_map if k != "done")
        tool_fmt = (
            "\n\nTo call a tool:\n"
            "<tool>{\"name\": \"tool_name\", \"args\": {\"param\": \"value\"}}</tool>\n"
            f"Tools: {tool_names}\n"
            "Finish: <tool>{\"name\": \"done\", \"args\": {\"result\": \"summary\"}}</tool>"
        )
        messages = [
            {"role": "system", "content": "You are a focused parallel worker agent." + tool_fmt},
            {"role": "user",   "content": prompt},
        ]

        # Inline helpers to avoid circular import (agent imports swarm)
        def _parse_fallback_calls(text):
            import re, json
            calls = []
            for m in re.finditer(r'<tool>(.*?)</tool>', text, re.DOTALL):
                raw = re.sub(r',(\s*[}\]])', r'\1', m.group(1).strip())
                try:
                    obj = json.loads(raw)
                    name = obj.get("name") or obj.get("tool")
                    args = obj.get("args") or obj.get("arguments") or {}
                    if isinstance(args, str):
                        try: args = json.loads(args)
                        except: args = {}
                    if name:
                        calls.append({"name": str(name), "args": dict(args)})
                except Exception:
                    pass
            return calls

        def _is_done(text):
            t = text.lower()
            return any(s in t for s in [
                "task complete", "task is complete", "all done", "i have completed",
                "finished.", "the task has been", "<endofop>", "successfully completed",
            ])

        finished = False
        final_result = ""
        nudge = 0

        for step in range(self.max_steps):
            try:
                tokens = []
                for tok in self.llm.stream_text(messages):
                    tokens.append(tok)
                full = "".join(tokens)

                calls = _parse_fallback_calls(full)
                if calls:
                    nudge = 0
                    messages.append({"role": "assistant", "content": full})
                    for fc in calls:
                        name = fc["name"]; args = fc["args"]
                        if name == "done":
                            final_result = args.get("result", full)
                            finished = True
                            break
                        if name in self.tool_map:
                            try:
                                r = self.tool_map[name](**args)
                                result_str = str(r) if r is not None else "OK"
                            except Exception as e:
                                result_str = f"[ERROR] {e}"
                            messages.append({
                                "role": "user",
                                "content": f"Tool '{name}' returned:\n{result_str}\n\nContinue."
                            })
                    if finished:
                        break
                    continue

                if _is_done(full):
                    final_result = full
                    finished = True
                    break

                nudge += 1
                messages.append({"role": "assistant", "content": full})
                if nudge >= 3:
                    final_result = full
                    break
                messages.append({"role": "user", "content": "Use a tool or call done()."})

            except Exception as e:
                final_result = f"[ERROR] Worker {self.id}: {e}"
                break

        return final_result or "Worker completed without explicit result."

    def _run_text_only(self, prompt: str, sub_task: SubTask) -> str:
        """
        Text-only execution for models that cannot call tools (DeepSeek Coder
        1.3B, Qwen2.5 1.5B, Qwen2.5 Coder 1.5B).

        The model receives file content pre-fetched inline and is instructed
        to produce pure text/code output only. The caller (orchestrator) is
        responsible for writing results to disk via a tool-capable worker.
        """
        # Build a richer prompt with pre-fetched file content
        rich_prompt = self._build_text_prompt(sub_task, "")
        messages = [
            {
                "role": "system",
                "content": (
                    "You are a specialist code/analysis worker. "
                    "You receive a task and any relevant file content inline. "
                    "Produce only the requested output — code, analysis, or summary. "
                    "Do NOT output JSON tool calls, function calls, or <tool> blocks. "
                    "Write plain text or code blocks only."
                )
            },
            {"role": "user", "content": rich_prompt},
        ]
        try:
            tokens = []
            for tok in self.llm.stream_text(messages):
                tokens.append(tok)
            result = "".join(tokens).strip()
            return result if result else "[TEXT-WORKER] No output produced."
        except Exception as e:
            return f"[ERROR] Text worker {self.id}: {e}"


# ─── Critic ───────────────────────────────────────────────────────────────────

class SwarmCritic:
    """
    Reviews worker results and scores them.
    Rejects low-quality results and tells the worker what to fix.
    """

    def __init__(self, llm: Any, pass_threshold: float = 6.0):
        self.llm            = llm
        self.pass_threshold = pass_threshold

    def review(self, sub_task: SubTask) -> Dict:
        """
        Returns {"score": float, "pass": bool, "issues": list, "fix_hint": str}
        Fast path: obvious failures are caught without LLM.
        """
        # Fast-path checks (no LLM needed)
        if not sub_task.result or len(sub_task.result) < 10:
            return {"score": 0.0, "pass": False,
                    "issues": ["Empty or trivial result"], "fix_hint": "Complete the task"}

        if sub_task.result.startswith("[ERROR]"):
            return {"score": 1.0, "pass": False,
                    "issues": [sub_task.result[:200]], "fix_hint": "Fix the error and retry"}

        if sub_task.status == "failed":
            return {"score": 2.0, "pass": False,
                    "issues": ["Worker reported failure"], "fix_hint": "Retry with different approach"}

        # Skip LLM review for simple tasks (performance optimization)
        if sub_task.priority < 4 or len(sub_task.result) < 50:
            return {"score": 7.0, "pass": True, "issues": [], "fix_hint": ""}

        # LLM review for important tasks
        try:
            msgs = [
                {"role": "system", "content": CRITIC_PROMPT},
                {"role": "user", "content": (
                    f"TASK: {sub_task.description}\n"
                    f"VERIFY: {sub_task.verify}\n"
                    f"RESULT:\n{sub_task.result[:1000]}"
                )},
            ]
            tokens = []
            for tok in self.llm.stream_text(msgs):
                tokens.append(tok)
            raw = "".join(tokens)
            m = re.search(r'\{[\s\S]*\}', raw)
            if m:
                obj = json.loads(m.group())
                score = float(obj.get("score", 7.0))
                return {
                    "score":    score,
                    "pass":     score >= self.pass_threshold and obj.get("pass", True),
                    "issues":   obj.get("issues", []),
                    "fix_hint": obj.get("fix_hint", ""),
                }
        except Exception:
            pass

        return {"score": 7.0, "pass": True, "issues": [], "fix_hint": ""}


# ─── Merger ───────────────────────────────────────────────────────────────────

class SwarmMerger:
    """Combines all worker results into a coherent final answer."""

    def __init__(self, llm: Any):
        self.llm = llm

    def merge(self, task: str, sub_tasks: List[SubTask]) -> str:
        """
        Merge all passed sub-task results.
        For simple tasks, does it without LLM (pure concatenation).
        """
        passed = [st for st in sub_tasks if st.status == "done" and st.score >= 5.0]

        if not passed:
            failed = [st for st in sub_tasks if st.status == "failed"]
            return (
                f"Swarm completed with issues. "
                f"{len(sub_tasks)} tasks, {len(failed)} failed.\n"
                + "\n".join(f"  Task {st.id}: {st.result[:200]}" for st in sub_tasks)
            )

        # For 1-2 tasks, just concatenate (no LLM overhead)
        if len(passed) <= 2:
            parts = [f"Task {st.id} ({st.description}):\n{st.result}" for st in passed]
            return "\n\n---\n\n".join(parts)

        # For larger swarms, use LLM to merge
        try:
            parts_text = "\n\n".join(
                f"[WORKER {st.worker_id} | Task {st.id}: {st.description}]\n{st.result[:600]}"
                for st in passed
            )
            msgs = [
                {"role": "system", "content": MERGE_PROMPT},
                {"role": "user", "content": f"ORIGINAL TASK: {task}\n\nWORKER OUTPUTS:\n{parts_text}"},
            ]
            tokens = []
            for tok in self.llm.stream_text(msgs):
                tokens.append(tok)
            return "".join(tokens).strip()
        except Exception:
            # Fallback: plain concat
            return "\n\n".join(f"• {st.description}: {st.result[:400]}" for st in passed)


# ─── Orchestrator ─────────────────────────────────────────────────────────────

class SwarmOrchestrator:
    """
    Main entry point for the swarm system.

    1. Decomposes task into parallel sub-tasks
    2. Schedules them respecting dependencies
    3. Runs workers in a thread pool
    4. Critic reviews each result
    5. Retries failed/rejected tasks once
    6. Merger combines everything

    Usage:
        swarm = SwarmOrchestrator(agent, max_workers=4)
        result = swarm.run("build a REST API...")
    """

    def __init__(
        self,
        agent,
        max_workers:      int   = 4,
        critic_threshold: float = 6.0,
        max_retries:      int   = 1,
        on_progress:      Optional[Callable] = None,
    ):
        self.agent            = agent
        self.critic_threshold = critic_threshold
        self.max_retries      = max_retries
        self.on_progress      = on_progress

        # Resolve any bare filenames in swarm_models to full paths
        from axoniz.core.config import resolve_swarm_models
        resolve_swarm_models(self.agent.config)

        # If domain-expert models are configured, workers must be sequential
        # so we never have two models loaded in RAM at the same time.
        self._expert_mode = any(self.agent.config.get("swarm_models", {}).values())
        self.max_workers  = 1 if self._expert_mode else max_workers

        self.critic = SwarmCritic(agent.llm, pass_threshold=critic_threshold)
        self.merger = SwarmMerger(agent.llm)

        # Remember the model that was active before swarm started so we can
        # restore it when the swarm finishes.
        # Support both hierarchical config (llm.providers) and legacy flat config (model_path)
        prov = agent.config.get("llm", {}).get("active_provider", "llamacpp")
        self._original_model: Optional[str] = (
            agent.config.get("llm", {})
                        .get("providers", {})
                        .get(prov, {})
                        .get("model_path", "")
            or agent.config.get("model_path", "")
        )

    # ── Model hot-swap (sequential, thread-safe) ───────────────────────────────

    def _swap_model_for_role(self, role: str) -> None:
        """
        Unload the current LLM and load the domain-expert model assigned
        to `role` in config.swarm_models.  A no-op if:
          - expert mode is disabled (no swarm_models configured)
          - the requested role has no model assigned
          - the correct model is already loaded
        """
        if not self._expert_mode:
            return

        import os
        cfg         = self.agent.config
        model_path  = cfg.get("swarm_models", {}).get(role, "")

        if not model_path:
            return  # role has no expert model — use whatever is loaded
        if not os.path.exists(model_path):
            warn(f"[Swarm] Model for role '{role}' not found: {model_path!r}")
            return

        prov         = cfg.get("llm", {}).get("active_provider", "llamacpp")
        current_path = (
            cfg.get("llm", {})
               .get("providers", {})
               .get(prov, {})
               .get("model_path", "")
            or cfg.get("model_path", "")
        )

        if current_path == model_path:
            return  # already the right model

        with _MODEL_SWAP_LOCK:
            info(f"[Swarm] ▶ Phase '{role}' — loading {os.path.basename(model_path)}")
            self._emit("model_swap", {"role": role, "model": os.path.basename(model_path)})

            self.agent.unload_llm()
            cfg.setdefault("llm", {}).setdefault("providers", {}).setdefault(prov, {})
            cfg["llm"]["providers"][prov]["model_path"] = model_path
            self.agent.ensure_llm()

            # Keep critic and merger wired to the current LLM
            self.critic.llm = self.agent.llm
            self.merger.llm = self.agent.llm

    def _restore_original_model(self) -> None:
        """Reload the model that was active before the swarm started."""
        if not self._expert_mode or not self._original_model:
            return
        import os
        prov = self.agent.config.get("llm", {}).get("active_provider", "llamacpp")
        current = (
            self.agent.config.get("llm", {})
                             .get("providers", {})
                             .get(prov, {})
                             .get("model_path", "")
            or self.agent.config.get("model_path", "")
        )
        if current == self._original_model:
            return
        with _MODEL_SWAP_LOCK:
            info(f"[Swarm] Restoring original model: {os.path.basename(self._original_model)}")
            self.agent.unload_llm()
            self.agent.config["llm"]["providers"][prov]["model_path"] = self._original_model
            self.agent.ensure_llm()

    # ── Main entry point ───────────────────────────────────────────────────────

    def run(self, task: str) -> SwarmResult:
        """Full swarm execution pipeline. Returns SwarmResult."""
        t_start = time.time()
        mode    = "expert" if self._expert_mode else "standard"
        info(f"[Swarm] Starting ({mode} mode): {task[:60]}")
        self._emit("swarm_start", {"task": task, "mode": mode})

        try:
            # ── Phase 1: Decompose ──────────────────────────────────────────
            self._swap_model_for_role("decomposer")
            sub_tasks = self._decompose(task)
            info(f"[Swarm] Decomposed into {len(sub_tasks)} sub-tasks")
            self._emit("decomposed", {
                "count": len(sub_tasks),
                "tasks": [st.description for st in sub_tasks],
            })

            # ── Phase 2: Execute ────────────────────────────────────────────
            self._swap_model_for_role("worker")
            completed: Dict[int, SubTask] = {}
            self._schedule_and_run(sub_tasks, completed)

            # ── Phase 3: Critic review + retry ──────────────────────────────
            self._swap_model_for_role("critic")
            for st in list(completed.values()):
                review   = self.critic.review(st)
                st.score = review["score"]

                if not review["pass"] and self.max_retries > 0:
                    info(f"[Swarm] Critic rejected task {st.id} (score={st.score:.1f}), retrying")
                    self._emit("critic_retry", {
                        "task_id": st.id,
                        "score":   st.score,
                        "issues":  review["issues"],
                    })
                    retry_st = SubTask(
                        id=st.id,
                        description=st.description + f"\n\nFIX REQUIRED: {review['fix_hint']}",
                        depends_on=st.depends_on, priority=st.priority,
                        tool_hint=st.tool_hint,   verify=st.verify,
                    )
                    self._swap_model_for_role("worker")
                    worker   = self._make_worker(st.id % self.max_workers)
                    ctx      = self._build_context(completed, exclude_id=st.id)
                    retry_st = worker.execute(retry_st, ctx)

                    self._swap_model_for_role("critic")
                    review2          = self.critic.review(retry_st)
                    retry_st.score   = review2["score"]
                    completed[st.id] = retry_st

            # ── Phase 4: Merge ──────────────────────────────────────────────
            self._swap_model_for_role("merger")
            all_tasks = list(completed.values())
            merged    = self.merger.merge(task, all_tasks)

        finally:
            # Always restore the original model so the agent is usable
            # immediately after the swarm finishes, regardless of errors.
            self._restore_original_model()

        total_ms    = int((time.time() - t_start) * 1000)
        seq_time_ms = sum(st.duration_ms for st in all_tasks)
        parallelism = seq_time_ms / max(total_ms, 1) if seq_time_ms > 0 else 1.0

        result = SwarmResult(
            task=task, sub_tasks=all_tasks, merged=merged,
            success=any(st.status == "done" for st in all_tasks),
            total_ms=total_ms, parallelism=round(parallelism, 2),
        )

        self._emit("swarm_done", {
            "total_ms": total_ms,
            "seq_ms":   seq_time_ms,
            "speedup":  f"{parallelism:.1f}x",
            "passed":   sum(1 for st in all_tasks if st.score >= 6.0),
        })
        info(f"[Swarm] ✓ Done in {total_ms}ms — {parallelism:.1f}x speedup | {sum(1 for st in all_tasks if st.score >= 6.0)}/{len(all_tasks)} passed")

        return result

    def run_simple(self, task: str) -> str:
        """Convenience: run and return just the merged string."""
        return self.run(task).merged

    # ── Internal ──────────────────────────────────────────────────────────────

    def _decompose(self, task: str) -> List[SubTask]:
        """Use LLM to decompose task into sub-tasks."""
        workspace_summary = self.agent.indexer.summary() if hasattr(self.agent, "indexer") else ""
        context = f"Workspace: {workspace_summary}\n\nTask: {task}" if workspace_summary else task

        msgs = [
            {"role": "system", "content": DECOMPOSE_PROMPT},
            {"role": "user",   "content": context},
        ]
        try:
            tokens = []
            for tok in self.agent.llm.stream_text(msgs):
                tokens.append(tok)
            raw = "".join(tokens)
            m = re.search(r'\[[\s\S]*\]', raw)
            if m:
                data = json.loads(m.group())
                return [
                    SubTask(
                        id=int(d.get("id", i+1)),
                        description=str(d.get("description", "")),
                        depends_on=[int(x) for x in d.get("depends_on", [])],
                        priority=int(d.get("priority", 5)),
                        tool_hint=str(d.get("tool_hint", "")),
                        verify=str(d.get("verify", "")),
                    )
                    for i, d in enumerate(data[:8])
                ]
        except Exception as e:
            warn(f"[Swarm] Decompose failed: {e}")

        # Fallback: single sub-task
        return [SubTask(id=1, description=task, verify="task complete", priority=8)]

    def _schedule_and_run(self, sub_tasks: List[SubTask], completed: Dict[int, SubTask]):
        """
        Execute sub-tasks respecting depends_on.
        Independent tasks run in parallel via ThreadPoolExecutor.
        """
        pending   = {st.id: st for st in sub_tasks}
        running:  Dict[int, Future]    = {}

        with ThreadPoolExecutor(max_workers=self.max_workers) as pool:
            while pending or running:
                # Find tasks that can now run (all dependencies done)
                ready = [
                    st for st in pending.values()
                    if all(dep in completed for dep in st.depends_on)
                ]

                for st in ready:
                    del pending[st.id]
                    ctx = self._build_context(completed)
                    worker = self._make_worker(st.id % self.max_workers)
                    self._emit("worker_start", {"task_id": st.id, "desc": st.description})
                    future = pool.submit(worker.execute, st, ctx)
                    running[st.id] = future

                if not running:
                    break  # nothing running, nothing ready = dependency cycle

                # Wait for at least one to finish
                done_futures = [f for f in running.values() if f.done()]
                if not done_futures:
                    time.sleep(0.05)
                    continue

                for tid in list(running.keys()):
                    f = running[tid]
                    if f.done():
                        del running[tid]
                        try:
                            result_st = f.result()
                            completed[result_st.id] = result_st
                        except Exception as e:
                            # Mark failed
                            original = next((s for s in sub_tasks if s.id == tid), None)
                            if original:
                                original.status = "failed"
                                original.result = f"[ERROR] {e}"
                                completed[tid]  = original

    def _make_worker(self, worker_id: int) -> SwarmWorker:
        # Determine whether the currently loaded model supports tool calling
        # by checking against the explicit whitelist in config.
        import os
        capable_models = self.agent.config.get("swarm_tool_capable_models", [])
        prov = self.agent.config.get("llm", {}).get("active_provider", "llamacpp")
        current_model = (
            self.agent.config.get("llm", {})
                             .get("providers", {})
                             .get(prov, {})
                             .get("model_path", "")
            or self.agent.config.get("model_path", "")
        )
        # Match by full path or just filename
        current_basename = os.path.basename(current_model)
        tool_capable = (
            not capable_models  # if list is empty, assume all models can use tools
            or current_model in capable_models
            or any(os.path.basename(c) == current_basename for c in capable_models)
        )
        if not tool_capable:
            info(f"[Swarm] Worker {worker_id} → text-only mode ({current_basename})")
        return SwarmWorker(
            worker_id=worker_id,
            tool_map=self.agent._tool_map,
            llm=self.agent.llm,
            workspace=self.agent.workspace,
            max_steps=8,
            on_progress=self.on_progress,
            tool_capable=tool_capable,
        )

    def _build_context(self, completed: Dict[int, SubTask],
                       exclude_id: int = None) -> str:
        """Build context string from already-completed sub-tasks."""
        parts = []
        for tid, st in sorted(completed.items()):
            if tid == exclude_id:
                continue
            if st.status == "done" and st.result:
                parts.append(f"Task {tid} ({st.description[:60]}): {st.result[:300]}")
        return "\n".join(parts[:3])  # limit context size

    def _emit(self, event: str, data: dict):
        if self.on_progress:
            try:
                self.on_progress({"event": event, **data})
            except Exception:
                pass
