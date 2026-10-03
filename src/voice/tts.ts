/**
 * src/voice/tts.ts
 * =================
 * AXONIZ Text-to-Speech — offline-first, best quality available.
 *
 * Python provider priority (preserved by `_detectBackend()`):
 *   1. kokoro-onnx — 82M params, Apache 2.0
 *   2. mms         — local VITS (transformers + torch)
 *   2b. piper      — fastest CPU TTS (`piper` module or `piper` binary)
 *   3. edge-tts    — free Microsoft cloud TTS (needs internet)
 *   4. pyttsx3     — offline COM/espeak fallback
 *   5. print       — last resort
 *
 * ── Node reality ─────────────────────────────────────────────────────────────
 * `kokoro-onnx`, `piper`, `pyttsx3`, `sounddevice`, `soundfile` and `transformers`
 * are Python-only and not installable here. `edge-tts`'s Node equivalent
 * **`msedge-tts` IS installed** (MIT, Microsoft Edge Read Aloud API) and is the
 * primary working path. The offline `pyttsx3` slot is preserved but implemented
 * as a clearly-marked unimplemented backend that returns a descriptive error.
 *
 * WAV output is written by hand (44-byte RIFF/PCM header, `node:fs`) — see
 * `src/voice/wav.ts`. No `soundfile` package is used anywhere.
 *
 * Model files (kokoro, searched cwd → ~/.axoniz/voice_models → ~/Downloads):
 *   kokoro-v1.0.int8.onnx   (88MB  — recommended, CPU-optimized)
 *   kokoro-v1.0.onnx        (310MB — full quality)
 *   voices-v1.0.bin         (voice embeddings, always required)
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getLogger } from "../core/logger.js";
import { whichSync } from "../core/which.js";
import { loadConfig, AXONIZ_HOME } from "../core/config.js";
import {
  AUDIO_OUTPUT_MISSING_ERROR,
  getAudioOutputDriver,
  writeWav,
  type AudioOutputDriver,
} from "./wav.js";

const logger = getLogger();

/* ── Voice config ──────────────────────────────────────────────────────────── */

export const KOKORO_VOICE = process.env.AXONIZ_KOKORO_VOICE ?? "am_liam"; // male, deep
export const KOKORO_SPEED = Number.parseFloat(process.env.AXONIZ_KOKORO_SPEED ?? "0.95");
export const PIPER_VOICE = process.env.AXONIZ_PIPER_VOICE ?? "en_US-lessac-medium";
export const EDGE_VOICE = process.env.AXONIZ_EDGE_VOICE ?? "en-US-GuyNeural";
export const EDGE_RATE = process.env.AXONIZ_EDGE_RATE ?? "-10%";
/** Kokoro native sample rate. */
export const SAMPLE_RATE = 24_000;

/** `os.path.dirname(os.path.dirname(abspath(__file__)))` → the `src/` directory. */
export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const MMS_MODEL_PATH = path.join(PROJECT_ROOT, "mms-tts-oss");

/** ✅ FIX #1 (ported): MODULE-LEVEL GLOBALS FOR SINGLETON PATTERN. */
let _GLOBAL_KOKORO: unknown = null; // ← Kokoro model singleton
let _tts: TTSEngine | null = null; // ← TTS engine singleton

/* ── Model file search ─────────────────────────────────────────────────────── */

export const VOICE_MODELS = path.join(AXONIZ_HOME, "voice_models");

const _ONNX_NAMES = [
  "kokoro-v1.0.int8.onnx", // int8, 88MB — preferred
  "kokoro-v1.0.onnx", // f32,  310MB
  "kokoro-v1.0.fp16.onnx", // fp16, 169MB
];
const _VOICES_NAME = "voices-v1.0.bin";

const _SEARCH_DIRS = [
  PROJECT_ROOT,
  process.cwd(),
  VOICE_MODELS,
  path.join(os.homedir(), "Downloads"),
  os.homedir(),
];

/**
 * Search common locations for Kokoro model files.
 * Returns `[onnxPath, voicesPath]`, each `null` when not found.
 */
