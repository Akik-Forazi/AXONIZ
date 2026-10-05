"""
axoniz/voice/light_daemon.py
=============================
BERU Light Voice Daemon — two-tier, minimal RAM.

Architecture
------------
  ALWAYS ON  (idle RAM ~80-160 MB total):
    openwakeword ONNX   —  ~1 MB  —  wake word detection
    faster-whisper tiny — ~75 MB  —  speech-to-text (int8 CPU)
    edge-tts            —   0 MB  —  text-to-speech (MS cloud stream)

  ON DEMAND  (no weights ever loaded locally):
    Tier 1 — regex classifier answers simple queries instantly (time, date, etc.)
    Tier 2 — one stateless HTTP call to Anthropic / Groq / OpenAI API
             only fires when the query is complex
             zero model weights in RAM

  NEVER LOADED:
    The full axoniz Agent, LM Studio, Ollama, or any local LLM.

Usage
-----
    from axoniz.voice.light_daemon import start_light_daemon
    d = start_light_daemon()
    # runs forever — say "Beru" to wake
    import time; time.sleep(9999)

    # With a specific API backend:
    d = start_light_daemon(provider="anthropic", api_key="sk-ant-...")
    d = start_light_daemon(provider="groq")   # uses GROQ_API_KEY env var
"""

from __future__ import annotations

import logging
import os
import random
import re
import struct
import tempfile
import threading
import time
import wave
from datetime import datetime
from typing import Callable, Optional

logger = logging.getLogger("axoniz.voice.light")

# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

WHISPER_MODEL  = os.environ.get("BERU_WHISPER_MODEL", "tiny")
WHISPER_DEVICE = "cpu"          # keep it on CPU — no VRAM consumed
SAMPLE_RATE    = 16_000
LISTEN_SECS    = 7              # max recording window after wake word
SILENCE_THRESH = 500            # PCM energy threshold — high enough to ignore BERU's own TTS echo
SILENCE_FRAMES = 20             # consecutive silent frames before stop (~0.5s)

DBG = True   # master debug flag — set to False to quiet down

def _dbg(msg: str):
    if DBG:
        ts = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        print(f"  [BERU:{ts}] {msg}", flush=True)

# ─────────────────────────────────────────────────────────────────────────────
# Tier 1 — Intent classifier (pure regex, zero latency, zero RAM)
# ─────────────────────────────────────────────────────────────────────────────

_STOP_WORDS = {"stop listening", "go to sleep", "shut up", "quiet",
               "nevermind", "stop", "sleep", "goodbye"}

_LOCAL_PATTERNS = [
    r"\btime\b", r"\bdate\b", r"\bday\b", r"\byear\b",
    r"\bhello\b", r"\bhi\b", r"\bhey\b",
    r"\bthank(s| you)\b", r"\bbye\b",
    r"\bwho are you\b", r"\bstatus\b",
]

_LLM_PATTERNS = [
    r"\b(load|use|switch to|activate)\b.*(big|full|smart|model|claude|gpt|groq)\b",
    r"\bthink harder\b", r"\bmore detail\b", r"\bexplain.+detail\b",
    r"\b(write|create|build|generate|implement|debug|refactor|analyse|analyze)\b",
    r"\bhow (do|does|can|would|should)\b",
    r"\bwhy (is|does|did|are|were)\b",
    r"\bwhat (is|are|was|were|does|did)\b",
    r"\bcan you\b", r"\bcould you\b",
]

def _classify(text: str) -> str:
    """Returns 'stop', 'local', or 'llm'."""
    low = text.lower().strip()
    if any(s in low for s in _STOP_WORDS):
        return "stop"
    for pat in _LLM_PATTERNS:
        if re.search(pat, low):
            return "llm"
    for pat in _LOCAL_PATTERNS:
        if re.search(pat, low):
            return "local"
    # short = probably local, long = probably llm
    return "local" if len(low.split()) <= 4 else "llm"


def _local_response(text: str) -> str:
    """Answer without any network call."""
    low = text.lower()
    now = datetime.now()
    if re.search(r"\btime\b", low):
        return f"It's {now.strftime('%I:%M %p').lstrip('0')}."
    if re.search(r"\b(date|today|day)\b", low):
        return f"Today is {now.strftime('%A, %B %d')}."
    if re.search(r"\byear\b", low):
        return f"It's {now.year}."
    if re.search(r"\b(hello|hi|hey)\b", low):
        return random.choice(["Hello, my liege.", "Here and ready.", "What do you need?"])
    if re.search(r"\bthank(s| you)\b", low):
        return random.choice(["Of course.", "Always.", "Your will is my mission."])
    if re.search(r"\bwho are you\b", low):
        return "I'm BERU. Your shadow army of one."
    if re.search(r"\bstatus\b", low):
        return "Light daemon online. Whisper STT active. Waiting for commands."
    return random.choice(["I'm here. What do you need?", "Standing by.", "Go ahead."])


