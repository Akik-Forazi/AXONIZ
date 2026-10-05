"""
axoniz/voice/wake_word.py
=========================
Always-on wake word detector. Runs in background thread.
Fires on_wake(word) the moment BERU's name is heard.

Backends tried in order (fully offline first):
  1. openwakeword  — ONNX model, ~1MB, zero latency, zero network
                     pip install openwakeword pyaudio
  2. pvporcupine   — Picovoice local engine (free API key needed)
                     pip install pvporcupine pyaudio
  3. sr_polling    — SpeechRecognition short-clip polling
                     pip install SpeechRecognition pyaudio
                     (uses pocketsphinx offline or Google STT online)
"""

import logging
import threading
import time
from typing import Callable, List, Optional

logger = logging.getLogger("axoniz.voice.wake_word")

WAKE_WORDS = ["beru activate", "beru", "shadow monarch", "marshal", "my liege"]


class WakeWordDetector:
    """Always-on wake word listener. Non-blocking — runs as daemon thread."""

    def __init__(
        self,
        on_wake: Callable[[str], None],
        wake_words: List[str] = None,
        sensitivity: float = 0.5,
    ):
        self.on_wake     = on_wake
        self.wake_words  = [w.lower() for w in (wake_words or WAKE_WORDS)]
        self.sensitivity = sensitivity
        self._stop_ev    = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._backend    = self._detect_backend()
        self._active     = False   # True while in cooldown after wake

    # ── backend detection ─────────────────────────────────────────────────────

    def _detect_backend(self) -> str:
        # For multi-word phrases like "beru activate", openwakeword can't score
        # them directly — its pretrained models are single keywords only.
        # Prefer sr_polling or whisper_polling for text-based matching.
        primary = self.wake_words[0] if self.wake_words else ""
        needs_text_match = " " in primary

        candidates = [
            ("openwakeword",     "openwakeword"),
            ("pvporcupine",      "pvporcupine"),
            ("speech_recognition", "sr_polling"),
        ]
        for mod, name in candidates:
            try:
                __import__(mod)
                if name == "openwakeword" and needs_text_match:
                    continue   # skip — can't match multi-word phrases
                return name
            except ImportError:
                pass
        # faster-whisper is already a dep of light_daemon — use it as final fallback
        try:
            __import__("faster_whisper")
            return "whisper_polling"
        except ImportError:
            pass
        # Last resort: openwakeword even for multi-word (matches on "beru" substring)
        try:
            import openwakeword  # noqa
            return "openwakeword"
        except ImportError:
            pass
        return "none"

    @property
    def backend(self) -> str:
        return self._backend

    # ── lifecycle ─────────────────────────────────────────────────────────────

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop_ev.clear()
        self._thread = threading.Thread(
            target=self._run, daemon=True, name="beru-wake"
        )
        self._thread.start()
        logger.info(
            f"[WakeWord] started | backend={self._backend} | words={self.wake_words}"
        )

    def stop(self):
        self._stop_ev.set()
        if self._thread:
            self._thread.join(timeout=3)
        logger.info("[WakeWord] stopped")

    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    # ── dispatch ──────────────────────────────────────────────────────────────

    def _run(self):
        runners = {
            "openwakeword":   self._run_openwakeword,
            "pvporcupine":    self._run_porcupine,
            "sr_polling":     self._run_sr_polling,
            "whisper_polling": self._run_whisper_polling,
        }
        fn = runners.get(self._backend)
        if fn:
            fn()
        else:
            logger.warning("[WakeWord] no audio backend found — wake word disabled")
            logger.warning(
                "[WakeWord] install: pip install faster-whisper pyaudio"
            )

    def _fire(self, word: str):
        """Fire the wake callback with a cooldown so it doesn't double-trigger."""
        if self._active:
            return
        self._active = True
        logger.info(f"[WakeWord] *** WAKE *** '{word}'")
        try:
            self.on_wake(word)
        except Exception as e:
            logger.error(f"[WakeWord] on_wake error: {e}")
        # cooldown — reset _active after 2 seconds in background so caller returns immediately
        def _reset():
            time.sleep(2.0)
            self._active = False
        threading.Thread(target=_reset, daemon=True).start()


    # ── openwakeword backend ──────────────────────────────────────────────────

    def _run_openwakeword(self):
        try:
            import numpy as np
            from openwakeword.model import Model
            import openwakeword.utils as oww_utils
            import os, glob

            use_pyaudio = True
            try:
                import pyaudio
            except Exception:
                use_pyaudio = False
                import sounddevice as sd
                import queue

            # ── Ensure models are downloaded ─────────────────────────────────
            # openwakeword needs its ONNX files present. Download if missing.
            resources_dir = os.path.join(
                os.path.dirname(oww_utils.__file__), "resources", "models"
            )
            if not os.path.isdir(resources_dir) or not glob.glob(
                os.path.join(resources_dir, "*.onnx")
            ):
                logger.info("[WakeWord] openwakeword models not found — downloading…")
                try:
                    oww_utils.download_models()
                    logger.info("[WakeWord] models downloaded.")
                except Exception as dl_err:
                    logger.error(f"[WakeWord] model download failed: {dl_err}")
                    raise  # fall through to sr_polling

            # ── Load model — no default model list so it uses whatever is present
            oww = Model(inference_framework="onnx")
            
            if use_pyaudio:
                pa  = pyaudio.PyAudio()
                stream = pa.open(
                    rate=16000, channels=1,
                    format=pyaudio.paInt16,
                    input=True, frames_per_buffer=1280,
                )
                logger.info("[WakeWord] openwakeword stream open (PyAudio) — listening")
            else:
                q = queue.Queue()
                def sd_callback(indata, frames, time_status, status):
                    q.put(indata.copy())
                sd_stream = sd.InputStream(
                    samplerate=16000, channels=1,
                    dtype='int16', blocksize=1280,
                    callback=sd_callback
                )
                sd_stream.start()
                logger.info("[WakeWord] openwakeword stream open (sounddevice) — listening")

            while not self._stop_ev.is_set():
                if use_pyaudio:
                    raw   = stream.read(1280, exception_on_overflow=False)
                    audio = np.frombuffer(raw, dtype=np.int16)
                else:
                    try:
                        audio_chunk = q.get(timeout=0.2)
                        audio = audio_chunk[:, 0]
                    except queue.Empty:
                        continue
                        
                for name, score in oww.predict(audio).items():
                    if score >= self.sensitivity:
                        # Fire on any loaded model OR explicit wake-word match
                        if any(w in name.lower() for w in self.wake_words) or score >= 0.7:
                            self._fire(name.lower())

            if use_pyaudio:
                stream.stop_stream()
                stream.close()
                pa.terminate()
            else:
                sd_stream.stop()
                sd_stream.close()

        except Exception as e:
            logger.error(f"[WakeWord] openwakeword crashed: {e}")
            logger.info("[WakeWord] falling back to whisper_polling")
            self._backend = "whisper_polling"
            self._run_whisper_polling()

    # ── Porcupine backend ─────────────────────────────────────────────────────

    def _run_porcupine(self):
        try:
            import pvporcupine
            import pyaudio
            import struct

            porcupine = pvporcupine.create(keywords=["bumblebee"])
            pa     = pyaudio.PyAudio()
            stream = pa.open(
                rate=porcupine.sample_rate, channels=1,
                format=pyaudio.paInt16, input=True,
                frames_per_buffer=porcupine.frame_length,
            )
            logger.info("[WakeWord] porcupine stream open — listening")

            while not self._stop_ev.is_set():
                raw = stream.read(porcupine.frame_length, exception_on_overflow=False)
                pcm = struct.unpack_from("h" * porcupine.frame_length, raw)
                if porcupine.process(pcm) >= 0:
                    self._fire("beru")

            stream.close()
            pa.terminate()
            porcupine.delete()

        except Exception as e:
            logger.error(f"[WakeWord] porcupine crashed: {e}")
            self._backend = "sr_polling"
            self._run_sr_polling()

    # ── SpeechRecognition polling fallback ────────────────────────────────────

    def _run_sr_polling(self):
        """
        Record short clips and check transcription for wake words.
        Uses pocketsphinx (offline) if available, else Google STT.
        """
        try:
            import speech_recognition as sr
        except ImportError:
            logger.warning("[WakeWord] speech_recognition not installed — "
                           "falling back to whisper_polling")
            self._backend = "whisper_polling"
            self._run_whisper_polling()
            return

        try:
            r = sr.Recognizer()
            r.energy_threshold       = 250
            r.dynamic_energy_threshold = True
            r.pause_threshold        = 0.5
            mic = sr.Microphone()

            with mic as source:
                r.adjust_for_ambient_noise(source, duration=1.0)
            logger.info("[WakeWord] sr_polling — listening (short clips)")

            while not self._stop_ev.is_set():
                try:
                    with mic as source:
                        audio = r.listen(source, timeout=5, phrase_time_limit=3)

                    text = ""
                    try:
                        text = r.recognize_sphinx(audio).lower()
                    except Exception:
                        try:
                            text = r.recognize_google(audio).lower()
                        except Exception:
                            continue

                    if text:
                        for w in self.wake_words:
                            if w in text:
                                self._fire(w)
                                break

                except sr.WaitTimeoutError:
                    continue
                except Exception as e:
                    logger.debug(f"[WakeWord] clip error: {e}")
                    time.sleep(0.3)

        except Exception as e:
            logger.error(f"[WakeWord] sr_polling fatal: {e}")

    # ── Whisper polling fallback (uses faster-whisper if available) ───────────

    def _run_whisper_polling(self):
        """
        Last-resort fallback: record 2s clips with pyaudio and transcribe
        with faster-whisper-tiny locally. No network, no extra install beyond
        what the light daemon already needs.
        """
        try:
            import wave
            import tempfile
            import struct
            from faster_whisper import WhisperModel

            use_pyaudio = True
            try:
                import pyaudio
            except Exception:
                use_pyaudio = False
                import sounddevice as sd

            logger.info("[WakeWord] whisper_polling — loading tiny model…")
            model = WhisperModel("tiny", device="cpu", compute_type="int8")
            
            if use_pyaudio:
                pa = pyaudio.PyAudio()
                logger.info("[WakeWord] whisper_polling — listening (2s clips via PyAudio)")
            else:
                logger.info("[WakeWord] whisper_polling — listening (2s clips via sounddevice)")

            while not self._stop_ev.is_set():
                try:
                    if use_pyaudio:
                        stream = pa.open(
                            rate=16000, channels=1,
                            format=pyaudio.paInt16,
                            input=True, frames_per_buffer=1024,
                        )
                        frames = [stream.read(1024, exception_on_overflow=False)
                                  for _ in range(32)]  # ~2s
                        stream.stop_stream()
                        stream.close()
                        raw = b"".join(frames)
                    else:
                        # Record 2s using sounddevice
                        raw_data = sd.rec(int(16000 * 2), samplerate=16000, channels=1, dtype='int16')
                        sd.wait()
                        raw = raw_data.tobytes()

                    # Quick energy check — skip silence
                    samples = struct.unpack(f"{len(raw)//2}h", raw)
                    if sum(abs(s) for s in samples) // len(samples) < 150:
                        continue

                    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                        tmp = f.name
                        with wave.open(f, "wb") as wf:
                            wf.setnchannels(1)
                            wf.setsampwidth(2)
                            wf.setframerate(16000)
                            wf.writeframes(raw)

                    segs, _ = model.transcribe(tmp, language="en", beam_size=1)
                    text = " ".join(s.text for s in segs).lower().strip()
                    try:
                        import os; os.unlink(tmp)
                    except Exception:
                        pass

                    if text:
                        logger.debug(f"[WakeWord] whisper clip: '{text}'")
                        for w in self.wake_words:
                            if w in text:
                                self._fire(w)
                                break

                except Exception as e:
                    logger.debug(f"[WakeWord] whisper clip error: {e}")
                    time.sleep(0.5)

            if use_pyaudio:
                pa.terminate()

        except ImportError as e:
            logger.error(f"[WakeWord] whisper_polling needs faster-whisper + pyaudio/sounddevice: {e}")
        except Exception as e:
            logger.error(f"[WakeWord] whisper_polling fatal: {e}")


# ── singleton ─────────────────────────────────────────────────────────────────

_wwd: Optional[WakeWordDetector] = None


def get_wake_detector(on_wake: Callable, **kwargs) -> WakeWordDetector:
    global _wwd
    if _wwd is None:
        _wwd = WakeWordDetector(on_wake=on_wake, **kwargs)
    return _wwd