export function _find_kokoro_models(): [string | null, string | null] {
  let onnxPath: string | null = null;
  let voicesPath: string | null = null;

  const bigger = (p: string, min: number): boolean => {
    try {
      return fs.existsSync(p) && fs.statSync(p).size > min;
    } catch {
      return false;
    }
  };

  for (const d of _SEARCH_DIRS) {
    if (onnxPath === null) {
      for (const name of _ONNX_NAMES) {
        const p = path.join(d, name);
        if (bigger(p, 1024 * 1024)) {
          onnxPath = p;
          break;
        }
      }
    }
    if (voicesPath === null) {
      const p = path.join(d, _VOICES_NAME);
      if (bigger(p, 1024)) voicesPath = p;
    }
    if (onnxPath && voicesPath) break;
  }

  return [onnxPath, voicesPath];
}

/* ── Pluggable synthesis backends ──────────────────────────────────────────── */

/** Actionable error text for the unimplemented offline (pyttsx3) slot. */
export const OFFLINE_TTS_ERROR =
  "[ERROR] offline TTS unavailable — pyttsx3 is Python-only and has no Node.js " +
  "equivalent installed. Install kokoro-onnx model files (run: tsx src/voice/setup.ts) " +
  "or register a backend with registerTTSBackend('os-tts', …) that drives SAPI5 " +
  "(PowerShell System.Speech) / espeak / say.";

export const TTS_UNAVAILABLE_ERROR =
  "[ERROR] text-to-speech unavailable — no TTS backend is available. " +
  "Set AXONIZ voice models via src/voice/setup.ts (kokoro) or ensure network access " +
  "for msedge-tts, or register a backend with registerTTSBackend().";

export interface TTSBackend {
  /** Human readable name shown by `info()`. */
  readonly name: string;
  /** True when this backend can actually synthesize right now. */
  available(): boolean;
  /** Synthesize `text` to `filePath`. Returns true on success. */
  synthesize(text: string, filePath: string, engine: TTSEngine): Promise<boolean>;
  /** Optional: play directly without a temp file. */
  speak?(text: string, engine: TTSEngine): Promise<boolean>;
}

const _backends = new Map<string, TTSBackend>();

/** Register (or replace) a TTS backend at runtime. */
export function registerTTSBackend(name: string, backend: TTSBackend): void {
  _backends.set(name, backend);
}

export function unregisterTTSBackend(name: string): void {
  _backends.delete(name);
}

/* ── msedge-tts (PRIMARY, working path) ────────────────────────────────────── */

/**
 * Import shape of `msedge-tts` v2.0.8 (verified against
 * node_modules/msedge-tts/dist/index.d.ts):
 *
 *   import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
 *
 * The package exposes named class exports only (no default export) and is
 * CommonJS under `main` with `esModuleInterop` bridging it into ESM. Its output
 * is MP3 (`audio-24khz-48kbitrate-mono-mp3`) or WebM/Opus — never WAV — so the
 * edge path writes `.mp3`; use kokoro/piper when a real RIFF WAV is required.
 */
async function importMsEdgeTTS(): Promise<{
  MsEdgeTTS: new (options?: { enableLogger?: boolean }) => {
    setMetadata(
      voiceName: string,
      outputFormat: string,
      metadataOptions?: { wordBoundaryEnabled?: boolean },
    ): Promise<void>;
    toFile(
      dirPath: string,
      input: string,
      options?: { rate?: string | number; volume?: string | number; pitch?: string },
    ): Promise<{ audioFilePath: string; metadataFilePath: string | null }>;
    close(): void;
  };
  OUTPUT_FORMAT: Record<string, string>;
}> {
  return (await import("msedge-tts")) as unknown as {
    MsEdgeTTS: new (options?: { enableLogger?: boolean }) => {
      setMetadata(voiceName: string, outputFormat: string, metadataOptions?: object): Promise<void>;
      toFile(
        dirPath: string,
        input: string,
        options?: { rate?: string | number; volume?: string | number; pitch?: string },
      ): Promise<{ audioFilePath: string; metadataFilePath: string | null }>;
      close(): void;
    };
    OUTPUT_FORMAT: Record<string, string>;
  };
}

/** "+0%" / "-0%" mean "leave it alone" — SSML rejects a zero relative change. */
function prosodyValue(raw: string, fallback = "default"): string {
  if (!raw) return fallback;
  if (/^[+-]?0+(\.0+)?\s*%?$/.test(raw.trim())) return fallback;
  return raw;
}