# ─────────────────────────────────────────────────────────────────────────────
# Tier 2 — Stateless LLM API client (no local weights ever)
# ─────────────────────────────────────────────────────────────────────────────

class _LLMClient:
    SYSTEM = (
        "You are BERU, a sharp military-precision AI assistant. "
        "Speak in short direct sentences. "
        "Current time: {time}. Date: {date}."
    )

    def __init__(self, provider="auto", api_key=None, model=None, base_url=None):
        self.provider = provider
        self.api_key  = api_key
        self.model    = model
        self.base_url = base_url
        self._backend = self._detect()
        _dbg(f"LLM backend detected: {self._backend}")

    def _detect(self) -> str:
        if self.provider not in ("auto", None):
            _dbg(f"LLM provider forced to: {self.provider}")
            return self.provider
        for prov, env, pkg in [
            ("groq",      "GROQ_API_KEY",     "groq"),
            ("anthropic", "ANTHROPIC_API_KEY", "anthropic"),
            ("openai",    "OPENAI_API_KEY",    "openai"),
        ]:
            key = os.environ.get(env, "")
            if key:
                try:
                    __import__(pkg)
                    _dbg(f"Found API key for {prov} — using it")
                    return prov
                except ImportError:
                    _dbg(f"{pkg} package not installed, skipping")
        _dbg("No LLM API key found. Tier 2 disabled.")
        return "none"

    @property
    def available(self) -> bool:
        return self._backend != "none"

    def ask(self, prompt: str, max_tokens: int = 200) -> str:
        now = datetime.now()
        system = self.SYSTEM.format(
            time=now.strftime("%I:%M %p"),
            date=now.strftime("%A, %B %d %Y"),
        )
        _dbg(f"LLM ask [{self._backend}]: '{prompt[:80]}'")
        t0 = time.time()
        try:
            if self._backend == "anthropic":
                result = self._ask_anthropic(system, prompt, max_tokens)
            elif self._backend == "groq":
                result = self._ask_groq(system, prompt, max_tokens)
            elif self._backend == "openai":
                result = self._ask_openai(system, prompt, max_tokens)
            else:
                return ("No LLM backend configured. "
                        "Set ANTHROPIC_API_KEY, GROQ_API_KEY, or OPENAI_API_KEY.")
            _dbg(f"LLM responded in {time.time()-t0:.2f}s: '{result[:80]}'")
            return result
        except Exception as e:
            logger.error(f"[LightDaemon] LLM error: {e}")
            _dbg(f"LLM ERROR: {e}")
            return f"LLM call failed: {e}"

    def _ask_anthropic(self, system, prompt, max_tokens):
        import anthropic
        key = self.api_key or os.environ.get("ANTHROPIC_API_KEY", "")
        client = anthropic.Anthropic(api_key=key)
        msg = client.messages.create(
            model=self.model or "claude-haiku-4-5-20251001",
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": prompt}],
        )
        return msg.content[0].text.strip()

    def _ask_groq(self, system, prompt, max_tokens):
        from groq import Groq
        key = self.api_key or os.environ.get("GROQ_API_KEY", "")
        client = Groq(api_key=key)
        resp = client.chat.completions.create(
            model=self.model or "llama3-8b-8192",
            max_tokens=max_tokens,
            messages=[
                {"role": "system", "content": system},
                {"role": "user",   "content": prompt},
            ],
        )
        return resp.choices[0].message.content.strip()

    def _ask_openai(self, system, prompt, max_tokens):
        from openai import OpenAI
        key = self.api_key or os.environ.get("OPENAI_API_KEY", "")
        client = OpenAI(api_key=key, **({"base_url": self.base_url} if self.base_url else {}))
        resp = client.chat.completions.create(
            model=self.model or "gpt-4o-mini",
            max_tokens=max_tokens,
            messages=[
                {"role": "system", "content": system},
                {"role": "user",   "content": prompt},
            ],
        )
        return resp.choices[0].message.content.strip()


# ─────────────────────────────────────────────────────────────────────────────
# STT — faster-whisper tiny, always loaded, stays in RAM
# ─────────────────────────────────────────────────────────────────────────────

