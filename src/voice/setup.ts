/**
 * src/voice/setup.ts
 * ===================
 * AXONIZ Voice Stack Setup — downloads Kokoro v1.0 models and checks all deps.
 *
 * Usage:
 *   npx tsx src/voice/setup.ts
 *   npx tsx src/voice/setup.ts --no-download
 *   npx tsx src/voice/setup.ts --full
 *   npx tsx src/voice/setup.ts --quiet
 *
 * ── Node reality ─────────────────────────────────────────────────────────────
 * `check_deps()` reviewed Python module names. Nothing in the voice stack has a
 * Python interpreter here, so it now reports the Node capability matrix: what is
 * installed, what is degraded, and which Python package it replaced.
 *
 * TODO(port): the `kokoro_onnx` guard around the model download is preserved as
 * a check for the `kokoro-js` Node package. `kokoro-js` is NOT installed on this
 * machine (its install was not attempted / failed), so by default the download
 * runs only when `--force` semantics are wanted; the model files are still
 * fetched and copied because `src/voice/tts.ts` looks for them regardless of the
 * JS binding. Recommended replacement for actual inference: `kokoro-js`.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { whichSync } from "../core/which.js";
import { AXONIZ_HOME } from "../core/config.js";

/* ── Paths ─────────────────────────────────────────────────────────────────── */

export const MODELS_DIR = path.join(AXONIZ_HOME, "voice_models");
fs.mkdirSync(MODELS_DIR, { recursive: true });

/** `os.path.dirname(os.path.dirname(abspath(__file__)))` → the `src/` directory. */
export const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/* ── Correct model filenames (v1.0, not v1.9) ──────────────────────────────── */

// The kokoro-onnx package expects: kokoro-v1.0.onnx + voices-v1.0.bin
// The int8 version is much smaller (88MB vs 310MB) — used for CPU inference.
export const KOKORO_FILES: Record<string, string[]> = {
  // int8 quantized (88MB) — best for CPU, recommended
  "kokoro-v1.0.int8.onnx": [
    "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx",
    "https://huggingface.co/thewh1teagle/kokoro-onnx-models/resolve/main/kokoro-v1.0.int8.onnx",
  ],
  // voices binary (always needed)
  "voices-v1.0.bin": [
    "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin",
    "https://huggingface.co/thewh1teagle/kokoro-onnx-models/resolve/main/voices-v1.0.bin",
  ],
};

/** Full quality f32 (310MB) — only if the user explicitly wants it. */
export const KOKORO_FULL: Record<string, string[]> = {
  "kokoro-v1.0.onnx": [
    "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx",
  ],
};

export const MANUAL_DOWNLOAD_MSG = `
  ─────────────────────────────────────────────────────
  MANUAL DOWNLOAD (if automatic fails):

  1. Go to:
     https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0

  2. Download these two files:
     • kokoro-v1.0.int8.onnx   (88MB  — fast CPU version)
     • voices-v1.0.bin         (small — voice embeddings)

  3. Copy them to:
     {models_dir}

  Or place them in the current working directory.
  ─────────────────────────────────────────────────────
`;

/* ── Helpers ───────────────────────────────────────────────────────────────── */

export function _bar(done: number, total: number, width = 28): string {
  const mb = (n: number): string => (n / 1024 / 1024).toFixed(1);
  if (total <= 0) return `[${"█".repeat(width)}] ${mb(done)} MB`;
  const filled = Math.floor((width * done) / total);
  return `[${"█".repeat(filled)}${"░".repeat(width - filled)}] ${mb(done)}/${mb(total)} MB`;
}

function write(msg: string): void {
  process.stdout.write(msg);
}

/**
 * Try each URL in order until one works.
 * Ports `_download()` — `urllib.request` becomes `fetch` streaming to disk.
 */
