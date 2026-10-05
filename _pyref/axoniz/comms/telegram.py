"""
axoniz/comms/telegram.py
=========================
BERU Telegram bot — remote control + approval delivery.

Setup:
  1. Create a bot via @BotFather, get token
  2. Set BERU_TELEGRAM_TOKEN env var or add to config.yaml:
       telegram:
         token: "123:ABC..."
         chat_id: "your_chat_id"
  3. Run: python -m axoniz.comms.telegram setup   (to get your chat_id)

Commands:
  /ask [task]       — run a task in background
  /status           — BERU system status
  /approve [id]     — approve a pending authority gate
  /deny [id]        — deny a pending authority gate
  /pause            — emergency pause all actions
  /resume           — resume after pause
  /goals            — show active goals
  /audit            — recent audit log
  /help             — command list

BERU can also send proactive messages:
  - Daily briefings
  - Goal deadline alerts
  - Error/warning notifications
  - Authority gate approval requests
"""

import json
import logging
import os
import threading
import time
from typing import Callable, Dict, Optional

logger = logging.getLogger("axoniz.comms.telegram")

# Lazy import — python-telegram-bot is optional
_tg = None
def _import_tg():
    global _tg
    if _tg is None:
        try:
            import telegram
            import telegram.ext
            _tg = telegram
        except ImportError:
            _tg = False
    return _tg is not False