class _WhisperSTT:
    def __init__(self, model_size=WHISPER_MODEL):
        self._model_size = model_size
        self._model = None
        self._lock  = threading.Lock()
        self._load()

    def _load(self):
        try:
            from faster_whisper import WhisperModel
            _dbg(f"Loading faster-whisper-{self._model_size} on CPU (int8)…")
            self._model = WhisperModel(
                self._model_size,
                device="cpu",          # ALWAYS CPU — never touch GPU for this
                compute_type="int8",   # smallest footprint
            )
            _dbg(f"Whisper-{self._model_size} ready.")
        except ImportError:
            _dbg("ERROR: faster-whisper not installed. Run: pip install faster-whisper")
            self._model = None
        except Exception as e:
            _dbg(f"ERROR loading whisper: {e}")
            self._model = None

    @property
    def available(self) -> bool:
        return self._model is not None

    def transcribe_pcm(self, pcm_bytes: bytes) -> str:
        """Transcribe raw 16-bit 16kHz mono PCM. Returns text or empty string."""
        if not self._model or not pcm_bytes:
            _dbg("transcribe_pcm: model not available or empty audio")
            return ""
        with self._lock:
            tmp = None
            try:
                with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                    tmp = f.name
                    with wave.open(f, "wb") as wf:
                        wf.setnchannels(1)
                        wf.setsampwidth(2)
                        wf.setframerate(SAMPLE_RATE)
                        wf.writeframes(pcm_bytes)
                _dbg(f"Transcribing {len(pcm_bytes)//2/SAMPLE_RATE:.1f}s audio…")
                t0 = time.time()
                segs, info = self._model.transcribe(
                    tmp, language="en",
                    beam_size=1,       # fastest
                    vad_filter=True,   # skip silence internally
                )
                text = " ".join(s.text for s in segs).strip()
                _dbg(f"Whisper done in {time.time()-t0:.2f}s → '{text}'")
                return text
            except Exception as e:
                _dbg(f"Whisper transcribe ERROR: {e}")
                return ""
            finally:
                if tmp:
                    try: os.unlink(tmp)
                    except: pass


# ─────────────────────────────────────────────────────────────────────────────
# Mic recording — raw PCM with silence detection
# ─────────────────────────────────────────────────────────────────────────────

def _record_mic(max_secs: int = LISTEN_SECS) -> bytes:
    """Record from mic until silence or timeout. Returns raw 16-bit PCM bytes."""
    try:
        import pyaudio
        _dbg(f"Opening mic (max {max_secs}s, silence_thresh={SILENCE_THRESH})…")
        pa = pyaudio.PyAudio()
        stream = pa.open(
            rate=SAMPLE_RATE, channels=1,
            format=pyaudio.paInt16,
            input=True, frames_per_buffer=1024,
        )
        frames         = []
        silence_count  = 0
        speech_started = False
        total_chunks   = int(SAMPLE_RATE / 1024 * max_secs)
        max_energy     = 0

        for i in range(total_chunks):
            data = stream.read(1024, exception_on_overflow=False)
            frames.append(data)
            samples = struct.unpack(f"{len(data)//2}h", data)
            energy  = sum(abs(s) for s in samples) // max(len(samples), 1)
            max_energy = max(max_energy, energy)

            if energy > SILENCE_THRESH:
                if not speech_started:
                    _dbg(f"Speech detected at chunk {i} (energy={energy})")
                speech_started = True
                silence_count  = 0
            elif speech_started:
                silence_count += 1
                if silence_count >= SILENCE_FRAMES:
                    _dbg(f"Silence after {i} chunks (energy={energy}) — stopping early")
                    break

        stream.stop_stream()
        stream.close()
        pa.terminate()

        raw = b"".join(frames)
        secs = len(raw) // 2 / SAMPLE_RATE
        _dbg(f"Recorded {secs:.1f}s, max_energy={max_energy}, speech_started={speech_started}")

        if not speech_started:
            _dbg("No speech energy detected — discarding audio")
            return b""
        return raw

    except ImportError:
        _dbg("ERROR: pyaudio not installed. Run: pip install pyaudio")
        return b""
    except Exception as e:
        _dbg(f"ERROR recording mic: {e}")
        return b""


# ─────────────────────────────────────────────────────────────────────────────
# TTS — edge-tts (streams, 0 local RAM) with pyttsx3 fallback
# ─────────────────────────────────────────────────────────────────────────────