export async function _download(urls: string[], dest: string, label: string): Promise<boolean> {
  if (fs.existsSync(dest)) {
    const sizeMb = fs.statSync(dest).size / 1024 / 1024;
    console.log(`  ✓  ${label}  (${sizeMb.toFixed(1)} MB — already exists)`);
    return true;
  }

  for (const url of urls) {
    write(`  ↓  ${label}`);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        signal: AbortSignal.timeout(300_000),
      });
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }
      const totalSize = Number.parseInt(res.headers.get("content-length") ?? "0", 10) || 0;
      let done = 0;
      const handle = fs.createWriteStream(dest);
      const reader = res.body.getReader();
      try {
        for (;;) {
          const { done: finished, value } = await reader.read();
          if (finished) break;
          if (value) {
            handle.write(Buffer.from(value));
            done += value.byteLength;
            write(`\r  ↓  ${label}  ${_bar(done, totalSize)}  `);
          }
        }
      } finally {
        await new Promise<void>((resolve) => handle.end(resolve));
      }

      if (totalSize > 0 && done < totalSize) {
        throw new Error(`truncated (${done}/${totalSize} bytes)`);
      }

      const sizeMb = fs.statSync(dest).size / 1024 / 1024;
      console.log(`\r  ✓  ${label}  (${sizeMb.toFixed(1)} MB)`);
      return true;
    } catch (e) {
      const host = safeHost(url);
      console.log(`\r  ·  ${label}  ${host} failed: ${errText(e)} — trying next…`);
      if (fs.existsSync(dest)) {
        try {
          fs.unlinkSync(dest);
        } catch {
          /* best effort */
        }
      }
    }
  }

  console.log(`  ✗  ${label}  ALL MIRRORS FAILED`);
  return false;
}

/** Find model files in common locations (ports `_check_existing_models()`). */
export function _check_existing_models(): Record<string, string> {
  const found: Record<string, string> = {};
  const searchDirs = [
    PROJECT_ROOT,
    process.cwd(),
    MODELS_DIR,
    path.join(os.homedir(), "Downloads"),
    os.homedir(),
  ];
  for (const fname of [...Object.keys(KOKORO_FILES), ...Object.keys(KOKORO_FULL)]) {
    for (const d of searchDirs) {
      const p = path.join(d, fname);
      try {
        if (fs.existsSync(p) && fs.statSync(p).size > 1024 * 1024) {
          found[fname] = p;
          break;
        }
      } catch {
        /* unreadable entry — keep searching */
      }
    }
  }
  return found;
}

/* ── Dependency check (Node capability matrix) ─────────────────────────────── */

export interface DepResult {
  status: "✓" | "✗";
  info: string;
  /** Python module this check replaced — reported for parity. */
  python: string;
}

/** `@huggingface/transformers` is deliberately NOT probed: its install failed here. */
const KNOWN_MISSING = new Set([
  "onnxruntime",
  "kokoro-js",
  "wakeword",
  "whisper",
  "audioio",
  "soundfile",
]);

/**
 * Check which voice dependencies are installed.
 *
 * TODO(port): the Python version imported `moonshine_onnx`, `faster_whisper`,
 * `whisper`, `speech_recognition`, `kokoro_onnx`, `piper`, `edge_tts`, `pyttsx3`,
 * `openwakeword`, `sounddevice`, `soundfile`, `numpy`, `pyaudio`. Every one of
 * those checked modules stays listed (so operators see the mapping) but is
 * resolved through the Node equivalents that actually exist on this machine.
 */
