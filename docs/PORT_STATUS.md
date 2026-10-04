# AXONIZ-ZERO — Python → TypeScript Port Status
> Current version: V00.01.000-beta-01 (npm: `0.1.0-beta.1`)
> Doc revision: v0.3.6 — PEAK advancements + FRAZIYM versioning + standalone axodex + Next.js dashboard

**Legend:** ✅ Complete · ⚠️ Partial/Bug · 🔴 Stub/Missing · 📝 Notes · 🆕 New in TS (no Python equiv)

---

## Summary Counts

| Category | Count |
|----------|-------|
| Total Python modules | ~45 |
| Fully ported (✅) | ~42 |
| Partial / has bugs (⚠️) | ~2 |
| Missing / stub (🔴) | ~1 |
| New in TS only (🆕) | 11 modules |
| **TypeScript typecheck** | ✅ ZERO ERRORS |
| **Build** | ✅ CLEAN |
| **Node built-in test runner** | ✅ `tests/version.test.ts` PASS |

---

## Core (`axoniz/core/` → `src/core/`)

| Python Module | TS File | Status | Notes |
|---------------|---------|--------|-------|
| `agent.py` (1354 lines) | `agent.ts` (1687 lines) | ✅ | Fully ported + made async; structural interfaces for lazy deps |
| `loop.py` | `loop.ts` (511 lines) | ✅ | Goal loop ported; private UI shim for cli.py deps. v0.3.6 modules (`DAGPlanner`, `VerifyGate`) ready to wire into `_plan()`/`_verify()` |
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
| `runner.py` | `runner.ts` | ✅ | Server runner + startup. v0.3.5: prints FRAZIYM version banner via `src/version.ts` |
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
| N/A | 🆕 `version.ts` | ✅ | **v0.3.5** — FRAZIYM versioning single source of truth. Exports `AXONIZ_VERSION`, `AXONIZ_VERSION_SEMVER`, `parseFraziymVersion()`, `fraziymToSemver()` |
| N/A | 🆕 `tool_registry.ts` | ✅ | **v0.3.6** — `AgentDefinition` interface + `ToolRegistry` class. 8 pre-defined agent roles; `scopedToolMap(role, fullToolMap)` filter. Wiring into `agent.run()` pending |

---

## Intelligence (`axoniz/core/intelligence/` → `src/core/intelligence/`)

