"""
AXONIZ-ZERO Comprehensive Logger
Logs every detail of system operation to files and console.

Features:
  - Session-scoped log files (one per session)
  - Structured JSON logs for programmatic analysis
  - Human-readable logs for debugging
  - Captures: agent steps, tool calls, backend interactions, memory ops, errors
  - Configurable via ~/.axoniz/config.json under "logging"
"""

import os
import sys
import json
import logging
import logging.handlers
import traceback
import threading
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Callable
from contextlib import contextmanager
from functools import wraps

from axoniz.core.config import AXONIZ_HOME


# ── Configuration ──────────────────────────────────────────────────────────────

LOG_DIR       = os.path.join(AXONIZ_HOME, "logs")
SESSION_DIR   = os.path.join(LOG_DIR, "sessions")
STRUCTURED_DIR = os.path.join(LOG_DIR, "structured")

os.makedirs(LOG_DIR, exist_ok=True)
os.makedirs(SESSION_DIR, exist_ok=True)
os.makedirs(STRUCTURED_DIR, exist_ok=True)


class LogConfig:
    """Runtime logging configuration."""
    level: str = "INFO"
    console: bool = True
    file: bool = True
    structured: bool = True  # JSON logs
    max_bytes: int = 10 * 1024 * 1024  # 10 MB
    backup_count: int = 10
    capture_llm_prompts: bool = False  # Off by default — can be huge
    capture_tool_args: bool = True
    capture_tool_results: bool = True
    capture_backend_health: bool = True
    session_id: str = ""

    @classmethod
    def from_config(cls, cfg: dict) -> "LogConfig":
        lc = cfg.get("logging", {})
        inst = cls()
        inst.level = lc.get("level", "INFO")
        inst.console = lc.get("console", True)
        inst.file = lc.get("file", True)
        inst.structured = lc.get("structured", True)
        inst.max_bytes = lc.get("max_bytes", 10 * 1024 * 1024)
        inst.backup_count = lc.get("backup_count", 10)
        inst.capture_llm_prompts = lc.get("capture_llm_prompts", False)
        inst.capture_tool_args = lc.get("capture_tool_args", True)
        inst.capture_tool_results = lc.get("capture_tool_results", True)
        inst.capture_backend_health = lc.get("capture_backend_health", True)
        return inst


# ── Session tracking ───────────────────────────────────────────────────────────

_session_counter = 0
_session_lock = threading.Lock()

def _new_session_id() -> str:
    global _session_counter
    with _session_lock:
        _session_counter += 1
        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        return f"{ts}_{_session_counter:04d}"


# ── Formatters ─────────────────────────────────────────────────────────────────

class _ConsoleFormatter(logging.Formatter):
    """Colored console output."""
    COLORS = {
        "DEBUG":    "\033[36m",   # cyan
        "INFO":     "\033[90m",   # gray
        "WARNING":  "\033[93m",   # yellow
        "ERROR":    "\033[91m",   # red
        "CRITICAL": "\033[95m",   # magenta
    }
    RESET = "\033[0m"
    GRAY  = "\033[38;5;240m"
    DIM   = "\033[2m"

    def format(self, record: logging.LogRecord) -> str:
        color = self.COLORS.get(record.levelname, "")
        ts = datetime.fromtimestamp(record.created).strftime("%H:%M:%S.%f")[:-3]
        lvl = f"{color}{record.levelname:<5}{self.RESET}"
        src = f"{self.GRAY}[{record.name}]{self.RESET} " if record.name != "axoniz" else ""
        return f"  {self.GRAY}{ts}{self.RESET}  {lvl}  {src}{record.getMessage()}"


class _FileFormatter(logging.Formatter):
    """Plain file output with full context."""
    def format(self, record: logging.LogRecord) -> str:
        ts = datetime.fromtimestamp(record.created).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3]
        return f"{ts} {record.levelname:<8} [{record.name}:{record.module}:{record.lineno}] {record.getMessage()}"


# ── Structured JSON logger ─────────────────────────────────────────────────────