const edgeBackend: TTSBackend = {
  name: "msedge-tts",
  available(): boolean {
    return true; // module is installed; network is required at call time
  },
  async synthesize(text: string, filePath: string, engine: TTSEngine): Promise<boolean> {
    const outDir = path.dirname(path.resolve(filePath));
    try {
      const { MsEdgeTTS, OUTPUT_FORMAT } = await importMsEdgeTTS();
      const tts = new MsEdgeTTS();
      const voice = engine.voice || EDGE_VOICE;
      await tts.setMetadata(voice, OUTPUT_FORMAT["AUDIO_24KHZ_48KBITRATE_MONO_MP3"]);
      const { audioFilePath } = await tts.toFile(outDir, text, {
        rate: prosodyValue(engine.rate, EDGE_RATE),
        volume: prosodyValue(engine.volume, "+0%"),
      });
      tts.close();

      // `toFile` names the file after the voice; move it onto the requested path.
      const target = path.resolve(filePath);
      if (path.resolve(audioFilePath) !== target) {
        fs.copyFileSync(audioFilePath, target);
        try {
          fs.unlinkSync(audioFilePath);
        } catch {
          /* best effort */
        }
      }
      const size = fileSize(target);
      if (size <= 0) {
        engine.storeLastError("[ERROR] msedge-tts produced an empty file");
        return false;
      }
      return true;
    } catch (e) {
      // Offline machines land here — this is the expected online-only failure.
      engine.storeLastError(
        `[ERROR] msedge-tts synthesis failed (online Microsoft Edge Read Aloud API ` +
          `unreachable?): ${errText(e)}`,
      );
      return false;
    }
  },
};

/* ── Offline slot (pyttsx3 equivalent) — clearly unimplemented ─────────────── */

/**
 * TODO(port): replaces `pyttsx3` (SAPI5/espeak). There is no Node package for
 * offline OS speech synthesis installed on this machine. Recommended
 * replacement: shell out to PowerShell `System.Speech.Synthesis.SpeechSynthesizer`
 * on Windows, `say` on macOS, `espeak-ng` on Linux — or register a backend with
 * `registerTTSBackend("os-tts", …)`. Until then `synthesize()` fails with a
 * descriptive error and never throws.
 */
const osTtsBackend: TTSBackend = {
  name: "os-tts (unimplemented)",
  available(): boolean {
    return false;
  },
  async synthesize(_text: string, _filePath: string, engine: TTSEngine): Promise<boolean> {
    engine.storeLastError(OFFLINE_TTS_ERROR);
    logger.debug(OFFLINE_TTS_ERROR);
    return false;
  },
  async speak(_text: string, engine: TTSEngine): Promise<boolean> {
    engine.storeLastError(OFFLINE_TTS_ERROR);
    return false;
  },
};

/* ── TTSEngine ─────────────────────────────────────────────────────────────── */

export interface TTSInfo {
  backend: string;
  voice: string;
  rate: string;
  available: boolean;
  kokoro_onnx: string | null;
}

export class TTSEngine {
  /** AXONIZ's voice output engine — offline-first, highest quality available. */
  rate: string;
  volume: string;
  speed: number;
  provider: string;
  voice: string;

  private _backend: string;
  private _model: unknown = null;
  private _onnxPath: string | null = null;
  private _voicesPath: string | null = null;
  private _lastError = "";

  constructor(
    voice: string | null = null,
    rate: string = EDGE_RATE,
    volume = "+0%",
    provider = "auto",
    speed: number = KOKORO_SPEED,
  ) {
    this.rate = rate;
    this.volume = volume;
    this.speed = speed;
    this.provider = provider;
    this._backend = this._detect_backend();
    this._model = null;
    this._onnxPath = null;
    this._voicesPath = null;
    this.voice = voice || this._default_voice();
  }

  /* ── Backend detection ──────────────────────────────────────────────────── */

