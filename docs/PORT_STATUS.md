# AXONIZ-ZERO — Python → TypeScript Port Status
> Phase 0 Ground Truth Audit · October 2026

**Legend:** ✅ Complete · ⚠️ Partial/Bug · 🔴 Stub/Missing · 📝 Notes

---

## Summary Counts

| Category | Count |
|----------|-------|
| Total Python modules | ~45 |
| Fully ported (✅) | ~38 |
| Partial / has bugs (⚠️) | ~4 |
| Missing / stub (🔴) | ~3 |
| **TypeScript typecheck** | ✅ ZERO ERRORS |
| **Build** | ✅ CLEAN |

---

## Core (`axoniz/core/` → `src/core/`)

| Python Module | TS File | Status | Notes |
|---------------|---------|--------|-------|
| `agent.py` (1354 lines) | `agent.ts` (1687 lines) | ✅ | Fully ported + made async; structural interfaces for lazy deps |
| `loop.py` | `loop.ts` (511 lines) | ✅ | Goal loop ported; private UI shim for cli.py deps |
| `backend.py` | `backend/types.ts` + `backend/index.ts` | ✅ | Abstract Backend class + factory; HTTP helpers ported |
| `backend.py` (llama) | `backend/llamacpp.ts` | ✅ | node-llama-cpp v3.22.1 |
| `backend.py` (openai) | `backend/openai.ts` | ✅ | OpenAI-compatible |
| `backend.py` (ollama) | `backend/ollama.ts` | ✅ | Ollama HTTP |
| `backend.py` (lmstudio) | `backend/lmstudio.ts` | ✅ | LM Studio HTTP |
| `backend.py` (llama-server) | `backend/llama_server.ts` | ✅ | llama.cpp server mode |
| `config.py` | `config.ts` (12KB) | ✅ | Full config + AXONIZ_HOME resolution |
| `history.py` | `history.ts` | ✅ | Chat message history |
| `chat_store.py` | `chat_store.ts` | ✅ | Persistent session storage |
| `memory.py` | `memory.ts` | ✅ | SemanticMemory (TF-IDF) |
| `auth.py` | `auth.ts` | ✅ | JWT auth |
| `authority.py` | `authority.ts` | ✅ | Authority engine + audit log |
| `persona.py` | `persona.ts` | ✅ | YAML persona loading |
| `runner.py` | `runner.ts` | ✅ | Server runner + startup |
| `cli.py` | `cli.ts` (21KB) | ✅ | CLI interface (ANSI, spinner, REPL) |
| `stream_parser.py` | `stream_parser.ts` | ✅ | SSE/token stream parser |
| `debug.py` | `debug.ts` | ✅ | |
| `logger.py` | `logger.ts` (26KB) | ✅ | Structured logging |
| `errors.py` | `errors.ts` | ✅ | Error hierarchy |
| `extras.py` | `extras.ts` (23KB) | ✅ | WorkspaceIndexer, GitTools, TokenCounter, ContextCompressor |
| `models.py` | `models.ts` | ✅ | Model registry |
| `optimizer.py` | `optimizer.ts` | ✅ | Hardware optimization |
| `downloader.py` | `downloader.ts` | ✅ | HuggingFace model download |
| `metrics.py` | `metrics.ts` | ✅ | Prometheus metrics |
| `rate_limit.py` | `rate_limit.ts` | ✅ | Rate limiting |
| `health.py` | `health.ts` | ✅ | Health check |
| `tool_schemas.py` (inline in agent.py) | `tool_schemas.ts` (10KB) | ✅ | Extracted to own module |
| `which.py` (N/A) | `which.ts` | ✅ | Path resolution utility |

---

## Intelligence (`axoniz/core/intelligence/` → `src/core/intelligence/`)

| Python Module | TS File | Status | Notes |
|---------------|---------|--------|-------|
| `swarm.py` | `swarm.ts` (45KB) | ✅ | Full async port; ThreadPoolExecutor → async scheduler; Mutex for model swapping |
| `ast_index.py` (ASTIndexer) | `ast_index.ts` (52KB) | ✅ | Symbol + import graph construction |
| `trajectory.py` | `trajectory.ts` (15KB) | ✅ | SQLite behavioral recorder |
| `confidence.py` | `confidence.ts` (14KB) | ✅ | Risk gate / confidence scorer |
| `self_correction.py` | `self_correction.ts` (14KB) | ✅ | Post-exec error analysis |
| `reflex.py` | `reflex.ts` (14KB) | ✅ | ShadowGuardReflex |
| `daemon.py` | `daemon.ts` (31KB) | ✅ | File watcher + scheduled tasks |
| `predictor.py` | `predictor.ts` (24KB) | ✅ | PredictiveEngine |
| `skill_distiller.py` | `skill_distiller.ts` (8KB) | ⚠️ | Ported, but missing human review gate (Python also missing) |
| `context_compressor.py` | `context_compressor.ts` (11KB) | ✅ | Context budget management |

---

## Tools (`axoniz/tools/` → `src/tools/`)

| Python Module | TS File | Status | Notes |
|---------------|---------|--------|-------|
| `file_tools.py` | `file_tools.ts` (16KB) | ✅ | |
| `shell_tools.py` | `shell_tools.ts` | ✅ | |
| `web_tools.py` | `web_tools.ts` | ✅ | DuckDuckGo search |
| `code_tools.py` | `code_tools.ts` | ✅ | lint, format, tree, analyze |
| `axodex_tools.py` | `axodex_tools.ts` | ✅ | Calls axodex CLI binary |
| `computer_tools.py` | `computer_tools.ts` (15KB) | ✅ | screenshot, mouse, keyboard |
| (internal helpers) | `_internal.ts` (13KB) | ✅ | Shared utilities |
| (smoke tests) | `_smoke.ts` (16KB) | ✅ | Tool smoke test suite |

