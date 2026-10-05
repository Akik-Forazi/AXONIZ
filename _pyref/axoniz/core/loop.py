"""
AXONIZ-ZERO Loop Engine — Goal Mode
Fixed: syntax error in _replan(), _plan()/_replan()/_verify() all use
TextResponse correctly, no SyntaxError on import.
"""

import json
import re
import time
from typing import Callable, Optional
from axoniz.core.agent import Agent
from axoniz.core.cli import C, _rule, Spinner

rule = _rule()

PLANNER_PROMPT = """Decompose a goal into sequential sub-tasks.
Respond ONLY with a valid JSON array:
[
  {"id": 1, "task": "What to do", "verify": "How to confirm it succeeded"},
  ...
]
Max 12 tasks. Each task independently executable."""

VERIFIER_PROMPT = """Assess whether a sub-task was completed based on evidence.
Respond ONLY with JSON:
{"success": true, "reason": "why it passed"}
or
{"success": false, "reason": "what is missing", "fix_hint": "corrective action"}"""

REPLANNER_PROMPT = """A plan hit an obstacle. Produce a new plan to reach the goal.
Respond ONLY with a valid JSON array of remaining sub-tasks:
[{"id": 1, "task": "...", "verify": "..."}, ...]"""


class LoopEngine:

    def __init__(self, agent: Agent, max_cycles: int = 5, max_retries: int = 3,
                 max_steps_per_task: int = 20, verbose: bool = True,
                 on_progress: Optional[Callable] = None):
        self.agent              = agent
        self.max_cycles         = max_cycles
        self.max_retries        = max_retries
        self.max_steps_per_task = max_steps_per_task
        self.verbose            = verbose
        self.on_progress        = on_progress
        self.goal               = ""
        self.plan               = []
        self.completed          = []
        self.failed             = []
        self.cycle              = 0
        self._stop              = False

    def run_goal(self, goal: str) -> str:
        self.goal      = goal
        self._stop     = False
        self.completed = []
        self.failed    = []
        self.cycle     = 0

        self._emit("start", {"goal": goal})
        self._header(f"Objective: {goal}")

        for cycle in range(1, self.max_cycles + 1):
            self.cycle = cycle
            self._emit("cycle", {"cycle": cycle, "max": self.max_cycles})
            self._section(f"Phase {cycle}/{self.max_cycles} — Planning")

            self.plan = self._plan(goal)
            if not self.plan:
                self._warn("Planner returned empty plan. Retrying...")
                continue

            self._show_plan(self.plan)
            all_passed = True

            for task in self.plan:
                if self._stop:
                    return "Operation interrupted."

                tid        = task["id"]
                task_desc  = task["task"]
                verify_cond = task.get("verify", "task complete")

                self._task_header(tid, len(self.plan), task_desc)
                self._emit("task_start", {"id": tid, "task": task_desc})

                success  = False
                evidence = ""

                for attempt in range(1, self.max_retries + 1):
                    if attempt > 1:
                        self._warn(f"Retry {attempt}/{self.max_retries}: {task.get('fix_hint', 'adjusting...')}")

                    evidence = self._run_subtask(task_desc, verify_cond, attempt)
                    ok, reason, fix_hint = self._verify(task_desc, verify_cond, evidence)

                    if ok:
                        self._ok(f"Validated: {reason}")
                        self._emit("task_done", {"id": tid, "reason": reason})
                        task["_evidence"] = evidence
                        task["_status"]   = "done"
                        success = True
                        break
                    else:
                        self._err(f"Validation failed: {reason}")
                        task["fix_hint"] = fix_hint
                        self._emit("task_fail", {"id": tid, "reason": reason, "attempt": attempt})
                        if attempt < self.max_retries:
                            time.sleep(0.3)

                if success:
                    self.completed.append(task)
                else:
                    task["_status"] = "failed"
                    self.failed.append(task)
                    all_passed = False
                    self._err(f"Task {tid} failed after all retries. Replanning...")
                    break

            if all_passed:
                self._section("Final verification...")
                ok, reason, _ = self._verify_goal(goal)
                if ok:
                    self._header(f"Goal achieved: {reason}")
                    self._emit("goal_done", {"reason": reason, "cycles": cycle})
                    return f"Goal achieved in {cycle} cycle(s): {reason}"
                else:
                    self._warn(f"Goal not fully met: {reason}")
                    self._emit("goal_not_met", {"reason": reason})
                    self.plan = self._replan(goal, self.completed, reason)

        self._err(f"Goal not achieved after {self.max_cycles} cycles.")
        self._emit("goal_failed", {"cycles": self.max_cycles})
        return f"Could not complete goal after {self.max_cycles} cycle(s)."

    def stop(self):
        self._stop = True

    def _llm_json(self, system: str, user: str) -> str:
        """Call LLM and return raw text. Used for plan/verify/replan."""
        msgs = [
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ]
        try:
            resp = self.agent.llm.complete(msgs)
            return resp.text if hasattr(resp, "text") else str(resp)
        except Exception as e:
            return ""

    def _plan(self, goal: str) -> list:
        spinner = Spinner("Planning...")
        spinner.start()
        raw = self._llm_json(
            PLANNER_PROMPT,
            f"GOAL: {goal}\nWorkspace: {self.agent.workspace}",
        )
        spinner.stop()
        return self._extract_list(raw)

    def _replan(self, goal: str, completed: list, reason: str) -> list:
        spinner = Spinner("Replanning...")
        spinner.start()
        done_summary = "\n".join(f"- {t['task']}" for t in completed)
        raw = self._llm_json(
            REPLANNER_PROMPT,
            (
                f"GOAL: {goal}\n\n"
                f"Completed:\n{done_summary}\n\n"
                f"Issue: {reason}\n\n"
                f"Produce a new plan for the remaining work."
            ),
        )
        spinner.stop()
        tasks = self._extract_list(raw)
        # Re-number from 1 to avoid ID collisions with completed tasks
        for i, t in enumerate(tasks):
            t["id"] = i + 1
        return tasks

    def _run_subtask(self, task: str, verify_cond: str, attempt: int) -> str:
        prompt = (
            f"TASK: {task}\n"
            f"SUCCESS CRITERION: {verify_cond}\n"
        )
        if attempt > 1:
            prompt += "\nNOTE: Previous attempt failed. Try a different approach.\n"
        prompt += "\nComplete this task. Call done() when the criterion is met."

        orig_steps = self.agent.config.get("max_steps", 30)
        self.agent.config["max_steps"] = self.max_steps_per_task

        evidence   = []
        orig_cb    = self.agent.on_tool_result

        def capture(name, result):
            evidence.append(f"[{name}] {str(result)[:800]}")
            if orig_cb:
                orig_cb(name, result)

        self.agent.on_tool_result = capture
        result = self.agent.run(prompt)
        self.agent.config["max_steps"] = orig_steps
        self.agent.on_tool_result      = orig_cb

        evidence.append(f"[final] {result}")
        return "\n".join(evidence)

    def _verify(self, task: str, condition: str, evidence: str) -> tuple:
        spinner = Spinner("Verifying...")
        spinner.start()
        raw = self._llm_json(
            VERIFIER_PROMPT,
            f"Task: {task}\nRequired: {condition}\nEvidence:\n{evidence[:3000]}",
        )
        spinner.stop()
        obj = self._extract_obj(raw)
        if obj:
            return (
                bool(obj.get("success", False)),
                obj.get("reason", ""),
                obj.get("fix_hint", ""),
            )
        # Heuristic fallback
        if "[DONE]" in evidence or "completed" in evidence.lower():
            return True, "Completion detected in evidence.", ""
        return False, "Could not parse verification response.", "Review logs."

    def _verify_goal(self, goal: str) -> tuple:
        evidence = "\n".join(
            f"{t['task']}: {t.get('_evidence', '')[:200]}"
            for t in self.completed
        )
        return self._verify(
            task=f"Overall goal: {goal}",
            condition="Entire goal is fully realized.",
            evidence=evidence,
        )

    # ── JSON helpers ───────────────────────────────────────────────────────────

    def _extract_list(self, text: str) -> list:
        m = re.search(r'\[[\s\S]*\]', text)
        if m:
            try:
                return json.loads(m.group())
            except Exception:
                pass
        return []

    def _extract_obj(self, text: str) -> dict:
        m = re.search(r'\{[\s\S]*\}', text)
        if m:
            try:
                return json.loads(m.group())
            except Exception:
                pass
        return {}

    # ── UI helpers ─────────────────────────────────────────────────────────────

    def _emit(self, event: str, data: dict):
        if self.on_progress:
            self.on_progress({"event": event, **data})

    def _header(self, msg: str):
        if not self.verbose: return
        print(f"\n  {C.BOLD}{C.WHITE}{msg}{C.RESET}")
        rule('═', C.BLUE)

    def _section(self, msg: str):
        if not self.verbose: return
        print(f"\n  {C.BLUE}◆{C.RESET} {C.GRAY}{msg}{C.RESET}")

    def _task_header(self, tid: int, total: int, task: str):
        if not self.verbose: return
        bar_w  = 16
        filled = int(bar_w * tid / max(total, 1))
        bar    = f"{C.BLUE}{'▪' * filled}{C.DGRAY}{'·' * (bar_w - filled)}{C.RESET}"
        print(f"\n  {bar}  {C.WHITE}{C.BOLD}[{tid}/{total}]{C.RESET} {C.WHITE}{task}{C.RESET}")

    def _show_plan(self, plan: list):
        if not self.verbose: return
        print(f"\n  {C.GRAY}Plan ({len(plan)} tasks):{C.RESET}")
        for t in plan:
            print(f"    {C.DGRAY}{t['id']:>2}.{C.RESET} {C.WHITE}{t['task']}{C.RESET}")
            print(f"        {C.DGRAY}✓ {t.get('verify', '—')}{C.RESET}")

    def _ok(self, msg: str):
        if self.verbose: print(f"   {C.GREEN}✓ {msg}{C.RESET}")

    def _err(self, msg: str):
        if self.verbose: print(f"   {C.RED}✗ {msg}{C.RESET}")

    def _warn(self, msg: str):
        if self.verbose: print(f"   {C.YELLOW}⚠ {msg}{C.RESET}")

    def _info(self, msg: str):
        if self.verbose: print(f"   {C.GRAY}{msg}{C.RESET}")