  private _detect_backend(): string {
    if (this.provider !== "auto") return this.provider;

    // 1. Kokoro (best quality offline) — Python probed `kokoro_onnx` + sounddevice.
    if (_backends.has("kokoro")) return "kokoro";
    const [onnx, voices] = _find_kokoro_models();
    if (onnx && voices) return "kokoro";

    // 2. MMS-TTS (robust local VITS) — only check the path, do not load.
    if (fs.existsSync(path.join(MMS_MODEL_PATH, "config.json"))) return "mms";

    // 2b. Piper (module or binary)
    if (_backends.has("piper")) return "piper";
    if (whichSync("piper") || whichSync("piper-tts")) return "piper_bin";

    // 3. edge-tts — the only engine with a working Node implementation here.
    if (_backends.has("edge") || edgeBackend.available()) return "edge";

    // 4. pyttsx3 — unimplemented offline slot.
    if (_backends.has("os-tts")) return "os-tts";

    return "print";
  }

  private _default_voice(): string {
    const byBackend: Record<string, string> = {
      kokoro: KOKORO_VOICE,
      mms: "",
      piper: PIPER_VOICE,
      piper_bin: PIPER_VOICE,
      edge: EDGE_VOICE,
      "os-tts": "",
      print: "",
    };
    return byBackend[this._backend] ?? "";
  }

  get backend(): string {
    return this._backend;
  }

  /** Last `[ERROR] …` string produced by a degraded path. */
  get lastError(): string {
    return this._lastError;
  }

  get is_available(): boolean {
    return this._backend !== "print" && this._backend !== "none";
  }

  get isAvailable(): boolean {
    return this.is_available;
  }

  /* ── Public API ─────────────────────────────────────────────────────────── */

  /** Speak `text` aloud. Returns true when something handled it. */
  async speak(text: string): Promise<boolean> {
    if (!text || !text.trim()) return false;

    // Define priority order (Python: self._backend == "auto" → the whole chain).
    const backends =
      this._backend === "auto"
        ? ["kokoro", "mms", "piper", "edge", "os-tts"]
        : [this._backend];

    for (const b of backends) {
      try {
        if (await this._speakBackend(b, text)) return true;
      } catch (e) {
        logger.debug(`[TTS] Backend ${b} failed: ${errText(e)}, trying next...`);
      }
    }

    // Last resort mirrors Python `print(f"[AXONIZ] {text}")`.
    process.stdout.write(`[AXONIZ] ${text}\n`);
    return true;
  }

  /** Fire-and-forget speak (replaces `threading.Thread(target=self.speak, daemon=True)`). */
  speakAsync(text: string): void {
    void this.speak(text).catch((e: unknown) => {
      logger.debug(`[TTS] speakAsync error: ${errText(e)}`);
    });
  }

  /**
   * Synthesize `text` to `filePath`.
   *
   * `filePath` should end in `.mp3` for edge (the only live engine) — the edge
   * API cannot emit WAV. When the requested extension is `.wav` and a
   * WAV-capable backend (kokoro/piper/mms) is unavailable, a clear
   * `[ERROR] …` is stored in `lastError` and false is returned.
   */
  async synthesize_to_file(text: string, filePath: string): Promise<boolean> {
    try {
      if (this._backend === "mms") return await this._mms_to_file(text, filePath);
      if (this._backend === "kokoro") return await this._kokoro_to_file(text, filePath);
      if (this._backend === "edge" || this._backend === "auto") {
        return await this._edge_to_file(text, filePath);
      }
      if (this._backend === "os-tts" || this._backend === "pyttsx3") {
        await osTtsBackend.synthesize(text, filePath, this);
        return false;
      }
      this.storeLastError(
        `[ERROR] no synthesis backend for '${this._backend}' — file output unavailable.`,
      );
      return false;
    } catch (e) {
      logger.debug(`[TTS] file synthesis failed: ${errText(e)}`);
      this.storeLastError(`[ERROR] TTS file synthesis failed: ${errText(e)}`);
      return false;
    }
  }

  async synthesizeToFile(text: string, filePath: string): Promise<boolean> {
    return this.synthesize_to_file(text, filePath);
  }

  async synthesize_to_bytes(text: string): Promise<Buffer | null> {
    const tmp = tempPath(".mp3");
    try {
      if (await this.synthesize_to_file(text, tmp)) {
        return fs.readFileSync(tmp);
      }
      return null;
    } catch {
      return null;
    } finally {
      unlinkQuiet(tmp);
    }
  }