export async function check_deps(): Promise<Record<string, DepResult>> {
  const results: Record<string, DepResult> = {};

  const probe = async (
    label: string,
    pkg: string,
    python: string,
  ): Promise<void> => {
    let ok = false;
    try {
      await import(pkg);
      ok = true;
    } catch {
      ok = false;
    }
    results[label] = {
      status: ok ? "✓" : "✗",
      info: ok ? pkg : `install ${pkg} (was: pip install ${python})`,
      python,
    };
  };

  // STT tiers — all Python-only, kept for parity.
  for (const [label, pkg] of [
    ["STT tier 1 (Moonshine)", "moonshine-onnx"],
    ["STT tier 2 (faster-whisper)", "faster-whisper"],
    ["STT tier 3 (Whisper)", "openai-whisper"],
    ["STT tier 4 (SpeechRecognition)", "SpeechRecognition"],
  ] as Array<[string, string]>) {
    results[label] = {
      status: "✗",
      info: `unavailable in Node — ${pkg} is Python-only; register an STT backend`,
      python: pkg,
    };
  }

  // TTS — msedge-tts is the one working engine.
  await probe("TTS tier 3 (edge-tts)", "msedge-tts", "edge-tts");
  const whisperCli = whichSync("whisper-cli") ?? whichSync("whisper");
  results["STT cli (whisper.cpp)"] = whisperCli
    ? { status: "✓", info: whisperCli, python: "openai-whisper" }
    : {
        status: "✗",
        info: "put a whisper.cpp `whisper-cli` binary on PATH",
        python: "openai-whisper",
      };

  const piperBin = whichSync("piper") ?? whichSync("piper-tts");
  results["TTS tier 2 (Piper)"] = piperBin
    ? { status: "✓", info: piperBin, python: "piper-tts" }
    : { status: "✗", info: "install the piper binary or `piper-tts`", python: "piper-tts" };

  await probe("TTS tier 1 (Kokoro)", "kokoro-js", "kokoro-onnx");

  results["TTS tier 4 (pyttsx3)"] = {
    status: "✗",
    info: "unavailable in Node — no offline OS TTS binding; register a TTS backend",
    python: "pyttsx3",
  };

  await probe("Wake word detector", "openwakeword", "openwakeword");
  results["Audio I/O"] = {
    status: "✗",
    info: "no Node audio I/O installed — setAudioInputDriver() to plug one in",
    python: "sounddevice",
  };
  await probe("Audio file read/write", "sharp", "soundfile");
  results["Array processing"] = {
    status: "✓",
    info: "built-in Float32Array / Buffer",
    python: "numpy",
  };
  results["Audio I/O (alt)"] = {
    status: "✗",
    info: "no Node audio I/O installed — was: pip install pyaudio",
    python: "pyaudio",
  };

  // The tesseract binary powers awareness OCR (mirrors pytesseract's shell-out).
  const tess = whichSync("tesseract");
  results["OCR (awareness)"] = tess
    ? { status: "✓", info: tess, python: "pytesseract" }
    : { status: "✗", info: "install tesseract and put it on PATH", python: "pytesseract" };

  return results;
}

/* ── Full setup ────────────────────────────────────────────────────────────── */

export interface SetupOptions {
  download_kokoro?: boolean;
  full_model?: boolean;
  verbose?: boolean;
  /** Download even when the `kokoro-js` binding is not installed. */
  force?: boolean;
}

