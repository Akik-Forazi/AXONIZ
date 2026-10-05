/**
 * src/voice/wake_word.ts
 * =========================
 * Always-on wake word detector. Runs as a cancellable async loop.
 * Fires `on_wake(word)` the moment AXONIZ's name is heard.
 *
 * Python backends tried in order (fully offline first):
 *   1. openwakeword  — ONNX model, ~1MB, zero latency
 *   2. pvporcupine   — Picovoice local engine
 *   3. sr_polling    — SpeechRecognition short-clip polling
 *   4. whisper_polling — faster-whisper tiny on 2s clips
 *
 * ── Node reality ─────────────────────────────────────────────────────────────
 * `openwakeword`, `pvporcupine`, `SpeechRecognition`, `faster-whisper`,
 * `pyaudio` and `sounddevice` are all Python-only. Every backend name and the
 * whole lifecycle API are preserved; a detector can be registered at runtime
 * with `registerWakeDetector(name, detector)` and a clip recognizer with
 * `registerClipRecognizer(recognizer)`.
 *
 * TODO(port): wake-word detection is fully degraded until a detector is
 *   registered. Recommended replacements to investigate:
 *     - `@huggingface/transformers` + an openWakeWord ONNX export (NOT installed)
 *     - `onnxruntime-node` running openWakeWord models (NOT installed)
 *     - Porcupine via a Node binding (none installed)
 *     - a `whisper.cpp` CLI binary shelled out from node:child_process
 */

import { getLogger } from "../core/logger.js";
import {
  AUDIO_INPUT_MISSING_ERROR,
  getAudioInputDriver,
  pcm16MeanAbs as meanAbs,
  writeWav,
} from "./wav.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const logger = getLogger();

export const WAKE_WORDS = ["axoniz activate", "axoniz", "shadow monarch", "System", "my liege"];

/** Provider ids, matching the strings the Python `_backend` attribute held. */
export type WakeBackendName =
  | "openwakeword"
  | "pvporcupine"
  | "sr_polling"
  | "whisper_polling"
  | "none";

/** Actionable error emitted when nothing is registered. */
export const WAKE_UNAVAILABLE_ERROR =
  "[ERROR] wake word detection unavailable — no detector registered. The Python " +
  "stack used openwakeword / pvporcupine / SpeechRecognition / faster-whisper, " +
  "none of which have installable Node equivalents here. Call " +
  "registerWakeDetector('my-detector', impl) or registerClipRecognizer(impl) " +
  "(see src/voice/wake_word.ts).";

export const WAKE_RECOGNIZER_MISSING_ERROR =
  "[ERROR] wake word polling unavailable — no clip recognizer registered and no " +
  "STT engine installed (whisper/faster-whisper are Python-only). Call " +
  "registerClipRecognizer({ name, recognizePcm }) to enable sr_polling / " +
  "whisper_polling.";

/* ────────────────────────────────────────────────────────────────────────────
 * Runtime-registerable engines
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * A native (streaming) wake word engine, e.g. an openWakeWord ONNX port.
 * `feed()` is called with 16-bit 16 kHz mono PCM frames; the detector invokes
 * `wake()` when the phrase fires.
 */
export interface WakeDetector {
  readonly name: string;
  /** Start consuming audio. Called once from `start()`. */
  run(wake: (word: string) => void, signal: AbortSignal): Promise<void>;
  /** Extra keys are permitted; the detector object is logged via `backend`. */
  [key: string]: unknown;
}

/** A short-clip recognizer used by the sr_polling / whisper_polling backends. */
export interface ClipRecognizer {
  readonly name: string;
  /** Transcribe raw 16-bit 16 kHz mono PCM. Returns "" when nothing is heard. */
  recognizePcm(pcm: Buffer): Promise<string>;
}

const _detectors = new Map<string, WakeDetector>();
let _clipRecognizer: ClipRecognizer | null = null;

/** Register (or replace) a native wake-word detector at runtime. */
export function registerWakeDetector(name: string, detector: WakeDetector): void {
  _detectors.set(name, detector);
}

export function unregisterWakeDetector(name: string): void {
  _detectors.delete(name);
}

export function getWakeDetector(name: string): WakeDetector | undefined {
  return _detectors.get(name);
}

/** Register the clip recognizer that powers the polling backends. */
export function registerClipRecognizer(recognizer: ClipRecognizer | null): void {
  _clipRecognizer = recognizer;
}

/** The engine currently registered under a polling backend id, if any. */
function pollRecognizerFor(backend: string): ClipRecognizer | null {
  const detector = _detectors.get(backend);
  if (detector && typeof detector["recognizePcm"] === "function") {
    return detector as unknown as ClipRecognizer;
  }
  return _clipRecognizer;
}

