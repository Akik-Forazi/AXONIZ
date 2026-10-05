"""
axoniz/workflows/engine.py
===========================
BERU Workflow Engine — trigger/action automation.

Inspired by Jarvis src/workflows/ — Python reimplementation.

A Workflow has:
  - Triggers: cron | file_change | keyword | manual | heartbeat
  - Conditions: optional filter expressions
  - Actions: run_agent | shell | notify | goal_update | palace_store

Workflows are persisted in SQLite and survive restarts.
The engine runs in a background thread monitoring all triggers.

Usage:
    from axoniz.workflows.engine import get_workflow_engine
    engine = get_workflow_engine()
    engine.add_workflow(Workflow(
        name="daily_audit",
        trigger=Trigger(kind="cron", schedule="08:00"),
        actions=[Action(kind="run_agent", task="Run daily audit and report findings")],
    ))
    engine.start()
"""

import json
import logging
import os
import re
import sqlite3
import threading
import time
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, date
from typing import Any, Callable, Dict, List, Optional

from axoniz.core.config import AXONIZ_HOME
from axoniz.core.debug import info, warn, debug

logger = logging.getLogger("axoniz.workflows")

WORKFLOWS_DB = os.path.join(AXONIZ_HOME, "workflows.db")


# ── Data classes ──────────────────────────────────────────────────────────────

@dataclass
class Trigger:
    kind: str           # cron | file_change | keyword | manual | heartbeat
    schedule: str = ""  # "HH:MM" for cron, interval seconds for heartbeat
    path: str = ""      # for file_change
    pattern: str = ""   # for keyword / file_change glob
    interval_s: int = 0 # for heartbeat

@dataclass
class Action:
    kind: str              # run_agent | shell | notify | goal_update | palace_store
    task: str = ""         # for run_agent
    command: str = ""      # for shell
    message: str = ""      # for notify
    goal_id: str = ""      # for goal_update
    score: float = 0.0     # for goal_update
    wing: str = ""         # for palace_store
    room: str = ""         # for palace_store
    content: str = ""      # for palace_store

@dataclass
class Workflow:
    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    name: str = ""
    description: str = ""
    enabled: bool = True
    trigger: Trigger = field(default_factory=lambda: Trigger(kind="manual"))
    actions: List[Action] = field(default_factory=list)
    last_run: str = ""
    run_count: int = 0
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())


# ── Engine ────────────────────────────────────────────────────────────────────

