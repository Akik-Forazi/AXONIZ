"""
axoniz.core.intelligence.trajectory
=====================================
Trajectory Memory — Phase 1 of the AXONIZ dominance plan.

Every tool call the agent makes — with its arguments, result, and outcome —
is recorded as a trajectory entry. Over time this becomes the agent's
experiential memory: it knows what worked, what failed, and why.

Unlike conversation history (which is prompt text), trajectory is structured
behavioral data that the agent and planner can query programmatically.

Storage: SQLite at ~/.axoniz/trajectory.db
WAL mode — safe for concurrent reads while agent is writing.

Key capabilities:
  - Record every tool call (name, args, result, success, duration)
  - Tag entries by task/session
  - Query: "what happened last time I ran shell_python on this file?"
  - Pattern detection: which tools fail most? which file paths cause loops?
  - Export as context block for injection into agent's system prompt
"""

import json
import os
import sqlite3
import threading
import time
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from axoniz.core.config import AXONIZ_HOME

TRAJECTORY_DB = os.path.join(AXONIZ_HOME, "trajectory.db")


# ─── Schema ───────────────────────────────────────────────────────────────────

_SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    task        TEXT,
    workspace   TEXT,
    started_at  REAL NOT NULL,
    ended_at    REAL,
    outcome     TEXT,
    total_steps INTEGER DEFAULT 0,
    total_tools INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS steps (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  TEXT NOT NULL REFERENCES sessions(id),
    step_num    INTEGER NOT NULL,
    tool_name   TEXT NOT NULL,
    args_json   TEXT,
    result_head TEXT,
    success     INTEGER DEFAULT 1,
    duration_ms INTEGER,
    ts          REAL NOT NULL,
    notes       TEXT
);

