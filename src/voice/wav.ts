/**
 * src/voice/wav.ts
 * =================
 * Shared low-level audio primitives for the AXONIZ voice stack.
 *
 * The Python stack leaned on `soundfile` / `scipy.io.wavfile` / `wave` for file
 * I/O and on `sounddevice` / `pyaudio` for live device I/O. Neither exists in
 * Node.js here, so this module provides:
 *
 *   1. A hand-rolled 44-byte RIFF/PCM WAV writer + reader (`node:fs` only).
 *   2. The pluggable audio-driver registry used for live capture/playback.
 *
 * TODO(port): live mic capture and speaker playback need a native driver.
 *   Recommended replacements (verify install on this machine first):
 *     - `naudiodon2` / `audify` / `speaker` / `node-record-lpcm16` (PortAudio)
 *   Until one is registered via `setAudioInputDriver()` / `setAudioOutputDriver()`
 *   every entry point returns a descriptive `[ERROR] ...` string and never throws.
 *
 * This file is an internal helper for `src/voice/*` — it is not part of the
 * public `__init__.py` export surface.
 */

import fs from "node:fs";
import path from "node:path";
import { whichSync } from "../core/which.js";

/** Kokoro/Moonshine/Whisper/edge-tts all agree on 16 kHz mono for AXONIZ's mic path. */
export const SAMPLE_RATE = 16_000;

/** RIFF header is exactly 44 bytes for a canonical PCM WAV. */
export const WAV_HEADER_BYTES = 44;

/* ────────────────────────────────────────────────────────────────────────────
 * WAV encode / decode (replaces `soundfile` + Python `wave`)
 * ──────────────────────────────────────────────────────────────────────────── */

/** Clamp a float sample in [-1, 1] to a signed 16-bit integer. */
function toInt16(sample: number): number {
  const v = Math.max(-1, Math.min(1, sample));
  // 32767 for positive, 32768 for negative — matches numpy's astype(int16) edge.
  return v < 0 ? Math.round(v * 0x8000) : Math.round(v * 0x7fff);
}

/**
 * Build a complete 16-bit PCM mono WAV file image in memory.
 * Mirrors what Python's `wave` module + `numpy.tobytes()` produced.
 */
export function encodeWavPcm16(pcm: Buffer, sampleRate: number = SAMPLE_RATE, channels = 1): Buffer {
  const header = Buffer.alloc(WAV_HEADER_BYTES);
  const byteRate = sampleRate * channels * 2;
  const blockAlign = channels * 2;

  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4); // RIFF chunk size
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // fmt chunk size (PCM)
  header.writeUInt16LE(1, 20); // audio format = PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

/** Convert a float32 sample array ([-1, 1]) into little-endian 16-bit PCM bytes. */
export function floatToPcm16(samples: Float32Array): Buffer {
  const out = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) out.writeInt16LE(toInt16(samples[i] ?? 0), i * 2);
  return out;
}

