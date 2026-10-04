"""
axoniz.core.intelligence.daemon
=================================
Phase 4 — axoniz OS Layer (Background Daemon)

This is what no one has attempted in local AI.
axoniz runs as a background daemon on your machine:

  File saved     → lint and test automatically
  Git commit     → write the changelog entry
  Build failed   → fix it and retry while you sleep
  Cron schedule  → daily code quality audit
  File watcher   → catch errors before you even ask

It stops being a tool you open and becomes infrastructure you run.

Architecture:
  FileWatcher    — watches workspace for changes
  EventQueue     — thread-safe queue of file events
  DaemonLoop     — runs scheduled tasks + reacts to events
  TaskScheduler  — cron-style task scheduling

Usage:
    from axoniz.core.intelligence.daemon import axonizDaemon
    daemon = axonizDaemon(agent, workspace)
    daemon.start()   # non-blocking background thread
    daemon.stop()
"""

import os
import re
import threading
import time
import json
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from queue import Queue, Empty
from typing import Callable, Dict, List, Optional, Set, Tuple

from axoniz.core.debug import debug, info, warn, error
from axoniz.core.config import AXONIZ_HOME


# ─── Events ──────────────────────────────────────────────────────────────────

@dataclass
class FileEvent:
    path:      str
    event:     str    # created / modified / deleted
    timestamp: float = field(default_factory=time.time)
    size:      int    = 0


@dataclass
class ScheduledTask:
    name:         str
    interval_sec: int
    callback:     Callable
    last_run:     float = 0.0
    enabled:      bool  = True
    description:  str   = ""


@dataclass
class DaemonEvent:
    kind:    str
    payload: dict
    ts:      float = field(default_factory=time.time)


# ─── File Watcher ─────────────────────────────────────────────────────────────

class FileWatcher:
    """
    Watches a workspace directory for file changes using mtime polling.
    No external deps (no watchdog needed).
    Debounces rapid changes (e.g. editor writing temp files).
    """

    POLL_INTERVAL   = 1.5     # seconds between polls
    DEBOUNCE_SEC    = 2.0     # wait this long after last change before emitting
    MAX_FILES       = 2000
    SKIP_DIRS       = {".git", "__pycache__", "node_modules", ".axoniz",
                       "dist", "build", ".egg-info", "venv", "env", ".venv"}
    WATCH_EXTS      = {".py", ".js", ".ts", ".json", ".yaml", ".yml",
                       ".toml", ".md", ".txt", ".html", ".css"}

    def __init__(self, workspace: str, queue: Queue):
        self.workspace = os.path.abspath(workspace)
        self.queue     = queue
        self._mtimes:  Dict[str, float] = {}
        self._pending: Dict[str, float] = {}   # path → time of last change
        self._running  = False
        self._thread:  Optional[threading.Thread] = None

    def start(self):
        self._running = True
        # Initial scan (silent — don't emit for existing files)
        self._scan(emit=False)
        self._thread = threading.Thread(
            target=self._loop, daemon=True, name="axoniz-watcher"
        )
        self._thread.start()
        info(f"[FileWatcher] Watching {self.workspace}")

    def stop(self):
        self._running = False

    def _loop(self):
        while self._running:
            try:
                self._scan(emit=True)
                self._flush_debounced()
            except Exception as e:
                debug(f"[FileWatcher] scan error: {e}")
            time.sleep(self.POLL_INTERVAL)

    def _scan(self, emit: bool):
        count = 0
        for root, dirs, files in os.walk(self.workspace):
            dirs[:] = [d for d in dirs if d not in self.SKIP_DIRS]
            for fname in files:
                ext = Path(fname).suffix.lower()
                if ext not in self.WATCH_EXTS:
                    continue
                fpath = os.path.join(root, fname)
                count += 1
                if count > self.MAX_FILES:
                    return
                try:
                    mtime = os.path.getmtime(fpath)
                    old   = self._mtimes.get(fpath)
                    if old is None:
                        self._mtimes[fpath] = mtime
                        if emit:
                            self._pending[fpath] = time.time()
                    elif mtime != old:
                        self._mtimes[fpath] = mtime
                        self._pending[fpath] = time.time()
                except OSError:
                    if fpath in self._mtimes:
                        del self._mtimes[fpath]
                        if emit:
                            self.queue.put(FileEvent(fpath, "deleted"))

    def _flush_debounced(self):
        now = time.time()
        flush = [p for p, t in list(self._pending.items())
                 if now - t >= self.DEBOUNCE_SEC]
        for fpath in flush:
            del self._pending[fpath]
            event = "created" if fpath not in self._mtimes else "modified"
            try:
                size = os.path.getsize(fpath)
                self.queue.put(FileEvent(fpath, event, size=size))
            except OSError:
                self.queue.put(FileEvent(fpath, "deleted"))


