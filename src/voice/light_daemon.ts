/**
 * src/voice/light_daemon.ts
 * ============================
 * AXONIZ Light Voice Daemon — two-tier, minimal RAM.
 *
 * Architecture
 * ------------
 *   ALWAYS ON  (idle RAM ~80-160 MB total):
 *     openwakeword ONNX   —  ~1 MB  —  wake word detection
 *     faster-whisper tiny — ~75 MB  —  speech-to-text (int8 CPU)
 *     edge-tts            —   0 MB  —  text-to-speech (MS cloud stream)
 *
 *   ON DEMAND  (no weights ever loaded locally):
 *     Tier 1 — regex classifier answers simple queries instantly (time, date, …)
 *     Tier 2 — one stateless HTTP call to Anthropic / Groq / OpenAI
 *              only fires when the query is complex
 *              zero model weights in RAM
 *
 *   NEVER LOADED:
 *     The full axoniz Agent, LM Studio, Ollama, or any local LLM.
 *
 * Usage
 * -----
 *   const d = start_light_daemon();
 *   // runs forever — say "Axoniz" to wake
 *   // d.say("AXONIZ is online.")
 *
 * ── Node reality ─────────────────────────────────────────────────────────────
 * Scheduling, watching, intent classification, LLM calls, trimming and event
 * emission are ported faithfully. Only the OS-level audio primitives degrade:
 *   - wake word  → `WakeWordDetector` from src/voice/wake_word.ts (register a
 *                  detector; `openwakeword`/`pvporcupine` are Python-only)
 *   - mic        → registered audio input driver (was `pyaudio`)
 *   - STT        → `_WhisperSTT` wraps the pluggable `STTEngine` (was
 *                  `faster-whisper`; no Node engine is installed)
 *   - TTS        → `msedge-tts` (installed) via `src/voice/tts.ts`
 * Every degraded path returns/emits a clear `[ERROR] …` string and never throws.
 */

import { getLogger } from "../core/logger.js";
import { get_tts, speakWithFallback, type TTSEngine } from "./tts.js";
import { STTEngine, get_stt } from "./stt.js";
import {
  AUDIO_INPUT_MISSING_ERROR,
  getAudioInputDriver,
  pcm16MeanAbs,
  writeWav,
} from "./wav.js";
import { get_wake_detector, registerClipRecognizer, sleep, type WakeWordDetector } from "./wake_word.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const logger = getLogger();

/* ─────────────────────────────────────────────────────────────────────────────
 * Constants
 * ───────────────────────────────────────────────────────────────────────────── */

export const WHISPER_MODEL = process.env.AXONIZ_WHISPER_MODEL ?? "tiny";
export const WHISPER_DEVICE = "cpu"; // keep it on CPU — no VRAM consumed
export const SAMPLE_RATE = 16_000;
export const LISTEN_SECS = 7; // max recording window after wake word
export const SILENCE_THRESH = 500; // PCM energy threshold — ignores AXONIZ's own TTS echo
export const SILENCE_FRAMES = 20; // consecutive silent frames before stop (~0.5s)

/** Master debug flag — set to false to quiet down. */
export let DBG = true;

export function setDbg(on: boolean): void {
  DBG = on;
}

