# AXONIZ-ZERO — Architecture Document
> Phase 0 Ground Truth Audit · October 2026

---

## Overview

AXONIZ-ZERO (persona: **AXONIZ — Core Engine**) is a autonomous, 100% offline agentic intelligence system designed to command million-line codebases using small local models (3B–8B parameters). The system achieves large-model-class capability by moving intelligence into structured subsystems (code graph, swarm, memory) rather than relying on raw model size.

The Python implementation is the behavioral reference. The TypeScript/Node.js port (`src/`) has reached feature parity on all core subsystems as of October 2026 and **passes typecheck with zero errors and builds cleanly**.

---

## Build Status (Phase 0 Verified)

| Check | Result |
|-------|--------|
| `npm run typecheck` | ✅ **PASS — zero errors** |
| `npm run build` | ✅ **PASS — clean compile** |
| `node _t_smoke.mjs` (UnifiedMemory, MemPalace, KG) | ✅ **PASS** (smoke tests pass) |
| `specialized.ts` smoke (CoderAgent instantiation) | ⚠️ **FAIL** — `agent.messages[0]` undefined on first construction |
| Python agent runtime | ✅ Working (production use) |

---

## Repository Layout

```
axo/
├── axoniz/              # Python reference implementation
│   ├── core/            # Agent, loop, backend, intelligence, memory
│   ├── agents/          # Specialized agents
│   ├── tools/           # File, shell, web, code, axodex, computer tools
│   ├── awareness/       # OCR sentinel / screen watcher
│   ├── comms/           # Telegram + dispatcher
│   ├── goals/           # OKR / goal tracking engine
│   ├── integrations/    # MCP, MemPalace, multi_agent, unified_memory
│   ├── voice/           # TTS (Kokoro) + STT (Moonshine) + wake word
│   └── web/             # Gradio/Flask UI + SSE broker
│
├── src/                 # TypeScript port (Node.js, ES2023, NodeNext)
│   ├── core/            # Agent, loop, backend, intelligence, config, auth
│   ├── agents/          # Specialized agents
│   ├── tools/           # All tool modules
│   ├── awareness/       # OCR sentinel
│   ├── comms/           # Telegram
│   ├── goals/           # Goal service + types
│   ├── integrations/    # UnifiedMemory, MCP, multi_agent, Goose
│   ├── voice/           # TTS, STT, wake word, voice loop
│   ├── workflows/       # Workflow engine
│   ├── sidecar/         # Background client
│   ├── web/             # Express server + SSE broker + static UI
│   ├── cli/             # CLI entry point
│   └── roles/           # Persona YAML (default.yaml)
│
├── _pyref/              # Python codebase snapshot (reference only, do not edit)
├── docs/                # This directory — architecture, status, roadmap
└── dist/                # TypeScript compiled output
```

---

## Core Architecture: The Agent Loop

### Python (`axoniz/core/agent.py` — 1354 lines)
### TypeScript (`src/core/agent.ts` — 1687 lines, fully ported + async)

The agent operates as a **stateful execution engine** with the following layers:

```
User Goal / Task
      ↓
System Prompt (Persona + Context + Tools)
      ↓
LLM Backend (llama.cpp / OpenAI / Ollama / LM Studio)
      ↓
Tool Call Detection (native function calling OR fallback regex parser)
      ↓
_exec() — Tool Execution Gate:
  0. Authority Engine gate (block/allow/ask)
  1. Axodex Guard (impact analysis before file edits)
  2. Confidence Scorer (risk gate — blocks dangerous tools)
  3. Timed execution
  4. Trajectory recording
  5. Self-correction analysis
      ↓
Tool Result → appended to history
      ↓
Loop continues until:
  - done() called
  - Max iterations reached
  - Abort event set
  - _is_done() text pattern matched
```