def _speak(text: str):
    """
    Speak text aloud. Priority:
      1. edge-tts  → sounddevice (best quality, free)
      2. edge-tts  → PowerShell SoundPlayer (Windows WAV fallback)
      3. pyttsx3   → SAPI5 (Windows native, zero install)
      4. print     → last resort
    """
    if not text:
        return
    _dbg(f"Speaking: '{text[:80]}'")
    t0 = time.time()

    # ── 1. edge-tts + sounddevice/soundfile ──────────────────────────────────
    try:
        import asyncio, edge_tts, sys
        import tempfile as _tf

        async def _save_mp3(mp3_path: str):
            comm = edge_tts.Communicate(text, "en-US-GuyNeural", rate="-10%")
            await comm.save(mp3_path)

        with _tf.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
            mp3_path = f.name

        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(_save_mp3(mp3_path))
        finally:
            loop.close()

        if not os.path.exists(mp3_path) or os.path.getsize(mp3_path) < 100:
            raise RuntimeError("edge-tts produced empty file")

        played = False

        # Try soundfile + sounddevice first (cross-platform, best)
        if not played:
            try:
                import soundfile as sf
                import sounddevice as sd
                data, rate = sf.read(mp3_path, dtype="float32")
                sd.play(data, rate)
                sd.wait()
                played = True
                _dbg(f"TTS via sounddevice in {time.time()-t0:.2f}s")
            except Exception as e:
                _dbg(f"sounddevice play failed: {e}")

        # Windows: convert mp3→wav, play via winsound
        if not played and sys.platform == "win32":
            try:
                from pydub import AudioSegment
                import subprocess as _sp
                with _tf.NamedTemporaryFile(suffix=".wav", delete=False) as wf:
                    wav_path = wf.name
                seg = AudioSegment.from_mp3(mp3_path)
                seg.export(wav_path, format="wav")
                import winsound
                winsound.PlaySound(wav_path, winsound.SND_FILENAME)
                os.unlink(wav_path)
                played = True
                _dbg(f"TTS via winsound in {time.time()-t0:.2f}s")
            except Exception as e:
                _dbg(f"winsound play failed: {e}")

        # Windows PowerShell fallback (plays mp3 via Windows Media Player)
        if not played and sys.platform == "win32":
            try:
                import subprocess as _sp
                _sp.run(
                    ["powershell", "-c",
                     f"$p=New-Object System.Windows.Media.MediaPlayer;"
                     f"$p.Open([Uri]::new('{mp3_path}'));"
                     f"$p.Play(); Start-Sleep -Milliseconds ("
                     f"(Get-Item '{mp3_path}').Length/32768*1000 + 1000);"
                     f"$p.Close()"],
                    timeout=60, check=False, capture_output=True
                )
                played = True
                _dbg(f"TTS via PowerShell in {time.time()-t0:.2f}s")
            except Exception as e:
                _dbg(f"PowerShell play failed: {e}")

        try: os.unlink(mp3_path)
        except: pass

        if played:
            return
    except ImportError:
        _dbg("edge-tts not installed — trying pyttsx3")
    except Exception as e:
        _dbg(f"edge-tts failed: {e} — trying pyttsx3")

    # ── 2. pyttsx3 (SAPI5 on Windows — zero install, always works) ──────────
    try:
        import pyttsx3
        eng = pyttsx3.init()
        eng.setProperty("rate", 155)
        # SAPI5 voices — pick the best available male voice
        voices = eng.getProperty("voices")
        for v in voices:
            if any(w in v.name.lower() for w in ("david", "mark", "guy", "male")):
                eng.setProperty("voice", v.id)
                break
        eng.say(text)
        eng.runAndWait()
        _dbg(f"TTS (pyttsx3) done in {time.time()-t0:.2f}s")
        return
    except ImportError:
        _dbg("pyttsx3 not installed")
    except Exception as e:
        _dbg(f"pyttsx3 failed: {e}")

    # ── 3. Windows SAPI via PowerShell (no deps needed ever) ─────────────────
    try:
        import sys as _sys, subprocess as _sp
        if _sys.platform == "win32":
            ps = (
                f"Add-Type -AssemblyName System.Speech; "
                f"$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
                f"$s.Rate = -2; "
                f"$s.Speak([System.String]'{text.replace(chr(39), '')}'); "
                f"$s.Dispose()"
            )
            _sp.run(["powershell", "-c", ps], timeout=30, check=False, capture_output=True)
            _dbg(f"TTS (SAPI PowerShell) done in {time.time()-t0:.2f}s")
            return
    except Exception as e:
        _dbg(f"SAPI PowerShell failed: {e}")

    # ── 4. Last resort: print ─────────────────────────────────────────────────
    print(f"  [BERU says] {text}", flush=True)


