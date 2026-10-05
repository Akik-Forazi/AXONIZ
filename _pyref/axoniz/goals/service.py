"""
axoniz/goals/service.py
========================
BERU Goal Pursuit Engine — OKR-style goal tracking with drill sergeant accountability.

Inspired by Jarvis src/goals/ — reimplemented in Python on SQLite.

Structure:
  Objective → KeyResult → DailyAction

BERU behaviour:
  - Goals are tracked across sessions
  - BERU proactively checks progress at heartbeat
  - If behind schedule: escalate, propose catch-up, spawn shadow army
  - Morning planning + evening review (via daemon scheduler)
  - Scores: 0.0 (nothing) → 1.0 (fully achieved)
"""

import json
import os
import sqlite3
import threading
import time
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, date, timedelta
from typing import Dict, List, Optional

from axoniz.core.config import AXONIZ_HOME
from axoniz.core.debug import info, warn, debug
from axoniz.goals.types import GoalStatus, GoalPriority

GOALS_DB = os.path.join(AXONIZ_HOME, "goals.db")


# ── Data classes ──────────────────────────────────────────────────────────────

@dataclass
class DailyAction:
    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    key_result_id: str = ""
    title: str = ""
    done: bool = False
    scheduled_date: str = ""  # YYYY-MM-DD
    completed_date: str = ""

@dataclass
class KeyResult:
    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    goal_id: str = ""
    title: str = ""
    score: float = 0.0   # 0.0 → 1.0
    target: str = ""     # e.g. "Ship v1.0"
    deadline: str = ""   # YYYY-MM-DD
    daily_actions: List[DailyAction] = field(default_factory=list)

@dataclass
class Goal:
    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    title: str = ""
    description: str = ""
    status: GoalStatus = GoalStatus.ACTIVE
    priority: GoalPriority = GoalPriority.HIGH
    score: float = 0.0
    deadline: str = ""   # YYYY-MM-DD
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now().isoformat())
    key_results: List[KeyResult] = field(default_factory=list)


# ── Service ───────────────────────────────────────────────────────────────────

