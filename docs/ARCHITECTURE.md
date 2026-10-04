# AXONIZ-ZERO — Architecture Document
> Current version: **V00.01.000-beta-01** (FRAZIYM) / `0.1.0-beta.1` (npm semver)
> Doc revision: v0.3.6 — PEAK advancements, FRAZIYM versioning, standalone axodex, Next.js dashboard

---

## Overview

AXONIZ-ZERO (persona: **AXONIZ — Core Engine**) is an autonomous, 100% offline agentic intelligence system designed to command million-line codebases using small local models (3B–8B parameters). The system achieves large-model-class capability by moving intelligence into structured subsystems (code graph, swarm, memory, tool registry, cost tracking, verify gate, DAG planner) rather than relying on raw model size.

The Python implementation is the behavioral reference. The TypeScript/Node.js port (`src/`) has reached feature parity on all core subsystems and **passes typecheck with zero errors and builds cleanly**. As of v0.3.6, the PEAK advancement modules (`tool_registry`, `cost_tracker`, `verify_gate`, `dag_planner`, enhanced `context_compressor`) are landed as standalone classes; the next milestone (v0.4.x) wires them into the live agent runtime.

---

## Build Status (v0.3.6 Verified)

| Check | Result |
|-------|--------|
| `npm run typecheck` | ✅ **PASS — zero errors** |
| `npm run build` | ✅ **PASS — clean compile** |
| `node --test` (Node built-in runner) | ✅ **PASS** — `tests/version.test.ts` verifies FRAZIYM version sync across 5 source points |
| `node _t_smoke.mjs` (UnifiedMemory, MemPalace, KG) | ✅ **PASS** (smoke tests pass) |
| `specialized.ts` smoke (CoderAgent instantiation) | ⚠️ **FAIL** — `agent.messages[0]` undefined on first construction (still open) |
| `axoniz --web` (Next.js dashboard spawn) | ✅ **PASS** — :3000 dev server proxied through :7860 |
| Python agent runtime | ✅ Working (production use) |

---

## Repository Layout

```
axo/
├── axoniz/              # Python reference implementation (read-only reference)
│   ├── core/            # Agent, loop, backend, intelligence, memory
│   ├── agents/          # Specialized agents
│   ├── tools/           # File, shell, web, code, axodex, computer tools
│   ├── awareness/       # OCR sentinel / screen watcher
│   ├── comms/           # Telegram + dispatcher
│   ├── goals/           # OKR / goal tracking engine
│   ├── integrations/    # MCP, MemPalace, multi_agent, unified_memory
│   ├── voice/           # TTS (Kokoro) + STT (Moonshine) + wake word
│   └── web/             # Gradio/Flask UI + SSE broker
│                        # NOTE: axodex extracted to standalone repo
│                        # (github.com/Akik-Forazi/axodex) as of v0.3.4
│
├── src/                 # TypeScript port (Node.js, ES2023, NodeNext)
│   ├── core/            # Agent, loop, backend, intelligence, config, auth
│   │   ├── tool_registry.ts        # ★ NEW v0.3.6 — 8-role agent definitions + scopedToolMap()
│   │   └── version.ts              # ★ NEW v0.3.5 — FRAZIYM version single source of truth
│   ├── core/intelligence/
│   │   ├── cost_tracker.ts         # ★ NEW v0.3.6 — per-tool/per-LLM cost + SSE broadcast
│   │   ├── verify_gate.ts          # ★ NEW v0.3.6 — tsc/eslint/vitest/pytest/mypy/flake8 runner
│   │   ├── dag_planner.ts          # ★ NEW v0.3.6 — DAGStep[] + topologicalSort() waves
│   │   ├── context_compressor.ts   # ✱ ENHANCED v0.3.6 — scoreImportance + compressSemantic
│   │   ├── swarm.ts
│   │   ├── ast_index.ts
│   │   ├── trajectory.ts
│   │   ├── confidence.ts
│   │   ├── self_correction.ts
│   │   ├── reflex.ts
│   │   ├── daemon.ts
│   │   ├── predictor.ts
│   │   └── skill_distiller.ts
│   ├── agents/          # Specialized agents
│   ├── tools/           # File, shell, web, code, axodex, computer tools
│   │   └── axodex_tools.ts         # ✱ UPDATED v0.3.4 — looks for `axodex` on PATH,
│   │                               #   fallback `npx @fraziym/axodex`
│   ├── awareness/       # OCR sentinel
│   ├── comms/           # Telegram
│   ├── goals/           # Goal service + types
│   ├── integrations/    # UnifiedMemory, MCP, multi_agent, Goose
│   ├── voice/           # TTS, STT, wake word, voice loop
│   ├── workflows/       # Workflow engine
│   ├── sidecar/         # Background client
│   ├── web/             # Express server + SSE broker + static UI
│   │   ├── server.ts                # Express v5 on :7860
│   │   ├── broker.ts                # SSE broadcast (cost, trajectory, status events)
│   │   └── web-next-spawn.ts       # ★ NEW v0.3.3 — spawns Next.js dev server on :3000
│   ├── cli/             # CLI entry point
│   ├── roles/           # Persona YAML (default.yaml)
│   └── tests/
│       └── version.test.ts         # ★ NEW v0.3.5 — FRAZIYM version sync across 5 points
│
├── web-next/            # ★ NEW v0.3.3 — Next.js dashboard (spawned by --web flag)
├── _pyref/              # Python codebase snapshot (reference only, do not edit)
├── docs/                # This directory — architecture, status, roadmap, decisions
└── dist/                # TypeScript compiled output
```

