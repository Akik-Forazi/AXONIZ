"""
axoniz/awareness/service.py
============================
BERU Awareness Service — proactive environment monitoring.

Inspired by Jarvis src/awareness/ — Python reimplementation.

Monitors:
  - Screen content via screenshot + OCR (tesseract / pytesseract)
  - Clipboard changes
  - Active window title
  - System load (CPU/RAM/disk)
  - Proactively suggests relevant actions based on context

BERU wakes up and says: "I see you're looking at X — want me to Y?"
"""

import json
import logging
import os
import platform
import threading
import time
from typing import Callable, Dict, List, Optional

from axoniz.core.debug import info, warn, debug

logger = logging.getLogger("axoniz.awareness")


# ── System metrics ────────────────────────────────────────────────────────────

def get_system_metrics() -> dict:
    """Returns CPU, RAM, disk usage. Zero-dep fallback if psutil missing."""
    metrics = {
        "cpu_percent": 0.0,
        "ram_percent": 0.0,
        "disk_percent": 0.0,
        "platform": platform.system(),
    }
    try:
        import psutil
        metrics["cpu_percent"]  = psutil.cpu_percent(interval=0.1)
        metrics["ram_percent"]  = psutil.virtual_memory().percent
        metrics["disk_percent"] = psutil.disk_usage("/").percent
    except ImportError:
        pass
    return metrics


def get_active_window_title() -> str:
    """Best-effort active window title."""
    try:
        if platform.system() == "Windows":
            import ctypes
            hwnd = ctypes.windll.user32.GetForegroundWindow()
            length = ctypes.windll.user32.GetWindowTextLengthW(hwnd)
            buf = ctypes.create_unicode_buffer(length + 1)
            ctypes.windll.user32.GetWindowTextW(hwnd, buf, length + 1)
            return buf.value
        elif platform.system() == "Darwin":
            import subprocess
            r = subprocess.run(
                ["osascript", "-e", 'tell application "System Events" to get name of first process whose frontmost is true'],
                capture_output=True, text=True, timeout=2
            )
            return r.stdout.strip()
        else:
            # Linux — try xdotool
            import subprocess
            r = subprocess.run(["xdotool", "getactivewindow", "getwindowname"],
                               capture_output=True, text=True, timeout=2)
            return r.stdout.strip()
    except Exception:
        return ""


def get_clipboard() -> str:
    """Get clipboard content."""
    try:
        import subprocess
        if platform.system() == "Windows":
            import win32clipboard
            win32clipboard.OpenClipboard()
            data = win32clipboard.GetClipboardData()
            win32clipboard.CloseClipboard()
            return str(data)[:500]
        elif platform.system() == "Darwin":
            r = subprocess.run(["pbpaste"], capture_output=True, text=True, timeout=2)
            return r.stdout[:500]
        else:
            r = subprocess.run(["xclip", "-selection", "clipboard", "-o"],
                               capture_output=True, text=True, timeout=2)
            return r.stdout[:500]
    except Exception:
        return ""


def take_screenshot_ocr() -> str:
    """Take screenshot and OCR it. Returns extracted text."""
    try:
        import PIL.ImageGrab as ig
        img = ig.grab()
        try:
            import pytesseract
            text = pytesseract.image_to_string(img)
            return text[:1000]
        except ImportError:
            return "[OCR unavailable — pip install pytesseract]"
    except ImportError:
        return "[Screenshot unavailable — pip install Pillow]"
    except Exception as e:
        return f"[Screenshot error: {e}]"


# ── Context snapshot ──────────────────────────────────────────────────────────

class ContextSnapshot:
    """Point-in-time awareness snapshot."""
    def __init__(self):
        self.ts = time.time()
        self.window_title = ""
        self.clipboard = ""
        self.metrics = {}
        self.ocr_text = ""
        self.suggestions: List[str] = []

    def to_dict(self) -> dict:
        return {
            "ts": self.ts,
            "window": self.window_title,
            "clipboard": self.clipboard[:100],
            "cpu": self.metrics.get("cpu_percent", 0),
            "ram": self.metrics.get("ram_percent", 0),
            "suggestions": self.suggestions,
        }

    def context_block(self) -> str:
        """Format as agent context block."""
        lines = []
        if self.window_title:
            lines.append(f"Active window: {self.window_title}")
        m = self.metrics
        if m.get("cpu_percent", 0) > 80:
            lines.append(f"⚠ CPU {m['cpu_percent']:.0f}% — system under load")
        if m.get("ram_percent", 0) > 85:
            lines.append(f"⚠ RAM {m['ram_percent']:.0f}% — memory pressure")
        if self.suggestions:
            lines.append("Proactive suggestions:")
            for s in self.suggestions:
                lines.append(f"  • {s}")
        return "\n".join(lines) if lines else ""