  async synthesizeToBytes(text: string): Promise<Buffer | null> {
    return this.synthesize_to_bytes(text);
  }

  /* ── MMS-TTS ────────────────────────────────────────────────────────────── */

  /**
   * TODO(port): Python loaded a local VITS model via `transformers` + `torch`
   * (`VitsModel.from_pretrained`). `@huggingface/transformers` is NOT installed
   * on this machine and its install repeatedly failed. Recommended replacement:
   * `@huggingface/transformers` (VITS/MMS ONNX) once reachable.
   */
  private async _get_mms_model(): Promise<unknown> {
    if (this._model === null) {
      logger.info(`[TTS] Loading MMS-TTS from: ${MMS_MODEL_PATH}`);
      throw new Error(
        "[ERROR] MMS-TTS unavailable — the Python path used transformers+torch " +
          "(VitsModel); '@huggingface/transformers' is not installed and its " +
          "install failed on this machine. Install it or register a TTS backend.",
      );
    }
    return this._model;
  }

  private async _speak_mms(text: string): Promise<boolean> {
    const tmp = tempPath(".wav");
    try {
      if (await this._mms_to_file(text, tmp)) return await _play_file(tmp);
      return false;
    } finally {
      unlinkQuiet(tmp);
    }
  }

  private async _mms_to_file(text: string, filePath: string): Promise<boolean> {
    try {
      const registered = _backends.get("mms");
      if (registered) {
        this._model = registered;
        return await registered.synthesize(text, filePath, this);
      }
      await this._get_mms_model();
      return false;
    } catch (e) {
      logger.debug(`[TTS] MMS file error: ${errText(e)}`);
      this.storeLastError(errText(e));
      return false;
    }
  }

  /* ── Kokoro ─────────────────────────────────────────────────────────────── */

  /**
   * TODO(port): Python used `kokoro_onnx.Kokoro`. `kokoro-js` is NOT installed
   * and cannot be installed on this machine's npm connection. The model-file
   * discovery logic is fully ported and `_GLOBAL_KOKORO` stays as the singleton
   * slot; `registerTTSBackend("kokoro", …)` is the runtime hook.
   */
  private async _get_kokoro(): Promise<unknown> {
    if (_GLOBAL_KOKORO === null) {
      const [onnx, voices] = _find_kokoro_models();
      if (!onnx || !voices) {
        throw new Error(
          "[ERROR] Kokoro model files not found. " +
            "Run: npx tsx src/voice/setup.ts  (or register a TTS backend)",
        );
      }
      this._onnxPath = onnx;
      this._voicesPath = voices;
      logger.info(`[TTS] Loading Kokoro globally: ${path.basename(onnx)}`);
      const registered = _backends.get("kokoro");
      if (!registered) {
        throw new Error(
          "[ERROR] kokoro engine unavailable — 'kokoro-js' is not installed " +
            "(kokoro-onnx is Python-only). registerTTSBackend('kokoro', …) to supply one.",
        );
      }
      _GLOBAL_KOKORO = registered;
    }
    this._model = _GLOBAL_KOKORO;
    return this._model;
  }

  private async _speak_kokoro(text: string): Promise<boolean> {
    try {
      const tmp = tempPath(".wav");
      try {
        if (!(await this._kokoro_to_file(text, tmp))) return false;
        return await _play_file(tmp);
      } finally {
        unlinkQuiet(tmp);
      }
    } catch (e) {
      logger.debug(`[TTS] Kokoro speak error: ${errText(e)}`);
      this.storeLastError(errText(e));
      return false;
    }
  }

  /**
   * Write Kokoro output to a real RIFF WAV using the hand-rolled header in
   * `src/voice/wav.ts` — the Python `soundfile.write` equivalent.
   */
  private async _kokoro_to_file(text: string, filePath: string): Promise<boolean> {
    try {
      const kokoro = (_backends.get("kokoro") ?? (await this._get_kokoro())) as
        | { create?: (t: string, o: unknown) => Promise<{ samples: Float32Array; rate: number }> }
        | undefined;
      if (!kokoro?.create) {
        throw new Error(
          "[ERROR] kokoro backend does not implement create(); cannot synthesize to file.",
        );
      }
      const { samples, rate } = await kokoro.create(text, {
        voice: this.voice,
        speed: this.speed,
        lang: "en-us",
      });
      writeWav(filePath, samples, rate, 1);
      return fs.existsSync(filePath) && fileSize(filePath) > 0;
    } catch (e) {
      logger.debug(`[TTS] Kokoro file error: ${errText(e)}`);
      this.storeLastError(errText(e));
      return false;
    }
  }