---

## Agents (`axoniz/agents/` → `src/agents/`)

| Python Module | TS File | Status | Notes |
|---------------|---------|--------|-------|
| `specialized.py` | `specialized.ts` (120 lines) | ⚠️ | **BUG**: `applyExtraPrompt` crashes — `agent.messages[0]` undefined at construction time because Agent's `__init__` sets `messages` lazily. Fix: check `if (first)` then push, else defer. |
| (no Python equiv) | `index.ts` | ✅ | Re-exports |

**Missing from TS:**
- `AgentDefinition` dataclass system (P0 TODO — tool scoping not implemented)
- `AgentRegistry` (P1 TODO)

---

## Integrations (`axoniz/integrations/` → `src/integrations/`)

| Python Module | TS File | Status | Notes |
|---------------|---------|--------|-------|
| `unified_memory.py` (39KB) | `unified_memory.ts` (68KB) | ✅ | Smoke-tested; MemPalace + KG + TF-IDF + Diary |
| `mcp.py` (8KB) | `mcp.ts` (10KB) | ✅ | MCP client integration |
| `multi_agent.py` (9KB) | `multi_agent.ts` (12KB) | ✅ | Multi-agent coordinator |
| `goose.py` (15KB) | `goose.ts` (16KB) | ✅ | Goose integration |
| `mempalace.py` (684B) | `mempalace.ts` (958B) | ✅ | MemPalace re-export shim |
| `autonomous_startup.py` (15KB) | `autonomous_startup.ts` (17KB) | ✅ | Autonomous startup sequence |

---

## Goals (`axoniz/goals/` → `src/goals/`)

| Python Module | TS File | Status | Notes |
|---------------|---------|--------|-------|
| `service.py` (14KB) | `service.ts` (18KB) | ✅ | Full OKR engine |
| `types.py` | `types.ts` | ✅ | Goal, KeyResult, DailyAction types |

---

## Awareness (`axoniz/awareness/` → `src/awareness/`)

| Python Module | TS File | Status | Notes |
|---------------|---------|--------|-------|
| `service.py` | `service.ts` (32KB) | ✅ | OCR screen watcher |

---

## Voice (`axoniz/voice/` → `src/voice/`)

| Python Module | TS File | Status | Notes |
|---------------|---------|--------|-------|
| `tts.py` | `tts.ts` (30KB) | ✅ | Edge-TTS + Kokoro ONNX |
| `stt.py` | `stt.ts` (17KB) | ✅ | Moonshine ONNX |
| `wake_word.py` | `wake_word.ts` (21KB) | ✅ | OpenWakeWord |
| `voice_loop.py` | `voice_loop.ts` (18KB) | ✅ | Wake→STT→Agent→TTS pipeline |
| N/A | `wav.ts` (13KB) | ✅ | WAV I/O utility (new in TS) |
| N/A | `setup.ts` (18KB) | ✅ | Voice system setup |

---

## Web (`axoniz/web/` → `src/web/`)

| Python Component | TS File | Status | Notes |
|-----------------|---------|--------|-------|
| Flask/Gradio server | `server.ts` (29KB) | ✅ | Express v5 with JWT, rate-limiting, Prometheus, SSE |
| SSE broker | `broker.ts` | ✅ | Server-sent event broadcaster |
| Static UI | `src/web/static/` | ✅ | Copied from Python reference |
| `open_browser.py` | `open_browser.ts` | ✅ | |

---

## Comms (`axoniz/comms/` → `src/comms/`)

| Python Module | TS File | Status | Notes |
|---------------|---------|--------|-------|
| `telegram.py` | `telegram.ts` (12KB) | ✅ | Grammy bot |
| `dispatcher.py` | (merged into telegram.ts) | ✅ | |

---

## Workflows (`axoniz/workflows/` → `src/workflows/`)

| Python Module | TS File | Status | Notes |
|---------------|---------|--------|-------|
| `engine.py` | `engine.ts` (26KB) | ✅ | Full workflow engine |

---

## New in TypeScript (no Python equivalent)

| TS Module | Purpose |
|-----------|---------|
| `src/cli/entry.ts` | Clean CLI entry point |
| `src/sidecar/client.ts` | Background sidecar client |
| `src/core/tool_schemas.ts` | Extracted tool schema registry |
| `src/core/backend/async_queue.ts` | Async request queue |
| `src/core/which.ts` | PATH resolution utility |
| `src/voice/wav.ts` | WAV I/O utilities |
| `src/voice/setup.ts` | Voice system initialization |
| `src/startup.ts` | Startup sequence |
| `src/index.ts` | Public API entry |

---

## Missing Capabilities (Not Ported, Not Implemented)

| Capability | Priority | Notes |
|------------|----------|-------|
| `AgentDefinition` / tool scoping | P0 | Every agent gets full ~80-tool arsenal |
| `AgentRegistry` | P1 | No dynamic agent discovery |
| Structured `Observation` type | P1 | Tool results are raw strings |
| Checkpointing / resume | P1 | Process restart loses all state |
| Per-task cost attribution | P2 | No token accounting per task |
| Human review gate for SkillDistiller | P0 | Safety gap — auto-applies patterns |
| DAG-based GoalLoop step scheduling | P2 | Currently linear |
| Sandboxed execution environment | P2 | No isolation for untrusted code |
| Evaluation / benchmark harness | P3 | No reproducible benchmarks |
