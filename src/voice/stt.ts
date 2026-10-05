/**
 * src/voice/stt.ts
 * =================
 * AXONIZ Speech-to-Text — offline-first.
 *
 * Python provider priority (ported verbatim into `_detectBackend()`):
 *   1. moonshine         — fastest edge STT
 *   2. faster-whisper    — GPU-accelerated Whisper
 *   3. whisper-cpp       — CPU GGUF Whisper via ctranslate2
 *   4. speech_recognition + pocketsphinx (offline)
 *   5. none              — no audio input available
 *
 * ── Node reality ─────────────────────────────────────────────────────────────
 * None of those engines exist as installable Node packages on this machine:
 *   `moonshine-onnx`, `faster-whisper`, `openai-whisper`, `SpeechRecognition`,
 *   `sounddevice`, `pyaudio` are all Python-only.
 *
 * TODO(port): STT is fully degraded. The class, its public API and its
 *   `info()` / `is_available` contract are preserved, and an engine can be
 *   plugged in at runtime with `registerSTTBackend()`. Recommended Node
 *   replacements to investigate:
 *     - `whisper.cpp` binary (`whisper-cli`) shelled out via node:child_process
 *     - `@huggingface/transformers` (Whisper ONNX) — NOT installed on this box
 *     - `vosk` / `sherpa-onnx-node` native bindings
 *
 * AXONIZ is always offline. Never sends audio to a cloud.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getLogger } from "../core/logger.js";
import { whichSync } from "../core/which.js";
import { loadConfig } from "../core/config.js";
import {
  AUDIO_INPUT_MISSING_ERROR,
  SAMPLE_RATE,
  getAudioInputDriver,
  pcm16MeanAbs,
  rmsFloat,
  writeWav,
  type AudioRecordOptions,
} from "./wav.js";

const logger = getLogger();

export const WAKE_WORDS = ["axoniz activate", "axoniz", "shadow monarch", "System", "my liege"];

/** Moonshine model sizes: "moonshine/tiny" or "moonshine/base". */
export const MOONSHINE_MODEL = process.env.AXONIZ_MOONSHINE_MODEL ?? "moonshine/tiny";
export const WHISPER_MODEL = process.env.AXONIZ_WHISPER_MODEL ?? "tiny";
export { SAMPLE_RATE };
export const CHUNK = 1024;

/** Backend ids, matching the strings the Python `_backend` attribute held. */
export type STTBackendName =
  | "auto"
  | "moonshine"
  | "faster_whisper"
  | "whisper"
  | "speech_recognition"
  | "none";

/** Actionable error text returned by `transcribe()` when no engine is wired up. */
export const STT_UNAVAILABLE_ERROR =
  "[ERROR] speech-to-text unavailable — no STT engine is installed for Node.js " +
  "(the Python stack used moonshine-onnx / faster-whisper / openai-whisper / " +
  "SpeechRecognition, none of which have installable Node equivalents here). " +
  "Enable it by registering an engine: registerSTTBackend('my-engine', impl) " +
  "(see registerSTTBackend in src/voice/stt.ts), or put a whisper.cpp " +
  "`whisper-cli` binary on PATH.";

/* ────────────────────────────────────────────────────────────────────────────
 * Pluggable backend interface (runtime-registerable engine)
 * ──────────────────────────────────────────────────────────────────────────── */

export interface STTTranscribeOptions {
  language: string;
  /** Whisper-style size hint, e.g. "tiny" / "base". */
  modelSize?: string;
}

export interface STTBackend {
  /** Human readable name shown by `info()`. */
  readonly name: string;
  /** True when the engine is actually usable (model present, binary found, …). */
  available(): boolean;
  transcribe(audioPath: string, options: STTTranscribeOptions): Promise<string | null>;
  /** Optional: transcribe raw 16-bit 16 kHz mono PCM without touching disk. */
  transcribePcm?(pcm: Buffer, options: STTTranscribeOptions): Promise<string | null>;
}

const _backends = new Map<string, STTBackend>();