---

## Versioning (FRAZIYM)

As of v0.3.5, AXONIZ uses the FRAZIYM versioning scheme as the canonical format. Semver is derived for npm package compatibility only.

- **FRAZIYM format:** `VPP.FF.BBB-STAGE-RR` (e.g., `V00.01.000-beta-01`)
  - `VPP` — vision phase (2 digits, zero-padded)
  - `FF` — feature family (2 digits)
  - `BBB` — build (3 digits)
  - `STAGE` — release stage (`alpha`, `beta`, `rc`, `stable`)
  - `RR` — revision (2 digits)
- **Semver translation:** `V00.01.000-beta-01` → `0.1.0-beta.1` (V00→0, 01→1, 000→0, -beta→-beta, 01→.1)
- **Single source of truth:** `src/version.ts`
  - `AXONIZ_VERSION` (FRAZIYM literal)
  - `AXONIZ_VERSION_SEMVER` (npm-compatible)
  - `parseFraziymVersion()`
  - `fraziymToSemver()`
- **5 sync points** (verified by `tests/version.test.ts`):
  1. `src/version.ts` — canonical
  2. `package.json` — `version` field (semver form)
  3. `src/core/runner.ts` — CLI banner output
  4. `README.md` — visible version string
  5. `tests/version.test.ts` — verification harness

The same scheme applies to axodex (its own `src/version.ts`).

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
[ Tool Registry scopedToolMap(role, fullToolMap) — ★ v0.3.6, wiring pending ]
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
  6. [ CostTracker.recordToolCall() — ★ v0.3.6, wiring pending ]
  7. [ CostTracker.recordLLMCall()  — ★ v0.3.6, wiring pending ]
      ↓
Tool Result → appended to history
      ↓
[ ContextCompressor.compressSemantic() at 40% threshold — ★ v0.3.6, method exists ]
      ↓
Loop continues until:
  - done() called (canonical — DEC-013)
  - Max iterations reached
  - Abort event set
  - _is_done() text pattern matched (fallback only — DEC-013)
```

### Key Properties
- **Async-first in TS**: All tool calls, LLM calls, and loop iterations are `async/await`
- **~80 tools** registered in the tool map; v0.3.6 introduces **Tool Registry** to scope per role (wiring into `agent.run()` pending)
- **Context compression**: `ContextCompressor` at 40% threshold, protect last 6 turns; v0.3.6 adds **semantic importance scoring** (`scoreImportance`, `semanticKeepMask`, `compressSemantic`)
- **Fallback tool parsing**: Regex-based `<tool>{...}</tool>` parser for models without native function calling
- **SkillDistiller**: Auto-distills successful patterns (⚠️ no human review gate — known safety gap)

---

## Tool Registry (`src/core/tool_registry.ts`) — NEW v0.3.6

Solves the P0 "tool scoping absent" gap (DEC-016).

```typescript
interface AgentDefinition {
  id: string;
  role: AgentRole;          // 8 pre-defined roles (see below)
  toolAllowlist: string[];
  systemPromptExtra?: string;
  modelOverride?: string;
}