/** First registered streaming detector, regardless of the name it was filed under. */
function firstRegisteredDetector(): WakeDetector | null {
  for (const detector of _detectors.values()) {
    if (typeof detector.run === "function") return detector;
  }
  return null;
}

/* ────────────────────────────────────────────────────────────────────────────
 * WakeWordDetector
 * ──────────────────────────────────────────────────────────────────────────── */

/** Small promise/flag signal replacing `threading.Event`. */
class Signal {
  private _set = false;
  private _waiters: Array<() => void> = [];

  set(): void {
    this._set = true;
    const waiters = this._waiters;
    this._waiters = [];
    for (const w of waiters) w();
  }

  clear(): void {
    this._set = false;
  }

  is_set(): boolean {
    return this._set;
  }

  /** Returns true immediately when already set, else races the timeout. */
  async wait(timeoutSeconds: number): Promise<boolean> {
    if (this._set) return true;
    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const done = (v: boolean): void => {
        if (settled) return;
        settled = true;
        resolve(v);
      };
      const timer = setTimeout(() => done(false), Math.max(0, timeoutSeconds * 1000));
      this._waiters.push(() => {
        clearTimeout(timer);
        done(true);
      });
    });
  }
}

export class WakeWordDetector {
  /** Always-on wake word listener. Non-blocking — runs as a cancellable loop. */
  on_wake: (word: string) => void;
  wake_words: string[];
  sensitivity: number;

  protected _stop_ev = new Signal();
  protected _abort: AbortController | null = null;
  protected _thread: Promise<void> | null = null;
  protected _backend: string;
  protected _active = false; // True while in cooldown after wake
  protected _lastError = "";
  protected _loggedDegraded = "";

  constructor(
    on_wake: (word: string) => void,
    wake_words: string[] | null = null,
    sensitivity = 0.5,
  ) {
    this.on_wake = on_wake;
    this.wake_words = (wake_words ?? WAKE_WORDS).map((w) => w.toLowerCase());
    this.sensitivity = sensitivity;
    this._backend = this._detect_backend();
  }

  /* ── backend detection ──────────────────────────────────────────────────── */

  /**
   * Ports the Python `_detect_backend()`. Each `import` probe becomes "is an
   * engine registered under that id".
   *
   * For multi-word phrases like "axoniz activate", openWakeWord cannot score them
   * directly — its pretrained models are single keywords only — so text-based
   * matching (sr_polling / whisper_polling) is preferred for those.
   */
  private _detect_backend(): string {
    const primary = this.wake_words[0] ?? "";
    const needsTextMatch = primary.includes(" ");

    const candidates: Array<[string, string]> = [
      ["openwakeword", "openwakeword"],
      ["pvporcupine", "pvporcupine"],
      ["speech_recognition", "sr_polling"],
    ];
    for (const [id, name] of candidates) {
      if (!_detectors.has(id) && !(name === "sr_polling" && _clipRecognizer)) continue;
      if (name === "openwakeword" && needsTextMatch) continue; // can't match multi-word
      return name;
    }

    // whisper/faster-whisper is already a dependency of light_daemon — final fallback.
    if (_detectors.has("faster_whisper") || _detectors.has("whisper") || _clipRecognizer) {
      return "whisper_polling";
    }

    // Any other registered streaming detector (e.g. a custom ONNX engine).
    if (firstRegisteredDetector()) return "openwakeword";

    return "none";
  }

  get backend(): string {
    return this._backend;
  }

  /** Last `[ERROR] …` string produced by a degraded path. */
  get lastError(): string {
    return this._lastError;
  }

  get isAvailable(): boolean {
    return this._backend !== "none";
  }

  /* ── lifecycle ──────────────────────────────────────────────────────────── */

  start(): void {
    if (this._thread) return; // already running
    this._stop_ev.clear();
    this._abort = new AbortController();
    const signal = this._abort.signal;
    this._thread = this._run(signal)
      .catch((e: unknown) => {
        logger.error(`[WakeWord] run failed: ${errText(e)}`);
      })
      .finally(() => {
        this._thread = null;
      });
    logger.info(
      `[WakeWord] started | backend=${this._backend} | words=${JSON.stringify(this.wake_words)}`,
    );
  }

  stop(): void {
    this._stop_ev.set();
    this._abort?.abort();
    this._abort = null;
    logger.info("[WakeWord] stopped");
  }

  is_running(): boolean {
    return this._thread !== null;
  }

  isRunning(): boolean {
    return this.is_running();
  }

  /* ── dispatch ───────────────────────────────────────────────────────────── */