/**
 * Register (or replace) an STT engine at runtime. This is the documented escape
 * hatch for the missing Python providers — see `STT_UNAVAILABLE_ERROR`.
 */
export function registerSTTBackend(name: string, backend: STTBackend): void {
  _backends.set(name, backend);
}

export function unregisterSTTBackend(name: string): void {
  _backends.delete(name);
}

export function getSTTBackend(name: string): STTBackend | undefined {
  return _backends.get(name);
}

/* ────────────────────────────────────────────────────────────────────────────
 * STTEngine
 * ──────────────────────────────────────────────────────────────────────────── */

export interface STTInfo {
  backend: string;
  language: string;
  available: boolean;
  wake_words: string[];
  model: string;
}

export class STTEngine {
  /** AXONIZ's voice input engine — offline-first, zero cloud. */
  provider: string;
  language: string;
  modelSize: string | null;

  private _backend: string;
  private _model: unknown = null;
  private _lastError = "";
  private _loggedDegraded = "";

  constructor(provider = "auto", language = "en", modelSize: string | null = null) {
    this.provider = provider;
    this.language = language;
    this.modelSize = modelSize;
    this._backend = this._detectBackend();
    this._model = null; // lazy-loaded
  }

  /* ── Backend detection ──────────────────────────────────────────────────── */

  /**
   * Mirrors the Python `_detect_backend()`. Each Python `import X` probe is
   * replaced by "is a backend registered under that id, or is its native
   * prerequisite discoverable on this machine".
   */
  private _detectBackend(): string {
    if (this.provider !== "auto") return this.provider;

    // 1. Moonshine (best edge)
    if (_backends.has("moonshine")) return "moonshine";

    // 2. faster-whisper (GPU-accelerated)
    if (_backends.has("faster_whisper")) return "faster_whisper";

    // 3. openai-whisper / whisper.cpp (CPU)
    if (_backends.has("whisper")) return "whisper";
    if (whichSync("whisper-cli") || whichSync("whisper")) return "whisper";

    // 4. SpeechRecognition + pocketsphinx (pure offline)
    if (_backends.has("speech_recognition")) return "speech_recognition";

    return "none";
  }

  /** Name of the selected backend (Python: `self._backend`). */
  get backend(): string {
    return this._backend;
  }

  /** Last `[ERROR] …` string produced by a degraded path. */
  get lastError(): string {
    return this._lastError;
  }

  get is_available(): boolean {
    return this._backend !== "none";
  }

  get isAvailable(): boolean {
    return this.is_available;
  }

  /* ── Public API ─────────────────────────────────────────────────────────── */

  /**
   * Capture from microphone and return transcription.
   * Blocks until the phrase ends or the timeout expires.
   *
   * Returns `null` when nothing was heard — this matches the Python contract.
   * When no engine is available the descriptive error lands in `lastError`.
   */
  async listen(timeout = 8, maxPhrase = 30): Promise<string | null> {
    if (!this.is_available) {
      this._degraded(STT_UNAVAILABLE_ERROR);
      return null;
    }
    try {
      if (this._backend === "moonshine") return await this._listenMoonshine(timeout);
      if (this._backend === "faster_whisper" || this._backend === "whisper") {
        return await this._listenWhisperMic(timeout);
      }
      return await this._listenSr(timeout, maxPhrase);
    } catch (e) {
      logger.debug(`[STT] listen failed (${this._backend}): ${errText(e)}`);
      this._degraded(`[ERROR] STT listen failed (${this._backend}): ${errText(e)}`);
      return null;
    }
  }