CREATE INDEX IF NOT EXISTS idx_steps_session  ON steps(session_id);
CREATE INDEX IF NOT EXISTS idx_steps_tool     ON steps(tool_name);
CREATE INDEX IF NOT EXISTS idx_steps_ts       ON steps(ts);
"""


# ─── TrajectoryStore ──────────────────────────────────────────────────────────

class TrajectoryStore:
    """
    Persistent behavioral memory for the agent.
    Thread-safe; writes are serialized with a lock.
    """

    def __init__(self, db_path: str = TRAJECTORY_DB):
        self.db_path = db_path
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(db_path, check_same_thread=False, timeout=5.0)
        self._conn.row_factory = sqlite3.Row
        self._init()

    def _init(self):
        with self._lock:
            self._conn.executescript(_SCHEMA)
            self._conn.commit()

    # ── Session ───────────────────────────────────────────────────────────────

    def begin_session(self, task: str, workspace: str = "") -> str:
        """Create a new trajectory session. Returns session_id."""
        sid = f"traj_{int(time.time() * 1000)}"
        with self._lock:
            self._conn.execute(
                "INSERT INTO sessions(id,task,workspace,started_at) VALUES(?,?,?,?)",
                (sid, task[:500], workspace, time.time())
            )
            self._conn.commit()
        return sid

    def end_session(self, session_id: str, outcome: str = ""):
        with self._lock:
            self._conn.execute(
                "UPDATE sessions SET ended_at=?, outcome=? WHERE id=?",
                (time.time(), outcome[:500], session_id)
            )
            self._conn.commit()

    # ── Steps ─────────────────────────────────────────────────────────────────

    def record_step(
        self,
        session_id: str,
        step_num:   int,
        tool_name:  str,
        args:       dict,
        result:     str,
        success:    bool   = True,
        duration_ms: int   = 0,
        notes:      str    = "",
    ):
        """Record a single tool call."""
        args_json   = json.dumps(args, ensure_ascii=False, default=str)[:2000]
        result_head = result[:500] if result else ""
        with self._lock:
            self._conn.execute(
                """INSERT INTO steps
                   (session_id,step_num,tool_name,args_json,result_head,success,duration_ms,ts,notes)
                   VALUES(?,?,?,?,?,?,?,?,?)""",
                (session_id, step_num, tool_name, args_json,
                 result_head, int(success), duration_ms, time.time(), notes[:300])
            )
            self._conn.execute(
                "UPDATE sessions SET total_steps=total_steps+1, total_tools=total_tools+1 WHERE id=?",
                (session_id,)
            )
            self._conn.commit()

    # ── Queries ───────────────────────────────────────────────────────────────

    def get_session_steps(self, session_id: str) -> List[Dict]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM steps WHERE session_id=? ORDER BY step_num",
                (session_id,)
            ).fetchall()
        return [dict(r) for r in rows]

    def recent_failures(self, tool_name: str = None, limit: int = 10) -> List[Dict]:
        """Return recent failed steps, optionally filtered by tool."""
        with self._lock:
            if tool_name:
                rows = self._conn.execute(
                    "SELECT * FROM steps WHERE success=0 AND tool_name=? ORDER BY ts DESC LIMIT ?",
                    (tool_name, limit)
                ).fetchall()
            else:
                rows = self._conn.execute(
                    "SELECT * FROM steps WHERE success=0 ORDER BY ts DESC LIMIT ?",
                    (limit,)
                ).fetchall()
        return [dict(r) for r in rows]

    def tool_stats(self) -> List[Dict]:
        """Per-tool success/failure counts."""
        with self._lock:
            rows = self._conn.execute(
                """SELECT tool_name,
                          COUNT(*) as total,
                          SUM(success) as successes,
                          COUNT(*)-SUM(success) as failures,
                          AVG(duration_ms) as avg_ms
                   FROM steps GROUP BY tool_name ORDER BY total DESC"""
            ).fetchall()
        return [dict(r) for r in rows]

    def repeated_args(self, session_id: str, threshold: int = 3) -> List[Dict]:
        """Detect tool+args combinations called 3+ times in one session (loop detection)."""
        with self._lock:
            rows = self._conn.execute(
                """SELECT tool_name, args_json, COUNT(*) as cnt
                   FROM steps WHERE session_id=?
                   GROUP BY tool_name, args_json
                   HAVING cnt >= ?""",
                (session_id, threshold)
            ).fetchall()
        return [dict(r) for r in rows]

    def similar_tasks(self, query: str, limit: int = 5) -> List[Dict]:
        """Find past sessions with similar task descriptions (simple keyword match)."""
        words = [w for w in query.lower().split() if len(w) > 3][:5]
        if not words:
            return []
        like_clauses = " OR ".join("LOWER(task) LIKE ?" for _ in words)
        params = [f"%{w}%" for w in words] + [limit]
        with self._lock:
            rows = self._conn.execute(
                f"SELECT * FROM sessions WHERE {like_clauses} ORDER BY started_at DESC LIMIT ?",
                params
            ).fetchall()
        return [dict(r) for r in rows]

    def context_block(self, session_id: str = None, max_chars: int = 600) -> str:
        """
        Build a compact context block for injection into the agent's prompt.
        Shows: tool stats, recent failures, any detected loops.
        """
        lines = []

        # Tool stats (top 5 most used)
        stats = self.tool_stats()
        if stats:
            lines.append("[TRAJECTORY — tool usage this project]")
            for s in stats[:5]:
                fail_pct = int(100 * s["failures"] / max(s["total"], 1))
                lines.append(
                    f"  {s['tool_name']}: {s['total']} calls, {fail_pct}% fail"
                    + (f", avg {int(s['avg_ms'])}ms" if s["avg_ms"] else "")
                )

        # Session-level loop detection
        if session_id:
            loops = self.repeated_args(session_id, threshold=3)
            if loops:
                lines.append("[WARNING — potential loops detected in this session]")
                for lp in loops[:3]:
                    lines.append(f"  {lp['tool_name']} called {lp['cnt']}x with same args")

        result = "\n".join(lines)
        return result[:max_chars] if result else ""

    def export_session(self, session_id: str) -> Dict:
        """Export full session as a dict (for palace storage)."""
        with self._lock:
            sess = self._conn.execute(
                "SELECT * FROM sessions WHERE id=?", (session_id,)
            ).fetchone()
        if not sess:
            return {}
        steps = self.get_session_steps(session_id)
        return {**dict(sess), "steps": steps}


# ─── Module-level singleton ────────────────────────────────────────────────────

_store: Optional[TrajectoryStore] = None


def get_store() -> TrajectoryStore:
    global _store
    if _store is None:
        _store = TrajectoryStore()
    return _store