class BeruTelegramBot:
    """
    BERU's Telegram interface.
    Runs in a background thread. Agent can call send_message() any time.
    """

    def __init__(self, token: str = None, chat_id: str = None):
        self.token   = token   or os.environ.get("BERU_TELEGRAM_TOKEN", "")
        self.chat_id = chat_id or os.environ.get("BERU_TELEGRAM_CHAT_ID", "")
        self._app    = None
        self._thread = None
        self._agent_callback: Optional[Callable[[str], str]] = None
        self._approval_callback: Optional[Callable[[str, bool], None]] = None
        self._running = False

    def is_configured(self) -> bool:
        return bool(self.token and self.chat_id)

    def set_agent_callback(self, cb: Callable[[str], str]):
        """Called when user sends /ask. cb(task) -> result string."""
        self._agent_callback = cb

    def set_approval_callback(self, cb: Callable[[str, bool], None]):
        """Called when user approves/denies authority gate."""
        self._approval_callback = cb

    def send_message(self, text: str, parse_mode: str = "Markdown"):
        """Send a message to the configured chat. Thread-safe."""
        if not self.is_configured():
            return
        if not _import_tg():
            logger.debug("python-telegram-bot not installed — pip install python-telegram-bot")
            return
        try:
            import requests
            url = f"https://api.telegram.org/bot{self.token}/sendMessage"
            payload = {"chat_id": self.chat_id, "text": text[:4096], "parse_mode": parse_mode}
            requests.post(url, json=payload, timeout=10)
        except Exception as e:
            logger.debug(f"Telegram send failed: {e}")

    def start(self):
        """Start polling in a background daemon thread."""
        if not self.is_configured():
            logger.debug("[Telegram] Not configured — set BERU_TELEGRAM_TOKEN and BERU_TELEGRAM_CHAT_ID")
            return
        if not _import_tg():
            logger.debug("[Telegram] python-telegram-bot not installed")
            return
        if self._running:
            return

        self._running = True
        self._thread  = threading.Thread(target=self._poll_loop, daemon=True, name="beru-telegram")
        self._thread.start()
        logger.info("[Telegram] Bot started")

    def stop(self):
        self._running = False

    def _poll_loop(self):
        """Simple long-poll loop — no async required."""
        import requests
        offset = 0
        url = f"https://api.telegram.org/bot{self.token}/getUpdates"

        while self._running:
            try:
                resp = requests.get(url, params={"offset": offset, "timeout": 20}, timeout=25)
                data = resp.json()
                if not data.get("ok"):
                    time.sleep(5)
                    continue
                for update in data.get("result", []):
                    offset = update["update_id"] + 1
                    self._handle_update(update)
            except Exception as e:
                logger.debug(f"Telegram poll error: {e}")
                time.sleep(5)

    def _handle_update(self, update: dict):
        msg = update.get("message", {})
        text = msg.get("text", "").strip()
        chat_id = str(msg.get("chat", {}).get("id", ""))

        # Security: only respond to configured chat_id
        if self.chat_id and chat_id != str(self.chat_id):
            return

        if not text:
            return

        try:
            self._dispatch(text, chat_id)
        except Exception as e:
            self.send_message(f"❌ Error: {e}")

    def _dispatch(self, text: str, chat_id: str):
        parts = text.split(maxsplit=1)
        cmd   = parts[0].lower()
        arg   = parts[1].strip() if len(parts) > 1 else ""

        if cmd == "/ask":
            if not arg:
                self.send_message("Usage: /ask [task]")
                return
            self.send_message(f"⚔️ Shadow army deploying on: _{arg}_", "Markdown")
            def _run():
                try:
                    if self._agent_callback:
                        result = self._agent_callback(arg)
                        self.send_message(f"✅ Done:\n{result[:2000]}")
                    else:
                        self.send_message("❌ No agent connected.")
                except Exception as e:
                    self.send_message(f"❌ Failed: {e}")
            threading.Thread(target=_run, daemon=True).start()

        elif cmd == "/status":
            self._send_status()

        elif cmd == "/approve":
            if not arg:
                self.send_message("Usage: /approve [decision_id]")
                return
            if self._approval_callback:
                self._approval_callback(arg, True)
                self.send_message(f"✅ Approved: `{arg}`", "Markdown")
            else:
                self.send_message("No approval callback registered.")

        elif cmd == "/deny":
            if not arg:
                self.send_message("Usage: /deny [decision_id]")
                return
            if self._approval_callback:
                self._approval_callback(arg, False)
                self.send_message(f"🚫 Denied: `{arg}`", "Markdown")
            else:
                self.send_message("No approval callback registered.")

        elif cmd == "/pause":
            try:
                from axoniz.core.authority import get_engine
                get_engine().emergency_pause()
                self.send_message("🛑 Emergency pause activated. All actions blocked.")
            except Exception as e:
                self.send_message(f"Error: {e}")

        elif cmd == "/resume":
            try:
                from axoniz.core.authority import get_engine
                get_engine().resume()
                self.send_message("▶️ Resumed. Actions allowed.")
            except Exception as e:
                self.send_message(f"Error: {e}")

        elif cmd == "/audit":
            try:
                from axoniz.core.authority import get_engine
                self.send_message(get_engine().recent_audit(10))
            except Exception as e:
                self.send_message(f"Error: {e}")

        elif cmd == "/goals":
            try:
                from axoniz.goals.service import get_goal_service
                gs = get_goal_service()
                report = gs.daily_report()
                self.send_message(report[:2000])
            except Exception as e:
                self.send_message(f"Goals unavailable: {e}")

        elif cmd == "/help":
            self.send_message(
                "⚔️ *BERU Commands*\n"
                "/ask [task] — run a task\n"
                "/status — system status\n"
                "/approve [id] — approve gate\n"
                "/deny [id] — deny gate\n"
                "/pause — emergency stop\n"
                "/resume — resume\n"
                "/goals — goal status\n"
                "/audit — recent audit log",
                "Markdown"
            )

        else:
            # Treat non-command messages as /ask
            if not text.startswith("/"):
                self._dispatch(f"/ask {text}", chat_id)

    def _send_status(self):
        lines = ["⚔️ *BERU Status*"]
        try:
            from axoniz.core.authority import get_engine
            lines.append(get_engine().summary())
        except Exception:
            pass
        try:
            from axoniz.goals.service import get_goal_service
            gs = get_goal_service()
            lines.append(f"Goals: {gs.count()} active")
        except Exception:
            pass
        self.send_message("\n".join(lines), "Markdown")


# ── Singleton ─────────────────────────────────────────────────────────────────

_bot: Optional[BeruTelegramBot] = None

def get_bot() -> Optional[BeruTelegramBot]:
    global _bot
    if _bot is None:
        try:
            from axoniz.core.config import load_config
            cfg = load_config()
            tg = cfg.get("telegram", {})
            token   = tg.get("token")   or os.environ.get("BERU_TELEGRAM_TOKEN", "")
            chat_id = tg.get("chat_id") or os.environ.get("BERU_TELEGRAM_CHAT_ID", "")
            _bot = BeruTelegramBot(token=token, chat_id=chat_id)
        except Exception:
            _bot = BeruTelegramBot()
    return _bot


def start_bot(agent_callback: Callable = None) -> BeruTelegramBot:
    """Start the Telegram bot, wired to agent if provided."""
    bot = get_bot()
    if agent_callback:
        bot.set_agent_callback(agent_callback)
    try:
        from axoniz.core.authority import get_engine
        bot.set_approval_callback(get_engine().delivery.resolve)
    except Exception:
        pass
    bot.start()
    return bot


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "setup":
        token = input("Enter bot token: ").strip()
        print("Send any message to your bot, then run this again to get your chat_id")
        import requests
        resp = requests.get(f"https://api.telegram.org/bot{token}/getUpdates")
        print(resp.json())