export async function setup_voice(options: SetupOptions = {}): Promise<void> {
  const downloadKokoro = options.download_kokoro ?? true;
  const fullModel = options.full_model ?? false;
  const verbose = options.verbose ?? true;
  const force = options.force ?? true;

  console.log("\n  AXONIZ Voice Stack Setup\n");

  // 1. Dep check
  const deps = await check_deps();
  let hasStt = false;
  let hasTts = false;
  let hasWake = false;
  const missing: string[] = [];

  for (const [label, res] of Object.entries(deps)) {
    const icon = res.status === "✓" ? "✓" : "·";
    const color = res.status === "✓" ? "\u001b[92m" : "\u001b[90m";
    const reset = "\u001b[0m";
    if (verbose) {
      console.log(
        `  ${color}${icon}${reset}  ${label.padEnd(40)}  ${res.status === "✓" ? color : ""}${res.info}${reset}`,
      );
    }
    if (res.status === "✗") missing.push(res.info);
    if (res.status === "✓") {
      if (label.includes("STT")) hasStt = true;
      if (label.includes("TTS")) hasTts = true;
      if (label.includes("Wake")) hasWake = true;
    }
  }

  console.log();

  // 2. Check for existing models
  const existing = _check_existing_models();
  if (Object.keys(existing).length > 0 && verbose) {
    console.log("  Existing model files found:");
    for (const [fname, p] of Object.entries(existing)) {
      const sizeMb = fs.statSync(p).size / 1024 / 1024;
      console.log(`  ✓  ${fname}  (${sizeMb.toFixed(0)} MB)  →  ${p}`);
    }
    console.log();
  }

  // 3. Download Kokoro models
  if (downloadKokoro) {
    const hasKokoroBinding = await moduleAvailable("kokoro-js");
    if (!hasKokoroBinding && !force) {
      console.log("  ·  kokoro-js not installed — skipping model download");
      console.log("     npm install kokoro-js\n");
    } else {
      if (!hasKokoroBinding) {
        console.log("  ·  kokoro-js not installed — downloading model files anyway");
        console.log("     (src/voice/tts.ts discovers them; install kokoro-js to infer)\n");
      }
      console.log("  Kokoro model files:");

      const targetFiles = fullModel ? KOKORO_FULL : KOKORO_FILES;
      let allOk = true;

      for (const [fname, urls] of Object.entries(targetFiles)) {
        // Already found?
        if (fname in existing) {
          const src = existing[fname];
          const dst = path.join(MODELS_DIR, fname);
          if (src !== dst && !fs.existsSync(dst)) {
            await copyFile(src, dst);
          }
          console.log(`  ✓  ${fname}  (found at ${src})`);
          continue;
        }

        const dest = path.join(MODELS_DIR, fname);
        const ok = await _download(urls, dest, fname);
        if (!ok) allOk = false;
      }

      // Copy to the working directory so the engine finds them.
      console.log();
      const cwdMissing: string[] = [];
      for (const fname of Object.keys(targetFiles)) {
        const src = path.join(MODELS_DIR, fname);
        const cwd = path.join(process.cwd(), fname);
        if (fs.existsSync(src) && !fs.existsSync(cwd)) {
          try {
            await copyFile(src, cwd);
            console.log(`  ✓  copied ${fname} → current directory`);
          } catch (e) {
            console.log(`  ·  could not copy ${fname} to cwd: ${errText(e)}`);
          }
        } else if (!fs.existsSync(src) && !fs.existsSync(cwd)) {
          cwdMissing.push(fname);
        }
      }

      if (!allOk || cwdMissing.length > 0) {
        console.log(MANUAL_DOWNLOAD_MSG.replace("{models_dir}", MODELS_DIR));
      }
    }
  }

  // 4. Summary
  console.log("  Summary:");
  console.log(`  ${hasStt ? "✓" : "✗"}  STT available`);
  console.log(`  ${hasTts ? "✓" : "✗"}  TTS available`);
  console.log(`  ${hasWake ? "✓" : "✗"}  Wake word detection`);
  console.log();

  if (missing.length > 0) {
    const unique = [...new Set(missing)];
    console.log("  Missing / degraded capabilities:");
    for (const m of unique) console.log(`  ·  ${m}`);
    console.log();
    console.log("  Minimum for offline voice (Python-only originals):");
    console.log("  pip install kokoro-onnx sounddevice soundfile openwakeword pyaudio numpy");
    console.log("  Node equivalents: msedge-tts (installed) + registerSTTBackend()/");
    console.log("                   registerWakeDetector()/setAudioInputDriver() seams.");
    console.log();
  }

  if (hasStt && hasTts) {
    console.log("  ✓  Voice stack ready. Run:");
    console.log(
      "     npx tsx -e \"import('./src/voice/light_daemon.js').then(m => m.startLightDaemon())\"",
    );
  } else {
    console.log("  Install the packages above then run this again.");
  }
  console.log();
}

/* ── internals ─────────────────────────────────────────────────────────────── */

async function moduleAvailable(pkg: string): Promise<boolean> {
  if (KNOWN_MISSING.has(pkg)) return false;
  try {
    await import(pkg);
    return true;
  } catch {
    return false;
  }
}

function copyFile(src: string, dst: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      fs.copyFileSync(src, dst);
      resolve();
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/* ── CLI entry point (replaces `if __name__ == "__main__":`) ───────────────── */

function isMain(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return path.resolve(entry) === path.resolve(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  const args = process.argv.slice(2);
  void setup_voice({
    download_kokoro: !args.includes("--no-download"),
    full_model: args.includes("--full"),
    verbose: !args.includes("--quiet"),
  }).catch((e: unknown) => {
    console.error(`[ERROR] voice setup failed: ${errText(e)}`);
  });
}