/** Convert little-endian 16-bit PCM bytes into a float32 sample array. */
export function pcm16ToFloat(pcm: Buffer): Float32Array {
  const n = Math.floor(pcm.length / 2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = pcm.readInt16LE(i * 2) / 32768;
  return out;
}

/**
 * Write a 16-bit PCM WAV file.
 * Handles both `Float32Array` (float samples in [-1,1]) and raw PCM `Buffer`.
 */
export function writeWav(
  filePath: string,
  samples: Float32Array | Int16Array | Buffer,
  sampleRate: number = SAMPLE_RATE,
  channels = 1,
): void {
  let pcm: Buffer;
  if (Buffer.isBuffer(samples)) {
    pcm = samples;
  } else if (samples instanceof Float32Array) {
    pcm = floatToPcm16(samples);
  } else {
    pcm = Buffer.alloc(samples.length * 2);
    for (let i = 0; i < samples.length; i++) pcm.writeInt16LE(samples[i] ?? 0, i * 2);
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, encodeWavPcm16(pcm, sampleRate, channels));
}

export interface DecodedWav {
  samples: Float32Array;
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
}

/**
 * Decode a PCM WAV file. Walks the chunk list rather than assuming 44 bytes so
 * files with LIST/fact chunks still load. Returns `null` when the file is not a
 * readable PCM WAV (mirrors `soundfile.read` raising + the Python `try/except`).
 */
export function readWav(filePath: string): DecodedWav | null {
  let buf: Buffer;
  try {
    buf = fs.readFileSync(filePath);
  } catch {
    return null;
  }
  if (buf.length < WAV_HEADER_BYTES) return null;
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") return null;

  let offset = 12;
  let sampleRate = SAMPLE_RATE;
  let channels = 1;
  let bitsPerSample = 16;
  let audioFormat = 1;
  let dataStart = -1;
  let dataLength = 0;

  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt " && size >= 16 && body + 16 <= buf.length) {
      audioFormat = buf.readUInt16LE(body);
      channels = Math.max(1, buf.readUInt16LE(body + 2));
      sampleRate = buf.readUInt32LE(body + 4);
      bitsPerSample = buf.readUInt16LE(body + 14);
    } else if (id === "data") {
      dataStart = body;
      dataLength = Math.min(size, buf.length - body);
      break;
    }
    offset = body + size + (size % 2); // chunks are word aligned
  }

  if (dataStart < 0) return null;
  if (audioFormat !== 1 || bitsPerSample !== 16) {
    // Only 16-bit PCM is produced by this stack; anything else is unsupported.
    return null;
  }

  const pcm = buf.subarray(dataStart, dataStart + dataLength);
  return { samples: pcm16ToFloat(pcm), sampleRate, channels, bitsPerSample };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Energy helpers (used by VAD in stt.ts / light_daemon.ts)
 * ──────────────────────────────────────────────────────────────────────────── */

/** Mean absolute amplitude of 16-bit PCM in [0, 32767] — Python `sum(abs(s))/n`. */
export function pcm16MeanAbs(pcm: Buffer): number {
  const n = Math.floor(pcm.length / 2);
  if (n === 0) return 0;
  let acc = 0;
  for (let i = 0; i < n; i++) acc += Math.abs(pcm.readInt16LE(i * 2));
  return acc / n;
}