# ── Suggestion engine ─────────────────────────────────────────────────────────

class SuggestionEngine:
    """
    Rule-based proactive suggestion generator.
    Looks at context and fires suggestions to the user.
    """

    def __init__(self):
        self._rules = [
            # (condition_fn, suggestion_str)
            (lambda s: "github.com" in s.window_title.lower() or "git" in s.window_title.lower(),
             "Looks like you're on GitHub — want me to summarize recent changes?"),
            (lambda s: "stackoverflow" in s.window_title.lower(),
             "Stack Overflow detected — want me to search for a solution?"),
            (lambda s: s.metrics.get("cpu_percent", 0) > 85,
             "CPU is pegged — want me to identify what's eating compute?"),
            (lambda s: s.metrics.get("ram_percent", 0) > 90,
             "Memory critical — want me to find large processes?"),
            (lambda s: any(kw in s.clipboard.lower() for kw in ["error", "traceback", "exception"]),
             "Saw an error in your clipboard — want me to diagnose it?"),
            (lambda s: any(kw in s.clipboard.lower() for kw in ["http://", "https://"]),
             "URL detected in clipboard — want me to summarize that page?"),
            (lambda s: any(kw in s.window_title.lower() for kw in ["python", ".py", "vscode", "pycharm"]),
             "Coding detected — want me to review what you're working on?"),
        ]

    def evaluate(self, snapshot: ContextSnapshot) -> List[str]:
        suggestions = []
        for condition, suggestion in self._rules:
            try:
                if condition(snapshot):
                    suggestions.append(suggestion)
            except Exception:
                pass
        return suggestions[:3]  # cap at 3


# ── Main service ──────────────────────────────────────────────────────────────

class AwarenessService:
    """
    Background service that monitors context and delivers proactive suggestions.
    """

    def __init__(self, interval_s: int = 60, enable_ocr: bool = False):
        self.interval_s  = interval_s
        self.enable_ocr  = enable_ocr
        self._suggester  = SuggestionEngine()
        self._running    = False
        self._thread: Optional[threading.Thread] = None
        self._last: Optional[ContextSnapshot] = None
        self._on_suggestion: Optional[Callable[[str], None]] = None
        self._last_window  = ""
        self._last_clip    = ""

    def set_suggestion_callback(self, cb: Callable[[str], None]):
        """Called when BERU has a proactive suggestion."""
        self._on_suggestion = cb

    def snapshot(self) -> ContextSnapshot:
        """Take a single context snapshot."""
        s = ContextSnapshot()
        s.window_title = get_active_window_title()
        s.metrics      = get_system_metrics()
        s.clipboard    = get_clipboard()
        if self.enable_ocr:
            s.ocr_text = take_screenshot_ocr()
        s.suggestions  = self._suggester.evaluate(s)
        self._last = s
        return s

    def get_context_block(self) -> str:
        """For injecting into agent system prompt."""
        if self._last is None:
            try:
                s = self.snapshot()
            except Exception:
                return ""
        else:
            s = self._last
        return s.context_block()

    def start(self):
        if self._running:
            return
        self._running = True
        self._thread  = threading.Thread(target=self._loop, daemon=True, name="beru-awareness")
        self._thread.start()
        info(f"[Awareness] Service started (interval={self.interval_s}s)")

    def stop(self):
        self._running = False

    def is_running(self) -> bool:
        return self._running

    def _loop(self):
        while self._running:
            try:
                s = self.snapshot()
                self._check_changes(s)
            except Exception as e:
                logger.debug(f"Awareness tick error: {e}")
            time.sleep(self.interval_s)

    def _check_changes(self, s: ContextSnapshot):
        # Notify on new suggestions only when context has meaningfully changed
        if s.window_title != self._last_window or s.clipboard[:50] != self._last_clip[:50]:
            self._last_window = s.window_title
            self._last_clip   = s.clipboard
            if s.suggestions and self._on_suggestion:
                for suggestion in s.suggestions[:1]:  # one at a time
                    try:
                        self._on_suggestion(suggestion)
                    except Exception:
                        pass

    def status(self) -> dict:
        if not self._last:
            return {"running": self._running, "last_snapshot": None}
        return {
            "running": self._running,
            "last_snapshot": self._last.to_dict(),
        }


# ── Singleton ─────────────────────────────────────────────────────────────────

_service: Optional[AwarenessService] = None

def get_awareness_service(interval_s: int = 60) -> AwarenessService:
    global _service
    if _service is None:
        try:
            from axoniz.core.config import load_config
            cfg  = load_config()
            acfg = cfg.get("awareness", {}) or {}
            _service = AwarenessService(
                interval_s=acfg.get("interval_s", interval_s),
                enable_ocr=acfg.get("enable_ocr", False),
            )
        except Exception:
            _service = AwarenessService(interval_s=interval_s)
    return _service
