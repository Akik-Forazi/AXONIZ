"""
axoniz/voice/voice_loop.py
===========================
BERU Voice Loop â€” full conversation state machine.

Flow:
  IDLE -[wake word]- ACKNOWLEDGING (earcon + "Yes, my liege")
                      - LISTENING   (STT, 8s window)
                      - THINKING    (agent run + stream tokens)
                      - SPEAKING    (TTS the trimmed response)
                      - FOLLOW_UP   (smart contextual follow-up)
                      - back to IDLE

Natural tone rules:
  - Short acks. Never robotic. Never "Processing your request."
  - Time-aware: knows the date, time, day of week
  - After a task: say what was done in one sentence, ask what's next
  - Code blocks are never read aloud â€” summarised instead
  - Interruption: new wake word during speech cancels and re-listens
"""

import logging
import random
import re
import threading
import time
from datetime import datetime
from enum import Enum, auto
from typing import Callable, Optional

logger = logging.getLogger("axoniz.voice.loop")


class VoiceState(Enum):
    IDLE          = auto()
    ACKNOWLEDGING = auto()
    LISTENING     = auto()
    THINKING      = auto()
    SPEAKING      = auto()
    FOLLOW_UP     = auto()


# - Personality phrase banks -------------------------

_ACK_PHRASES = [
    "Yes?",
    "Listening.",
    "Go ahead.",
    "Here.",
    "Ready.",
    "At your command.",
    "What do you need?",
]

_THINK_PHRASES = [
    "On it.",
    "Give me a second.",
    "Working on that.",
    "Let me check.",
    "One moment.",
]

_DONE_TRANSITIONS = [
    "What else?",
    "Anything else?",
    "What's next?",
    "Standing by.",
    "Your call.",
]

_ERROR_PHRASES = [
    "Didn't catch that â€” try again.",
    "Say that once more.",
    "I couldn't hear you clearly.",
]

_STOP_WORDS = {"stop listening", "go to sleep", "shut up", "quiet", "nevermind"}


def _pick(phrases): return random.choice(phrases)


# - Time helpers -------------------------------

def _natural_time() -> str:
    now = datetime.now()
    hour = now.hour
    minute = now.minute
    if minute == 0:
        t = f"{hour % 12 or 12} o'clock {'AM' if hour < 12 else 'PM'}"
    else:
        t = now.strftime("%I:%M %p").lstrip("0")
    return t

def _natural_datetime() -> str:
    now = datetime.now()
    day = now.strftime("%A")
    date = now.strftime("%B %d").replace(" 0", " ")
    hour = now.hour
    period = "morning" if hour < 12 else "afternoon" if hour < 17 else "evening"
    return f"{day} {date}, {period}"


# - Response trimmer (voice-optimised) -------------------â”€

def _voice_trim(text: str, max_chars: int = 350) -> str:
    """
    Convert an agent text response into something natural to speak aloud.
    - Drops code blocks entirely (just says "code block attached")
    - Removes markdown
    - Keeps first 2 meaningful sentences
    """
    had_code = bool(re.search(r"```", text))
    text = re.sub(r"```[\s\S]*?```", "", text)   # drop code blocks
    text = re.sub(r"`[^`\n]+`", lambda m: m.group().strip("`"), text)  # inline code
    text = re.sub(r"\*\*(.*?)\*\*", r"\1", text)  # bold
    text = re.sub(r"\*(.*?)\*", r"\1", text)       # italic
    text = re.sub(r"#{1,6}\s+", "", text)          # headings
    text = re.sub(r"\n{2,}", ". ", text)
    text = re.sub(r"\s{2,}", " ", text).strip()

    suffix = " I've attached the code to the chat." if had_code else ""

    if len(text) <= max_chars:
        return (text + suffix).strip()

    sentences = re.split(r'(?<=[.!?])\s+', text)
    trimmed = ""
    for s in sentences:
        if len(trimmed) + len(s) > max_chars:
            break
        trimmed += s + " "
    trimmed = trimmed.strip()
    if not trimmed:
        trimmed = text[:max_chars].rstrip() + "â€¦"
    return (trimmed + suffix).strip()