  /* ── Piper ──────────────────────────────────────────────────────────────── */

  /**
   * TODO(port): Python used the `piper` module (or the `piper` binary).
   * No Node binding is installed. The binary path is still honoured: if
   * `piper`/`piper-tts` is on PATH we shell out exactly like `_speak_piper_bin`.
   */
  private async _speak_piper(text: string): Promise<boolean> {
    if (whichSync("piper") || whichSync("piper-tts")) return this._speak_piper_bin(text);
    this.storeLastError(
      "[ERROR] piper unavailable — no Node 'piper' binding and no piper binary on PATH.",
    );
    return false;
  }

  private async _speak_piper_bin(text: string): Promise<boolean> {
    const tmp = tempPath(".wav");
    try {
      const bin = whichSync("piper") ?? whichSync("piper-tts") ?? "piper";
      const { spawn } = await import("node:child_process");
      const ok = await new Promise<boolean>((resolve) => {
        const child = spawn(bin, ["--model", this.voice, "--output_file", tmp], {
          windowsHide: true,
        });
        child.on("error", () => resolve(false));
        child.on("close", (code) => resolve(code === 0));
        try {
          child.stdin?.end(text, "utf8");
        } catch {
          /* best effort */
        }
      });
      if (ok) return await _play_file(tmp);
      return false;
    } catch (e) {
      logger.debug(`[TTS] piper bin error: ${errText(e)}`);
      this.storeLastError(`[ERROR] piper binary failed: ${errText(e)}`);
      return false;
    } finally {
      unlinkQuiet(tmp);
    }
  }

  /* ── edge (msedge-tts) ──────────────────────────────────────────────────── */

  private async _speak_edge(text: string): Promise<boolean> {
    const tmp = tempPath(".mp3");
    try {
      if (await this._edge_to_file(text, tmp)) return await _play_file(tmp);
      return false;
    } catch (e) {
      logger.debug(`[TTS] edge-tts error: ${errText(e)}`);
      this.storeLastError(`[ERROR] msedge-tts error: ${errText(e)}`);
      return false;
    } finally {
      unlinkQuiet(tmp);
    }
  }

  private async _edge_to_file(text: string, filePath: string): Promise<boolean> {
    const backend = _backends.get("edge") ?? edgeBackend;
    const ok = await backend.synthesize(text, filePath, this);
    return ok && fs.existsSync(filePath) && fileSize(filePath) > 0;
  }

  /* ── pyttsx3 slot ───────────────────────────────────────────────────────── */

  private async _speak_pyttsx3(text: string): Promise<boolean> {
    return osTtsBackend.speak ? osTtsBackend.speak(text, this) : false;
  }

  /* ── Info ───────────────────────────────────────────────────────────────── */

  info(): TTSInfo {
    const [onnx] = _find_kokoro_models();
    return {
      backend: this._backend,
      voice: this.voice,
      rate: this.rate,
      available: this.is_available,
      kokoro_onnx: onnx ? path.basename(onnx) : null,
    };
  }

  set_voice(voice: string): void {
    this.voice = voice;
    this._model = null;
  }

  setVoice(voice: string): void {
    this.set_voice(voice);
  }

  set_speed(speed: number): void {
    this.speed = speed;
  }

  setSpeed(speed: number): void {
    this.set_speed(speed);
  }

  /** Record an `[ERROR] …` string and log it. Never throws. */
  storeLastError(msg: string): void {
    this._lastError = msg;
    logger.warning(msg);
  }

  /* ── dispatch ───────────────────────────────────────────────────────────── */