function _dbg(msg: string): void {
  if (!DBG) return;
  const d = new Date();
  const ts = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(
    d.getSeconds(),
  ).padStart(2, "0")}.${String(d.getMilliseconds()).padStart(3, "0")}`;
  process.stdout.write(`  [AXONIZ:${ts}] ${msg}\n`);
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Tier 1 — Intent classifier (pure regex, zero latency, zero RAM)
 * ───────────────────────────────────────────────────────────────────────────── */

export const _STOP_WORDS = new Set([
  "stop listening",
  "go to sleep",
  "shut up",
  "quiet",
  "nevermind",
  "stop",
  "sleep",
  "goodbye",
]);

const _LOCAL_PATTERNS = [
  String.raw`\btime\b`,
  String.raw`\bdate\b`,
  String.raw`\bday\b`,
  String.raw`\byear\b`,
  String.raw`\bhello\b`,
  String.raw`\bhi\b`,
  String.raw`\bhey\b`,
  String.raw`\bthank(s| you)\b`,
  String.raw`\bbye\b`,
  String.raw`\bwho are you\b`,
  String.raw`\bstatus\b`,
];

const _LLM_PATTERNS = [
  String.raw`\b(load|use|switch to|activate)\b.*(big|full|smart|model|claude|gpt|groq)\b`,
  String.raw`\bthink harder\b`,
  String.raw`\bmore detail\b`,
  String.raw`\bexplain.+detail\b`,
  String.raw`\b(write|create|build|generate|implement|debug|refactor|analyse|analyze)\b`,
  String.raw`\bhow (do|does|can|would|should)\b`,
  String.raw`\bwhy (is|does|did|are|were)\b`,
  String.raw`\bwhat (is|are|was|were|does|did)\b`,
  String.raw`\bcan you\b`,
  String.raw`\bcould you\b`,
];

export type IntentTier = "stop" | "local" | "llm";

/** Returns 'stop', 'local', or 'llm'. */
export function _classify(text: string): IntentTier {
  const low = text.toLowerCase().trim();
  if ([..._STOP_WORDS].some((s) => low.includes(s))) return "stop";
  for (const pat of _LLM_PATTERNS) if (new RegExp(pat).test(low)) return "llm";
  for (const pat of _LOCAL_PATTERNS) if (new RegExp(pat).test(low)) return "local";
  // short = probably local, long = probably llm
  return low.split(/\s+/).length <= 4 ? "local" : "llm";
}

/** `%I:%M %p` with the Python `.lstrip("0")` behaviour. */
function twelveHourClock(d = new Date()): string {
  return d
    .toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })
    .replace(/^0/, "");
}

function localDateStr(d = new Date()): string {
  return d
    .toLocaleDateString("en-US", { weekday: "long", month: "long", day: "2-digit" })
    .replace(" 0", " ");
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/** Answer without any network call. */
export function _local_response(text: string): string {
  const low = text.toLowerCase();
  const now = new Date();
  if (/\btime\b/.test(low)) return `It's ${twelveHourClock(now)}.`;
  if (/\b(date|today|day)\b/.test(low)) return `Today is ${localDateStr(now)}.`;
  if (/\byear\b/.test(low)) return `It's ${now.getFullYear()}.`;
  if (/\b(hello|hi|hey)\b/.test(low)) {
    return pick(["Hello, my liege.", "Here and ready.", "What do you need?"]);
  }
  if (/\bthank(s| you)\b/.test(low)) {
    return pick(["Of course.", "Always.", "Your will is my mission."]);
  }
  if (/\bwho are you\b/.test(low)) return "I'm AXONIZ. Your Worker Swarm of one.";
  if (/\bstatus\b/.test(low)) {
    return "Light daemon online. Whisper STT active. Waiting for commands.";
  }
  return pick(["I'm here. What do you need?", "Standing by.", "Go ahead."]);
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Tier 2 — Stateless LLM API client (no local weights ever)
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * TODO(port): Python imported the `anthropic`, `groq` and `openai` SDKs. None is
 * installed here, so each provider is called over plain `fetch` against the same
 * REST endpoints — same models, same prompts, same shapes, zero new dependencies.
 * Recommended replacement: keep the HTTP path; add `undici` ProxyAgent only if a
 * corporate proxy is required.
 */
export class _LLMClient {
  static readonly SYSTEM =
    "You are AXONIZ, a sharp military-precision AI assistant. " +
    "Speak in short direct sentences. " +
    "Current time: {time}. Date: {date}.";

  provider: string;
  apiKey: string | null;
  model: string | null;
  baseUrl: string | null;

  private _backend: string;

  constructor(
    provider = "auto",
    apiKey: string | null = null,
    model: string | null = null,
    baseUrl: string | null = null,
  ) {
    this.provider = provider;
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = baseUrl;
    this._backend = this._detect();
    _dbg(`LLM backend detected: ${this._backend}`);
  }

