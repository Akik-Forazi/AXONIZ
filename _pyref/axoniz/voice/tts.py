"""
axoniz/voice/tts.py
====================
BERU Text-to-Speech â€” offline-first, best quality available.

Provider priority:
  1. kokoro-onnx â€” 82M params, Apache 2.0, best quality/size ratio
  2. piper        â€” fastest CPU TTS
  3. edge-tts     â€” free Microsoft cloud TTS (needs internet)
  4. pyttsx3      â€” offline COM/espeak fallback

Model files (kokoro):
  kokoro-v1.0.int8.onnx   (88MB  â€” recommended, CPU-optimized)
  kokoro-v1.0.onnx         (310MB â€” full quality)
  voices-v1.0.bin          (voice embeddings, always required)

These are searched in: cwd â†’ ~/.axoniz/voice_models â†’ ~/Downloads
"""

import asyncio
import logging
import os
import subprocess
import sys
import tempfile
import threading
from typing import Optional

logger = logging.getLogger("axoniz.voice.tts")

# - Voice config -------------------------------
KOKORO_VOICE = os.environ.get("BERU_KOKORO_VOICE",  "am_liam")    # male, deep
KOKORO_SPEED = float(os.environ.get("BERU_KOKORO_SPEED", "0.95"))
PIPER_VOICE  = os.environ.get("BERU_PIPER_VOICE",   "en_US-lessac-medium")
EDGE_VOICE   = os.environ.get("BERU_EDGE_VOICE",    "en-US-GuyNeural")
EDGE_RATE    = os.environ.get("BERU_EDGE_RATE",     "-10%")
SAMPLE_RATE  = 24000   # Kokoro native

# MMS-TTS-OSS configuration
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MMS_MODEL_PATH = os.path.join(PROJECT_ROOT, "mms-tts-oss")

# ✅ FIX #1: MODULE-LEVEL GLOBALS FOR SINGLETON PATTERN
_GLOBAL_KOKORO = None  # ← Kokoro model singleton
_tts = None            # ← TTS engine singleton


# - Model file search ----------------------------â”€
AXONIZ_HOME  = os.path.expanduser("~/.axoniz")
VOICE_MODELS = os.path.join(AXONIZ_HOME, "voice_models")

# kokoro-onnx expects the ONNX file and voices file in the same directory
# or you can pass paths explicitly
_ONNX_NAMES = [
    "kokoro-v1.0.int8.onnx",   # int8, 88MB â€” preferred
    "kokoro-v1.0.onnx",         # f32,  310MB
    "kokoro-v1.0.fp16.onnx",   # fp16, 169MB
]
_VOICES_NAME = "voices-v1.0.bin"

_SEARCH_DIRS = [
    PROJECT_ROOT,
    os.getcwd(),
    VOICE_MODELS,
    os.path.expanduser("~/Downloads"),
    os.path.expanduser("~"),
]


def _find_kokoro_models() -> tuple:
    """
    Search common locations for Kokoro model files.
    Returns (onnx_path, voices_path) or (None, None) if not found.
    """
    onnx_path   = None
    voices_path = None

    for d in _SEARCH_DIRS:
        # Find ONNX model (try names in preference order)
        if onnx_path is None:
            for name in _ONNX_NAMES:
                p = os.path.join(d, name)
                if os.path.exists(p) and os.path.getsize(p) > 1024 * 1024:
                    onnx_path = p
                    break

        # Find voices file
        if voices_path is None:
            p = os.path.join(d, _VOICES_NAME)
            if os.path.exists(p) and os.path.getsize(p) > 1024:
                voices_path = p

        if onnx_path and voices_path:
            break

    return onnx_path, voices_path