  private async _run(signal: AbortSignal): Promise<void> {
    switch (this._backend) {
      case "openwakeword":
      case "pvporcupine":
        return this._runRegistered(signal);
      case "sr_polling":
        return this._run_sr_polling(signal);
      case "whisper_polling":
        return this._run_whisper_polling(signal);
      default:
        this._degraded(WAKE_UNAVAILABLE_ERROR);
        logger.warning("[WakeWord] no audio backend found — wake word disabled");
        logger.warning(
          "[WakeWord] install: a Node detector or register one with registerWakeDetector()",
        );
    }
  }

  /**
   * Fire the wake callback with a cooldown so it does not double-trigger.
   * The Python version spawned a 2s reset thread; here it is a timer.
   */
  protected _fire(word: string): void {
    if (this._active) return;
    this._active = true;
    logger.info(`[WakeWord] *** WAKE *** '${word}'`);
    try {
      this.on_wake(word);
    } catch (e) {
      logger.error(`[WakeWord] on_wake error: ${errText(e)}`);
    }
    // Cooldown — reset `_active` after 2 seconds so the caller returns immediately.
    const timer = setTimeout(() => {
      this._active = false;
    }, 2000);
    if (typeof timer.unref === "function") timer.unref();
  }

  /* ── registered streaming backend (openwakeword / porcupine slots) ──────── */

  /**
   * TODO(port): `openwakeword` (ONNX, ~1MB) and `pvporcupine` are Python-only.
   * A registered detector supplies the same behaviour — the model download,
   * 1280-frame streaming loop and score-threshold logic all live behind the
   * `WakeDetector.run()` seam. Recommended replacement: an ONNX runtime
   * (`onnxruntime-node`, NOT installed) running openWakeWord models.
   */
  private async _runRegistered(signal: AbortSignal): Promise<void> {
    const detector =
      _detectors.get(this._backend) ??
      _detectors.get("openwakeword") ??
      _detectors.get("pvporcupine") ??
      firstRegisteredDetector();
    if (!detector) {
      this._degraded(WAKE_UNAVAILABLE_ERROR);
      return;
    }
    try {
      // A registered detector owns the score threshold (it supplies `sensitivity`
      // to its own model); we only gate on an explicit wake-word match.
      await detector.run((word: string) => {
        const lower = word.toLowerCase();
        if (this.wake_words.length === 0 || this.wake_words.some((w) => lower.includes(w))) {
          this._fire(lower);
        }
      }, signal);
    } catch (e) {
      logger.error(`[WakeWord] ${detector.name} crashed: ${errText(e)}`);
      this._degraded(`[ERROR] wake detector '${detector.name}' crashed: ${errText(e)}`);
      // Port the Python fallback: switch to whisper_polling.
      this._backend = "whisper_polling";
      await this._run_whisper_polling(signal);
    }
  }

  /* ── SpeechRecognition polling fallback ─────────────────────────────────── */

  /**
   * Record short clips and check the transcription for wake words.
   *
   * TODO(port): Python used `speech_recognition` with pocketsphinx (offline) or
   * Google STT. Neither is available for Node; a registered `ClipRecognizer`
   * takes its place (see `registerClipRecognizer`).
   */
  private async _run_sr_polling(signal: AbortSignal): Promise<void> {
    const recognizer = pollRecognizerFor("sr_polling");
    if (!recognizer) {
      this._degraded(WAKE_RECOGNIZER_MISSING_ERROR);
      logger.warning(
        "[WakeWord] no clip recognizer registered — falling back to whisper_polling",
      );
      this._backend = "whisper_polling";
      await this._run_whisper_polling(signal);
      return;
    }

    // Refuse to spin: without an audio driver there is nothing to poll.
    if (!getAudioInputDriver()) {
      this._degraded(AUDIO_INPUT_MISSING_ERROR);
      return;
    }

    logger.info("[WakeWord] sr_polling — listening (short clips)");
    while (!this._stop_ev.is_set() && !signal.aborted) {
      try {
        const pcm = await this._recordClip(signal, 3);
        if (!pcm) {
          await sleep(0.5, signal); // no audio driver / empty clip — do not busy-loop
          continue;
        }
        const text = (await recognizer.recognizePcm(pcm)).toLowerCase();
        if (!text) continue;
        for (const w of this.wake_words) {
          if (text.includes(w)) {
            this._fire(w);
            break;
          }
        }
      } catch (e) {
        logger.debug(`[WakeWord] clip error: ${errText(e)}`);
        await sleep(0.3, signal);
      }
    }
  }

  /* ── Whisper polling fallback ───────────────────────────────────────────── */

