"""
axoniz/voice/stt.py
====================
BERU Speech-to-Text — best offline-first stack.

Provider priority (all offline, no API keys needed):
  1. moonshine      — fastest edge STT, outperforms Whisper tiny/small
                      pip install moonshine-onnx sounddevice numpy
  2. faster-whisper — GPU-accelerated Whisper, great quality
                      pip install faster-whisper sounddevice numpy
  3. whisper-cpp    — CPU GGUF Whisper via ctranslate2
                      pip install openai-whisper sounddevice numpy
  4. speech_recognition — SpeechRecognition + pocketsphinx (offline)
                          pip install SpeechRecognition pyaudio pocketsphinx
  5. none           — no audio input available

BERU is always offline. Never sends audio to a cloud.
"""

import logging
import os
import tempfile
import threading
import wave
from typing import Optional

logger = logging.getLogger("axoniz.voice.stt")

WAKE_WORDS = ["beru activate", "beru", "shadow monarch", "marshal", "my liege"]

# Moonshine model sizes: "moonshine/tiny" or "moonshine/base"
MOONSHINE_MODEL = os.environ.get("BERU_MOONSHINE_MODEL", "moonshine/tiny")
WHISPER_MODEL   = os.environ.get("BERU_WHISPER_MODEL", "tiny")
SAMPLE_RATE     = 16000
CHUNK           = 1024