  /**
   * Transcribe an audio file.
   *
   * Degradation contract: when no engine is available this resolves to a
   * clear, actionable `[ERROR] …` string instead of throwing, so callers that
   * render the return value directly show the operator what to install.
   */
  async transcribe(audioPath: string): Promise<string | null> {
    const backend = this._backends_get();
    if (backend) {
      try {
        const out = await backend.transcribe(audioPath, {
          language: this.language,
          modelSize: this.modelSize ?? undefined,
        });
        return out ? out.trim() || null : null;
      } catch (e) {
        const msg = `[ERROR] STT backend '${backend.name}' failed on ${audioPath}: ${errText(e)}`;
        logger.debug(`[STT] transcribe failed: ${errText(e)}`);
        this._degraded(msg);
        return msg;
      }
    }

    if (this._backend === "none") {
      this._degraded(STT_UNAVAILABLE_ERROR);
      return STT_UNAVAILABLE_ERROR;
    }

    // A Python-only backend was selected (or a whisper binary is on PATH that we
    // have no binding for) — report precisely which capability is missing.
    const msg =
      `[ERROR] STT backend '${this._backend}' is selected but has no Node.js ` +
      `implementation available. ${STT_UNAVAILABLE_ERROR}`;
    this._degraded(msg);
    return msg;
  }

  /* ── Moonshine ──────────────────────────────────────────────────────────── */

  /**
   * TODO(port): `moonshine-onnx` is a Python package with no Node port. The
   * lazy-load slot is preserved so a registered backend can populate `_model`.
   * Recommended replacement: `@huggingface/transformers` Whisper ONNX (NOT
   * installed on this machine) or the `whisper.cpp` CLI.
   */
  private async _getMoonshine(): Promise<unknown> {
    throw new Error(
      "[ERROR] moonshine-onnx is not available (Python-only, no Node binding). " +
        "registerSTTBackend('moonshine', …) can supply an equivalent engine.",
    );
  }

  private async _listenMoonshine(timeout: number): Promise<string | null> {
    const audio = await this._recordSounddevice(timeout);
    if (audio === null) return null;
    const backend = this._backends_get();
    if (backend) {
      this._model = backend;
      const text = backend.transcribePcm
        ? await backend.transcribePcm(audio, {
            language: this.language,
            modelSize: MOONSHINE_MODEL,
          })
        : null;
      return text ? text.trim() || null : null;
    }
    try {
      await this._getMoonshine();
    } catch (e) {
      this._degraded(errText(e));
    }
    return null;
  }

  /* ── faster-whisper / openai-whisper ────────────────────────────────────── */

