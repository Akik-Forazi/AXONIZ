"""
axoniz/voice/__init__.py
=========================
BERU voice stack — offline-first.

STT:   Moonshine → faster-whisper → whisper → SpeechRecognition
TTS:   Kokoro-82M → Piper → edge-tts → pyttsx3
Wake:  openwakeword → sr_polling

Quick start:
    from axoniz.voice.light_daemon import start_light_daemon
    d = start_light_daemon()          # boots in background thread
    d.say("BERU is online.")
"""

from axoniz.voice.tts         import TTSEngine, get_tts
from axoniz.voice.stt         import STTEngine, get_stt
from axoniz.voice.wake_word   import WakeWordDetector, get_wake_detector
from axoniz.voice.voice_loop  import VoiceLoop, start_voice_loop, get_voice_loop
from axoniz.voice.light_daemon import LightDaemon, start_light_daemon, get_daemon

__all__ = [
    "TTSEngine", "get_tts",
    "STTEngine", "get_stt",
    "WakeWordDetector", "get_wake_detector",
    "VoiceLoop", "start_voice_loop", "get_voice_loop",
    "LightDaemon", "start_light_daemon", "get_daemon",
]