### Key Properties
- **Async-first in TS**: All tool calls, LLM calls, and loop iterations are `async/await`
- **~80 tools** registered in the tool map (no scoping per agent — known gap)
- **Context compression**: `ContextCompressor` at 40% threshold, protect last 6 turns
- **Fallback tool parsing**: Regex-based `<tool>{...}</tool>` parser for models without native function calling
- **SkillDistiller**: Auto-distills successful patterns (⚠️ no human review gate — known safety gap)

---

## Intelligence Layer (`src/core/intelligence/`)

| Module | Size | Purpose |
|--------|------|---------|
| `swarm.ts` | 45KB | SwarmOrchestrator — Decompose→Worker→Critic→Merge pipeline |
| `ast_index.ts` | 52KB | ASTIndexer — symbol and import graph construction |
| `trajectory.ts` | 15KB | TrajectoryStore — SQLite behavioral experience recorder |
| `confidence.ts` | 14KB | ConfidenceScorer — risk gate before dangerous actions |
| `self_correction.ts` | 14KB | SelfCorrector — post-execution error analysis |
| `reflex.ts` | 14KB | ShadowGuardReflex — pattern-based safety reflexes |
| `daemon.ts` | 31KB | axonizDaemon — file watcher + scheduled background tasks |
| `predictor.ts` | 24KB | PredictiveEngine — behavioral intent modeling |
| `skill_distiller.ts` | 8KB | SkillDistiller — pattern extraction from successful runs |
| `context_compressor.ts` | 11KB | Context budget management + summarization |

### SwarmOrchestrator Architecture
```
Task
 ↓
Decomposer (reasoning model) → SubTask[]
 ↓
[Worker₁, Worker₂, ... WorkerN] (parallel, tool access)
 ↓  ↓  ↓
Critic validates each result
 ↓
Merger synthesizes → Final result

Key features:
- RAM-aware sequential model hot-swapping
- Dependency-graph parallel scheduling
- Configurable concurrency ceiling (max_workers)
- SwarmCritic result scoring before acceptance
```

---

## Memory Architecture (`src/integrations/unified_memory.ts` — 68KB, largest file)

```
UnifiedMemory
├── MemPalace (semantic memory)
│   ├── Wings → Rooms → Drawers (hierarchical namespace)
│   ├── TF-IDF semantic search
│   ├── Graph traversal (tunnel discovery between wings)
│   └── SQLite backend at ~/.axoniz/palace/
├── KnowledgeGraph (temporal facts)
│   ├── subject → predicate → object + valid_from + ended_at
│   ├── Timeline queries
│   └── SQLite backend at ~/.axoniz/knowledge_graph.sqlite3
├── SemanticMemory (TF-IDF key-value store)
└── DiaryManager (session event log)
```

**Smoke-tested working in TypeScript** (all palace, KG, search, graph tests PASS).

---

## Backend Abstraction (`src/core/backend/`)

```
Backend (abstract class)
├── complete(messages) → CompletionResult
├── streamText(messages) → AsyncGenerator<string>
├── load() / unload() / isLoaded()
└── healthCheck() → BackendHealth

Implementations:
├── llamacpp.ts    — node-llama-cpp v3.22.1 (native, no Ollama)
├── openai.ts      — OpenAI-compatible API
├── ollama.ts      — Ollama HTTP API
├── lmstudio.ts    — LM Studio HTTP API
└── llama_server.ts — llama.cpp server mode

Response types:
├── TextResponse   { kind: "text", text: string, toolCalls? }
└── ToolCallResponse { kind: "tool_calls", calls: ToolCall[] }
```

---

## Tool Layer (`src/tools/`)

| Tool Module | Tools | Notes |
|-------------|-------|-------|
| `file_tools.ts` | read, write, edit, delete, list, search, append | Full port |
| `shell_tools.ts` | run, run_python | Full port |
| `web_tools.ts` | get, search (DuckDuckGo) | Full port |
| `code_tools.ts` | lint, format, tree, analyze | Full port |
| `axodex_tools.ts` | query, context, smart_read, impact, detect_changes, status, analyze | Full port (calls axodex CLI) |
| `computer_tools.ts` | screenshot, mouse, keyboard, OCR | Full port |