  private _detect(): string {
    if (this.provider && this.provider !== "auto") {
      _dbg(`LLM provider forced to: ${this.provider}`);
      return this.provider;
    }
    for (const [prov, env] of [
      ["groq", "GROQ_API_KEY"],
      ["anthropic", "ANTHROPIC_API_KEY"],
      ["openai", "OPENAI_API_KEY"],
    ] as Array<[string, string]>) {
      if (process.env[env]) {
        _dbg(`Found API key for ${prov} — using it`);
        return prov;
      }
    }
    _dbg("No LLM API key found. Tier 2 disabled.");
    return "none";
  }

  get backend(): string {
    return this._backend;
  }

  get available(): boolean {
    return this._backend !== "none";
  }

  async ask(prompt: string, maxTokens = 200): Promise<string> {
    const now = new Date();
    const system = _LLMClient.SYSTEM.replace("{time}", twelveHourClock(now)).replace(
      "{date}",
      now.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "2-digit",
        year: "numeric",
      }),
    );
    _dbg(`LLM ask [${this._backend}]: '${prompt.slice(0, 80)}'`);
    const t0 = Date.now();
    try {
      let result: string;
      if (this._backend === "anthropic") {
        result = await this._ask_anthropic(system, prompt, maxTokens);
      } else if (this._backend === "groq") {
        result = await this._ask_groq(system, prompt, maxTokens);
      } else if (this._backend === "openai") {
        result = await this._ask_openai(system, prompt, maxTokens);
      } else {
        return (
          "No LLM backend configured. " +
          "Set ANTHROPIC_API_KEY, GROQ_API_KEY, or OPENAI_API_KEY."
        );
      }
      _dbg(`LLM responded in ${((Date.now() - t0) / 1000).toFixed(2)}s: '${result.slice(0, 80)}'`);
      return result;
    } catch (e) {
      logger.error(`[LightDaemon] LLM error: ${errText(e)}`);
      _dbg(`LLM ERROR: ${errText(e)}`);
      return `LLM call failed: ${errText(e)}`;
    }
  }

  private async _ask_anthropic(system: string, prompt: string, maxTokens: number): Promise<string> {
    const key = this.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "";
    const base = (this.baseUrl ?? "https://api.anthropic.com").replace(/\/+$/, "");
    const json = await httpJson(
      `${base}/v1/messages`,
      {
        model: this.model ?? "claude-haiku-4-5-20251001",
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: prompt }],
      },
      {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
    );
    const content = json["content"] as Array<{ text?: string }> | undefined;
    return (content?.[0]?.text ?? "").trim();
  }

  private async _ask_groq(system: string, prompt: string, maxTokens: number): Promise<string> {
    const key = this.apiKey ?? process.env.GROQ_API_KEY ?? "";
    const base = (this.baseUrl ?? "https://api.groq.com/openai/v1").replace(/\/+$/, "");
    const json = await httpJson(
      `${base}/chat/completions`,
      {
        model: this.model ?? "llama3-8b-8192",
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      },
      { Authorization: `Bearer ${key}` },
    );
    return firstChoiceText(json);
  }

  private async _ask_openai(system: string, prompt: string, maxTokens: number): Promise<string> {
    const key = this.apiKey ?? process.env.OPENAI_API_KEY ?? "";
    const base = (this.baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "");
    const json = await httpJson(
      `${base}/chat/completions`,
      {
        model: this.model ?? "gpt-4o-mini",
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      },
      { Authorization: `Bearer ${key}` },
    );
    return firstChoiceText(json);
  }
}

function firstChoiceText(json: Record<string, unknown>): string {
  const choices = json["choices"] as Array<{ message?: { content?: string } }> | undefined;
  return (choices?.[0]?.message?.content ?? "").trim();
}

async function httpJson(
  url: string,
  payload: unknown,
  headers: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60_000),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
  return JSON.parse(body) as Record<string, unknown>;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * STT — whisper-tiny slot, always loaded, stays in RAM
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * TODO(port): Python held a `faster_whisper.WhisperModel` here. No Node STT
 * engine is installed. `_WhisperSTT` now wraps the pluggable `STTEngine` from
 * src/voice/stt.ts (register one with `registerSTTBackend`, or put a whisper.cpp
 * `whisper-cli` on PATH). Until then `available` is false and `transcribe_pcm`
 * returns "" while emitting a descriptive `[ERROR] …` via `lastError`.
 */