class StructuredLogger:
    """Writes JSON events to a dedicated structured log file."""

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.path = os.path.join(STRUCTURED_DIR, f"{session_id}.jsonl")
        self._lock = threading.Lock()
        self._file = None
        self._open()

    def _open(self):
        try:
            self._file = open(self.path, "a", encoding="utf-8", buffering=1)
        except Exception as e:
            sys.stderr.write(f"[Logger] Failed to open structured log: {e}\n")

    def _close(self):
        if self._file:
            self._file.close()
            self._file = None

    def emit(self, event_type: str, data: Dict[str, Any]):
        if not self._file:
            return
        entry = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "session": self.session_id,
            "type": event_type,
            "data": data,
        }
        try:
            with self._lock:
                self._file.write(json.dumps(entry, default=_json_default, ensure_ascii=False) + "\n")
                self._file.flush()
        except Exception:
            pass

    def __del__(self):
        self._close()


def _json_default(obj: Any) -> Any:
    """JSON serializer for non-standard types."""
    if hasattr(obj, "isoformat"):
        return obj.isoformat()
    if hasattr(obj, "__dict__"):
        return {k: v for k, v in obj.__dict__.items() if not k.startswith("_")}
    return str(obj)


# ── Main Logger ────────────────────────────────────────────────────────────────