class TTSEngine:
    """BERU's voice output engine â€” offline-first, highest quality available."""

    def __init__(
        self,
        voice:    str   = None,
        rate:     str   = EDGE_RATE,
        volume:   str   = "+0%",
        provider: str   = "auto",
        speed:    float = KOKORO_SPEED,
    ):
        self.rate     = rate
        self.volume   = volume
        self.speed    = speed
        self.provider = provider
        self._backend = self._detect_backend()
        self._model   = None
        self._onnx_path   = None
        self._voices_path = None
        self.voice = voice or self._default_voice()

    # - Backend detection --------------------------â”€

    def _detect_backend(self) -> str:
        if self.provider != "auto":
            return self.provider

        # 1. Kokoro (best quality offline)
        try:
            import kokoro_onnx  # noqa
            import sounddevice  # noqa
            onnx, voices = _find_kokoro_models()
            if onnx and voices:
                return "kokoro"
        except (ImportError, Exception):
            pass

        # 2. MMS-TTS (Robust local VITS)
        # Only check if path exists, don't import yet
        if os.path.exists(MMS_MODEL_PATH):
            # Check for files that indicate a model is there
            if os.path.exists(os.path.join(MMS_MODEL_PATH, "config.json")):
                return "mms"

        # 2. Piper
        try:
            import piper  # noqa
            return "piper"
        except (ImportError, Exception):
            pass
        if _which("piper") or _which("piper-tts"):
            return "piper_bin"

        # 3. edge-tts
        try:
            import edge_tts  # noqa
            return "edge"
        except (ImportError, Exception):
            pass

        # 4. pyttsx3
        try:
            import pyttsx3  # noqa
            return "pyttsx3"
        except (ImportError, Exception):
            pass

        return "print"

    def _default_voice(self) -> str:
        return {
            "kokoro":    KOKORO_VOICE,
            "piper":     PIPER_VOICE,
            "piper_bin": PIPER_VOICE,
            "edge":      EDGE_VOICE,
            "pyttsx3":   "",
            "print":     "",
        }.get(self._backend, "")

    @property
    def is_available(self) -> bool:
        return self._backend not in ("print", "none")

    # - Public API ------------------------------

    def speak(self, text: str) -> bool:
        if not text or not text.strip():
            return False
        
        # Define priority order
        backends = []
        if self._backend == "auto":
            backends = ["kokoro", "mms", "edge", "pyttsx3"]
        else:
            backends = [self._backend]

        for b in backends:
            try:
                if b == "mms":
                    if self._speak_mms(text): return True
                elif b == "kokoro":
                    if self._speak_kokoro(text): return True
                elif b == "piper":
                    if self._speak_piper(text): return True
                elif b == "edge":
                    if self._speak_edge(text): return True
                elif b == "pyttsx3":
                    if self._speak_pyttsx3(text): return True
            except Exception as e:
                logger.debug(f"[TTS] Backend {b} failed: {e}, trying next...")
                continue
        
        print(f"[BERU] {text}")
        return True

    def speak_async(self, text: str):
        threading.Thread(target=self.speak, args=(text,), daemon=True).start()

    def synthesize_to_file(self, text: str, path: str) -> bool:
        try:
            if self._backend == "mms":
                return self._mms_to_file(text, path)
            elif self._backend == "kokoro":
                return self._kokoro_to_file(text, path)
            elif self._backend == "edge":
                return self._edge_to_file(text, path)
            return False
        except Exception as e:
            logger.debug(f"[TTS] file synthesis failed: {e}")
            return False

    def synthesize_to_bytes(self, text: str) -> Optional[bytes]:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            tmp = f.name
        try:
            if self.synthesize_to_file(text, tmp):
                with open(tmp, "rb") as f:
                    return f.read()
        finally:
            try: os.unlink(tmp)
            except: pass
        return None

    # - MMS-TTS -------------------------------â”€

    def _get_mms_model(self):
        if self._model is None:
            import torch
            from transformers import VitsModel, AutoTokenizer
            logger.info(f"[TTS] Loading MMS-TTS from: {MMS_MODEL_PATH}")
            try:
                tokenizer = AutoTokenizer.from_pretrained(MMS_MODEL_PATH)
                model = VitsModel.from_pretrained(MMS_MODEL_PATH)
                # Keep on CPU for lightness
                model = model.to("cpu")
                self._model = (tokenizer, model)
            except Exception as e:
                logger.error(f"[TTS] Failed to load MMS-TTS: {e}")
                raise
        return self._model

    def _speak_mms(self, text: str) -> bool:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            tmp = f.name
        try:
            if self._mms_to_file(text, tmp):
                return _play_file(tmp)
        finally:
            try: 
                if os.path.exists(tmp): os.unlink(tmp)
            except: pass
        return False

    def _mms_to_file(self, text: str, path: str) -> bool:
        try:
            import torch
            import scipy.io.wavfile as wavfile
            tokenizer, model = self._get_mms_model()
            inputs = tokenizer(text, return_tensors="pt")
            with torch.no_grad():
                output = model(**inputs).waveform
            # Squeeze and move to numpy
            audio_data = output.squeeze().float().cpu().numpy()
            wavfile.write(path, rate=model.config.sampling_rate, data=audio_data)
            return True
        except Exception as e:
            logger.debug(f"[TTS] MMS file error: {e}")
            return False