class WorkflowEngine:
    """
    Background workflow executor.
    Checks cron/heartbeat triggers every 30s.
    File-change triggers use polling.
    """

    def __init__(self, db_path: str = WORKFLOWS_DB):
        self.db_path = db_path
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        self._init_db()
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._agent_callback: Optional[Callable[[str], str]] = None
        self._file_mtimes: Dict[str, float] = {}

    def _init_db(self):
        with self._lock:
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("""
                CREATE TABLE IF NOT EXISTS workflows (
                    id          TEXT PRIMARY KEY,
                    name        TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    enabled     INTEGER DEFAULT 1,
                    trigger_json TEXT NOT NULL,
                    actions_json TEXT NOT NULL,
                    last_run    TEXT DEFAULT '',
                    run_count   INTEGER DEFAULT 0,
                    created_at  TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)
            self._conn.execute("""
                CREATE TABLE IF NOT EXISTS workflow_runs (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    workflow_id TEXT NOT NULL,
                    ts          TEXT DEFAULT CURRENT_TIMESTAMP,
                    trigger     TEXT,
                    result      TEXT,
                    success     INTEGER DEFAULT 1,
                    duration_ms INTEGER DEFAULT 0
                )
            """)
            self._conn.execute("CREATE INDEX IF NOT EXISTS idx_wf_enabled ON workflows(enabled)")
            self._conn.commit()

    def set_agent_callback(self, cb: Callable[[str], str]):
        """Wire in the agent's run() method."""
        self._agent_callback = cb

    # ── CRUD ──────────────────────────────────────────────────────────────────

    def add_workflow(self, wf: Workflow) -> str:
        with self._lock:
            self._conn.execute(
                """INSERT OR REPLACE INTO workflows
                   (id, name, description, enabled, trigger_json, actions_json, last_run, run_count, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (wf.id, wf.name, wf.description, int(wf.enabled),
                 json.dumps(asdict(wf.trigger)),
                 json.dumps([asdict(a) for a in wf.actions]),
                 wf.last_run, wf.run_count, wf.created_at)
            )
            self._conn.commit()
        info(f"[Workflows] Added: '{wf.name}' (id={wf.id})")
        return wf.id

    def remove_workflow(self, wf_id: str) -> bool:
        with self._lock:
            cur = self._conn.execute("DELETE FROM workflows WHERE id=?", (wf_id,))
            self._conn.commit()
        return cur.rowcount > 0

    def enable(self, wf_id: str, enabled: bool = True):
        with self._lock:
            self._conn.execute("UPDATE workflows SET enabled=? WHERE id=?", (int(enabled), wf_id))
            self._conn.commit()

    def list_workflows(self, enabled_only: bool = False) -> List[Workflow]:
        q = "SELECT * FROM workflows"
        params = []
        if enabled_only:
            q += " WHERE enabled=1"
        q += " ORDER BY created_at"
        with self._lock:
            rows = self._conn.execute(q, params).fetchall()
        return [self._row_to_wf(r) for r in rows]

    def _row_to_wf(self, row) -> Workflow:
        t = json.loads(row["trigger_json"])
        a = json.loads(row["actions_json"])
        return Workflow(
            id=row["id"], name=row["name"], description=row["description"] or "",
            enabled=bool(row["enabled"]),
            trigger=Trigger(**t),
            actions=[Action(**x) for x in a],
            last_run=row["last_run"] or "",
            run_count=row["run_count"] or 0,
            created_at=row["created_at"] or "",
        )

    def get_workflow(self, wf_id: str) -> Optional[Workflow]:
        with self._lock:
            row = self._conn.execute("SELECT * FROM workflows WHERE id=?", (wf_id,)).fetchone()
        return self._row_to_wf(row) if row else None

    # ── Execution ─────────────────────────────────────────────────────────────

    def run_now(self, wf_id: str, trigger_note: str = "manual") -> str:
        wf = self.get_workflow(wf_id)
        if not wf:
            return f"Workflow {wf_id} not found"
        return self._execute(wf, trigger_note)

    def _execute(self, wf: Workflow, trigger_note: str) -> str:
        t0 = time.time()
        results = []
        success = True
        try:
            for action in wf.actions:
                res = self._run_action(action, wf)
                results.append(res)
        except Exception as e:
            results.append(f"Error: {e}")
            success = False
        duration_ms = int((time.time() - t0) * 1000)
        result_str = " | ".join(results)[:500]

        # Update run log
        now = datetime.now().isoformat()
        with self._lock:
            self._conn.execute(
                "UPDATE workflows SET last_run=?, run_count=run_count+1 WHERE id=?",
                (now, wf.id)
            )
            self._conn.execute(
                """INSERT INTO workflow_runs (workflow_id, ts, trigger, result, success, duration_ms)
                   VALUES (?,?,?,?,?,?)""",
                (wf.id, now, trigger_note, result_str, int(success), duration_ms)
            )
            self._conn.commit()

        info(f"[Workflows] '{wf.name}' ran in {duration_ms}ms — {result_str[:80]}")
        return result_str

    def _run_action(self, action: Action, wf: Workflow) -> str:
        if action.kind == "run_agent":
            if self._agent_callback:
                task = action.task or wf.description or wf.name
                result = self._agent_callback(task)
                return result[:300] if result else "done"
            return "[no agent connected]"

        elif action.kind == "shell":
            import subprocess
            try:
                r = subprocess.run(action.command, shell=True, capture_output=True, text=True, timeout=60, encoding="utf-8", errors="replace")
                return (r.stdout + r.stderr)[:200]
            except Exception as e:
                return f"shell error: {e}"

        elif action.kind == "notify":
            msg = action.message or f"Workflow '{wf.name}' fired"
            try:
                from axoniz.comms.dispatcher import get_dispatcher
                get_dispatcher().send(msg)
            except Exception:
                print(f"[Workflow] {msg}")
            return "notified"

        elif action.kind == "goal_update":
            try:
                from axoniz.goals.service import get_goal_service
                gs = get_goal_service()
                gs.update_score(action.goal_id, action.score)
                return f"goal {action.goal_id} score → {action.score:.0%}"
            except Exception as e:
                return f"goal update error: {e}"

        elif action.kind == "palace_store":
            try:
                from axoniz.integrations.unified_memory import UnifiedMemory
                m = UnifiedMemory()
                m.palace.store(wing=action.wing or "wing_workflows",
                               room=action.room or wf.name,
                               content=action.content or f"Workflow '{wf.name}' fired at {datetime.now().isoformat()}",
                               added_by="workflow")
                return "palace stored"
            except Exception as e:
                return f"palace error: {e}"

        return f"unknown action kind: {action.kind}"

    # ── Background loop ────────────────────────────────────────────────────────

    def start(self):
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True, name="beru-workflows")
        self._thread.start()
        info("[Workflows] Engine started")

    def stop(self):
        self._running = False

    def is_running(self) -> bool:
        return self._running

    def _loop(self):
        while self._running:
            try:
                self._tick()
            except Exception as e:
                logger.debug(f"Workflow tick error: {e}")
            time.sleep(30)

    def _tick(self):
        now = datetime.now()
        now_hhmm = now.strftime("%H:%M")
        today = date.today().isoformat()

        for wf in self.list_workflows(enabled_only=True):
            t = wf.trigger
            fired = False
            note = ""

            if t.kind == "cron":
                # Fire if current time matches HH:MM and not already run today
                if t.schedule == now_hhmm:
                    last = wf.last_run[:10] if wf.last_run else ""
                    if last != today:
                        fired = True
                        note = f"cron {t.schedule}"

            elif t.kind == "heartbeat":
                interval = t.interval_s or 3600
                if wf.last_run:
                    try:
                        last_ts = datetime.fromisoformat(wf.last_run)
                        if (now - last_ts).total_seconds() >= interval:
                            fired = True
                            note = f"heartbeat {interval}s"
                    except Exception:
                        fired = True
                        note = "heartbeat (first)"
                else:
                    fired = True
                    note = "heartbeat (first)"

            elif t.kind == "file_change":
                if t.path and os.path.exists(t.path):
                    mtime = os.path.getmtime(t.path)
                    prev  = self._file_mtimes.get(wf.id, 0)
                    if mtime > prev:
                        self._file_mtimes[wf.id] = mtime
                        if prev > 0:  # don't fire on first check
                            fired = True
                            note = f"file_change {t.path}"

            if fired:
                debug(f"[Workflows] Firing '{wf.name}' ({note})")
                threading.Thread(
                    target=self._execute, args=(wf, note), daemon=True
                ).start()

    def recent_runs(self, n: int = 10) -> List[dict]:
        with self._lock:
            rows = self._conn.execute(
                """SELECT wr.ts, w.name, wr.trigger, wr.result, wr.success, wr.duration_ms
                   FROM workflow_runs wr JOIN workflows w ON wr.workflow_id = w.id
                   ORDER BY wr.id DESC LIMIT ?""", (n,)
            ).fetchall()
        return [{"ts": r[0], "name": r[1], "trigger": r[2], "result": r[3],
                 "success": bool(r[4]), "ms": r[5]} for r in rows]

    def status(self) -> dict:
        wfs = self.list_workflows()
        enabled = sum(1 for w in wfs if w.enabled)
        return {
            "total_workflows": len(wfs),
            "enabled": enabled,
            "running": self._running,
            "workflows": [{"id": w.id, "name": w.name, "enabled": w.enabled,
                           "trigger": w.trigger.kind, "last_run": w.last_run,
                           "runs": w.run_count} for w in wfs],
        }

    def format_for_agent(self) -> str:
        wfs = self.list_workflows(enabled_only=True)
        if not wfs:
            return ""
        lines = ["Active Workflows:"]
        for w in wfs[:5]:
            lines.append(f"  [{w.id}] {w.name} | trigger={w.trigger.kind} | runs={w.run_count}")
        return "\n".join(lines)


# ── Built-in workflows seeded on first start ──────────────────────────────────

def _seed_default_workflows(engine: "WorkflowEngine"):
    """Add sensible default workflows if DB is empty."""
    existing = engine.list_workflows()
    if existing:
        return
    defaults = [
        Workflow(
            name="daily_goal_report",
            description="Send daily goal briefing at 08:00",
            trigger=Trigger(kind="cron", schedule="08:00"),
            actions=[Action(kind="notify", message="__goals__")],
        ),
        Workflow(
            name="palace_heartbeat",
            description="Archive conversation context every 4 hours",
            trigger=Trigger(kind="heartbeat", interval_s=14400),
            actions=[Action(kind="palace_store", wing="wing_axoniz",
                            room="heartbeat", content="Heartbeat checkpoint")],
        ),
    ]
    for wf in defaults:
        engine.add_workflow(wf)


# ── Singleton ─────────────────────────────────────────────────────────────────

_engine: Optional[WorkflowEngine] = None

def get_workflow_engine() -> WorkflowEngine:
    global _engine
    if _engine is None:
        _engine = WorkflowEngine()
        _seed_default_workflows(_engine)
    return _engine