export class _WhisperSTT {
  /** Exposed because the Python daemon printed it in `start()`/`info()`. */
  readonly _model_size: string;
  private _engine: STTEngine;
  private _lastError = "";

  constructor(modelSize = WHISPER_MODEL, engine: STTEngine | null = null) {
    this._model_size = modelSize;
    this._engine = engine ?? get_stt("auto", { modelSize });
  }

  get lastError(): string {
    return this._lastError || this._engine.lastError;
  }

  get available(): boolean {
    return this._engine.is_available;
  }

  /** Transcribe raw 16-bit 16 kHz mono PCM. Returns text or empty string. */
  async transcribe_pcm(pcmBytes: Buffer): Promise<string> {
    if (!pcmBytes || pcmBytes.length === 0) {
      _dbg("transcribe_pcm: empty audio");
      return "";
    }
    if (!this.available) {
      this._lastError =
        "[ERROR] STT unavailable — no Whisper engine for Node.js " +
        "(faster-whisper is Python-only). registerSTTBackend() or install whisper.cpp.";
      _dbg(this._lastError);
      return "";
    }

    const tmp = path.join(
      os.tmpdir(),
      `axoniz-light-stt-${Date.now()}-${Math.floor(Math.random() * 1e6)}.wav`,
    );
    try {
      // Hand-rolled RIFF header — replaces Python's `wave` module.
      writeWav(tmp, pcmBytes, SAMPLE_RATE, 1);
      _dbg(`Transcribing ${(pcmBytes.length / 2 / SAMPLE_RATE).toFixed(1)}s audio…`);
      const t0 = Date.now();
      const text = (await this._engine.transcribe(tmp)) ?? "";
      if (this._engine.lastError) this._lastError = this._engine.lastError;
      _dbg(`Whisper done in ${((Date.now() - t0) / 1000).toFixed(2)}s → '${text}'`);
      return text.trim();
    } catch (e) {
      _dbg(`Whisper transcribe ERROR: ${errText(e)}`);
      this._lastError = `[ERROR] STT transcribe failed: ${errText(e)}`;
      return "";
    } finally {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* best effort */
      }
    }
  }

  async transcribePcm(pcmBytes: Buffer): Promise<string> {
    return this.transcribe_pcm(pcmBytes);
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Mic recording — raw PCM with silence detection
 * ───────────────────────────────────────────────────────────────────────────── */

export interface RecordMicOptions {
  max_secs?: number;
  signal?: AbortSignal;
}

/**
 * Record from mic until silence or timeout. Returns raw 16-bit PCM bytes.
 *
 * TODO(port): Python used `pyaudio` (PortAudio) with a 1024-frame read loop.
 * There is no Node audio I/O dependency installed — a driver registered through
 * `setAudioInputDriver()` supplies the frames; without one this logs a clear
 * `[ERROR] …` and returns an empty buffer.
 */
export async function _record_mic(
  arg: number | RecordMicOptions = LISTEN_SECS,
  signal?: AbortSignal,
): Promise<Buffer> {
  const opts: RecordMicOptions = typeof arg === "number" ? { max_secs: arg, signal } : arg;
  const maxSecs = opts.max_secs ?? LISTEN_SECS;
  const driver = getAudioInputDriver();
  if (!driver) {
    _dbg(AUDIO_INPUT_MISSING_ERROR);
    return Buffer.alloc(0);
  }

  _dbg(`Opening mic (max ${maxSecs}s, silence_thresh=${SILENCE_THRESH})…`);
  try {
    const pcm = await driver.record({
      maxSeconds: maxSecs,
      sampleRate: SAMPLE_RATE,
      // ~0.5s of silence before stopping, matching SILENCE_FRAMES * 1024 frames.
      silenceSeconds: (SILENCE_FRAMES * 1024) / SAMPLE_RATE,
      energyThreshold: SILENCE_THRESH,
      signal: opts.signal,
    });
    const secs = pcm.length / 2 / SAMPLE_RATE;
    const energy = pcm16MeanAbs(pcm);
    _dbg(
      `Recorded ${secs.toFixed(1)}s, mean_energy=${energy.toFixed(1)}, ` +
        `speech_started=${energy > SILENCE_THRESH}`,
    );
    if (energy <= SILENCE_THRESH) {
      _dbg("No speech energy detected — discarding audio");
      return Buffer.alloc(0);
    }
    return pcm;
  } catch (e) {
    _dbg(`ERROR recording mic: ${errText(e)}`);
    return Buffer.alloc(0);
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * TTS — edge-tts (streams, 0 local RAM) with offline fallback
 * ───────────────────────────────────────────────────────────────────────────── */

let _speakEngine: TTSEngine | null = null;

function speakEngine(): TTSEngine {
  if (_speakEngine === null) _speakEngine = get_tts();
  return _speakEngine;
}

/** Test/DI hook. */
export function setSpeakEngine(engine: TTSEngine | null): void {
  _speakEngine = engine;
}

/**
 * Speak text aloud. Priority (ported from the Python module-level `_speak()`):
 *   1. msedge-tts → audio output driver   (best quality, free)
 *   2. msedge-tts → OS player fallback    (PowerShell MediaPlayer on Windows)
 *   3. offline OS TTS slot                (was pyttsx3 — NOT implemented)
 *   4. print                              (last resort)
 *
 * TODO(port): step 1/2 require a registered audio output driver; step 3 needs a
 * Node offline TTS backend (see `OFFLINE_TTS_ERROR` in src/voice/tts.ts). All
 * failures are logged as `[ERROR] …` and never throw.
 */
export async function _speak(text: string): Promise<void> {
  if (!text) return;
  _dbg(`Speaking: '${text.slice(0, 80)}'`);
  const t0 = Date.now();
  try {
    const ok = await speakWithFallback(text);
    if (ok) _dbg(`TTS done in ${((Date.now() - t0) / 1000).toFixed(2)}s`);
    const err = speakEngine().lastError;
    if (err) _dbg(err);
  } catch (e) {
    _dbg(`TTS failed: ${errText(e)}`);
    process.stdout.write(`  [AXONIZ says] ${text}\n`);
  }
}

export function _speak_sync_fallback(text: string): void {
  process.stdout.write(`  [AXONIZ says] ${text}\n`);
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Response trimmer
 * ───────────────────────────────────────────────────────────────────────────── */

export function _trim(text: string, maxChars = 300): string {
  const hadCode = /```/.test(text);
  let out = text.replace(/```[\s\S]*?```/g, "");
  out = out.replace(/`([^`\n]+)`/g, "$1");
  out = out.replace(/\*{1,2}(.*?)\*{1,2}/g, "$1");
  out = out.replace(/#{1,6}\s+/g, "");
  out = out.replace(/\n{2,}/g, ". ");
  out = out.replace(/\s{2,}/g, " ").trim();
  const suffix = hadCode ? " I've put the code in the chat." : "";
  if (out.length <= maxChars) return (out + suffix).trim();
  const sents = out.split(/(?<=[.!?])\s+/);
  let acc = "";
  for (const s of sents) {
    if (acc.length + s.length > maxChars) break;
    acc += s + " ";
  }
  return ((acc.trim() || out.slice(0, maxChars) + "…") + suffix).trim();
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Main daemon class
 * ───────────────────────────────────────────────────────────────────────────── */

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

export interface LightDaemonOptions {
  provider?: string;
  api_key?: string;
  model?: string;
  base_url?: string;
  whisper_model?: string;
  on_state_change?: (state: string) => void;
}

export class LightVoiceDaemon {
  /**
   * AXONIZ light voice daemon.
   *
   * Idle RAM: ~80 MB (whisper-tiny int8 CPU + openwakeword ONNX)
   * NO local LLM is ever loaded. Complex queries go to the API only.
   */
  private _llm: _LLMClient;
  private _stt: _WhisperSTT;
  private _wwd: WakeWordDetector | null = null;
  private _on_state: ((state: string) => void) | null;
  private _state = "IDLE";
  private _stop_ev = new Signal();
  private _wake_ev = new Signal();
  private _abort: AbortController | null = null;
  private _thread: Promise<void> | null = null;

  constructor(options: LightDaemonOptions = {}) {
    _dbg("LightVoiceDaemon.__init__ — initialising (no LLM loaded)");
    this._llm = new _LLMClient(
      options.provider ?? "auto",
      options.api_key ?? null,
      options.model ?? null,
      options.base_url ?? null,
    );
    this._stt = new _WhisperSTT(options.whisper_model ?? WHISPER_MODEL);
    this._on_state = options.on_state_change ?? null;
  }

  /* ── Public API ─────────────────────────────────────────────────────────── */

  start(): void {
    _dbg("start() called — spinning up wake word + main loop");
    this._stop_ev.clear();
    this._abort = new AbortController();
    const signal = this._abort.signal;
    this._wwd = this._init_wake_word();
    this._wwd.start();
    this._thread = this._loop(signal)
      .catch((e: unknown) => {
        logger.error(`[LightDaemon] loop crashed: ${errText(e)}`);
      })
      .finally(() => {
        this._thread = null;
      });
    console.log("\n  [AXONIZ] Light daemon online");
    console.log(
      `  [AXONIZ] STT : whisper-${this._stt._model_size} (${
        this._stt.available ? "ready" : "UNAVAILABLE"
      })`,
    );
    console.log(
      `  [AXONIZ] LLM : ${this._llm.backend} (${
        this._llm.available ? "ready" : "no key — Tier 2 disabled"
      })`,
    );
    console.log(`  [AXONIZ] Wake: ${this._wwd.backend}`);
    console.log("  [AXONIZ] Say 'Axoniz' to activate\n");
    if (!this._stt.available && this._stt.lastError) {
      console.log(`  ${this._stt.lastError}\n`);
    }
  }

  stop(): void {
    _dbg("stop() called");
    this._stop_ev.set();
    this._abort?.abort();
    this._abort = null;
    this._wwd?.stop();
  }

  is_running(): boolean {
    return this._thread !== null;
  }

  isRunning(): boolean {
    return this.is_running();
  }

  get state(): string {
    return this._state;
  }

  /** Speak text immediately (compat with the old LightDaemon API). */
  say(text: string, async_ = false): void {
    if (async_) {
      void _speak(text).catch((e: unknown) => logger.debug(`[LightDaemon] say error: ${errText(e)}`));
    } else {
      void _speak(text);
    }
  }

  /** Capture one utterance and return its transcription. */
  async listen_once(): Promise<string | null> {
    const pcm = await _record_mic(LISTEN_SECS);
    if (pcm.length === 0) return null;
    const text = await this._stt.transcribe_pcm(pcm);
    return text || null;
  }

  async listenOnce(): Promise<string | null> {
    return this.listen_once();
  }

  info(): Record<string, unknown> {
    return {
      state: this._state,
      stt: this._stt.available ? `whisper-${this._stt._model_size}` : "unavailable",
      tts: "msedge-tts → os-tts (unimplemented) → print",
      stt_ready: this._stt.available,
      llm: this._llm.backend,
      llm_available: this._llm.available,
      wake_word: this._wwd ? this._wwd.backend : "not started",
    };
  }

  /* ── Internals ──────────────────────────────────────────────────────────── */

  private _set_state(s: string): void {
    if (s !== this._state) _dbg(`State: ${this._state} → ${s}`);
    this._state = s;
    if (this._on_state) {
      try {
        this._on_state(s);
      } catch {
        /* state callbacks must never break the loop */
      }
    }
  }

  /**
   * Wire the whisper-polling fallback so the wake detector can reuse this
   * daemon's STT engine — this is the Node equivalent of the Python "faster-whisper
   * is already a dep of light_daemon" coupling.
   */
  private _init_wake_word(): WakeWordDetector {
    _dbg("Initialising wake word detector…");
    registerClipRecognizer({
      name: "light-daemon-stt",
      recognizePcm: (pcm: Buffer) => this._stt.transcribe_pcm(pcm),
    });
    return get_wake_detector((word: string) => this._on_wake(word));
  }

  private _on_wake(word: string): void {
    _dbg(`*** WAKE WORD FIRED *** '${word}' | current state: ${this._state}`);
    if (this._state === "LISTENING" || this._state === "THINKING" || this._state === "TRANSCRIBING") {
      _dbg("Ignoring wake — already processing");
      return;
    }
    this._wake_ev.set();
  }

  private async _loop(signal: AbortSignal): Promise<void> {
    _dbg("Main event loop started");
    while (!this._stop_ev.is_set() && !signal.aborted) {
      this._set_state("IDLE");
      const fired = await this._wake_ev.wait(1.0);
      if (!fired) continue;
      this._wake_ev.clear();
      if (this._stop_ev.is_set()) break;

      // ── Acknowledge ─────────────────────────────────────────────────────
      this._set_state("ACKNOWLEDGING");
      await _speak(pick(["Yes?", "Listening.", "Go ahead.", "Ready.", "Here."]));
      await sleep(0.4, signal); // brief gap so the mic doesn't capture AXONIZ's own voice

      // ── Record ──────────────────────────────────────────────────────────
      this._set_state("LISTENING");
      const pcm = await _record_mic({ max_secs: LISTEN_SECS, signal });
      if (pcm.length === 0) {
        _dbg("Empty recording — no speech energy");
        await _speak(pick(["Didn't catch that.", "Say that once more."]));
        continue;
      }

      // ── Transcribe (whisper-tiny, local, fast) ───────────────────────────
      this._set_state("TRANSCRIBING");
      const text = await this._stt.transcribe_pcm(pcm);
      if (!text) {
        _dbg("Whisper returned empty string");
        await _speak("Couldn't make that out.");
        continue;
      }
      console.log(`  [AXONIZ] Heard: '${text}'`);

      // ── Classify intent ─────────────────────────────────────────────────
      const tier = _classify(text);
      console.log(`  [AXONIZ] Tier: ${tier}`);

      if (tier === "stop") {
        this._set_state("IDLE");
        await _speak("Got it. Going quiet.");
        continue;
      }

      // ── Tier 1: local instant answer ────────────────────────────────────
      if (tier === "local") {
        this._set_state("RESPONDING_LOCAL");
        const response = _local_response(text);
        _dbg(`Local response: '${response}'`);
        await _speak(response);
        continue;
      }

      // ── Tier 2: LLM API call ────────────────────────────────────────────
      this._set_state("THINKING");
      if (!this._llm.available) {
        await _speak(
          "I need an API key for that. Set ANTHROPIC_API_KEY, GROQ_API_KEY, or OPENAI_API_KEY.",
        );
        continue;
      }
      await _speak(pick(["On it.", "One moment.", "Let me check."]));
      const response = await this._llm.ask(text);
      const spoken = _trim(response);
      this._set_state("SPEAKING");
      await _speak(spoken);
    }

    this._set_state("IDLE");
    _dbg("Loop exited cleanly.");
  }

  /** Expose the wake detector for tests/embedding. */
  get wakeDetector(): WakeWordDetector | null {
    return this._wwd;
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Singleton & public entry point
 * ───────────────────────────────────────────────────────────────────────────── */

/** Keep LightDaemon as an alias so older code doesn't break. */
export const LightDaemon = LightVoiceDaemon;
export type LightDaemonType = LightVoiceDaemon;

let _daemon: LightVoiceDaemon | null = null;

export interface StartLightDaemonOptions extends LightDaemonOptions {
  /** Legacy kwargs silently ignored so old call sites don't crash. */
  agent?: unknown;
  verbose?: boolean;
  auto_start?: boolean;
}

/**
 * Start AXONIZ's light voice daemon in the background.
 * No local LLM is ever loaded. Returns immediately.
 */
export function start_light_daemon(options: StartLightDaemonOptions = {}): LightVoiceDaemon {
  if (_daemon !== null && _daemon.is_running()) {
    _dbg("Daemon already running — returning existing instance");
    return _daemon;
  }
  _dbg("Creating new LightVoiceDaemon…");
  _daemon = new LightVoiceDaemon(options);
  _daemon.start();
  return _daemon;
}

/** camelCase alias of `start_light_daemon`. */
export const startLightDaemon = start_light_daemon;

export function get_daemon(): LightVoiceDaemon | null {
  return _daemon;
}

/** camelCase alias of `get_daemon`. */
export const getDaemon = get_daemon;

/** Test/DI hook — replace the singleton. */
export function setDaemon(d: LightVoiceDaemon | null): void {
  _daemon = d;
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