# - Kokoro --------------------------------

    _GLOBAL_KOKORO = None

    def _get_kokoro(self):
        global _GLOBAL_KOKORO
        if _GLOBAL_KOKORO is None:
            from kokoro_onnx import Kokoro
            onnx, voices = _find_kokoro_models()
            if not onnx or not voices:
                raise RuntimeError(
                    "Kokoro model files not found. "
                    "Run: python -m axoniz.voice.setup"
                )
            self._onnx_path   = onnx
            self._voices_path = voices
            model_name = os.path.basename(onnx)
            logger.info(f"[TTS] Loading Kokoro globally: {model_name}")
            _GLOBAL_KOKORO = Kokoro(onnx, voices)
        
        self._model = _GLOBAL_KOKORO
        return self._model

    def _speak_kokoro(self, text: str) -> bool:
        try:
            import sounddevice as sd
            kokoro = self._get_kokoro()
            samples, rate = kokoro.create(text, voice=self.voice,
                                           speed=self.speed, lang="en-us")
            sd.play(samples, rate)
            sd.wait()
            return True
        except Exception as e:
            logger.debug(f"[TTS] Kokoro speak error: {e}")
            try:
                return self._kokoro_play_via_file(text)
            except Exception:
                return False

    def _kokoro_to_file(self, text: str, path: str) -> bool:
        try:
            import soundfile as sf
            kokoro = self._get_kokoro()
            samples, rate = kokoro.create(text, voice=self.voice,
                                           speed=self.speed, lang="en-us")
            sf.write(path, samples, rate)
            return True
        except Exception as e:
            import traceback
            traceback.print_exc()
            logger.debug(f"[TTS] Kokoro file error: {e}")
            return False

    def _kokoro_play_via_file(self, text: str) -> bool:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            tmp = f.name
        try:
            if self._kokoro_to_file(text, tmp):
                return _play_file(tmp)
        finally:
            try: os.unlink(tmp)
            except: pass
        return False

    # - Piper --------------------------------â”€

    def _speak_piper(self, text: str) -> bool:
        try:
            if self._backend == "piper_bin":
                return self._speak_piper_bin(text)
            from piper import PiperVoice
            if self._model is None:
                self._model = PiperVoice.load(self.voice)
            import sounddevice as sd
            import numpy as np
            with sd.OutputStream(samplerate=self._model.config.sample_rate,
                                   channels=1, dtype="int16") as stream:
                for chunk in self._model.synthesize_stream_raw(text):
                    stream.write(np.frombuffer(chunk, dtype="int16"))
            return True
        except Exception as e:
            logger.debug(f"[TTS] Piper error: {e}")
            return False

    def _speak_piper_bin(self, text: str) -> bool:
        try:
            bin_ = _which("piper") or _which("piper-tts") or "piper"
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                tmp = f.name
            result = subprocess.run(
                [bin_, "--model", self.voice, "--output_file", tmp],
                input=text.encode("utf-8"), capture_output=True, timeout=15,
            )
            if result.returncode == 0:
                return _play_file(tmp)
        except Exception as e:
            logger.debug(f"[TTS] piper bin error: {e}")
        finally:
            try: os.unlink(tmp)
            except: pass
        return False

    # - edge-tts -------------------------------

    def _speak_edge(self, text: str) -> bool:
        try:
            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
                tmp = f.name
            if self._edge_to_file(text, tmp):
                return _play_file(tmp)
        except Exception as e:
            logger.debug(f"[TTS] edge-tts error: {e}")
        finally:
            try: os.unlink(tmp)
            except: pass
        return False

    def _edge_to_file(self, text: str, path: str) -> bool:
        try:
            import edge_tts
            async def _save():
                comm = edge_tts.Communicate(text, self.voice,
                                             rate=self.rate, volume=self.volume)
                await comm.save(path)
            loop = asyncio.new_event_loop()
            try:
                loop.run_until_complete(_save())
            finally:
                loop.close()
            return os.path.exists(path) and os.path.getsize(path) > 0
        except Exception as e:
            logger.debug(f"[TTS] edge-tts file error: {e}")
            return False

    # - pyttsx3 -------------------------------â”€

    def _speak_pyttsx3(self, text: str) -> bool:
        try:
            import pyttsx3
            engine = pyttsx3.init()
            engine.setProperty("rate", 155)
            engine.say(text)
            engine.runAndWait()
            return True
        except Exception as e:
            logger.debug(f"[TTS] pyttsx3 error: {e}")
            return False

    # - Info ---------------------------------

    def info(self) -> dict:
        onnx, voices = _find_kokoro_models()
        return {
            "backend":     self._backend,
            "voice":       self.voice,
            "rate":        self.rate,
            "available":   self.is_available,
            "kokoro_onnx": os.path.basename(onnx) if onnx else None,
        }

    def set_voice(self, voice: str):
        self.voice  = voice
        self._model = None

    def set_speed(self, speed: float):
        self.speed = speed


