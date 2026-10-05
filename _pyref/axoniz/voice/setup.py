"""
axoniz/voice/setup.py
======================
BERU Voice Stack Setup — downloads Kokoro v1.0 models and checks all deps.

Usage:
    python -m axoniz.voice.setup
"""

import os
import sys
import urllib.request
import urllib.error
from pathlib import Path

AXONIZ_HOME = os.path.expanduser("~/.axoniz")
MODELS_DIR  = os.path.join(AXONIZ_HOME, "voice_models")
os.makedirs(MODELS_DIR, exist_ok=True)

# ── Correct model filenames (v1.0, not v1.9) ─────────────────────────────────
# kokoro-onnx package expects: kokoro-v1.0.onnx  +  voices-v1.0.bin
# int8 version is much smaller (88MB vs 310MB) — use it for CPU inference

KOKORO_FILES = {
    # int8 quantized (88MB) — best for CPU, recommended
    "kokoro-v1.0.int8.onnx": [
        "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx",
        "https://huggingface.co/thewh1teagle/kokoro-onnx-models/resolve/main/kokoro-v1.0.int8.onnx",
    ],
    # voices binary (always needed)
    "voices-v1.0.bin": [
        "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin",
        "https://huggingface.co/thewh1teagle/kokoro-onnx-models/resolve/main/voices-v1.0.bin",
    ],
}

# Full quality f32 (310MB) — only if user explicitly wants it
KOKORO_FULL = {
    "kokoro-v1.0.onnx": [
        "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx",
    ],
}

MANUAL_DOWNLOAD_MSG = """
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
"""


def _bar(done: int, total: int, width: int = 28) -> str:
    if total <= 0:
        return f"[{'█' * width}] {done/1024/1024:.1f} MB"
    filled = int(width * done / total)
    return f"[{'█' * filled}{'░' * (width - filled)}] {done/1024/1024:.1f}/{total/1024/1024:.1f} MB"