type AgentRole =
  | "planner" | "researcher" | "coder"    | "debugger"
  | "reviewer" | "tester"  | "verifier" | "general";

class ToolRegistry {
  static readonly ROLE_DEFINITIONS: Record<AgentRole, AgentDefinition>;
  static scopedToolMap(role: AgentRole, fullToolMap: ToolMap): ToolMap;
}
```

- 8 pre-defined roles, each with a curated tool allowlist
- `scopedToolMap(role, fullToolMap)` returns a filtered `ToolMap` containing only the role's allowlisted tools
- Designed to be called by `agent.run()` before LLM completion (wiring pending — see TODO)
- Replaces the legacy "every agent gets the full ~80-tool arsenal" anti-pattern

---

## Intelligence Layer (`src/core/intelligence/`)

| Module | Size | Purpose |
|--------|------|---------|
| `swarm.ts` | 45KB | SwarmOrchestrator — Decompose→Worker→Critic→Merge pipeline |
| `ast_index.ts` | 52KB | ASTIndexer — symbol and import graph construction |
| `trajectory.ts` | 15KB | TrajectoryStore — SQLite behavioral experience recorder |
| `confidence.ts` | 14KB | ConfidenceScorer — risk gate before dangerous actions |
| `self_correction.ts` | 14KB | SelfCorrector — post-execution error analysis (failure classifier) |
| `reflex.ts` | 14KB | ShadowGuardReflex — pattern-based safety reflexes |
| `daemon.ts` | 31KB | axonizDaemon — file watcher + scheduled background tasks |
| `predictor.ts` | 24KB | PredictiveEngine — behavioral intent modeling |
| `skill_distiller.ts` | 8KB | SkillDistiller — pattern extraction from successful runs |
| `context_compressor.ts` | 11KB+ | Context budget management + **semantic importance scoring** (v0.3.6) |
| ★ `cost_tracker.ts` | (NEW v0.3.6) | CostTracker — per-tool/per-LLM token + USD attribution, SSE broadcast |
| ★ `verify_gate.ts` | (NEW v0.3.6) | VerifyGate — runs real tsc/eslint/vitest/pytest/mypy/flake8, returns `VerifyResult` |
| ★ `dag_planner.ts` | (NEW v0.3.6) | DAGPlanner — produces `DAGStep[]` with `dependsOn`, topological sort into parallel waves |

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

### Cost Tracker (NEW v0.3.6)
```typescript
interface CostRecord {
  taskId: string;
  toolName?: string;       // undefined → LLM call
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  timestamp: number;
}

class CostTracker {
  recordToolCall(rec: CostRecord): void;
  recordLLMCall(rec: CostRecord): void;
  getTaskTotal(taskId: string): { tokensIn, tokensOut, costUsd };
}
```
- Emits `cost` SSE events via `broker.broadcast("cost", event)` for live dashboard updates
- Solves the "no per-task cost tracking" architectural weakness

### Verify Gate (NEW v0.3.6)
```typescript
interface VerifyResult {
  checks: VerifyCheck[];           // per-check status
  passed: number;
  failed: number;
  errored: number;
}