# - Audio playback ------------------------------

def _play_file(path: str) -> bool:
    try:
        import soundfile as sf
        import sounddevice as sd
        data, rate = sf.read(path, dtype="float32")
        sd.play(data, rate)
        sd.wait()
        return True
    except Exception:
        pass
    try:
        if sys.platform == "win32":
            import winsound
            winsound.PlaySound(path, winsound.SND_FILENAME)
            return True
        elif sys.platform == "darwin":
            subprocess.run(["afplay", path], timeout=30, check=True)
            return True
        else:
            for player in ("mpg123", "ffplay", "aplay", "paplay"):
                if _which(player):
                    args = [player, "-q", path] if player != "ffplay" \
                           else [player, "-nodisp", "-autoexit", "-loglevel", "quiet", path]
                    subprocess.run(args, timeout=30)
                    return True
    except Exception as e:
        logger.debug(f"[TTS] _play_file error: {e}")
    return False


def _which(name: str) -> Optional[str]:
    import shutil
    return shutil.which(name)


# - Singleton --------------------------------â”€

_tts: Optional[TTSEngine] = None


def get_tts(provider: str = "auto", **kwargs) -> TTSEngine:
    global _tts
    if _tts is None:
        try:
            from axoniz.core.config import load_config
            cfg  = load_config()
            vcfg = cfg.get("voice", {}) or cfg.get("tts", {}) or {}
            _tts = TTSEngine(
                voice=vcfg.get("voice", None),
                rate=vcfg.get("rate", EDGE_RATE),
                speed=float(vcfg.get("speed", KOKORO_SPEED)),
                provider=vcfg.get("provider", provider),
            )
        except Exception:
            _tts = TTSEngine(provider=provider, **kwargs)
    return _tts





