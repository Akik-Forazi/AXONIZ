"""
axoniz/comms/dispatcher.py
===========================
Unified message dispatcher — route outbound messages to all configured channels.

Channels: console | telegram | (future: discord, email, slack)

Usage:
    from axoniz.comms.dispatcher import get_dispatcher
    get_dispatcher().send("BERU online — Shadow Army ready.")
"""

import logging
import os
from typing import List, Optional

logger = logging.getLogger("axoniz.comms.dispatcher")


class Dispatcher:
    """Routes messages to all configured channels."""

    def __init__(self):
        self._console  = True
        self._telegram: Optional[object] = None   # lazy
        self._channels: List = []                 # extra callable channels for testing

    def _get_telegram(self):
        if self._telegram is None:
            try:
                from axoniz.comms.telegram import get_bot
                bot = get_bot()
                self._telegram = bot if bot.is_configured() else False
            except Exception:
                self._telegram = False
        return self._telegram if self._telegram is not False else None

    def send(self, message: str, channel: str = "all", parse_mode: str = "Markdown", urgent: bool = False):
        """
        Send a message.
        channel: "all" | "console" | "telegram"
        urgent: passed through to extra channels (no-op for built-ins)
        """
        # Route through any registered extra channels first (e.g. for testing)
        for ch in self._channels:
            try:
                ch(message, urgent=urgent)
            except Exception as e:
                logger.debug(f"Extra channel dispatch failed: {e}")

        if channel in ("all", "console") and self._console:
            print(f"[BERU] {message}")

        if channel in ("all", "telegram"):
            tg = self._get_telegram()
            if tg:
                try:
                    tg.send_message(message, parse_mode=parse_mode)
                except Exception as e:
                    logger.debug(f"Telegram dispatch failed: {e}")

    def alert(self, message: str):
        """High-priority alert — always console + all configured channels."""
        self.send(f"⚠️ {message}", channel="all")

    def notify(self, title: str, body: str):
        """System notification."""
        self.send(f"*{title}*\n{body}", channel="all")
        try:
            from axoniz.sidecar.client import get_sidecar
            sc = get_sidecar()
            if sc.is_alive():
                sc.send_notification(title, body)
        except Exception:
            pass

    def status(self) -> dict:
        return {
            "console": self._console,
            "telegram": self._get_telegram() is not None,
        }


# ── Singleton ─────────────────────────────────────────────────────────────────

_dispatcher: Optional[Dispatcher] = None

def get_dispatcher() -> Dispatcher:
    global _dispatcher
    if _dispatcher is None:
        _dispatcher = Dispatcher()
    return _dispatcher