# ─────────────────────────────────────────────────────────────────────────────
# Response trimmer
# ─────────────────────────────────────────────────────────────────────────────

def _trim(text: str, max_chars: int = 300) -> str:
    had_code = "```" in text
    text = re.sub(r"```[\s\S]*?```", "", text)
    text = re.sub(r"`([^`\n]+)`", r"\1", text)
    text = re.sub(r"\*{1,2}(.*?)\*{1,2}", r"\1", text)
    text = re.sub(r"#{1,6}\s+", "", text)
    text = re.sub(r"\n{2,}", ". ", text)
    text = re.sub(r"\s{2,}", " ", text).strip()
    suffix = " I've put the code in the chat." if had_code else ""
    if len(text) <= max_chars:
        return (text + suffix).strip()
    sents = re.split(r"(?<=[.!?])\s+", text)
    out = ""
    for s in sents:
        if len(out) + len(s) > max_chars:
            break
        out += s + " "
    return ((out.strip() or text[:max_chars] + "…") + suffix).strip()


# ─────────────────────────────────────────────────────────────────────────────
# Main daemon class
# ─────────────────────────────────────────────────────────────────────────────

class LightVoiceDaemon:
    """
    BERU light voice daemon.

    Idle RAM: ~80 MB (whisper-tiny int8 CPU + openwakeword ONNX)
    NO local LLM is ever loaded. Complex queries go to API only.
    """

    def __init__(
        self,
        provider:  str  = "auto",
        api_key:   str  = None,
        model:     str  = None,
        base_url:  str  = None,
        whisper_model:  str = WHISPER_MODEL,
        on_state_change: Optional[Callable[[str], None]] = None,
    ):
        _dbg("LightVoiceDaemon.__init__ — initialising (no LLM loaded)")
        self._llm    = _LLMClient(provider=provider, api_key=api_key,
                                  model=model, base_url=base_url)
        self._stt    = _WhisperSTT(model_size=whisper_model)
        self._wwd    = None
        self._on_state = on_state_change
        self._state    = "IDLE"
        self._stop_ev  = threading.Event()
        self._wake_ev  = threading.Event()
        self._thread: Optional[threading.Thread] = None

    # ── Public API ──────────────────────────────────────────────────────────

    def start(self):
        _dbg("start() called — spinning up wake word + main loop")
        self._stop_ev.clear()
        self._wwd = self._init_wake_word()
        self._wwd.start()
        self._thread = threading.Thread(
            target=self._loop, daemon=True, name="beru-light-voice"
        )
        self._thread.start()
        print(f"\n  [BERU] Light daemon online", flush=True)
        print(f"  [BERU] STT : faster-whisper-{self._stt._model_size} ({'ready' if self._stt.available else 'UNAVAILABLE'})", flush=True)
        print(f"  [BERU] LLM : {self._llm._backend} ({'ready' if self._llm.available else 'no key — Tier 2 disabled'})", flush=True)
        print(f"  [BERU] Wake: {self._wwd.backend}", flush=True)
        print(f"  [BERU] Say 'Beru' to activate\n", flush=True)

    def stop(self):
        _dbg("stop() called")
        self._stop_ev.set()
        if self._wwd:
            self._wwd.stop()
        if self._thread:
            self._thread.join(timeout=4)

    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    @property
    def state(self) -> str:
        return self._state

    def say(self, text: str, async_: bool = False):
        """Speak text immediately (compat with old LightDaemon API)."""
        if async_:
            threading.Thread(target=_speak, args=(text,), daemon=True).start()
        else:
            _speak(text)

    def listen_once(self) -> Optional[str]:
        """Capture one utterance and return transcription."""
        pcm = _record_mic(LISTEN_SECS)
        if not pcm:
            return None
        return self._stt.transcribe_pcm(pcm) or None

    def info(self) -> dict:
        return {
            "state":         self._state,
            "stt":           f"faster-whisper-{self._stt._model_size}" if self._stt.available else "unavailable",
            "tts":           "edge-tts → pyttsx3 → print",
            "stt_ready":     self._stt.available,
            "llm":           self._llm._backend,
            "llm_available": self._llm.available,
            "wake_word":     self._wwd.backend if self._wwd else "not started",
        }

    # ── Internals ────────────────────────────────────────────────────────────

    def _set_state(self, s: str):
        if s != self._state:  # only log actual transitions
            _dbg(f"State: {self._state} → {s}")
        self._state = s
        if self._on_state:
            try: self._on_state(s)
            except Exception: pass

    def _init_wake_word(self):
        from axoniz.voice.wake_word import get_wake_detector
        _dbg("Initialising wake word detector…")
        return get_wake_detector(on_wake=self._on_wake)

    def _on_wake(self, word: str):
        _dbg(f"*** WAKE WORD FIRED *** '{word}' | current state: {self._state}")
        if self._state in ("LISTENING", "THINKING", "TRANSCRIBING"):
            _dbg("Ignoring wake — already processing")
            return
        self._wake_ev.set()

    def _loop(self):
        _dbg("Main event loop started")
        while not self._stop_ev.is_set():
            self._set_state("IDLE")
            fired = self._wake_ev.wait(timeout=1.0)
            if not fired:
                continue
            self._wake_ev.clear()
            if self._stop_ev.is_set():
                break

            # ── Acknowledge ─────────────────────────────────────────────────
            self._set_state("ACKNOWLEDGING")
            ack = random.choice(["Yes?", "Listening.", "Go ahead.", "Ready.", "Here."])
            _speak(ack)
            time.sleep(0.4)  # brief gap so mic doesn't capture BERU's own voice

            # ── Record ──────────────────────────────────────────────────────
            self._set_state("LISTENING")
            pcm = _record_mic(LISTEN_SECS)
            if not pcm:
                _dbg("Empty recording — no speech energy")
                _speak(random.choice(["Didn't catch that.", "Say that once more."]))
                continue

            # ── Transcribe (whisper-tiny, local, fast) ──────────────────────
            self._set_state("TRANSCRIBING")
            text = self._stt.transcribe_pcm(pcm)
            if not text:
                _dbg("Whisper returned empty string")
                _speak("Couldn't make that out.")
                continue
            print(f"  [BERU] Heard: '{text}'", flush=True)

            # ── Classify intent ─────────────────────────────────────────────
            tier = _classify(text)
            print(f"  [BERU] Tier: {tier}", flush=True)

            if tier == "stop":
                self._set_state("IDLE")
                _speak("Got it. Going quiet.")
                continue

            # ── Tier 1: local instant answer ────────────────────────────────
            if tier == "local":
                self._set_state("RESPONDING_LOCAL")
                response = _local_response(text)
                _dbg(f"Local response: '{response}'")
                _speak(response)
                continue

            # ── Tier 2: LLM API call ─────────────────────────────────────────
            self._set_state("THINKING")
            if not self._llm.available:
                _speak("I need an API key for that. "
                       "Set ANTHROPIC_API_KEY, GROQ_API_KEY, or OPENAI_API_KEY.")
                continue
            _speak(random.choice(["On it.", "One moment.", "Let me check."]))
            response = self._llm.ask(text)
            spoken   = _trim(response)
            self._set_state("SPEAKING")
            _speak(spoken)

        self._set_state("IDLE")
        _dbg("Loop exited cleanly.")