**No tool registry or dynamic discovery** — tools are hardcoded into `_tool_map` in `agent.ts`.

---

## Execution Loop (`src/core/loop.ts` — 511 lines)

The Goal Mode loop, separate from the basic agent chat loop:

```
GoalLoop.run(goal)
 ↓
_understand() → comprehend the goal
 ↓
_plan() → generate Step[] with LLM
 ↓
for each step:
  _execute() → run via agent
  _verify() → check step result
  if failed: _repair() → patch result
 ↓
_replan() if overall progress stalled
 ↓
_report() → final summary
```

Includes: Spinner UI, ANSI color codes, progress tracking, step verification.

---

## Voice Stack (`src/voice/`)

| Module | Purpose |
|--------|---------|
| `tts.ts` | Edge-TTS + Kokoro ONNX (offline) |
| `stt.ts` | Moonshine ONNX (best edge STT) |
| `wake_word.ts` | OpenWakeWord ONNX |
| `voice_loop.ts` | Wake → STT → Agent → TTS pipeline |
| `wav.ts` | WAV file I/O utilities |

---

## Web Server (`src/web/server.ts` — 29KB)

Express v5 server with:
- JWT authentication (`src/core/auth.ts`)
- Rate limiting (`src/core/rate_limit.ts`)
- Prometheus metrics (`src/core/metrics.ts`)
- SSE broker for real-time agent events (`src/web/broker.ts`)
- Static UI serving (copied from Python reference)
- Chat, swarm, goals, memory, model management API routes

---

## Comms (`src/comms/telegram.ts`)

Full Telegram bot integration via Grammy:
- Async message handling
- Agent session per chat
- Voice message support (STT pipeline)

---

## Key Differentiators vs. Other Agentic Systems

1. **Axodex** — Static code graph (4,843 symbols, 10,982 relationships) enables surgical context retrieval instead of dumping entire repos. No other CLI agent has this.
2. **RAM-aware model swapping** — SwarmOrchestrator can hot-swap models between phases on CPU-only hardware (i5-8350U).
3. **ConfidenceScorer + AuthorityEngine** — Risk gate before dangerous tool calls; auditlog of every decision.
4. **100% offline** — llama.cpp native, no Ollama, no cloud dependency.
5. **TrajectoryStore** — Every tool call recorded to SQLite; behavioral experience is persisted.
6. **Multi-memory architecture** — MemPalace + KG + TF-IDF + Diary vs. single vector DB.

---

## Known Architectural Weaknesses (Phase 0 Findings)

| # | Weakness | Severity | Notes |
|---|----------|----------|-------|
| 1 | Tool scoping not implemented | HIGH | All 3 specialized agents get full ~80-tool arsenal |
| 2 | SkillDistiller has no human review gate | HIGH | Auto-applies distilled skills — live safety gap |
| 3 | No agent registry / definition system | HIGH | Agents are hardcoded subclasses, not configurable |
| 4 | `specialized.ts` bug: `agent.messages[0]` undefined | MEDIUM | `applyExtraPrompt` crashes if messages not yet populated |
| 5 | `_is_done()` is text-string matching | MEDIUM | Fragile termination detection vs. structured `done()` tool |
| 6 | No structured `Observation` type | MEDIUM | Tool results are raw strings, no metadata |
| 7 | No checkpointing for long-running tasks | HIGH | Process restart = lost state |
| 8 | GoalLoop `_plan()` produces steps but no DAG | MEDIUM | Linear execution only, no parallel step scheduling |
| 9 | Context compressor acts on turn count, not semantic importance | MEDIUM | May drop critical context |
| 10 | No per-task cost tracking | LOW | Token usage not attributed to individual tasks |