  /**
   * Last-resort fallback: record ~2s clips and transcribe locally.
   *
   * TODO(port): Python used `faster_whisper.WhisperModel("tiny")` plus
   * pyaudio/sounddevice. There is no Node STT engine installed — the registered
   * `ClipRecognizer` (or an `registerSTTBackend` engine bridged in) fills in.
   * Recommended replacement: `whisper.cpp` CLI or whisper ONNX via
   * `@huggingface/transformers` (NOT installed).
   */
  private async _run_whisper_polling(signal: AbortSignal): Promise<void> {
    const recognizer = pollRecognizerFor("whisper_polling");
    if (!recognizer) {
      this._degraded(WAKE_RECOGNIZER_MISSING_ERROR);
      logger.error(
        "[WakeWord] whisper_polling needs a registered recognizer " +
          "(whisper/faster-whisper are Python-only)",
      );
      return;
    }

    // Refuse to spin: without an audio driver there is nothing to poll.
    if (!getAudioInputDriver()) {
      this._degraded(AUDIO_INPUT_MISSING_ERROR);
      return;
    }

    logger.info("[WakeWord] whisper_polling — listening (2s clips)");
    while (!this._stop_ev.is_set() && !signal.aborted) {
      try {
        const pcm = await this._recordClip(signal, 2);
        // Quick energy check — skip silence (ported SILENCE/energy guard).
        if (!pcm || meanAbs(pcm) < 150) {
          await sleep(0.5, signal); // nothing captured — do not busy-loop
          continue;
        }

        const text = (await recognizer.recognizePcm(pcm)).toLowerCase().trim();
        if (text) {
          logger.debug(`[WakeWord] whisper clip: '${text}'`);
          for (const w of this.wake_words) {
            if (text.includes(w)) {
              this._fire(w);
              break;
            }
          }
        }
      } catch (e) {
        logger.debug(`[WakeWord] whisper clip error: ${errText(e)}`);
        await sleep(0.5, signal);
      }
    }
  }

  /* ── mic helpers ────────────────────────────────────────────────────────── */

  /**
   * Record one short clip through the registered audio input driver.
   * Returns null (with a descriptive `[ERROR]`) when no driver is registered.
   */
  protected async _recordClip(signal: AbortSignal, seconds: number): Promise<Buffer | null> {
    const driver = getAudioInputDriver();
    if (!driver) {
      this._degraded(AUDIO_INPUT_MISSING_ERROR);
      return null;
    }
    try {
      const pcm = await driver.record({
        maxSeconds: seconds,
        sampleRate: 16_000,
        silenceSeconds: seconds,
        signal,
      });
      return pcm && pcm.length > 0 ? pcm : null;
    } catch (e) {
      logger.debug(`[WakeWord] record failed: ${errText(e)}`);
      return null;
    }
  }

  /**
   * Persist a captured clip as a hand-rolled 44-byte-header WAV.
   * Replaces Python's `wave` module usage in `_run_whisper_polling`.
   */
  protected saveClipWav(pcm: Buffer, filePath?: string): string {
    const target =
      filePath ??
      path.join(
        os.tmpdir(),
        `axoniz-wake-${Date.now()}-${Math.floor(Math.random() * 1e6)}.wav`,
      );
    writeWav(target, pcm, 16_000, 1);
    return target;
  }

  protected unlinkClip(filePath: string): void {
    try {
      fs.unlinkSync(filePath);
    } catch {
      /* best effort */
    }
  }

  protected _degraded(msg: string): void {
    this._lastError = msg;
    // Deduplicate: the polling loops hit these paths every cycle.
    if (this._loggedDegraded === msg) return;
    this._loggedDegraded = msg;
    logger.warning(msg);
  }
}

/* ── singleton ─────────────────────────────────────────────────────────────── */

let _wwd: WakeWordDetector | null = null;

export function get_wake_detector(
  on_wake: (word: string) => void,
  kwargs: { wake_words?: string[]; sensitivity?: number } = {},
): WakeWordDetector {
  if (_wwd === null) {
    _wwd = new WakeWordDetector(
      on_wake,
      kwargs.wake_words ?? null,
      kwargs.sensitivity ?? 0.5,
    );
  }
  return _wwd;
}

/** camelCase alias of `get_wake_detector` (avoids colliding with the registry getter). */
export const getWakeDetectorInstance = get_wake_detector;

/** Test/DI hook — replace the singleton. */
export function setWakeDetector(detector: WakeWordDetector | null): void {
  _wwd = detector;
}

/* ── helpers ───────────────────────────────────────────────────────────────── */

/** Cancellable sleep — the async replacement for `time.sleep`. */
export async function sleep(seconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, Math.max(0, seconds * 1000));
    if (signal) {
      const onAbort = (): void => {
        clearTimeout(timer);
        resolve();
      };
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