  private async _listenWhisperMic(timeout: number): Promise<string | null> {
    const audio = await this._recordSounddevice(timeout);
    if (audio === null) return null;
    const tmp = path.join(os.tmpdir(), `axoniz-stt-${Date.now()}-${Math.floor(Math.random() * 1e6)}.wav`);
    try {
      this._saveWav(audio, tmp);
      return await this.transcribe(tmp);
    } finally {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* best effort, mirrors the Python `except: pass` */
      }
    }
  }

  /* ── SpeechRecognition fallback ─────────────────────────────────────────── */

  private async _listenSr(timeout: number, maxPhrase: number): Promise<string | null> {
    // Python used `speech_recognition` + pocketsphinx / vosk. Neither exists for
    // Node. Recording still works if a driver is registered; recognition cannot.
    logger.debug(`[STT] sr listen requested (max_phrase=${maxPhrase}s)`);
    const pcm = await this._recordSounddevice(timeout);
    if (pcm === null) return null;
    this._degraded(
      "[ERROR] speech_recognition backend unavailable — pocketsphinx / vosk have " +
        "no Node.js binding here. Register an engine with registerSTTBackend().",
    );
    return null;
  }

  /* ── Audio recording helper ─────────────────────────────────────────────── */

  /**
   * Record with the registered audio driver plus energy-based VAD.
   * Returns raw 16-bit 16 kHz mono PCM, or `null` when no driver is registered
   * or nothing was heard.
   *
   * TODO(port): Python used `sounddevice` (PortAudio). No Node audio I/O
   * dependency is installed — see `setAudioInputDriver()` in src/voice/wav.ts.
   */
  async _recordSounddevice(timeout: number): Promise<Buffer | null> {
    const driver = getAudioInputDriver();
    if (!driver) {
      this._degraded(AUDIO_INPUT_MISSING_ERROR);
      return null;
    }
    try {
      const opts: AudioRecordOptions = {
        maxSeconds: timeout,
        sampleRate: SAMPLE_RATE,
        silenceSeconds: 1.5,
        energyThreshold: Math.round(0.02 * 32767),
      };
      const pcm = await driver.record(opts);
      if (!pcm || pcm.length === 0) return null;
      logger.debug(
        `[STT] recorded ${(pcm.length / 2 / SAMPLE_RATE).toFixed(2)}s ` +
          `(mean_abs=${pcm16MeanAbs(pcm).toFixed(1)})`,
      );
      return pcm;
    } catch (e) {
      logger.debug(`[STT] audio driver '${driver.name}' failed: ${errText(e)}`);
      this._degraded(`[ERROR] STT audio capture failed (${driver.name}): ${errText(e)}`);
      return null;
    }
  }

  /**
   * Save raw 16-bit mono PCM at 16 kHz to a WAV file.
   * Replaces Python `_save_wav()` which used numpy + the `wave` module.
   */
  _saveWav(pcm: Buffer, filePath: string): void {
    writeWav(filePath, pcm, SAMPLE_RATE, 1);
  }

  /** Copy a raw PCM capture to a WAV path. Used by the daemon/loop layers. */
  saveWavFromPcm(pcm: Buffer, filePath: string): void {
    this._saveWav(pcm, filePath);
  }

  /* ── Helpers ────────────────────────────────────────────────────────────── */

  /** RMS of a float capture — kept for parity with the Python VAD maths. */
  rms(samples: Float32Array): number {
    return rmsFloat(samples);
  }

  check_wake_word(text: string): boolean {
    const lower = text.toLowerCase();
    return WAKE_WORDS.some((w) => lower.includes(w));
  }

  checkWakeWord(text: string): boolean {
    return this.check_wake_word(text);
  }

  info(): STTInfo {
    return {
      backend: this._backend,
      language: this.language,
      available: this.is_available,
      wake_words: WAKE_WORDS,
      model: this.modelSize ?? "(default)",
    };
  }

  /* ── internals ──────────────────────────────────────────────────────────── */

  private _backends_get(): STTBackend | undefined {
    if (this._backend === "none" || this._backend === "auto") return undefined;
    return _backends.get(this._backend);
  }

  /** Record the error string, log it once, and (best effort) surface it to the user. */
  private _degraded(msg: string): void {
    this._lastError = msg;
    // Deduplicate: polling callers hit these paths every cycle; log each distinct
    // error once so a degraded capability cannot flood the log.
    if (this._loggedDegraded === msg) return;
    this._loggedDegraded = msg;
    logger.warning(msg);
  }
}

/* ── Singleton ─────────────────────────────────────────────────────────────── */

let _stt: STTEngine | null = null;

function sttConfigFromDisk(): { provider?: string; language?: string; model_size?: string } {
  try {
    const cfg = loadConfig() as unknown as Record<string, unknown>;
    const scfg = (cfg["stt"] ?? {}) as Record<string, unknown>;
    return {
      provider: typeof scfg["provider"] === "string" ? scfg["provider"] : undefined,
      language: typeof scfg["language"] === "string" ? scfg["language"] : undefined,
      model_size: typeof scfg["model_size"] === "string" ? scfg["model_size"] : undefined,
    };
  } catch {
    return {};
  }
}

export function get_stt(provider = "auto", kwargs: { language?: string; modelSize?: string | null } = {}): STTEngine {
  if (_stt === null) {
    const scfg = sttConfigFromDisk();
    _stt = new STTEngine(
      scfg.provider ?? provider,
      scfg.language ?? kwargs.language ?? "en",
      scfg.model_size ?? kwargs.modelSize ?? null,
    );
  }
  return _stt;
}

/** camelCase alias of `get_stt`. */
export const getStt = get_stt;

/** Test/DI hook — replace the singleton. */
export function setStt(engine: STTEngine | null): void {
  _stt = engine;
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
