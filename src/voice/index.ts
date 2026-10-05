/**
 * src/voice/index.ts
 * ====================
 * AXONIZ voice stack — offline-first.
 *
 * STT:   Moonshine → faster-whisper → whisper → SpeechRecognition
 * TTS:   Kokoro-82M → Piper → edge-tts → pyttsx3
 * Wake:  openwakeword → sr_polling
 *
 * Quick start:
 *   import { start_light_daemon } from "./index.js";
 *   const d = start_light_daemon();   // boots in the background
 *   d.say("AXONIZ is online.");
 *
 * ── Node capability note ─────────────────────────────────────────────────────
 * The Python engines named above are Python-only and not installable here. The
 * public surface below is identical; the working path is `msedge-tts`, and STT /
 * wake word / audio I/O use runtime-registered backends
 * (`registerSTTBackend`, `registerWakeDetector`, `setAudioInputDriver`).
 * Degraded calls return or emit a descriptive `[ERROR] …` string.
 */

import { TTSEngine, get_tts } from "./tts.js";
import { STTEngine, get_stt } from "./stt.js";
import { WakeWordDetector, get_wake_detector } from "./wake_word.js";
import { VoiceLoop, start_voice_loop, get_voice_loop } from "./voice_loop.js";
import { LightDaemon, start_light_daemon, get_daemon } from "./light_daemon.js";

export {
  TTSEngine,
  get_tts,
  STTEngine,
  get_stt,
  WakeWordDetector,
  get_wake_detector,
  VoiceLoop,
  start_voice_loop,
  get_voice_loop,
  LightDaemon,
  start_light_daemon,
  get_daemon,
};

/* ── Extra surface (Node port) ─────────────────────────────────────────────────
 * camelCase aliases plus the runtime-registration seams for the capabilities
 * whose Python engines have no Node equivalent.
 * --------------------------------------------------------------------------- */

export { getTts, registerTTSBackend, unregisterTTSBackend, speakWithFallback } from "./tts.js";
export { getStt, registerSTTBackend, unregisterSTTBackend } from "./stt.js";
export { getWakeDetector, registerWakeDetector, registerClipRecognizer } from "./wake_word.js";

export {
  /** Register a live microphone capture driver (was `sounddevice`/`pyaudio`). */
  setAudioInputDriver,
  getAudioInputDriver,
  /** Register a live playback driver (was `soundplay`/`sounddevice`). */
  setAudioOutputDriver,
  getAudioOutputDriver,
  writeWav,
  readWav,
  encodeWavPcm16,
  SAMPLE_RATE as AUDIO_SAMPLE_RATE,
  type AudioInputDriver,
  type AudioOutputDriver,
  type AudioRecordOptions,
} from "./wav.js";

export { LightVoiceDaemon, LightDaemon as LightDaemonAlias, getDaemon, startLightDaemon } from "./light_daemon.js";
export { getVoiceLoop, startVoiceLoop, VoiceState } from "./voice_loop.js";
export { getTts as getTTSEngine } from "./tts.js";

/** Python `__init__.py` `__all__` equivalent. */
export const __all__ = [
  "TTSEngine",
  "get_tts",
  "STTEngine",
  "get_stt",
  "WakeWordDetector",
  "get_wake_detector",
  "VoiceLoop",
  "start_voice_loop",
  "get_voice_loop",
  "LightDaemon",
  "start_light_daemon",
  "get_daemon",
] as const;