class AxonizLogger:
    """
    Central logging hub for AXONIZ-ZERO.
    Creates one logger per session with console, file, and structured outputs.
    """

    _instance: Optional["AxonizLogger"] = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self, config: Optional[LogConfig] = None):
        if self._initialized:
            return
        self._initialized = True

        self.config = config or LogConfig()
        self.session_id = self.config.session_id or _new_session_id()
        self.started_at = datetime.now(timezone.utc)

        # Build loggers
        self._logger = logging.getLogger("axoniz")
        self._logger.handlers.clear()
        self._logger.setLevel(logging.DEBUG)
        self._logger.propagate = False

        # Console handler
        if self.config.console and sys.stderr:
            ch = logging.StreamHandler(sys.stderr)
            ch.setLevel(getattr(logging, self.config.level.upper(), logging.INFO))
            ch.setFormatter(_ConsoleFormatter())
            self._logger.addHandler(ch)

        # Main rotating file handler
        if self.config.file:
            main_log = os.path.join(LOG_DIR, "axoniz.log")
            try:
                fh = logging.handlers.RotatingFileHandler(
                    main_log,
                    maxBytes=self.config.max_bytes,
                    backupCount=self.config.backup_count,
                    encoding="utf-8",
                )
                fh.setLevel(logging.DEBUG)
                fh.setFormatter(_FileFormatter())
                self._logger.addHandler(fh)
            except Exception as e:
                self._logger.warning(f"Could not open main log file: {e}")

            # Session file handler
            session_log = os.path.join(SESSION_DIR, f"{self.session_id}.log")
            try:
                sh = logging.FileHandler(session_log, encoding="utf-8")
                sh.setLevel(logging.DEBUG)
                sh.setFormatter(_FileFormatter())
                self._logger.addHandler(sh)
            except Exception as e:
                self._logger.warning(f"Could not open session log file: {e}")

        # Structured JSON logger
        self._structured = StructuredLogger(self.session_id) if self.config.structured else None

        # Sub-loggers for specific domains
        self.agent = logging.getLogger("axoniz.agent")
        self.backend = logging.getLogger("axoniz.backend")
        self.tools = logging.getLogger("axoniz.tools")
        self.memory = logging.getLogger("axoniz.memory")
        self.swarm = logging.getLogger("axoniz.swarm")
        self.loop = logging.getLogger("axoniz.loop")
        self.config_logger = logging.getLogger("axoniz.config")
        self.web = logging.getLogger("axoniz.web")
        self.voice = logging.getLogger("axoniz.voice")
        self.awareness = logging.getLogger("axoniz.awareness")

        for sub in [self.agent, self.backend, self.tools, self.memory,
                    self.swarm, self.loop, self.config_logger, self.web,
                    self.voice, self.awareness]:
            sub.setLevel(logging.DEBUG)
            sub.propagate = True  # bubble up to main logger

        self._log_session_start()

    def _log_session_start(self):
        self.info("=" * 60)
        self.info(f"AXONIZ-ZERO Session Started")
        self.info(f"  Session ID : {self.session_id}")
        self.info(f"  Started at : {self.started_at.isoformat()}")
        self.info(f"  Log level  : {self.config.level}")
        self.info(f"  Console    : {self.config.console}")
        self.info(f"  File log   : {self.config.file}")
        self.info(f"  Structured : {self.config.structured}")
        self.info("=" * 60)
        self._structured_emit("session_start", {
            "session_id": self.session_id,
            "started_at": self.started_at.isoformat(),
            "config": self.config.__dict__,
        })

    def _structured_emit(self, event_type: str, data: Dict[str, Any]):
        if self._structured:
            self._structured.emit(event_type, data)

    # ── Core logging API ───────────────────────────────────────────────────────

    def debug(self, msg: str, domain: str = "axoniz"):
        logging.getLogger(domain).debug(msg)

    def info(self, msg: str, domain: str = "axoniz"):
        logging.getLogger(domain).info(msg)

    def warning(self, msg: str, domain: str = "axoniz"):
        logging.getLogger(domain).warning(msg)

    def error(self, msg: str, domain: str = "axoniz"):
        logging.getLogger(domain).error(msg)

    def critical(self, msg: str, domain: str = "axoniz"):
        logging.getLogger(domain).critical(msg)

    # ── Structured event logging ───────────────────────────────────────────────

    def log_event(self, event_type: str, data: Dict[str, Any]):
        """Log a structured event to JSON and human-readable logs."""
        self._structured_emit(event_type, data)
        # Also log a summary to the main logger
        summary = f"[{event_type}] {json.dumps(data, default=_json_default, ensure_ascii=False)[:200]}"
        self.debug(summary)

    # ── Agent lifecycle ───────────────────────────────────────────────────────

    def log_agent_init(self, config: Dict[str, Any]):
        safe_cfg = {k: v for k, v in config.items() if k not in ("api_key", "token", "password")}
        self.info(f"Agent initialized | config={safe_cfg}", domain="axoniz.agent")
        self.log_event("agent_init", {"config": safe_cfg})

    def log_agent_run(self, task: str, mode: str = "agent"):
        self.info(f"Agent run | mode={mode} | task={task[:200]}", domain="axoniz.agent")
        self.log_event("agent_run", {"mode": mode, "task": task[:2000]})

    def log_agent_step(self, step: int, total: int, thought_preview: str = ""):
        self.debug(f"Step {step}/{total} | thought={thought_preview[:100]}", domain="axoniz.agent")
        self.log_event("agent_step", {"step": step, "total": total, "thought_preview": thought_preview[:500]})

    def log_agent_done(self, result_preview: str = "", steps_taken: int = 0, tokens_out: int = 0):
        self.info(f"Agent done | steps={steps_taken} | tokens={tokens_out}", domain="axoniz.agent")
        self.log_event("agent_done", {
            "result_preview": result_preview[:500],
            "steps_taken": steps_taken,
            "tokens_out": tokens_out,
        })

    def log_agent_error(self, exc: Exception, context: str = ""):
        tb = traceback.format_exc()
        self.error(f"Agent error | context={context} | {exc}\n{tb}", domain="axoniz.agent")
        self.log_event("agent_error", {
            "context": context,
            "error": str(exc),
            "traceback": tb,
        })

    def log_agent_chat(self, message: str, response_preview: str = ""):
        self.info(f"Chat | msg={message[:200]}", domain="axoniz.agent")
        self.log_event("agent_chat", {
            "message": message[:2000],
            "response_preview": response_preview[:500],
        })

    # ── Backend interactions ────────────────────────────────────────────────────

    def log_backend_health(self, backend: str, result: Dict[str, Any]):
        if not self.config.capture_backend_health:
            return
        status = result.get("status", "unknown")
        self.info(f"Backend health | {backend} | {status}", domain="axoniz.backend")
        self.log_event("backend_health", {"backend": backend, "result": result})

    def log_backend_complete(self, backend: str, model: str, prompt_tokens: int, output_tokens: int, duration_ms: int, error: Optional[str] = None):
        if error:
            self.error(f"Backend complete failed | {backend} | {model} | {error}", domain="axoniz.backend")
            self.log_event("backend_complete_error", {"backend": backend, "model": model, "error": error})
        else:
            self.debug(f"Backend complete | {backend} | {model} | {prompt_tokens} → {output_tokens} tok | {duration_ms}ms", domain="axoniz.backend")
            self.log_event("backend_complete", {
                "backend": backend, "model": model,
                "prompt_tokens": prompt_tokens, "output_tokens": output_tokens,
                "duration_ms": duration_ms,
            })

    def log_backend_load(self, backend: str, model: str, result: str):
        self.info(f"Backend load | {backend} | {model} | {result}", domain="axoniz.backend")
        self.log_event("backend_load", {"backend": backend, "model": model, "result": result})

    # ── Tool execution ─────────────────────────────────────────────────────────

    def log_tool_call(self, name: str, args: Dict[str, Any], step: int = 0):
        if not self.config.capture_tool_args:
            return
        # Sanitize sensitive args
        safe_args = {k: v for k, v in args.items() if k not in ("api_key", "token", "password", "secret")}
        self.info(f"Tool call | {name} | step={step} | args={safe_args}", domain="axoniz.tools")
        self.log_event("tool_call", {"name": name, "args": safe_args, "step": step})

    def log_tool_result(self, name: str, result: Any, duration_ms: int = 0, error: Optional[str] = None):
        if not self.config.capture_tool_results:
            return
        preview = str(result)[:500] if result else ""
        if error:
            self.error(f"Tool error | {name} | {error}", domain="axoniz.tools")
            self.log_event("tool_error", {"name": name, "error": error, "duration_ms": duration_ms})
        else:
            self.debug(f"Tool result | {name} | {preview[:100]}... | {duration_ms}ms", domain="axoniz.tools")
            self.log_event("tool_result", {"name": name, "result_preview": preview, "duration_ms": duration_ms})

    # ── Memory operations ───────────────────────────────────────────────────────

    def log_memory_query(self, query: str, results_count: int, domain: str = "axoniz.memory"):
        self.debug(f"Memory query | {query[:100]} | {results_count} results", domain=domain)
        self.log_event("memory_query", {"query": query[:500], "results_count": results_count})

    def log_memory_store(self, key: str, size: int, domain: str = "axoniz.memory"):
        self.debug(f"Memory store | {key} | {size} bytes", domain=domain)
        self.log_event("memory_store", {"key": key, "size": size})

    # ── Swarm / Loop ───────────────────────────────────────────────────────────

    def log_swarm_run(self, task: str, workers: int, sub_tasks: int):
        self.info(f"Swarm run | {sub_tasks} sub-tasks | {workers} workers", domain="axoniz.swarm")
        self.log_event("swarm_run", {"task": task[:500], "workers": workers, "sub_tasks": sub_tasks})

    def log_swarm_worker_done(self, worker_id: int, task_id: int, status: str, duration_ms: int, score: float = 0.0):
        self.debug(f"Swarm worker {worker_id} done | task={task_id} | {status} | {duration_ms}ms | score={score}", domain="axoniz.swarm")
        self.log_event("swarm_worker_done", {
            "worker_id": worker_id, "task_id": task_id,
            "status": status, "duration_ms": duration_ms, "score": score,
        })

    def log_loop_cycle(self, cycle: int, max_cycles: int, tasks_completed: int, tasks_failed: int):
        self.info(f"Loop cycle {cycle}/{max_cycles} | done={tasks_completed} | failed={tasks_failed}", domain="axoniz.loop")
        self.log_event("loop_cycle", {
            "cycle": cycle, "max_cycles": max_cycles,
            "tasks_completed": tasks_completed, "tasks_failed": tasks_failed,
        })

    # ── Config changes ─────────────────────────────────────────────────────────

    def log_config_change(self, key: str, old_val: Any, new_val: Any):
        self.info(f"Config change | {key}: {old_val} → {new_val}", domain="axoniz.config")
        self.log_event("config_change", {"key": key, "old": str(old_val), "new": str(new_val)})

    # ── Session end ─────────────────────────────────────────────────────────────

    def log_session_end(self, reason: str = "normal"):
        elapsed = (datetime.now(timezone.utc) - self.started_at).total_seconds()
        self.info("=" * 60)
        self.info(f"Session Ended | {self.session_id} | reason={reason} | elapsed={elapsed:.1f}s")
        self.info("=" * 60)
        self.log_event("session_end", {
            "session_id": self.session_id,
            "reason": reason,
            "elapsed_seconds": elapsed,
        })
        if self._structured:
            self._structured._close()
            self._structured = None

    # ── Utility ─────────────────────────────────────────────────────────────────

    def get_session_log_path(self) -> str:
        return os.path.join(SESSION_DIR, f"{self.session_id}.log")

    def get_structured_log_path(self) -> str:
        return os.path.join(STRUCTURED_DIR, f"{self.session_id}.jsonl")

    def get_recent_sessions(self, n: int = 10) -> List[Dict[str, str]]:
        """Return info about recent session log files."""
        try:
            files = sorted(
                [f for f in os.listdir(SESSION_DIR) if f.endswith(".log")],
                reverse=True,
            )
        except Exception:
            return []
        sessions = []
        for f in files[:n]:
            path = os.path.join(SESSION_DIR, f)
            try:
                stat = os.stat(path)
                sessions.append({
                    "session_id": f[:-4],
                    "size_kb": f"{stat.st_size / 1024:.1f}",
                    "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    "path": path,
                })
            except Exception:
                pass
        return sessions

    @contextmanager
    def timed(self, label: str, domain: str = "axoniz"):
        """Context manager for timing operations."""
        t0 = datetime.now(timezone.utc)
        self.debug(f"{label} started", domain=domain)
        try:
            yield
        except Exception as e:
            elapsed = (datetime.now(timezone.utc) - t0).total_seconds() * 1000
            self.error(f"{label} failed after {elapsed:.0f}ms | {e}", domain=domain)
            raise
        finally:
            elapsed = (datetime.now(timezone.utc) - t0).total_seconds() * 1000
            self.debug(f"{label} completed in {elapsed:.0f}ms", domain=domain)