/** Root-mean-square of float samples — Python `np.sqrt(np.mean(chunk ** 2))`. */
export function rmsFloat(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let acc = 0;
  for (let i = 0; i < samples.length; i++) acc += samples[i]! * samples[i]!;
  return Math.sqrt(acc / samples.length);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Audio driver registry (replaces sounddevice / pyaudio)
 * ──────────────────────────────────────────────────────────────────────────── */

export interface AudioRecordOptions {
  /** Maximum number of seconds to capture. */
  maxSeconds: number;
  /** 16-bit mono PCM sample rate. */
  sampleRate: number;
  /** Stop after this many seconds of continuous near-silence. */
  silenceSeconds?: number;
  /** Mean-absolute-amplitude threshold (0..32767) counted as speech. */
  energyThreshold?: number;
  /** Cooperative cancellation. */
  signal?: AbortSignal;
}

export interface AudioInputDriver {
  readonly name: string;
  /** Capture raw 16-bit 16 kHz mono PCM. Empty buffer == nothing heard. */
  record(options: AudioRecordOptions): Promise<Buffer>;
}

export interface AudioOutputDriver {
  readonly name: string;
  /** Play a WAV (or any file the OS codec handles). Resolves when playback ends. */
  playFile(filePath: string): Promise<void>;
}

let _inputDriver: AudioInputDriver | null = null;
let _outputDriver: AudioOutputDriver | null = null;

export function setAudioInputDriver(driver: AudioInputDriver | null): void {
  _inputDriver = driver;
}

export function getAudioInputDriver(): AudioInputDriver | null {
  return _inputDriver;
}

export function setAudioOutputDriver(driver: AudioOutputDriver | null): void {
  _outputDriver = driver;
}

/**
 * Playback driver, if one is available.
 *
 * TODO(port): there is no in-process audio I/O dependency. The fallbacks below
 * shell out to OS players, which is what the Python `_play_file()` did after
 * `sounddevice` failed. Recommended real replacement: `speaker` or `audify`.
 */
export function getAudioOutputDriver(): AudioOutputDriver | null {
  if (_outputDriver) return _outputDriver;
  const cli = detectCliPlayer();
  if (cli) return cli;
  if (process.platform === "win32") return powershellPlayer;
  return null;
}

export const AUDIO_INPUT_MISSING_ERROR =
  "[ERROR] no audio input driver registered — microphone capture unavailable. " +
  "Register one with setAudioInputDriver() from src/voice/wav.ts, or install a " +
  "PortAudio binding (e.g. naudiodon2 / audify / node-record-lpcm16).";

export const AUDIO_OUTPUT_MISSING_ERROR =
  "[ERROR] no audio output driver available — playback unavailable. " +
  "Register one with setAudioOutputDriver() from src/voice/wav.ts, or install a " +
  "speaker backend (e.g. speaker / audify / naudiodon2).";

/** Run an external command, resolving with `{ code, stdout, stderr }` (never rejects). */
export async function runCommand(
  cmd: string,
  args: string[],
  timeoutMs = 60_000,
  stdin?: Buffer,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const { spawn } = await import("node:child_process");
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { windowsHide: true });
    } catch (e) {
      resolve({ code: -1, stdout: "", stderr: String(e) });
      return;
    }
    let stdout = "";
    let stderr = "";
    let done = false;
    const finish = (code: number): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    };
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* best effort */
      }
      finish(-1);
    }, timeoutMs);
    child.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString("utf8");
    });
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString("utf8");
    });
    child.on("error", (e: Error) => {
      stderr += String(e);
      finish(-1);
    });
    child.on("close", (code: number | null) => finish(code ?? -1));
    if (stdin) {
      try {
        child.stdin?.end(stdin);
      } catch {
        /* best effort */
      }
    }
  });
}

/** Escape a value for a single-quoted PowerShell string literal. */
export function psQuote(s: string): string {
  return s.replace(/'/g, "''");
}

/**
 * Windows playback via WPF MediaPlayer — handles mp3 and wav, no extra install.
 * This is the Node analogue of the Python `PowerShell MediaPlayer` fallback.
 */
const powershellPlayer: AudioOutputDriver = {
  name: "powershell-mediaplayer",
  async playFile(filePath: string): Promise<void> {
    const secs = Math.max(1, fileSize(filePath) / 32_768 + 1);
    const ps =
      `$p=New-Object System.Windows.Media.MediaPlayer;` +
      `$p.Open([Uri]::new('${psQuote(path.resolve(filePath))}'));` +
      `$p.Play(); Start-Sleep -Milliseconds ${Math.round(secs * 1000)}; $p.Close()`;
    await runCommand("powershell", ["-NoProfile", "-c", ps], 120_000);
  },
};

function detectCliPlayer(): AudioOutputDriver | null {
  const platform = process.platform;
  const candidates: Array<{ bin: string; args: (p: string) => string[] }> =
    platform === "darwin"
      ? [{ bin: "afplay", args: (p) => [p] }]
      : platform === "win32"
        ? []
        : [
            { bin: "mpg123", args: (p) => ["-q", p] },
            { bin: "ffplay", args: (p) => ["-nodisp", "-autoexit", "-loglevel", "quiet", p] },
            { bin: "aplay", args: (p) => [p] },
            { bin: "paplay", args: (p) => [p] },
          ];
  for (const c of candidates) {
    if (!whichSync(c.bin)) continue;
    const bin = c.bin;
    const argsFor = c.args;
    return {
      name: `${bin}-cli`,
      async playFile(p: string): Promise<void> {
        await runCommand(bin, argsFor(p), 60_000);
      },
    };
  }
  return null;
}

function fileSize(p: string): number {
  try {
    return fs.statSync(p).size;
  } catch {
    return 0;
  }
}