# - Follow-up generator ---------------------------â”€

def _make_followup(task: str, response: str) -> str:
    t = task.lower()
    r = response.lower()
    if any(w in t for w in ["fix", "bug", "error", "crash", "broken"]):
        return "Want me to run the tests?"
    if any(w in t for w in ["write", "create", "build", "generate", "make"]):
        return "Shall I commit this?"
    if any(w in t for w in ["search", "find", "look up", "check"]):
        return "Want me to dig deeper on any of that?"
    if "time" in t or "date" in t or "day" in t:
        return None  # No follow-up for time queries
    if any(w in t for w in ["explain", "what", "how", "why", "tell me"]):
        return "Want me to expand on any part?"
    if "error" in r or "failed" in r or "couldn't" in r:
        return "Should I try to fix that?"
    return _pick(_DONE_TRANSITIONS)


# - Main loop class -----------------------------â”€

class VoiceLoop:
    """
    BERU's always-on voice interface.
    Wire to Agent, call start(). The loop runs as a daemon thread.
    """

    def __init__(
        self,
        agent,
        on_state_change: Optional[Callable[[str], None]] = None,
        listen_timeout: int = 8,
        auto_followup: bool = True,
    ):
        self.agent           = agent
        self.on_state_change = on_state_change
        self.listen_timeout  = listen_timeout
        self.auto_followup   = auto_followup

        self._state         = VoiceState.IDLE
        self._stop_ev       = threading.Event()
        self._wake_ev       = threading.Event()
        self._speak_stop_ev = threading.Event()
        self._main_thread: Optional[threading.Thread] = None

        self._tts = None
        self._stt = None
        self._wwd = None

    # - lifecycle ------------------------------â”€

    def start(self):
        self._stop_ev.clear()
        self._init_engines()
        self._main_thread = threading.Thread(
            target=self._loop, daemon=True, name="beru-voice"
        )
        self._main_thread.start()
        logger.info("[VoiceLoop] started")

    def stop(self):
        self._stop_ev.set()
        if self._wwd:
            self._wwd.stop()
        if self._main_thread:
            self._main_thread.join(timeout=3)

    def is_running(self) -> bool:
        return self._main_thread is not None and self._main_thread.is_alive()

    @property
    def state(self) -> str:
        return self._state.name

    def interrupt(self):
        self._speak_stop_ev.set()

    # - engine init -----------------------------â”€

    def _init_engines(self):
        from axoniz.voice.tts import get_tts
        from axoniz.voice.stt import get_stt
        from axoniz.voice.wake_word import get_wake_detector
        self._tts = get_tts()
        self._stt = get_stt()
        self._wwd = get_wake_detector(on_wake=self._on_wake)
        self._wwd.start()
        logger.info(
            f"[VoiceLoop] TTS={self._tts.info()['backend']} "
            f"STT={self._stt.info()['backend']} "
            f"WakeWord={self._wwd.backend}"
        )

    # - wake callback ----------------------------â”€

    def _on_wake(self, word: str):
        if self._state in (VoiceState.THINKING, VoiceState.LISTENING):
            return
        if self._state == VoiceState.SPEAKING:
            self.interrupt()
            time.sleep(0.2)
        self._wake_ev.set()

    # - state helpers ----------------------------â”€



    def _get_tts(self):
        """Lazy-load TTS on first use."""
        if self._tts is None:
            try:
                from axoniz.voice.tts import get_tts
                self._tts = get_tts()
                logger.info(f"[VoiceLoop] TTS loaded: {self._tts.info()['backend']}")
            except Exception as e:
                logger.error(f"[VoiceLoop] TTS load failed: {e}")
                return None
        return self._tts

    def _get_stt(self):
        """Lazy-load STT on first use."""
        if self._stt is None:
            try:
                from axoniz.voice.stt import get_stt
                self._stt = get_stt()
                logger.info(f"[VoiceLoop] STT loaded: {self._stt.info()['backend']}")
            except Exception as e:
                logger.error(f"[VoiceLoop] STT load failed: {e}")
                return None
        return self._stt

    def _set_state(self, s: VoiceState):
        self._state = s
        if self.on_state_change:
            try: self.on_state_change(s.name)
            except Exception: pass

    # - TTS with interrupt --------------------------

    def _speak(self, text: str, interruptible: bool = True):
        tts = self._get_tts()
        if not text or not tts:
            return
        self._speak_stop_ev.clear()
        self._set_state(VoiceState.SPEAKING)
        if interruptible:
            done = threading.Event()
            threading.Thread(target=lambda: (tts.speak(text) if tts else None, done.set()), daemon=True).start()
            while not done.is_set():
                if self._speak_stop_ev.is_set():
                    break
                time.sleep(0.05)
        else:
            tts.speak(text)

    # - STT ---------------------------------â”€

    def _listen(self) -> Optional[str]:
        self._set_state(VoiceState.LISTENING)
        if not self._stt or not self._stt.is_available:
            return None
        try:
            text = stt.listen(timeout=self.listen_timeout)
            if text:
                logger.info(f"[VoiceLoop] heard: '{text}'")
            return text.strip() if text else None
        except Exception as e:
            logger.error(f"[VoiceLoop] STT error: {e}")
            return None

    # - Time query shortcut (no LLM needed) -----------------

    def _handle_time_query(self, task: str) -> Optional[str]:
        """If the user just asked for the time/date, answer directly."""
        low = task.lower()
        if any(p in low for p in ["what time", "what's the time", "current time"]):
            now = datetime.now()
            return f"It's {now.strftime('%I:%M %p').lstrip('0')}."
        if any(p in low for p in ["what day", "what date", "today's date", "what's today"]):
            now = datetime.now()
            return f"Today is {now.strftime('%A, %B %d %Y')}."
        if any(p in low for p in ["what year", "current year"]):
            return f"It's {datetime.now().year}."
        return None

    # - Main loop ------------------------------â”€

    def _loop(self):
        logger.info("[VoiceLoop] idle â€” waiting for wake word")
        while not self._stop_ev.is_set():
            self._set_state(VoiceState.IDLE)
            fired = self._wake_ev.wait(timeout=1.0)
            if not fired:
                continue
            self._wake_ev.clear()
            if self._stop_ev.is_set():
                break

            # Acknowledge
            self._set_state(VoiceState.ACKNOWLEDGING)
            self._speak(_pick(_ACK_PHRASES), interruptible=False)

            # Listen
            task = self._listen()
            if not task:
                self._speak(_pick(_ERROR_PHRASES))
                continue

            # Stop command
            if any(s in task.lower() for s in _STOP_WORDS):
                self._speak("Got it. Going quiet.")
                continue

            # Fast-path: time queries handled locally, no LLM roundtrip
            quick = self._handle_time_query(task)
            if quick:
                self._speak(quick)
                continue

            # Think
            self._set_state(VoiceState.THINKING)
            self._speak(_pick(_THINK_PHRASES), interruptible=False)

            response = ""
            try:
                response = self.agent.run(task)
            except Exception as e:
                logger.error(f"[VoiceLoop] agent error: {e}")
                response = f"I hit an error: {e}"

            # Speak response
            spoken = _voice_trim(response)
            self._speak(spoken)

            if self._stop_ev.is_set():
                break

            # Follow-up
            if self.auto_followup and response and not self._speak_stop_ev.is_set():
                self._set_state(VoiceState.FOLLOW_UP)
                followup = _make_followup(task, response)
                if followup:
                    time.sleep(0.5)
                    self._speak(followup)

        self._set_state(VoiceState.IDLE)


# - singletons --------------------------------

_loop_instance: Optional[VoiceLoop] = None


def get_voice_loop(agent, **kwargs) -> VoiceLoop:
    global _loop_instance
    if _loop_instance is None:
        _loop_instance = VoiceLoop(agent=agent, **kwargs)
    return _loop_instance


def start_voice_loop(agent, **kwargs) -> VoiceLoop:
    vl = get_voice_loop(agent, **kwargs)
    if not vl.is_running():
        vl.start()
    return vl