class STTEngine:
    """BERU's voice input engine — offline-first, zero cloud."""

    def __init__(self, provider: str = "auto", language: str = "en",
                 model_size: str = None):
        self.provider   = provider
        self.language   = language
        self.model_size = model_size
        self._backend   = self._detect_backend()
        self._model     = None   # lazy-loaded

    # ── Backend detection ─────────────────────────────────────────────────────

    def _detect_backend(self) -> str:
        if self.provider != "auto":
            return self.provider

        # 1. Moonshine (best edge)
        try:
            import moonshine_onnx  # noqa
            import sounddevice     # noqa
            return "moonshine"
        except ImportError:
            pass

        # 2. faster-whisper (GPU-accelerated)
        try:
            import faster_whisper  # noqa
            import sounddevice     # noqa
            return "faster_whisper"
        except ImportError:
            pass

        # 3. openai-whisper (CPU)
        try:
            import whisper    # noqa
            import sounddevice  # noqa
            return "whisper"
        except ImportError:
            pass

        # 4. SpeechRecognition + pocketsphinx (pure offline)
        try:
            import speech_recognition  # noqa
            return "speech_recognition"
        except ImportError:
            pass

        return "none"

    @property
    def is_available(self) -> bool:
        return self._backend != "none"

    # ── Public API ────────────────────────────────────────────────────────────

    def listen(self, timeout: int = 8, max_phrase: int = 30) -> Optional[str]:
        """
        Capture from microphone and return transcription.
        Blocks until phrase detected or timeout.
        """
        if not self.is_available:
            return None
        try:
            if self._backend == "moonshine":
                return self._listen_moonshine(timeout)
            elif self._backend in ("faster_whisper", "whisper"):
                return self._listen_whisper_mic(timeout)
            else:
                return self._listen_sr(timeout, max_phrase)
        except Exception as e:
            logger.debug(f"[STT] listen failed ({self._backend}): {e}")
            return None

    def transcribe(self, audio_path: str) -> Optional[str]:
        """Transcribe an audio file."""
        try:
            if self._backend == "moonshine":
                return self._transcribe_moonshine(audio_path)
            elif self._backend == "faster_whisper":
                return self._transcribe_faster_whisper(audio_path)
            elif self._backend == "whisper":
                return self._transcribe_whisper(audio_path)
            return None
        except Exception as e:
            logger.debug(f"[STT] transcribe failed: {e}")
            return None

    # ── Moonshine ─────────────────────────────────────────────────────────────

    def _get_moonshine(self):
        if self._model is None:
            from moonshine_onnx import MoonshineOnnxModel, load_audio
            model_id = self.model_size or MOONSHINE_MODEL
            logger.info(f"[STT] Loading Moonshine model: {model_id}")
            self._model = MoonshineOnnxModel(model_name=model_id)
            self._moonshine_load_audio = load_audio
        return self._model

    def _listen_moonshine(self, timeout: int) -> Optional[str]:
        """Record with sounddevice then transcribe with Moonshine."""
        audio = self._record_sounddevice(timeout)
        if audio is None:
            return None
        try:
            model = self._get_moonshine()
            tokens = model.generate(audio)
            return model.tokenizer.decode_batch(tokens)[0].strip()
        except Exception as e:
            logger.debug(f"[STT] Moonshine transcribe error: {e}")
            return None

    def _transcribe_moonshine(self, path: str) -> Optional[str]:
        try:
            model = self._get_moonshine()
            audio = self._moonshine_load_audio(path)
            tokens = model.generate(audio)
            return model.tokenizer.decode_batch(tokens)[0].strip()
        except Exception as e:
            logger.debug(f"[STT] Moonshine file error: {e}")
            return None

    # ── faster-whisper / openai-whisper ───────────────────────────────────────

    def _listen_whisper_mic(self, timeout: int) -> Optional[str]:
        """Record and transcribe with Whisper."""
        audio = self._record_sounddevice(timeout)
        if audio is None:
            return None
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            tmp = f.name
        try:
            self._save_wav(audio, tmp)
            if self._backend == "faster_whisper":
                return self._transcribe_faster_whisper(tmp)
            else:
                return self._transcribe_whisper(tmp)
        finally:
            try:
                os.unlink(tmp)
            except Exception:
                pass

    def _get_faster_whisper(self):
        if self._model is None:
            from faster_whisper import WhisperModel
            size = self.model_size or WHISPER_MODEL
            logger.info(f"[STT] Loading faster-whisper: {size}")
            self._model = WhisperModel(size, device="auto", compute_type="int8")
        return self._model

    def _transcribe_faster_whisper(self, path: str) -> Optional[str]:
        try:
            model = self._get_faster_whisper()
            segs, _ = model.transcribe(path, language=self.language,
                                        beam_size=5, best_of=5)
            return " ".join(s.text for s in segs).strip() or None
        except Exception as e:
            logger.debug(f"[STT] faster-whisper error: {e}")
            return None

    def _get_whisper(self):
        if self._model is None:
            import whisper
            size = self.model_size or WHISPER_MODEL
            logger.info(f"[STT] Loading whisper: {size}")
            self._model = whisper.load_model(size)
        return self._model

    def _transcribe_whisper(self, path: str) -> Optional[str]:
        try:
            model = self._get_whisper()
            result = model.transcribe(path, language=self.language, fp16=False)
            return result.get("text", "").strip() or None
        except Exception as e:
            logger.debug(f"[STT] whisper error: {e}")
            return None

    # ── SpeechRecognition fallback ────────────────────────────────────────────

    def _listen_sr(self, timeout: int, max_phrase: int) -> Optional[str]:
        try:
            import speech_recognition as sr
            r = sr.Recognizer()
            r.energy_threshold = 300
            r.dynamic_energy_threshold = True
            with sr.Microphone(sample_rate=SAMPLE_RATE) as source:
                r.adjust_for_ambient_noise(source, duration=0.5)
                audio = r.listen(source, timeout=timeout,
                                 phrase_time_limit=max_phrase)
            # Offline: pocketsphinx
            try:
                return r.recognize_sphinx(audio).strip() or None
            except Exception:
                pass
            # Offline: vosk
            try:
                return r.recognize_vosk(audio).strip() or None
            except Exception:
                pass
            return None
        except Exception as e:
            logger.debug(f"[STT] sr listen error: {e}")
            return None

    # ── Audio recording helper ────────────────────────────────────────────────

    def _record_sounddevice(self, timeout: int):
        """
        Record audio using sounddevice with VAD (energy-based stop).
        Returns numpy float32 array at 16kHz or None.
        """
        try:
            import sounddevice as sd
            import numpy as np

            FRAME  = 512
            THRESH = 0.02    # RMS threshold for speech
            SILENCE_FRAMES = int(SAMPLE_RATE / FRAME * 1.5)  # ~1.5s silence to stop

            frames        = []
            silence_count = 0
            total_frames  = 0
            max_frames    = int(SAMPLE_RATE / FRAME * timeout)
            speech_started = False

            def _callback(indata, n_frames, time_info, status):
                nonlocal silence_count, total_frames, speech_started
                chunk = indata[:, 0].copy()
                rms   = float(np.sqrt(np.mean(chunk ** 2)))

                if rms > THRESH:
                    speech_started = True
                    silence_count  = 0
                    frames.append(chunk)
                elif speech_started:
                    frames.append(chunk)
                    silence_count += 1

                total_frames += 1

            with sd.InputStream(samplerate=SAMPLE_RATE, channels=1,
                                 dtype="float32", blocksize=FRAME,
                                 callback=_callback):
                # Wait until speech starts + silence ends, or timeout
                start = __import__("time").time()
                while __import__("time").time() - start < timeout:
                    __import__("time").sleep(0.05)
                    if speech_started and silence_count >= SILENCE_FRAMES:
                        break
                    if total_frames >= max_frames:
                        break

            if not frames:
                return None

            audio = np.concatenate(frames)
            return audio.astype(np.float32)

        except Exception as e:
            logger.debug(f"[STT] sounddevice record failed: {e}")
            return None

    def _save_wav(self, audio, path: str):
        """Save float32 numpy array to 16-bit PCM WAV."""
        import numpy as np
        import wave
        pcm = (audio * 32767).astype(np.int16)
        with wave.open(path, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(SAMPLE_RATE)
            wf.writeframes(pcm.tobytes())

    # ── Helpers ───────────────────────────────────────────────────────────────

    def check_wake_word(self, text: str) -> bool:
        lower = text.lower()
        return any(w in lower for w in WAKE_WORDS)

    def info(self) -> dict:
        return {
            "backend":    self._backend,
            "language":   self.language,
            "available":  self.is_available,
            "wake_words": WAKE_WORDS,
            "model":      self.model_size or "(default)",
        }


# ── Singleton ─────────────────────────────────────────────────────────────────

_stt: Optional[STTEngine] = None


def get_stt(provider: str = "auto", **kwargs) -> STTEngine:
    global _stt
    if _stt is None:
        try:
            from axoniz.core.config import load_config
            cfg  = load_config()
            scfg = cfg.get("stt", {}) or {}
            _stt = STTEngine(
                provider=scfg.get("provider", provider),
                language=scfg.get("language", "en"),
                model_size=scfg.get("model_size", None),
            )
        except Exception:
            _stt = STTEngine(provider=provider, **kwargs)
    return _stt