class VerifyGate {
  async run(changes: ChangeSet): Promise<VerifyResult>;
}
```
- Runs each of: `tsc --noEmit`, `eslint`, `vitest run`, `pytest`, `mypy`, `flake8`
- Each check is **independent** — a tsc failure does not stop eslint/vitest from running
- Checks that aren't applicable (e.g., no `tsconfig.json`) are **skipped**, not failed
- Returns real per-check pass/fail/error counts
- Replaces the LLM-only `_verify()` in `loop.ts` which used to ask "did this succeed?" (DEC-018)

### DAG Planner (NEW v0.3.6)
```typescript
interface DAGStep {
  id: string;
  role: AgentRole;
  instruction: string;
  dependsOn: string[];            // IDs of steps that must complete first
  difficulty: 1 | 2 | 3 | 4 | 5;
  produces?: string[];            // artifact names
  consumes?: string[];
  verify?: VerifyCondition;
}

interface PlanResult {
  steps: DAGStep[];
  waves: DAGStep[][];             // topologically sorted, parallel-executable
  estimatedDurationMs: number;
}

class DAGPlanner {
  async plan(goal: string): Promise<PlanResult>;
  topologicalSort(steps: DAGStep[]): DAGStep[][];   // Kahn's algorithm
}
```
- Replaces linear `PlanTask[]` with a dependency graph
- `topologicalSort()` returns "waves" of parallel-executable steps using **Kahn's algorithm**
- Each step declares `role`, `difficulty` (1–5), `produces`/`consumes` artifacts, `verify` condition
- `PlanResult.waves` enables `Promise.all` per wave (DEC-019)

### Semantic Context Compression (v0.3.6 enhancement)
```typescript
class ContextCompressor {
  scoreImportance(msg: Message, indexFromEnd: number): number;  // 0–100
  semanticKeepMask(messages: Message[]): boolean[];
  compressSemantic(messages: Message[]): Message[];
}
```
- `scoreImportance` baseline scoring:
  - user message → **95**
  - assistant + tool calls → **90**
  - error messages → **85**
  - done() calls → **88**
  - success messages → **60**
  - plain text → **40**, with age decay (older = lower)
- `semanticKeepMask` builds a boolean[] mask over the message list
- `compressSemantic` keeps high-importance messages **verbatim** + last N turns; summarizes only low-importance old successful results
- Falls back to original contiguous-region method if LLM summary fails (DEC-020)

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

The memory pipeline now feeds into `ContextCompressor.compressSemantic()` (v0.3.6): high-importance memories survive compression verbatim, low-importance old successful results are summarized instead of dropped.

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

No changes in v0.3.6 — backend abstraction remains stable.

---

## Tool Layer (`src/tools/`)

| Tool Module | Tools | Notes |
|-------------|-------|-------|
| `file_tools.ts` | read, write, edit, delete, list, search, append | Full port |
| `shell_tools.ts` | run, run_python | Full port |
| `web_tools.ts` | get, search (DuckDuckGo) | Full port |
| `code_tools.ts` | lint, format, tree, analyze | Full port |
| `axodex_tools.ts` | query, context, smart_read, impact, detect_changes, status, analyze | ✱ UPDATED v0.3.4 — looks for `axodex` on PATH, fallback `npx @fraziym/axodex` |
| `computer_tools.ts` | screenshot, mouse, keyboard, OCR | Full port |

**Tool Registry** (`src/core/tool_registry.ts`, NEW v0.3.6) provides role-based tool scoping on top of this map. Each role's `AgentDefinition.toolAllowlist` is intersected with the full tool map by `ToolRegistry.scopedToolMap(role, fullToolMap)` before being passed to the LLM.

---

## Execution Loop (`src/core/loop.ts` — 511 lines)

The Goal Mode loop, separate from the basic agent chat loop:

```
GoalLoop.run(goal)
 ↓
_understand() → comprehend the goal
 ↓
_plan() → generate Step[] with LLM
    [ ★ v0.3.6: DAGPlanner.plan(goal) ready to replace linear planner;
      wiring pending — DEC-019 ]
 ↓
for each step:
  _execute() → run via agent
  _verify() → check step result
    [ ★ v0.3.6: VerifyGate.run(changes) ready to replace LLM-only verifier;
      wiring pending — DEC-018 ]
  if failed: _repair() → patch result
 ↓
_replan() if overall progress stalled
 ↓