# ── Global instance ─────────────────────────────────────────────────────────────

_logger_instance: Optional[AxonizLogger] = None

def get_logger(config: Optional[LogConfig] = None) -> AxonizLogger:
    """Get or create the global logger instance."""
    global _logger_instance
    if _logger_instance is None:
        _logger_instance = AxonizLogger(config)
    return _logger_instance


def init_logger(config: Optional[LogConfig] = None) -> AxonizLogger:
    """Explicitly initialize the logger (call once at startup)."""
    global _logger_instance
    _logger_instance = AxonizLogger(config)
    return _logger_instance


# ── Convenience wrappers (backward-compatible with debug.py) ──────────────────

def debug(msg: str, domain: str = "axoniz"):
    get_logger().debug(msg, domain)

def info(msg: str, domain: str = "axoniz"):
    get_logger().info(msg, domain)

def warn(msg: str, domain: str = "axoniz"):
    get_logger().warning(msg, domain)

def error(msg: str, domain: str = "axoniz"):
    get_logger().error(msg, domain)

def critical(msg: str, domain: str = "axoniz"):
    get_logger().critical(msg, domain)


def log_json(data: Any, label: str = "JSON"):
    try:
        formatted = json.dumps(data, indent=2, default=_json_default)
        get_logger().debug(f"{label}:\n{formatted}")
    except Exception:
        get_logger().debug(f"{label}: {data}")


