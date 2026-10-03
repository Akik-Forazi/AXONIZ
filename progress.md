# BERU — Build Progress

> Updated: 2026-04-15

---

## Voice Stack — FIXED ✅

### Problem
`python -m axoniz.voice.setup` failed downloading Kokoro models with HTTP 404.

**Root cause:** `setup.py` was trying to download `kokoro-v1.9.onnx` which doesn't exist.
The actual release tag is `model-files-v1.0` and the correct files are:
- `kokoro-v1.0.int8.onnx` (88MB — CPU optimized, recommended)
- `kokoro-v1.0.onnx` (310MB — full f32)
- `voices-v1.0.bin` (voice embeddings)

### What was fixed

#### `axoniz/voice/setup.py`
- Corrected all model filenames (`v1.9` → `v1.0`)
- Added `kokoro-v1.0.int8.onnx` as the **default** (88MB vs 310MB — much faster to download and runs faster on CPU)
- Multiple mirror URLs per file (GitHub → HuggingFace fallback)
- Progress bar now streams in 64KB chunks instead of using `urlretrieve` (more reliable)
- Searches existing locations before downloading: `cwd → ~/.axoniz/voice_models → ~/Downloads`
- Auto-copies found models to `~/.axoniz/voice_models/` and working directory
- Prints clear manual download instructions if all mirrors fail
- New `--full` flag to download the 310MB f32 model instead of int8
- New `--no-download` flag to check deps only

#### `axoniz/voice/tts.py`
- Fixed Kokoro model loading: now uses `_find_kokoro_models()` which searches all common locations
- `_detect_backend()` now checks if model files exist before claiming Kokoro is available (was crashing at runtime)
- Model search order: `kokoro-v1.0.int8.onnx` → `kokoro-v1.0.onnx` → `kokoro-v1.0.fp16.onnx`
- Searches: `cwd → ~/.axoniz/voice_models → ~/Downloads → ~`
- Removed hardcoded `"kokoro-v1.9.onnx"` string (that file never existed)
- `info()` now reports which ONNX file is loaded

### To run now

```powershell
# Step 1: Download models (run this on YOUR machine, not through Claude)
python -m axoniz.voice.setup

# If download fails (network issues), download manually:
# https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
# Download: kokoro-v1.0.int8.onnx + voices-v1.0.bin
# Place in: C:\Users\akikf\.axoniz\voice_models\

# Step 2: Start daemon
python -c "from axoniz.voice.light_daemon import start_light_daemon; d = start_light_daemon(); import time; time.sleep(9999)"
```

### Voice stack status
```
✓  STT tier 2 (faster-whisper)     ← active
✓  TTS tier 1 (Kokoro)             ← needs model files downloaded
✓  Wake word detector (openwakeword)
✓  Audio I/O (sounddevice + pyaudio)

Missing (optional):
  pip install moonshine-onnx        ← faster STT (tier 1)
  pip install openai-whisper        ← STT fallback
  pip install SpeechRecognition     ← STT fallback
  pip install piper-tts             ← TTS fallback
  pip install edge-tts              ← TTS cloud fallback
  pip install pyttsx3               ← TTS offline fallback
```

---

## Intelligence Stack — Phase 1 ✅

`axoniz/core/intelligence/`:
- `trajectory.py` — SQLite behavioral memory (every tool call recorded)
- `confidence.py` — risk gate before dangerous actions
- `self_correction.py` — live error detection + corrective guidance
- `swarm.py` — parallel sub-agent orchestrator (Phase 2)
- `ast_index.py` — real AST codebase indexer (Phase 3)
- `daemon.py` — background file watcher + predictive engine (Phases 4+5)
- `__init__.py` — clean exports for all phases

`axoniz/core/agent.py` v6 — wires all phases into `_exec()`

---

## Voice Stack — UPGRADED ✅
- [x] Integrated MMS-TTS-OSS (Tier 0 - Super-robust local) using `C:\Users\akikf\programing\ai\mms-tts-oss`.
- [x] Added `transformers` + `torch` backend support.

## Intelligence Layer — SUPERINTELLIGENCE ✅
- [x] Shadow Guard Reflex Engine (Zero-LLM latency).
- [x] Hermes ContextCompressor (Iterative structured summarization).
- [x] Hermes API Error Classifier (Smart failover & recovery).
- [x] Wired into Agent Core v7.1.

## Next
- [x] Phase 9: Workflow Engine (Trigger → Condition → Action).
- [x] Phase 10: Continuous Awareness (Visual environment monitoring).
- [x] Phase 11: Goals (OKR Engine).
- [ ] Phase 12: Distributed Shadow Army (Cross-machine swarm).
- [ ] Phase 13: Self-Evolving Prompts (DPO-style local feedback loop).
- [ ] Phase 14: Visual Sovereignty (Local VLM integration).