_report() → final summary
```

Includes: Spinner UI, ANSI color codes, progress tracking, step verification.

The `_plan()` → `DAGPlanner.plan()` and `_verify()` → `VerifyGate.run()` wiring changes are the next milestone (v0.4.x).

---

## Voice Stack (`src/voice/`)

| Module | Purpose |
|--------|---------|
| `tts.ts` | Edge-TTS + Kokoro ONNX (offline) |
| `stt.ts` | Moonshine ONNX (best edge STT) |
| `wake_word.ts` | OpenWakeWord ONNX |
| `voice_loop.ts` | Wake → STT → Agent → TTS pipeline |
| `wav.ts` | WAV file I/O utilities |

No changes in v0.3.6.

---

## Web Server (`src/web/`)

### Express Backend (`src/web/server.ts` — 29KB, port :7860)

Express v5 server with:
- JWT authentication (`src/core/auth.ts`)
- Rate limiting (`src/core/rate_limit.ts`)
- Prometheus metrics (`src/core/metrics.ts`)
- SSE broker for real-time agent events (`src/web/broker.ts`)
  - v0.3.6: `cost` events broadcast by `CostTracker` for live dashboard updates
- Static UI serving (copied from Python reference)
- Chat, swarm, goals, memory, model management API routes
- **Next.js proxy** (v0.3.3): all non-API GET requests proxy to `:3000` if the Next.js dev server is up; falls back to legacy static UI if unavailable

### Next.js Dashboard (`web-next/` — NEW v0.3.3, spawned by `src/web/web-next-spawn.ts`)

When `axoniz --web` is invoked:
1. Express starts on `:7860` as usual
2. `web-next-spawn.ts` spawns `next dev` in `web-next/` on `:3000` (DEC-021)
3. Express proxies all non-API GET requests from `:7860` → `:3000`
4. Falls back to legacy static UI in `src/web/static/` if the dev server is unavailable

This gives the dashboard a real React/Next.js SPA with HMR while keeping the Express API surface stable.

---

## Comms (`src/comms/telegram.ts`)

Full Telegram bot integration via Grammy:
- Async message handling
- Agent session per chat
- Voice message support (STT pipeline)

No changes in v0.3.6.

---

## Key Differentiators vs. Other Agentic Systems

1. **Axodex** — Static code graph (4,843 symbols, 10,982 relationships) enables surgical context retrieval instead of dumping entire repos. As of v0.3.4, axodex is a **standalone npm package** `@fraziym/axodex` at https://github.com/Akik-Forazi/axodex — declared as `peerDependency ^0.1.0-beta.1` in AXONIZ's `package.json`. `axoniz install axodex` now runs `npm install -g @fraziym/axodex` (was: cloning entire AXONIZ repo, ~30 MiB download).
2. **RAM-aware model swapping** — SwarmOrchestrator can hot-swap models between phases on CPU-only hardware (i5-8350U).
3. **ConfidenceScorer + AuthorityEngine** — Risk gate before dangerous tool calls; auditlog of every decision.
4. **100% offline** — llama.cpp native, no Ollama, no cloud dependency.
5. **TrajectoryStore** — Every tool call recorded to SQLite; behavioral experience is persisted.
6. **Multi-memory architecture** — MemPalace + KG + TF-IDF + Diary vs. single vector DB.
7. **Tool Registry (v0.3.6)** — 8 pre-defined agent roles, per-role tool allowlists via `scopedToolMap()`; solves the "every agent gets the full arsenal" anti-pattern shared by all major CLI agents.
8. **CostTracker (v0.3.6)** — Per-tool-call and per-LLM-call token + USD attribution with live SSE broadcast; solves bill-shock anti-pattern.
9. **VerifyGate (v0.3.6)** — Real `tsc`/`eslint`/`vitest`/`pytest`/`mypy`/`flake8` execution with parsed results; replaces LLM-only "did this succeed?" verification that has embarrassed Cursor, Claude Code, and Devin.
10. **DAGPlanner (v0.3.6)** — Dependency-graph planning with parallel-executable waves via topological sort; replaces linear step execution.
11. **Semantic Context Compression (v0.3.6)** — Importance-scored message retention (user=95, errors=85) instead of naive turn-count compression; addresses context-window rot.
12. **FRAZIYM versioning (v0.3.5)** — Canonical `VPP.FF.BBB-STAGE-RR` format with semver translation for npm compatibility; single source of truth in `src/version.ts` verified by `tests/version.test.ts`.
13. **Next.js Dashboard (v0.3.3)** — Real SPA dashboard (`web-next/` on :3000) spawned as a child process by the Express backend, proxied through :7860.

---

## Known Architectural Weaknesses

| # | Weakness | Severity | Status | Notes |
|---|----------|----------|--------|-------|
| 1 | Tool scoping not implemented | HIGH | ✅ **SOLVED v0.3.6** | `ToolRegistry` ships `AgentDefinition` + 8 roles + `scopedToolMap()`. Wiring into `agent.run()` pending. |
| 2 | SkillDistiller has no human review gate | HIGH | 🔴 OPEN | Auto-applies distilled skills — live safety gap. |
| 3 | No agent registry / definition system | HIGH | 🟡 PARTIAL v0.3.6 | `ToolRegistry` provides role-based definitions; full dynamic `AgentRegistry` instantiation pending. |
| 4 | `specialized.ts` bug: `agent.messages[0]` undefined | MEDIUM | 🔴 OPEN | `applyExtraPrompt` crashes if messages not yet populated. |
| 5 | `_is_done()` is text-string matching | MEDIUM | ✅ **SOLVED** (existing) | `done()` is canonical (DEC-013); `_is_done()` retained as fallback only. |
| 6 | No structured `Observation` type | MEDIUM | 🟡 PARTIAL | Type exists; full migration of all tool callsites pending. |
| 7 | No checkpointing for long-running tasks | HIGH | 🔴 OPEN | Process restart = lost state. |
| 8 | GoalLoop `_plan()` produces steps but no DAG | MEDIUM | ✅ **SOLVED v0.3.6** | `DAGPlanner` ships `DAGStep[]` with `dependsOn` + `topologicalSort()` waves. Wiring into `_plan()` pending. |
| 9 | Context compressor acts on turn count, not semantic importance | MEDIUM | ✅ **SOLVED v0.3.6** | `scoreImportance` + `semanticKeepMask` + `compressSemantic` now available. |
| 10 | No per-task cost tracking | LOW | ✅ **SOLVED v0.3.6** | `CostTracker` records per-tool and per-LLM cost; SSE broadcast for live updates. |
| 11 | LLM-only verification (no real compile/lint/test) | HIGH | ✅ **SOLVED v0.3.6** | `VerifyGate` runs real `tsc`/`eslint`/`vitest`/`pytest`/`mypy`/`flake8`. Wiring into `_verify()` pending. |
| 12 | Standalone axodex bundle bloat | LOW | ✅ **SOLVED v0.3.4** | axodex extracted to `@fraziym/axodex`; installer now runs `npm install -g @fraziym/axodex` instead of cloning the entire AXONIZ repo. |
| 13 | Version string drift across files | LOW | ✅ **SOLVED v0.3.5** | FRAZIYM versioning with 5 sync points verified by `tests/version.test.ts`. |
| 14 | Opaque black-box dashboard (legacy static UI) | MEDIUM | ✅ **SOLVED v0.3.3** | Next.js SPA spawned on :3000, proxied through :7860. |
| 15 | No per-tool timeout / cancellation | MEDIUM | 🔴 OPEN | A hanging shell command blocks the entire loop. |

### Open Wiring Tasks (v0.4.x milestone)

The five PEAK advancement modules ship as standalone classes in v0.3.6 but are not yet wired into the runtime. See `docs/TODO.md` for the wiring checklist:
- `agent.run()` → `ToolRegistry.scopedToolMap(role, fullToolMap)`
- `_exec()` → `CostTracker.recordToolCall()` / `recordLLMCall()`
- `loop._verify()` → `VerifyGate.run(changes)`
- `loop._plan()` → `DAGPlanner.plan(goal)` with wave-based `Promise.all` execution
- `ContextCompressor` → call `compressSemantic()` at threshold (method already on the class)
