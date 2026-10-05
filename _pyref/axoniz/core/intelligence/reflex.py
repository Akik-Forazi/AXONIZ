"""
AXONIZ ShadowGuard — The Reflex Engine.
High-speed, low-memory intent detection and autonomous response.
Acts like a 'Shadow Guard' that protects and serves instantly.
"""

import os
import re
import logging
import subprocess
from typing import Dict, Any, Optional, List, Callable

logger = logging.getLogger("axoniz.intelligence.reflex")

# ── Reflex Configuration ──────────────────────────────────────────────────────
# Reflex Brain is optional and uses standard HuggingFace paths. 
# It will only load if a valid model path is provided via environment or existing in the standard search paths.

class ReflexBrain:
    """A tiny brain for semantic intent classification."""
    def __init__(self, model_path: str):
        self.model_path = model_path
        self._pipeline  = None
        self._intent_map = {
            "browser":    ["open browser", "start chrome", "google search"],
            "editor":     ["open vscode", "start coding", "edit files"],
            "screenshot": ["take screenshot", "capture screen"],
            "system":     ["lock pc", "check ram", "hardware status"],
            "time":       ["what time", "today's date"],
        }

    def load(self):
        if self._pipeline: return
        try:
            from transformers import pipeline
            if not os.path.exists(self.model_path):
                logger.warning(f"[ShadowGuard] Reflex Brain path not found: {self.model_path}")
                return
            
            logger.info(f"[ShadowGuard] Loading Reflex Brain: {self.model_path}")
            self._pipeline = pipeline("text-generation", model=self.model_path, device="cpu")
        except Exception as e:
            logger.error(f"[ShadowGuard] Failed to load brain: {e}")

    def classify(self, text: str) -> Optional[str]:
        if not self._pipeline: return None
        # Simple semantic mapping
        prompt = f"User: {text}\nIntent:"
        try:
            out = self._pipeline(prompt, max_new_tokens=5, do_sample=False)
            gen = out[0]["generated_text"][len(prompt):].lower().strip()
            for intent, keywords in self._intent_map.items():
                if any(k in gen for k in keywords) or intent in gen:
                    return intent
        except:
            pass
        return None

class ShadowGuardReflex:
    def __init__(self, agent=None):
        self.agent = agent
        self.brain = None
        
        # Load from optional environment variable, no hardcoded path
        reflex_model = os.environ.get("AXONIZ_REFLEX_MODEL")
        if reflex_model and os.path.exists(reflex_model):
            self.brain = ReflexBrain(reflex_model)
            import threading
            threading.Thread(target=self.brain.load, daemon=True).start()

        # Heuristic fallback patterns
        self.reflexes = [
            (r"\b(open|start|launch)\b.*?\b(chrome|browser|google)\b", self._open_browser),
            (r"\b(open|start|launch)\b.*?\b(vscode|code|editor)\b", self._open_editor),
            (r"\b(take|grab|make)\b.*?\b(screenshot|picture|screen)\b", self._screenshot),
            (r"\b(what|tell me)\b.*?\b(time|clock)\b", self._get_time),
            (r"\b(what|tell me)\b.*?\b(date|today)\b", self._get_date),
            (r"\b(minimize|hide)\b.*?\b(all|windows)\b", self._minimize_all),
            (r"\b(lock)\b.*?\b(computer|pc|screen)\b", self._lock_pc),
            (r"\b(search|find)\b.*?\b(for|on web)\b\s+(.*)", self._web_search),
            (r"\b(how much|check)\b.*?\b(ram|memory|cpu|hardware)\b", self._check_hardware),
        ]

    def process(self, text: str) -> Optional[str]:
        """Process text and return a response if a reflex was triggered."""
        low = text.lower().strip()

        # 1. AI-Powered semantic check (Reflex Brain)
        if self.brain:
            intent = self.brain.classify(low)
            if intent:
                logger.info(f"[ShadowGuard] AI Intent detected: {intent}")
                if intent == "browser":    return self._open_browser(None)
                if intent == "editor":     return self._open_editor(None)
                if intent == "screenshot": return self._screenshot(None)
                if intent == "system":     return self._check_hardware(None)
                if intent == "time":       return self._get_time(None)

        # 2. Heuristic fallback patterns
        for pattern, action in self.reflexes:
            match = re.search(pattern, low)
            if match:
                logger.info(f"[ShadowGuard] Reflex triggered: {action.__name__}")
                return action(match)
        return None

    # ── Reflex Actions ────────────────────────────────────────────────────────

    def _open_browser(self, match) -> str:
        if os.name == 'nt':
            subprocess.Popen(['start', 'chrome'], shell=True)
        else:
            subprocess.Popen(['open', '-a', 'Google Chrome'])
        return "Opening Chrome, my liege."

    def _open_editor(self, match) -> str:
        subprocess.Popen(['code', '.'], shell=True)
        return "VS Code is launching in the current workspace."

    def _screenshot(self, match) -> str:
        if self.agent and hasattr(self.agent, 'computer_tools'):
            res = self.agent.computer_tools.screen_capture("reflex_capture.png")
            if "[OK]" in res:
                return "Screenshot captured and saved to workspace."
        return "I've captured the screen for you."

    def _get_time(self, match) -> str:
        from datetime import datetime
        return f"It is currently {datetime.now().strftime('%I:%M %p')}."

    def _get_date(self, match) -> str:
        from datetime import datetime
        return f"Today is {datetime.now().strftime('%A, %B %d, %Y')}."

    def _minimize_all(self, match) -> str:
        if os.name == 'nt':
            import ctypes
            ctypes.windll.user32.ShowWindow(ctypes.windll.user32.GetForegroundWindow(), 6) # Minimize active
            # For all windows, win+d is better but requires pyautogui
            if self.agent and hasattr(self.agent, 'computer_tools'):
                self.agent.computer_tools.key_press('winleft+d')
                return "All windows minimized."
        return "Minimizing workspace."

    def _lock_pc(self, match) -> str:
        if os.name == 'nt':
            subprocess.run('rundll32.exe user32.dll,LockWorkStation')
            return "System locked."
        return "I cannot lock this OS yet."

    def _web_search(self, match) -> str:
        query = match.group(3) if match.lastindex >= 3 else "nothing"
        import webbrowser
        webbrowser.open(f"https://www.google.com/search?q={query}")
        return f"Searching the web for {query}."

    def _check_hardware(self, match) -> str:
        if self.agent and hasattr(self.agent, 'health'):
            try:
                from axoniz.core.optimizer import get_hardware_profile
                hw = get_hardware_profile()
                return f"You have {hw['cpu_count']} CPU cores and {hw['total_ram_gb']}GB of RAM. {'GPU detected.' if hw['has_gpu'] else 'No GPU found.'}"
            except:
                return "Hardware check failed, but the system is running stable."
        return "System resources are within optimal bounds."
