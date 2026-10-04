"""
axoniz/sidecar/client.py
=========================
HTTP client for the Jarvis Go sidecar (if running).

The Jarvis Go binary exposes a local REST API on localhost:5151 (default).
This client lets BERU query it for:
  - System context (running processes, open files, active windows)
  - Hotkey events
  - Clipboard content
  - Screen text (via sidecar OCR)
  - Notifications

If the sidecar is not running, all calls degrade gracefully — None or {}.

Usage:
    from axoniz.sidecar.client import get_sidecar
    sc = get_sidecar()
    if sc.is_alive():
        ctx = sc.get_context()
"""

import json
import logging
import os
import threading
import time
from typing import Any, Dict, Optional

logger = logging.getLogger("axoniz.sidecar")

DEFAULT_HOST = "localhost"
DEFAULT_PORT = 5151


class SidecarClient:
    """
    HTTP client for the Jarvis Go sidecar.
    All methods are safe to call even when sidecar is offline.
    """

    def __init__(self, host: str = DEFAULT_HOST, port: int = DEFAULT_PORT,
                 timeout: float = 2.0):
        self.base_url = f"http://{host}:{port}"
        self.timeout  = timeout
        self._alive:  Optional[bool] = None
        self._last_check: float = 0.0
        self._check_interval = 30.0  # recheck every 30s

    def is_alive(self) -> bool:
        """Check if sidecar is running. Cached for 30s."""
        now = time.time()
        if self._alive is not None and (now - self._last_check) < self._check_interval:
            return self._alive
        try:
            import urllib.request
            with urllib.request.urlopen(f"{self.base_url}/health", timeout=self.timeout) as r:
                self._alive = r.status == 200
        except Exception:
            self._alive = False
        self._last_check = now
        return self._alive

    def _get(self, path: str) -> Optional[dict]:
        """GET request to sidecar. Returns parsed JSON or None."""
        if not self.is_alive():
            return None
        try:
            import urllib.request
            with urllib.request.urlopen(f"{self.base_url}{path}", timeout=self.timeout) as r:
                return json.loads(r.read())
        except Exception as e:
            logger.debug(f"Sidecar GET {path} failed: {e}")
            return None

    def _post(self, path: str, data: dict) -> Optional[dict]:
        """POST request to sidecar."""
        if not self.is_alive():
            return None
        try:
            import urllib.request
            body = json.dumps(data).encode()
            req  = urllib.request.Request(
                f"{self.base_url}{path}", data=body,
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                return json.loads(r.read())
        except Exception as e:
            logger.debug(f"Sidecar POST {path} failed: {e}")
            return None

    # ── Context ───────────────────────────────────────────────────────────────

    def get_context(self) -> dict:
        """Full system context from sidecar."""
        return self._get("/context") or {}

    def get_active_window(self) -> str:
        """Active window title."""
        r = self._get("/window")
        return r.get("title", "") if r else ""

    def get_clipboard(self) -> str:
        """Clipboard text content."""
        r = self._get("/clipboard")
        return r.get("text", "") if r else ""

    def get_screen_text(self) -> str:
        """OCR'd screen text from sidecar."""
        r = self._get("/screen/text")
        return r.get("text", "") if r else ""

    def get_processes(self) -> list:
        """Running processes list."""
        r = self._get("/processes")
        return r.get("processes", []) if r else []

    def get_system_metrics(self) -> dict:
        """CPU/RAM/disk from sidecar (more accurate than psutil on some platforms)."""
        return self._get("/metrics") or {}

    # ── Actions ───────────────────────────────────────────────────────────────

    def send_notification(self, title: str, body: str, icon: str = "") -> bool:
        """Ask sidecar to show a system notification."""
        r = self._post("/notify", {"title": title, "body": body, "icon": icon})
        return bool(r and r.get("ok"))

    def set_clipboard(self, text: str) -> bool:
        """Ask sidecar to set clipboard content."""
        r = self._post("/clipboard", {"text": text})
        return bool(r and r.get("ok"))

    def open_url(self, url: str) -> bool:
        """Ask sidecar to open a URL in default browser."""
        r = self._post("/open", {"url": url})
        return bool(r and r.get("ok"))

    # ── Context block for agent ───────────────────────────────────────────────

    def context_block(self) -> str:
        """Compact context block to inject into agent's system prompt."""
        if not self.is_alive():
            return ""
        ctx = self.get_context()
        if not ctx:
            return ""
        lines = ["[Sidecar context]"]
        if ctx.get("window"):
            lines.append(f"  Active: {ctx['window']}")
        if ctx.get("cpu_percent", 0) > 70:
            lines.append(f"  CPU: {ctx['cpu_percent']:.0f}%")
        if ctx.get("ram_percent", 0) > 80:
            lines.append(f"  RAM: {ctx['ram_percent']:.0f}%")
        return "\n".join(lines)

    def status(self) -> dict:
        return {
            "alive": self.is_alive(),
            "base_url": self.base_url,
        }


# ── Singleton ─────────────────────────────────────────────────────────────────

_client: Optional[SidecarClient] = None

def get_sidecar(host: str = None, port: int = None) -> SidecarClient:
    global _client
    if _client is None:
        try:
            from axoniz.core.config import load_config
            cfg  = load_config()
            scfg = cfg.get("sidecar", {}) or {}
            _client = SidecarClient(
                host=host or scfg.get("host", DEFAULT_HOST),
                port=port or scfg.get("port", DEFAULT_PORT),
            )
        except Exception:
            _client = SidecarClient(
                host=host or DEFAULT_HOST,
                port=port or DEFAULT_PORT,
            )
    return _client