  private async _speakBackend(name: string, text: string): Promise<boolean> {
    switch (name) {
      case "mms":
        return this._speak_mms(text);
      case "kokoro":
        return this._speak_kokoro(text);
      case "piper":
      case "piper_bin":
        return this._speak_piper(text);
      case "edge":
        return this._speak_edge(text);
      case "os-tts":
      case "pyttsx3":
        return this._speak_pyttsx3(text);
      default: {
        const custom = _backends.get(name);
        if (custom?.speak) return custom.speak(text, this);
        if (custom) {
          const tmp = tempPath(".mp3");
          try {
            return await custom.synthesize(text, tmp, this);
          } finally {
            unlinkQuiet(tmp);
          }
        }
        return false;
      }
    }
  }
}

/* ── Audio playback ────────────────────────────────────────────────────────── */

/**
 * Play an audio file through the registered audio-output driver.
 *
 * TODO(port): Python tried `soundfile`+`sounddevice`, then `winsound`/`afplay`/
 * `mpg123`/`ffplay`. There is no in-process Node audio dependency here, so this
 * shells out to an OS player (see `getAudioOutputDriver()` in src/voice/wav.ts).
 */
export async function _play_file(filePath: string): Promise<boolean> {
  const driver: AudioOutputDriver | null = getAudioOutputDriver();
  if (!driver) {
    logger.warning(AUDIO_OUTPUT_MISSING_ERROR);
    return false;
  }
  try {
    await driver.playFile(filePath);
    return true;
  } catch (e) {
    logger.debug(`[TTS] _play_file error via ${driver.name}: ${errText(e)}`);
    return false;
  }
}

export function _which(name: string): string | null {
  return whichSync(name);
}

/* ── Module-level speak helper (used by light_daemon) ──────────────────────── */

/**
 * Speak text with the module singleton. Ports the module-level `_speak()` in
 * `light_daemon.py` so the daemon has a one-call path to the engine.
 */
export async function speakWithFallback(text: string): Promise<boolean> {
  if (!text) return false;
  const engine = get_tts();
  const ok = await engine.speak(text);
  if (engine.lastError) logger.debug(engine.lastError);
  return ok;
}

/* ── Singleton ─────────────────────────────────────────────────────────────── */

function ttsConfigFromDisk(): {
  voice?: string;
  rate?: string;
  speed?: number;
  provider?: string;
} {
  try {
    const cfg = loadConfig() as unknown as Record<string, unknown>;
    const vcfg = (cfg["voice"] ?? cfg["tts"] ?? {}) as Record<string, unknown>;
    return {
      voice: typeof vcfg["voice"] === "string" ? vcfg["voice"] : undefined,
      rate: typeof vcfg["rate"] === "string" ? vcfg["rate"] : undefined,
      speed: typeof vcfg["speed"] === "number" ? vcfg["speed"] : undefined,
      provider: typeof vcfg["provider"] === "string" ? vcfg["provider"] : undefined,
    };
  } catch {
    return {};
  }
}

export function get_tts(
  provider = "auto",
  kwargs: { voice?: string | null; rate?: string; speed?: number } = {},
): TTSEngine {
  if (_tts === null) {
    const vcfg = ttsConfigFromDisk();
    _tts = new TTSEngine(
      vcfg.voice ?? kwargs.voice ?? null,
      vcfg.rate ?? kwargs.rate ?? EDGE_RATE,
      "+0%",
      vcfg.provider ?? provider,
      vcfg.speed ?? kwargs.speed ?? KOKORO_SPEED,
    );
  }
  return _tts;
}

/** camelCase alias of `get_tts`. */
export const getTts = get_tts;

/** Test/DI hook — replace the singleton. */
export function setTts(engine: TTSEngine | null): void {
  _tts = engine;
}

/* ── helpers ───────────────────────────────────────────────────────────────── */

function tempPath(ext: string): string {
  return path.join(
    os.tmpdir(),
    `axoniz-tts-${Date.now()}-${Math.floor(Math.random() * 1e6)}${ext}`,
  );
}

function fileSize(p: string): number {
  try {
    return fs.statSync(p).size;
  } catch {
    return 0;
  }
}

function unlinkQuiet(p: string): void {
  try {
    if (p) fs.unlinkSync(p);
  } catch {
    /* best effort, mirrors Python `except: pass` */
  }
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