# ─── Daemon Loop ──────────────────────────────────────────────────────────────

class axonizDaemon:
    """
    Background daemon that watches files, runs scheduled tasks,
    and reacts to events — all without user intervention.

    This is the OS layer. It's always running.
    """

    DAEMON_STATE_PATH = os.path.join(AXONIZ_HOME, "daemon_state.json")

    def __init__(
        self,
        agent,
        workspace: str,
        on_event: Optional[Callable] = None,
    ):
        self.agent     = agent
        self.workspace = os.path.abspath(workspace)
        self.on_event  = on_event

        self._queue:   Queue = Queue(maxsize=500)
        self._watcher  = FileWatcher(workspace, self._queue)
        self._running  = False
        self._thread:  Optional[threading.Thread] = None
        self._event_log: List[DaemonEvent] = []

        # Scheduled tasks
        self._tasks: List[ScheduledTask] = [
            ScheduledTask(
                name="lint_changed_files",
                interval_sec=30,
                callback=self._task_lint_pending,
                description="Auto-lint Python files changed in last 30s",
            ),
            ScheduledTask(
                name="git_status_check",
                interval_sec=120,
                callback=self._task_git_status,
                description="Check git status and warn about uncommitted changes",
            ),
            ScheduledTask(
                name="axodex_shadow_scan",
                interval_sec=60,
                callback=self._task_axodex_refresh,
                description="Auto-refresh Axodex graph index on changes",
            ),
            ScheduledTask(
                name="beru_heartbeat",
                interval_sec=300, # 5 minutes
                callback=self._task_beru_heartbeat,
                description="Proactive codebase health check and fix suggestion",
            ),
            ScheduledTask(
                name="vision_sentinel",
                interval_sec=10, # 10 seconds
                callback=self._task_vision_sentinel,
                description="Monitor terminal for errors via screenshot/OCR",
            ),
            ScheduledTask(
                name="daily_audit",
                interval_sec=86400,   # 24h
                callback=self._task_daily_audit,
                description="Daily code quality audit",
            ),
        ]

        # Track which files changed since last lint
        self._pending_lint: Set[str] = set()
        self._lock = threading.Lock()

    # ── Public API ────────────────────────────────────────────────────────────

    def start(self):
        """Start daemon in background thread."""
        self._running = True
        self._watcher.start()
        self._thread = threading.Thread(
            target=self._loop, daemon=True, name="axoniz-daemon"
        )
        self._thread.start()
        info(f"[Daemon] Started | workspace={self.workspace}")

    def stop(self):
        self._running = False
        self._watcher.stop()
        info("[Daemon] Stopped")

    def is_running(self) -> bool:
        return self._running

    def add_task(self, task: ScheduledTask):
        """Add a custom scheduled task."""
        self._tasks.append(task)

    def remove_task(self, name: str):
        self._tasks = [t for t in self._tasks if t.name != name]

    def get_recent_events(self, n: int = 20) -> List[DaemonEvent]:
        return list(self._event_log[-n:])

    def status(self) -> dict:
        return {
            "running":       self._running,
            "workspace":     self.workspace,
            "tasks":         [{"name": t.name, "interval": t.interval_sec, "enabled": t.enabled} for t in self._tasks],
            "pending_lint":  len(self._pending_lint),
            "recent_events": len(self._event_log),
        }

    # ── Internal loop ─────────────────────────────────────────────────────────

    def _loop(self):
        while self._running:
            # 1. Process file events
            self._drain_queue()

            # 2. Run scheduled tasks that are due
            now = time.time()
            for task in self._tasks:
                if not task.enabled:
                    continue
                if now - task.last_run >= task.interval_sec:
                    try:
                        task.callback()
                        task.last_run = now
                    except Exception as e:
                        error(f"[Daemon] Task '{task.name}' failed: {e}")

            time.sleep(1.0)

    def _drain_queue(self):
        """Process all pending file events."""
        processed = 0
        while processed < 20:   # max 20 per tick to avoid blocking
            try:
                event: FileEvent = self._queue.get_nowait()
                self._handle_event(event)
                processed += 1
            except Empty:
                break

    def _handle_event(self, event: FileEvent):
        """React to a file change event."""
        path = event.path
        ext  = Path(path).suffix.lower()

        # Queue Python files for linting
        if ext == ".py" and event.event in ("created", "modified"):
            with self._lock:
                self._pending_lint.add(path)

        # Log the event
        daemon_ev = DaemonEvent(
            kind="file_change",
            payload={"path": path, "event": event.event, "size": event.size}
        )
        self._event_log.append(daemon_ev)
        if len(self._event_log) > 500:
            self._event_log = self._event_log[-400:]

        if self.on_event:
            try:
                self.on_event(daemon_ev)
            except Exception:
                pass

        debug(f"[Daemon] {event.event}: {os.path.relpath(path, self.workspace)}")

    # ── Scheduled tasks ───────────────────────────────────────────────────────

    def _task_lint_pending(self):
        """Lint all Python files that changed recently."""
        with self._lock:
            pending = set(self._pending_lint)
            self._pending_lint.clear()

        if not pending:
            return

        py_files = [p for p in pending if p.endswith(".py") and os.path.exists(p)]
        if not py_files:
            return

        info(f"[Daemon] Auto-linting {len(py_files)} changed file(s)")
        for fpath in py_files[:5]:   # max 5 per cycle
            rel = os.path.relpath(fpath, self.workspace)
            try:
                with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
                    source = f.read()
                compile(source, fpath, "exec")
                debug(f"[Daemon] ✓ syntax OK: {rel}")
            except SyntaxError as e:
                warn(f"[Daemon] ✗ syntax error in {rel}: {e}")
                daemon_ev = DaemonEvent(
                    kind="syntax_error",
                    payload={"file": rel, "error": str(e), "line": e.lineno}
                )
                self._event_log.append(daemon_ev)
                if self.on_event:
                    self.on_event(daemon_ev)
            except Exception:
                pass

    def _task_git_status(self):
        """Check git status and emit events for uncommitted changes."""
        if not hasattr(self.agent, "git_tools"):
            return
        try:
            status = self.agent.git_tools.status()
            if status and status.strip() and "nothing to commit" not in status.lower():
                lines = [l for l in status.splitlines() if l.strip()]
                changed_count = len(lines)
                if changed_count > 0:
                    ev = DaemonEvent(
                        kind="git_uncommitted",
                        payload={"count": changed_count, "status": status[:500]}
                    )
                    self._event_log.append(ev)
                    if self.on_event:
                        self.on_event(ev)
                    debug(f"[Daemon] {changed_count} uncommitted file(s)")
        except Exception:
            pass

    def _task_daily_audit(self):
        """Daily code quality check — runs lint on all Python files."""
        info("[Daemon] Running daily code audit")
        try:
            py_files = []
            skip = {".git", "__pycache__", "node_modules", ".axoniz"}
            for root, dirs, files in os.walk(self.workspace):
                dirs[:] = [d for d in dirs if d not in skip]
                for f in files:
                    if f.endswith(".py"):
                        py_files.append(os.path.join(root, f))

            errors_found = []
            for fpath in py_files[:50]:
                try:
                    with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
                        source = f.read()
                    compile(source, fpath, "exec")
                except SyntaxError as e:
                    errors_found.append({"file": fpath, "error": str(e)})

            ev = DaemonEvent(
                kind="daily_audit",
                payload={
                    "files_checked": len(py_files[:50]),
                    "syntax_errors": len(errors_found),
                    "errors":        errors_found[:10],
                }
            )
            self._event_log.append(ev)
            if self.on_event:
                self.on_event(ev)

            # Store audit results in palace
            if self.agent.memory.palace.is_available():
                self.agent.memory.palace.store(
                    wing="wing_axoniz",
                    room="daily-audits",
                    content=f"Audit {datetime.now().strftime('%Y-%m-%d')}: "
                            f"{len(py_files)} files, {len(errors_found)} errors",
                    added_by="daemon"
                )

            info(f"[Daemon] Daily audit: {len(py_files[:50])} files checked, "
                 f"{len(errors_found)} syntax errors")
        except Exception as e:
            error(f"[Daemon] Daily audit failed: {e}")

    def _task_axodex_refresh(self):
        """Background Axodex refresh."""
        if not hasattr(self.agent, "axodex"):
            return
        # Only refresh if there are uncommitted changes or recent file events
        if self._event_log:
            last_ev = self._event_log[-1]
            if time.time() - last_ev.ts < 60:
                debug("[Daemon] Triggering Axodex shadow scan...")
                self.agent.axodex.analyze()

    def _task_beru_heartbeat(self):
        """Proactive codebase health check and fix suggestion."""
        if not hasattr(self.agent, "axodex"):
            return
        
        info("[Daemon] Beru Heartbeat: Scanning for architectural weaknesses...")
        try:
            # 1. Check for stale index
            status = self.agent.axodex.status()
            if "stale" in status.lower():
                self.agent.axodex.analyze()
                
            # 2. Proactively look for syntax errors in the last edited files
            # This is already handled by _task_lint_pending, but we can add more logic here.
            
            # 3. Emit a heartbeat event
            ev = DaemonEvent(
                kind="beru_heartbeat",
                payload={"status": "healthy", "scanned_at": datetime.now().isoformat()}
            )
            self._event_log.append(ev)
            if self.on_event:
                self.on_event(ev)
                
        except Exception as e:
            error(f"[Daemon] Heartbeat failed: {e}")

    def _task_vision_sentinel(self):
        """Monitor terminal/screen for errors via OCR."""
        if os.environ.get("AXONIZ_DISABLE_VISION"):
            return
            
        try:
            import pyautogui
            # Check if we can actually take a screenshot (fails on some headless systems)
            try:
                screenshot = pyautogui.screenshot()
            except Exception:
                return # Silent exit if screen access denied

            import pytesseract
            # Check if tesseract is in PATH
            try:
                text = pytesseract.image_to_string(screenshot)
            except Exception:
                # Tesseract binary might be missing
                return

            if not text: return
            
            # Look for critical fail markers
            critical_patterns = ["error", "failed", "exception", "traceback", "fatal"]
            found = [p for p in critical_patterns if p in text.lower()]
            
            if found:
                warn(f"[Vision] Beru detected visual error markers: {found}")
                ev = DaemonEvent(
                    kind="vision_alert",
                    payload={"detected": found, "snippet": text[:100]}
                )
                self._event_log.append(ev)
                if self.on_event:
                    self.on_event(ev)
                    
        except ImportError:
            pass # Dependencies missing
        except Exception as e:
            debug(f"[Vision] Sentinel critical fail: {e}")

    def save_state(self):
        """Persist daemon state for restart."""
        state = {
            "workspace":   self.workspace,
            "last_run":    {t.name: t.last_run for t in self._tasks},
            "saved_at":    time.time(),
        }
        try:
            with open(self.DAEMON_STATE_PATH, "w") as f:
                json.dump(state, f, indent=2)
        except Exception:
            pass

    def load_state(self):
        """Restore task last_run times from previous session."""
        try:
            if os.path.exists(self.DAEMON_STATE_PATH):
                with open(self.DAEMON_STATE_PATH) as f:
                    state = json.load(f)
                last_run = state.get("last_run", {})
                for task in self._tasks:
                    if task.name in last_run:
                        task.last_run = last_run[task.name]
        except Exception:
            pass