def _download(urls: list, dest: str, label: str) -> bool:
    """Try each URL in order until one works."""
    if os.path.exists(dest):
        size_mb = os.path.getsize(dest) / 1024 / 1024
        print(f"  ✓  {label}  ({size_mb:.1f} MB — already exists)")
        return True

    for url in urls:
        print(f"  ↓  {label}", end="", flush=True)
        try:
            def _hook(count, block, total):
                done = count * block
                sys.stdout.write(f"\r  ↓  {label}  {_bar(done, total)}  ")
                sys.stdout.flush()

            headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=300) as response:
                total_size = int(response.headers.get("Content-Length", 0))
                done       = 0
                chunk_size = 65536  # 64KB chunks
                with open(dest, "wb") as f:
                    while True:
                        chunk = response.read(chunk_size)
                        if not chunk:
                            break
                        f.write(chunk)
                        done += len(chunk)
                        _hook(done // chunk_size, chunk_size, total_size)

            size_mb = os.path.getsize(dest) / 1024 / 1024
            print(f"\r  ✓  {label}  ({size_mb:.1f} MB)")
            return True

        except urllib.error.HTTPError as e:
            print(f"\r  ·  {label}  mirror {url.split('/')[2]} failed ({e.code}) — trying next…")
            if os.path.exists(dest):
                os.unlink(dest)
            continue
        except Exception as e:
            print(f"\r  ·  {label}  {url.split('/')[2]} failed: {type(e).__name__} — trying next…")
            if os.path.exists(dest):
                os.unlink(dest)
            continue

    print(f"  ✗  {label}  ALL MIRRORS FAILED")
    return False


def _check_existing_models() -> dict:
    """Find model files in common locations."""
    found = {}
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    search_dirs = [
        project_root,
        os.getcwd(),
        MODELS_DIR,
        os.path.expanduser("~/Downloads"),
        os.path.expanduser("~"),
    ]
    for fname in list(KOKORO_FILES.keys()) + list(KOKORO_FULL.keys()):
        for d in search_dirs:
            p = os.path.join(d, fname)
            if os.path.exists(p) and os.path.getsize(p) > 1024 * 1024:  # > 1MB
                found[fname] = p
                break
    return found


def check_deps() -> dict:
    """Check which voice dependencies are installed."""
    results = {}
    checks = [
        ("moonshine_onnx",    "moonshine-onnx",    "STT tier 1 (Moonshine)"),
        ("faster_whisper",    "faster-whisper",    "STT tier 2 (faster-whisper)"),
        ("whisper",           "openai-whisper",    "STT tier 3 (Whisper)"),
        ("speech_recognition","SpeechRecognition", "STT tier 4 (SpeechRecognition)"),
        ("kokoro_onnx",       "kokoro-onnx",       "TTS tier 1 (Kokoro)"),
        ("piper",             "piper-tts",         "TTS tier 2 (Piper)"),
        ("edge_tts",          "edge-tts",          "TTS tier 3 (edge-tts)"),
        ("pyttsx3",           "pyttsx3",           "TTS tier 4 (pyttsx3)"),
        ("openwakeword",      "openwakeword",      "Wake word detector"),
        ("sounddevice",       "sounddevice",       "Audio I/O"),
        ("soundfile",         "soundfile",         "Audio file read/write"),
        ("numpy",             "numpy",             "Array processing"),
        ("pyaudio",           "pyaudio",           "Audio I/O (alt)"),
    ]
    for mod, pkg, label in checks:
        try:
            __import__(mod)
            results[label] = ("✓", pkg)
        except ImportError:
            results[label] = ("✗", f"pip install {pkg}")
    return results


def setup_voice(download_kokoro: bool = True, full_model: bool = False,
                verbose: bool = True):
    """
    Full voice setup:
      1. Check all deps
      2. Search for existing model files
      3. Download missing Kokoro models
      4. Copy/symlink models to working directory
      5. Print install commands for missing packages
    """
    print("\n  BERU Voice Stack Setup\n")

    # 1. Dep check
    deps = check_deps()
    has_stt = has_tts = has_wake = False
    missing = []

    for label, (status, info) in deps.items():
        icon  = "✓" if status == "✓" else "·"
        color = "\033[92m" if status == "✓" else "\033[90m"
        reset = "\033[0m"
        if verbose:
            print(f"  {color}{icon}{reset}  {label:<40}  {color if status == '✓' else ''}{info}{reset}")
        if status == "✗" and "pip install" in info:
            missing.append(info)
        if status == "✓":
            if "STT" in label:  has_stt  = True
            if "TTS" in label:  has_tts  = True
            if "Wake" in label: has_wake = True

    print()

    # 2. Check for existing models
    existing = _check_existing_models()
    if existing and verbose:
        print("  Existing model files found:")
        for fname, path in existing.items():
            size_mb = os.path.getsize(path) / 1024 / 1024
            print(f"  ✓  {fname}  ({size_mb:.0f} MB)  →  {path}")
        print()

    # 3. Download Kokoro models
    if download_kokoro:
        try:
            import kokoro_onnx  # noqa
            print("  Kokoro model files:")

            target_files = KOKORO_FULL if full_model else KOKORO_FILES

            all_ok = True
            for fname, urls in target_files.items():
                # Already found?
                if fname in existing:
                    src = existing[fname]
                    dst = os.path.join(MODELS_DIR, fname)
                    if src != dst and not os.path.exists(dst):
                        import shutil
                        shutil.copy2(src, dst)
                    print(f"  ✓  {fname}  (found at {src})")
                    continue

                dest = os.path.join(MODELS_DIR, fname)
                ok   = _download(urls, dest, fname)
                if not ok:
                    all_ok = False

            # Copy to working dir so kokoro-onnx finds them
            print()
            cwd_missing = []
            for fname in target_files:
                src = os.path.join(MODELS_DIR, fname)
                cwd = os.path.join(os.getcwd(), fname)
                if os.path.exists(src) and not os.path.exists(cwd):
                    import shutil
                    try:
                        shutil.copy2(src, cwd)
                        print(f"  ✓  copied {fname} → current directory")
                    except Exception as e:
                        print(f"  ·  could not copy {fname} to cwd: {e}")
                elif not os.path.exists(src) and not os.path.exists(cwd):
                    cwd_missing.append(fname)

            if not all_ok or cwd_missing:
                print(MANUAL_DOWNLOAD_MSG.format(models_dir=MODELS_DIR))

        except ImportError:
            print("  ·  kokoro-onnx not installed — skipping model download")
            print("     run: pip install kokoro-onnx soundfile\n")

    # 4. Summary
    print("  Summary:")
    print(f"  {'✓' if has_stt  else '✗'}  STT available")
    print(f"  {'✓' if has_tts  else '✗'}  TTS available")
    print(f"  {'✓' if has_wake else '✗'}  Wake word detection")
    print()

    if missing:
        unique  = list(dict.fromkeys(missing))
        pkgs    = " ".join(p.replace("pip install ", "") for p in unique)
        print("  Install missing packages:")
        print(f"  pip install {pkgs}")
        print()
        print("  Minimum for offline voice:")
        print("  pip install kokoro-onnx sounddevice soundfile openwakeword pyaudio numpy")
        print()

    if has_stt and has_tts:
        print("  ✓  Voice stack ready. Run:")
        print("     python -c \"from axoniz.voice.light_daemon import start_light_daemon; d = start_light_daemon(); import time; time.sleep(9999)\"")
    else:
        print("  Install the packages above then run this again.")
    print()


if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--no-download", action="store_true", help="Skip model download")
    p.add_argument("--full",        action="store_true", help="Download full f32 model (310MB) instead of int8 (88MB)")
    p.add_argument("--quiet",       action="store_true")
    args = p.parse_args()
    setup_voice(
        download_kokoro=not args.no_download,
        full_model=args.full,
        verbose=not args.quiet,
    )