class GoalService:
    """
    Persistent goal store with drill sergeant accountability.
    SQLite backend — survives restarts.
    """

    def __init__(self, db_path: str = GOALS_DB):
        self.db_path = db_path
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        self._init_db()

    def _init_db(self):
        with self._lock:
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("""
                CREATE TABLE IF NOT EXISTS goals (
                    id          TEXT PRIMARY KEY,
                    title       TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    status      TEXT DEFAULT 'active',
                    priority    TEXT DEFAULT 'high',
                    score       REAL DEFAULT 0.0,
                    deadline    TEXT DEFAULT '',
                    created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at  TEXT DEFAULT CURRENT_TIMESTAMP,
                    data_json   TEXT DEFAULT '{}'
                )
            """)
            self._conn.execute("""
                CREATE TABLE IF NOT EXISTS key_results (
                    id          TEXT PRIMARY KEY,
                    goal_id     TEXT NOT NULL,
                    title       TEXT NOT NULL,
                    score       REAL DEFAULT 0.0,
                    target      TEXT DEFAULT '',
                    deadline    TEXT DEFAULT '',
                    data_json   TEXT DEFAULT '{}'
                )
            """)
            self._conn.execute("""
                CREATE TABLE IF NOT EXISTS daily_actions (
                    id              TEXT PRIMARY KEY,
                    key_result_id   TEXT NOT NULL,
                    title           TEXT NOT NULL,
                    done            INTEGER DEFAULT 0,
                    scheduled_date  TEXT DEFAULT '',
                    completed_date  TEXT DEFAULT ''
                )
            """)
            self._conn.execute("CREATE INDEX IF NOT EXISTS idx_goal_status ON goals(status)")
            self._conn.execute("CREATE INDEX IF NOT EXISTS idx_kr_goal ON key_results(goal_id)")
            self._conn.execute("CREATE INDEX IF NOT EXISTS idx_da_kr ON daily_actions(key_result_id)")
            self._conn.commit()

    # ── CRUD ──────────────────────────────────────────────────────────────────

    def create_goal(self, title: str, description: str = "", deadline: str = "",
                    priority: str = "high") -> Goal:
        g = Goal(
            title=title, description=description,
            deadline=deadline, priority=GoalPriority(priority),
            status=GoalStatus.ACTIVE,
        )
        with self._lock:
            self._conn.execute(
                "INSERT INTO goals (id,title,description,status,priority,score,deadline,created_at,updated_at,data_json) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (g.id, g.title, g.description, g.status.value, g.priority.value,
                 g.score, g.deadline, g.created_at, g.updated_at, "{}")
            )
            self._conn.commit()
        info(f"[Goals] Created: '{title}' (id={g.id})")
        return g

    def add_key_result(self, goal_id: str, title: str, target: str = "",
                       deadline: str = "") -> KeyResult:
        kr = KeyResult(goal_id=goal_id, title=title, target=target, deadline=deadline)
        with self._lock:
            self._conn.execute(
                "INSERT INTO key_results (id,goal_id,title,score,target,deadline,data_json) VALUES (?,?,?,?,?,?,?)",
                (kr.id, goal_id, title, 0.0, target, deadline, "{}")
            )
            self._conn.commit()
        return kr

    def add_daily_action(self, key_result_id: str, title: str,
                         scheduled_date: str = "") -> DailyAction:
        da = DailyAction(key_result_id=key_result_id, title=title,
                         scheduled_date=scheduled_date or date.today().isoformat())
        with self._lock:
            self._conn.execute(
                "INSERT INTO daily_actions (id,key_result_id,title,done,scheduled_date) VALUES (?,?,?,?,?)",
                (da.id, key_result_id, title, 0, da.scheduled_date)
            )
            self._conn.commit()
        return da

    def update_score(self, goal_id: str, score: float,
                     key_result_id: str = None) -> str:
        """Update score for a goal or key result (0.0-1.0)."""
        score = max(0.0, min(1.0, score))
        with self._lock:
            if key_result_id:
                self._conn.execute(
                    "UPDATE key_results SET score=? WHERE id=? AND goal_id=?",
                    (score, key_result_id, goal_id)
                )
            else:
                self._conn.execute(
                    "UPDATE goals SET score=?, updated_at=? WHERE id=?",
                    (score, datetime.now().isoformat(), goal_id)
                )
            self._conn.commit()
        return f"Score updated: {score:.1%}"

    def complete_action(self, action_id: str) -> str:
        with self._lock:
            self._conn.execute(
                "UPDATE daily_actions SET done=1, completed_date=? WHERE id=?",
                (date.today().isoformat(), action_id)
            )
            self._conn.commit()
        return f"Action {action_id} marked done"

    def set_status(self, goal_id: str, status: str) -> str:
        with self._lock:
            self._conn.execute(
                "UPDATE goals SET status=?, updated_at=? WHERE id=?",
                (status, datetime.now().isoformat(), goal_id)
            )
            self._conn.commit()
        return f"Status → {status}"

    # ── Queries ───────────────────────────────────────────────────────────────

    def list_goals(self, status: str = None) -> List[Goal]:
        q = "SELECT * FROM goals"
        params = []
        if status:
            q += " WHERE status=?"
            params.append(status)
        q += " ORDER BY priority DESC, deadline ASC"
        with self._lock:
            rows = self._conn.execute(q, params).fetchall()
        return [self._row_to_goal(r) for r in rows]

    def get_goal(self, goal_id: str) -> Optional[Goal]:
        with self._lock:
            row = self._conn.execute("SELECT * FROM goals WHERE id=?", (goal_id,)).fetchone()
        return self._row_to_goal(row) if row else None

    def _row_to_goal(self, row) -> Goal:
        return Goal(
            id=row["id"], title=row["title"], description=row["description"] or "",
            status=GoalStatus(row["status"]), priority=GoalPriority(row["priority"]),
            score=row["score"], deadline=row["deadline"] or "",
            created_at=row["created_at"] or "", updated_at=row["updated_at"] or "",
        )

    def count(self, status: str = "active") -> int:
        with self._lock:
            return self._conn.execute(
                "SELECT COUNT(*) FROM goals WHERE status=?", (status,)
            ).fetchone()[0]

    # ── Accountability ────────────────────────────────────────────────────────

    def health_check(self) -> List[dict]:
        """Check all active goals for health. Returns list of concerns."""
        concerns = []
        today = date.today()
        goals = self.list_goals(status="active")
        for g in goals:
            if not g.deadline:
                continue
            try:
                dl = date.fromisoformat(g.deadline)
                days_left = (dl - today).days
                if days_left < 0:
                    concerns.append({"id": g.id, "title": g.title,
                                     "issue": "OVERDUE", "days": abs(days_left),
                                     "score": g.score})
                elif days_left <= 3 and g.score < 0.7:
                    concerns.append({"id": g.id, "title": g.title,
                                     "issue": "AT_RISK", "days": days_left,
                                     "score": g.score})
                elif days_left <= 7 and g.score < 0.4:
                    concerns.append({"id": g.id, "title": g.title,
                                     "issue": "BEHIND", "days": days_left,
                                     "score": g.score})
            except ValueError:
                pass
        return concerns

    def daily_report(self) -> str:
        """BERU's daily goal briefing — drill sergeant tone."""
        active = self.list_goals(status="active")
        concerns = self.health_check()

        lines = ["⚔️ *BERU Daily Goal Report*\n"]

        if not active:
            lines.append("No active goals. Set objectives, Shadow Monarch.")
            return "\n".join(lines)

        for g in active:
            score_bar = "█" * int(g.score * 10) + "░" * (10 - int(g.score * 10))
            deadline_str = f" | deadline: {g.deadline}" if g.deadline else ""
            lines.append(f"• *{g.title}*{deadline_str}")
            lines.append(f"  [{score_bar}] {g.score:.0%}")

        if concerns:
            lines.append("\n⚠️ *Concerns:*")
            for c in concerns:
                if c["issue"] == "OVERDUE":
                    lines.append(f"  🔴 '{c['title']}' is {c['days']} days OVERDUE ({c['score']:.0%})")
                elif c["issue"] == "AT_RISK":
                    lines.append(f"  🟡 '{c['title']}' — {c['days']} days left, only {c['score']:.0%} done")
                else:
                    lines.append(f"  🟠 '{c['title']}' — behind pace ({c['score']:.0%} with {c['days']}d left)")
            lines.append("\nDeploy resources or face consequences, my liege.")
        else:
            lines.append("\nAll objectives on track. Shadow Monarch's will be done.")

        return "\n".join(lines)

    def morning_plan(self) -> str:
        """What needs to happen today."""
        today = date.today().isoformat()
        with self._lock:
            actions = self._conn.execute(
                """SELECT da.title, kr.title as kr_title, g.title as g_title
                   FROM daily_actions da
                   JOIN key_results kr ON da.key_result_id = kr.id
                   JOIN goals g ON kr.goal_id = g.id
                   WHERE da.done=0 AND da.scheduled_date=? AND g.status='active'
                   ORDER BY g.priority DESC""",
                (today,)
            ).fetchall()

        if not actions:
            return f"No actions scheduled for today ({today})."
        lines = [f"📋 *Today's Mission ({today}):*"]
        for a in actions:
            lines.append(f"  • [{a['g_title']}] {a['title']}")
        return "\n".join(lines)

    def format_goals(self) -> str:
        """Compact goal list for agent context injection."""
        active = self.list_goals(status="active")
        if not active:
            return ""
        lines = []
        for g in active[:5]:
            dl = f" (due {g.deadline})" if g.deadline else ""
            lines.append(f"  [{g.score:.0%}] {g.title}{dl}")
        return "Active Goals:\n" + "\n".join(lines)


# ── Singleton ─────────────────────────────────────────────────────────────────

_service: Optional[GoalService] = None

def get_goal_service() -> GoalService:
    global _service
    if _service is None:
        _service = GoalService()
    return _service