| Python Module | TS File | Status | Notes |
|---------------|---------|--------|-------|
| `swarm.py` | `swarm.ts` (45KB) | ✅ | Full async port; ThreadPoolExecutor → async scheduler; Mutex for model swapping |
| `ast_index.py` (ASTIndexer) | `ast_index.ts` (52KB) | ✅ | Symbol + import graph construction |
| `trajectory.py` | `trajectory.ts` (15KB) | ✅ | SQLite behavioral recorder |
| `confidence.py` | `confidence.ts` (14KB) | ✅ | Risk gate / confidence scorer |
| `self_correction.py` | `self_correction.ts` (14KB) | ✅ | Post-exec error analysis (failure classifier) |
| `reflex.py` | `reflex.ts` (14KB) | ✅ | ShadowGuardReflex |
| `daemon.py` | `daemon.ts` (31KB) | ✅ | File watcher + scheduled tasks |
| `predictor.py` | `predictor.ts` (24KB) | ✅ | PredictiveEngine |
| `skill_distiller.py` | `skill_distiller.ts` (8KB) | ⚠️ | Ported, but missing human review gate (Python also missing) |
| `context_compressor.py` | `context_compressor.ts` (11KB+) | ✅ | Context budget management. **v0.3.6 enhancement:** `scoreImportance(msg, indexFromEnd)`, `semanticKeepMask()`, `compressSemantic()`. Importance scoring: user=95, assistant+tools=90, errors=85, done=88, success=60, plain text=40 with age decay. Falls back to contiguous-region method if LLM summary fails |
| N/A | 🆕 `cost_tracker.ts` | ✅ | **v0.3.6** — `CostTracker` class. Records `tokensIn`/`tokensOut`/`costUsd` per tool call AND per LLM call. `getTaskTotal(taskId)` aggregator. Emits `cost` SSE events via `broker.broadcast("cost", event)`. Wiring into `_exec()` pending |
| N/A | 🆕 `verify_gate.ts` | ✅ | **v0.3.6** — `VerifyGate` class. Runs `tsc --noEmit`, `eslint`, `vitest run`, `pytest`, `mypy`, `flake8` and parses real results. Returns `VerifyResult` with per-check pass/fail/error counts. Independent checks (a tsc failure doesn't stop eslint/vitest). Inapplicable checks skipped. Replaces LLM-only `_verify()`. Wiring pending |
| N/A | 🆕 `dag_planner.ts` | ✅ | **v0.3.6** — `DAGPlanner` class. Produces `DAGStep[]` with `dependsOn: string[]`, `role`, `difficulty` (1-5), `produces`/`consumes` artifacts, `verify` condition. `topologicalSort()` returns "waves" of parallel-executable steps using Kahn's algorithm. `PlanResult` includes `waves` and `estimatedDurationMs`. Wiring into `_plan()` pending |

---

## Tools (`axoniz/tools/` → `src/tools/`)

| Python Module | TS File | Status | Notes |
|---------------|---------|--------|-------|
| `file_tools.py` | `file_tools.ts` (16KB) | ✅ | |
| `shell_tools.py` | `shell_tools.ts` | ✅ | |
| `web_tools.py` | `web_tools.ts` | ✅ | DuckDuckGo search |
| `code_tools.py` | `code_tools.ts` | ✅ | lint, format, tree, analyze |
| `axodex_tools.py` | `axodex_tools.ts` | ✱ UPDATED v0.3.4 | Simplified: looks for `axodex` binary on `PATH`, fallback `npx @fraziym/axodex`. axodex itself is now a standalone npm package `@fraziym/axodex` (peerDependency in AXONIZ package.json). Install via `npm install -g @fraziym/axoniz @fraziym/axodex` |
| `computer_tools.py` | `computer_tools.ts` (15KB) | ✅ | screenshot, mouse, keyboard |
| (internal helpers) | `_internal.ts` (13KB) | ✅ | Shared utilities |
| (smoke tests) | `_smoke.ts` (16KB) | ✅ | Tool smoke test suite |

---

## Agents (`axoniz/agents/` → `src/agents/`)

| Python Module | TS File | Status | Notes |
|---------------|---------|--------|-------|
| `specialized.py` | `specialized.ts` (120 lines) | ⚠️ | **BUG**: `applyExtraPrompt` crashes — `agent.messages[0]` undefined at construction time because Agent's `__init__` sets `messages` lazily. Fix: check `if (first)` then push, else defer. |
| (no Python equiv) | `index.ts` | ✅ | Re-exports |

**Notes:**
- `ToolRegistry` (v0.3.6) provides `AgentDefinition` interface + 8 role definitions; the full dynamic `AgentRegistry` instantiation is still pending (Phase 2 task)

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
| `Axodex/` (in Python bundle) | — | ✅ | **REMOVED v0.3.4** — axodex extracted to standalone repo `github.com/Akik-Forazi/axodex`, published as `@fraziym/axodex` on npm |

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
| N/A | 🆕 `wav.ts` (13KB) | ✅ | WAV I/O utility (new in TS) |
| N/A | 🆕 `setup.ts` (18KB) | ✅ | Voice system setup |

---

## Web (`axoniz/web/` → `src/web/`)

| Python Component | TS File | Status | Notes |
|-----------------|---------|--------|-------|
| Flask/Gradio server | `server.ts` (29KB) | ✅ | Express v5 on :7860 with JWT, rate-limiting, Prometheus, SSE. **v0.3.3:** all non-API GET requests proxy to :3000 if Next.js dev server is up |
| SSE broker | `broker.ts` | ✅ | Server-sent event broadcaster. **v0.3.6:** now also broadcasts `cost` events emitted by `CostTracker` |
| Static UI | `src/web/static/` | ✅ | Copied from Python reference. Used as fallback when Next.js dev server is unavailable |
| `open_browser.py` | `open_browser.ts` | ✅ | |
| N/A | 🆕 `web-next-spawn.ts` | ✅ | **v0.3.3** — Spawns Next.js dev server in `web-next/` on :3000 when `axoniz --web` is invoked. Falls back to legacy static UI if spawn fails or dev server is unavailable |
| N/A | 🆕 `web-next/` (directory) | ✅ | **v0.3.3** — Next.js SPA dashboard. Real React/Next.js dashboard with HMR. Proxied through Express :7860 |

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

## Tests (`axoniz/...` → `src/tests/`)

| Test File | Status | Notes |
|-----------|--------|-------|
| 🆕 `version.test.ts` | ✅ | **v0.3.5** — Verifies FRAZIYM version sync across 5 source points: `src/version.ts`, `package.json`, `src/core/runner.ts` (CLI banner), `README.md`, and itself. Uses Node built-in test runner (`node --test --experimental-strip-types`) |

---

## Installer (`axoniz install` command)

| Component | Status | Notes |
|-----------|--------|-------|
| `axoniz install axodex` | ✱ REWRITTEN v0.3.4 | Was: clone entire AXONIZ GitHub repo (~30 MiB). Now: runs `npm install -g @fraziym/axodex` (fast, deduplicated, versioned). AXONIZ `package.json` declares `@fraziym/axodex` as `peerDependency: ^0.1.0-beta.1` |
| Install command (combined) | ✅ | `npm install -g @fraziym/axoniz @fraziym/axodex` |

---

## New in TypeScript (no Python equivalent)

| TS Module | Purpose | Status |
|-----------|---------|--------|
| `src/cli/entry.ts` | Clean CLI entry point | ✅ |
| `src/sidecar/client.ts` | Background sidecar client | ✅ |
| `src/core/tool_schemas.ts` | Extracted tool schema registry | ✅ |
| `src/core/backend/async_queue.ts` | Async request queue | ✅ |
| `src/core/which.ts` | PATH resolution utility | ✅ |
| `src/voice/wav.ts` | WAV I/O utilities | ✅ |
| `src/voice/setup.ts` | Voice system initialization | ✅ |
| `src/startup.ts` | Startup sequence | ✅ |
| `src/index.ts` | Public API entry | ✅ |
| 🆕 `src/version.ts` | **v0.3.5** FRAZIYM versioning single source of truth | ✅ |
| 🆕 `src/core/tool_registry.ts` | **v0.3.6** Tool Registry with 8 roles + scopedToolMap | ✅ |
| 🆕 `src/core/intelligence/cost_tracker.ts` | **v0.3.6** Per-tool/per-LLM cost + SSE broadcast | ✅ |
| 🆕 `src/core/intelligence/verify_gate.ts` | **v0.3.6** Real tsc/eslint/vitest/pytest/mypy/flake8 runner | ✅ |
| 🆕 `src/core/intelligence/dag_planner.ts` | **v0.3.6** DAGStep[] + topologicalSort waves | ✅ |
| 🆕 `src/web/web-next-spawn.ts` | **v0.3.3** Next.js dev server spawner | ✅ |
| 🆕 `src/tests/version.test.ts` | **v0.3.5** FRAZIYM version sync verifier | ✅ |
| 🆕 `web-next/` | **v0.3.3** Next.js dashboard SPA | ✅ |

---

## Missing Capabilities (Not Ported, Not Implemented)

| Capability | Priority | Status | Notes |
|------------|----------|--------|-------|
| `AgentDefinition` / tool scoping | P0 | ✅ **DONE v0.3.6** | `ToolRegistry` shipped. Wiring into `agent.run()` pending |
| `AgentRegistry` | P1 | 🟡 PARTIAL | `ToolRegistry` provides role-based definitions; full dynamic catalog pending |
| Structured `Observation` type | P1 | 🟡 PARTIAL | Type exists; full migration of all tool callsites pending |
| Checkpointing / resume | P1 | 🔴 OPEN | Process restart loses all state |
| Per-task cost attribution | P2 | ✅ **DONE v0.3.6** | `CostTracker` shipped. Wiring into `_exec()` pending |
| Human review gate for SkillDistiller | P0 | 🔴 OPEN | Safety gap — auto-applies patterns |
| DAG-based GoalLoop step scheduling | P2 | ✅ **DONE v0.3.6** | `DAGPlanner` shipped. Wiring into `_plan()` pending |
| Semantic context compression | P2 | ✅ **DONE v0.3.6** | `scoreImportance` + `compressSemantic` shipped on `ContextCompressor` |
| Real verify gate (compile/lint/test) | P0 | ✅ **DONE v0.3.6** | `VerifyGate` shipped. Wiring into `_verify()` pending |
| Sandboxed execution environment | P2 | 🔴 OPEN | No isolation for untrusted code |
| Evaluation / benchmark harness | P3 | 🔴 OPEN | No reproducible benchmarks |
| Standalone axodex | P3 | ✅ **DONE v0.3.4** | Extracted to `@fraziym/axodex` |
| Canonical versioning | P3 | ✅ **DONE v0.3.5** | FRAZIYM in `src/version.ts` |
| Next.js dashboard | P3 | ✅ **DONE v0.3.3** | `web-next/` spawned by `web-next-spawn.ts` |
| Per-tool timeout / cancellation | P2 | 🔴 OPEN | A hanging tool blocks the loop |
| Model auto-selection by task complexity | P3 | 🔴 OPEN | Router pending |
| KV cache management API | P3 | 🔴 OPEN | Direct control exists; high-level API pending |

---

## Wiring Status (Post-v0.3.6 milestone)

The five PEAK advancement modules (`tool_registry`, `cost_tracker`, `verify_gate`, `dag_planner`, enhanced `context_compressor`) ship as standalone classes. They are not yet called from the runtime. The v0.4.x milestone wires them:

| Wiring site | Class to call | Status |
|-------------|---------------|--------|
| `agent.run()` | `ToolRegistry.scopedToolMap(role, fullToolMap)` | 🔴 PENDING |
| `_exec()` (after tool) | `CostTracker.recordToolCall(...)` | 🔴 PENDING |
| `_exec()` (after LLM) | `CostTracker.recordLLMCall(...)` | 🔴 PENDING |
| `loop._verify()` | `VerifyGate.run(changes)` (LLM check as fallback) | 🔴 PENDING |
| `loop._plan()` | `DAGPlanner.plan(goal)` + wave-based `Promise.all` execution | 🔴 PENDING |
| `ContextCompressor` threshold hook | `compressSemantic()` (method already on the class) | 🔴 PENDING |