def set_level(level: str):
    """Dynamically change log level."""
    lvl = getattr(logging, level.upper(), logging.INFO)
    logger = get_logger()._logger
    for h in logger.handlers:
        if isinstance(h, logging.StreamHandler) and not isinstance(h, logging.FileHandler):
            h.setLevel(lvl)
    get_logger().info(f"Log level set to {level.upper()}")


def robust_handle(e: Exception, context: str = ""):
    """Catch-all error handler with logging."""
    msg = f"[CRITICAL] {context}: {e}" if context else f"[CRITICAL] {e}"
    get_logger().error(msg)
    err_str = str(e).lower()
    if "10061" in err_str or "refused" in err_str:
        print("  [FIX] Backend connection refused. Is LM Studio/Ollama running?")
    elif "transformers" in err_str or "av._core" in err_str:
        print("  [FIX] Voice model dependency error. Run 'pip install av --only-binary :all:'")
    elif "404" in err_str:
        print("  [FIX] Check your endpoint URL in settings.")
    if os.environ.get("AXONIZ_DEBUG", "").lower() in ("1", "true", "yes"):
        traceback.print_exc()


# ── Decorators for automatic logging ───────────────────────────────────────────

def log_calls(level: str = "info", domain: str = "axoniz"):
    """Decorator to log function entry/exit with timing."""
    def decorator(func: Callable):
        @wraps(func)
        def wrapper(*args, **kwargs):
            logger = get_logger()
            log_fn = getattr(logger, level, logger.info)
            log_fn(f"→ {func.__qualname__} | args={len(args)} kwargs={list(kwargs.keys())}", domain=domain)
            t0 = datetime.now(timezone.utc)
            try:
                result = func(*args, **kwargs)
                elapsed = (datetime.now(timezone.utc) - t0).total_seconds() * 1000
                log_fn(f"← {func.__qualname__} | ok | {elapsed:.0f}ms", domain=domain)
                return result
            except Exception as e:
                elapsed = (datetime.now(timezone.utc) - t0).total_seconds() * 1000
                logger.error(f"← {func.__qualname__} | FAILED | {elapsed:.0f}ms | {e}", domain=domain)
                raise
        return wrapper
    return decorator