# ─────────────────────────────────────────────────────────────────────────────
# Singleton & public entry point
# ─────────────────────────────────────────────────────────────────────────────

# Keep LightDaemon as alias so old code doesn't break
LightDaemon = LightVoiceDaemon

_daemon: Optional[LightVoiceDaemon] = None


def start_light_daemon(
    provider:  str  = "auto",
    api_key:   str  = None,
    model:     str  = None,
    base_url:  str  = None,
    whisper_model:  str = WHISPER_MODEL,
    on_state_change: Optional[Callable] = None,
    # legacy kwargs silently ignored so old call sites don't crash
    agent=None, verbose=None, auto_start=None,
) -> LightVoiceDaemon:
    """
    Start BERU's light voice daemon in a background thread.
    No local LLM is ever loaded. Returns immediately.
    """
    global _daemon
    if _daemon is not None and _daemon.is_running():
        _dbg("Daemon already running — returning existing instance")
        return _daemon
    _dbg("Creating new LightVoiceDaemon…")
    _daemon = LightVoiceDaemon(
        provider=provider,
        api_key=api_key,
        model=model,
        base_url=base_url,
        whisper_model=whisper_model,
        on_state_change=on_state_change,
    )
    _daemon.start()
    return _daemon


def get_daemon() -> Optional[LightVoiceDaemon]:
    return _daemon
