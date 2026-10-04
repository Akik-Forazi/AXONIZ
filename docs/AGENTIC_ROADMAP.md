# AXONIZ-ZERO — Agentic SOTA Roadmap
> 30-Phase Mission to State-of-the-Art Agentic OS
> **Current version:** V00.01.000-beta-01 (npm: `0.1.0-beta.1`)
> **Doc revision:** v0.3.6 (PEAK advancements + FRAZIYM versioning + standalone axodex)

---

## Current Position (v0.3.6)

### Foundation complete
- ✅ TypeScript port: ~95% feature parity, zero type errors, clean build
- ✅ Core agent loop: fully ported and async
- ✅ Memory: MemPalace + KG smoke-tested
- ✅ Intelligence: SwarmOrchestrator, ConfidenceScorer, TrajectoryStore all ported
- ✅ Differentiators: Axodex (standalone `@fraziym/axodex`), RAM-aware model swapping, multi-memory

### PEAK advancement modules landed (v0.3.6)
- ✅ **Tool Registry** (`src/core/tool_registry.ts`) — 8 pre-defined agent roles, per-role tool allowlists, `scopedToolMap(role, fullToolMap)` filter
- ✅ **Cost Tracker** (`src/core/intelligence/cost_tracker.ts`) — per-tool-call and per-LLM-call token + USD attribution, SSE broadcast for live dashboard
- ✅ **Verify Gate** (`src/core/intelligence/verify_gate.ts`) — runs `tsc --noEmit`, `eslint`, `vitest run`, `pytest`, `mypy`, `flake8` and parses real results
- ✅ **DAG Planner** (`src/core/intelligence/dag_planner.ts`) — `DAGStep[]` with `dependsOn`, Kahn's-algorithm topological sort into parallel-executable "waves"
- ✅ **Semantic Context Compression** — `ContextCompressor` gained `scoreImportance`, `semanticKeepMask`, `compressSemantic` (importance-scored, not turn-count-based)

### Remaining gaps (next-up wiring tasks)
- 🔴 Wire ToolRegistry into `agent.run()` (class exists, not called yet)
- 🔴 Wire CostTracker into `_exec()` (class exists, not called yet)
- 🔴 Wire VerifyGate into `loop._verify()` (class exists, not called yet)
- 🔴 Wire DAGPlanner into `loop._plan()` (class exists, not called yet)
- 🔴 Write unit + integration tests for the 5 new modules
- 🔴 SkillDistiller human review gate still missing
- 🔴 Checkpoint/resume still missing
- 🔴 Per-tool timeout + cancellation still missing

---

## Status Legend

| Marker | Meaning |
|--------|---------|
| ✅ DONE | Implemented and landed (verified in source) |
| 🟡 PARTIAL | Class/module exists but not yet wired into the runtime, OR partially implemented |
| 🔴 PLANNED | Designed but not started |
| ⬜ FUTURE | Future work, not yet designed |

---

## Phase Roadmap

### ✅ Phase 0 — Ground Truth (COMPLETE)
- Repository inventory
- Python → TypeScript parity matrix
- Build verification (PASS)
- Smoke test execution
- Failure identification
- Architecture documentation
- Prioritized backlog

---

### 🟡 Phase 1 — Clean Foundation
**Goal:** Fix all P0 blockers. Establish reliable baseline.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Fix `specialized.ts` `applyExtraPrompt` bug (P0-001) | 🟡 PARTIAL | Still flagged in smoke; tracked in TODO |
| 2 | Add human review gate to SkillDistiller (P0-003) | 🔴 PLANNED | Auto-apply still in place; live safety gap |
| 3 | Fix smoke test path handling (P0-004) | ✅ DONE | Absolute-path requirement resolved |
| 4 | Implement `AgentDefinition` + tool scoping (P0-002) | ✅ DONE | `ToolRegistry` (v0.3.6) ships `AgentDefinition` interface + 8 role definitions + `scopedToolMap()` filter |
| 5 | Fix `_is_done()` → structured done() signal (P1-007) | ✅ DONE | `done()` tool is canonical; `_is_done()` kept as text-response fallback only |
| 6 | Create MockBackend + first unit tests (P1-004) | 🔴 PLANNED | MockBackend still pending; first unit tests deferred to post-v0.3.6 module wiring |

**Exit criteria (remaining):** SkillDistiller review gate implemented; MockBackend landed; unit tests for the 5 new modules written.

---

### 🟡 Phase 2 — Agent Runtime
**Goal:** Build real, composable agent infrastructure.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | `AgentRegistry` — dynamic agent catalog (P1-001) | 🟡 PARTIAL | `ToolRegistry` provides role-based definitions and a registry-style API; full dynamic instantiation still pending |
| 2 | `Observation` type — structured tool results (P1-002) | 🟡 PARTIAL | Observation type exists in source; full migration of all tool callsites pending |
| 3 | `Checkpoint` — session persistence across restarts (P1-003) | 🔴 PLANNED | — |
| 4 | Per-tool timeout + cancellation (P2-007) | 🔴 PLANNED | — |
| 5 | Per-task token cost attribution (P2-002) | ✅ DONE | `CostTracker` (v0.3.6) records tokensIn/out + USD per tool call AND per LLM call; `getTaskTotal()` aggregator; SSE broadcast |
| 6 | Integration tests: agent + llamacpp (P2-005) | 🔴 PLANNED | — |

**Exit criteria (remaining):** Full AgentRegistry wiring, checkpoint persistence, per-tool timeout, integration tests.

---

### 🟡 Phase 3 — First-Class Tool System
**Goal:** Tools become discoverable, safe, and auditable.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Tool registry with capability advertisement | ✅ DONE | `ToolRegistry` (v0.3.6); 8 roles: planner/researcher/coder/debugger/reviewer/tester/verifier/general |
| 2 | Tool preconditions + postconditions | 🔴 PLANNED | — |
| 3 | Tool risk classification (read-only / write / destructive / external) | 🟡 PARTIAL | `ConfidenceScorer` provides risk-gate behavior; formal classification taxonomy pending |
| 4 | Retry policies per tool category | 🔴 PLANNED | — |
| 5 | Rollback support for reversible tools (file edits, git) | 🔴 PLANNED | — |
| 6 | Tool audit log (every call, args, result, cost) | 🟡 PARTIAL | `TrajectoryStore` already records every call to SQLite; cost field pending CostTracker wiring |

---

### ⬜ Phase 4 — Computer Control
**Goal:** Screen, mouse, keyboard as first-class capabilities.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Formalize `ComputerAction` → `Observation` → `Verification` pipeline | 🔴 PLANNED | — |
| 2 | OCR-based result verification | 🔴 PLANNED | — |
| 3 | Window discovery + application enumeration | 🔴 PLANNED | — |
| 4 | Browser interaction support | 🔴 PLANNED | — |
| 5 | Clipboard integration | 🔴 PLANNED | — |

---

### 🟡 Phase 5 — Context Engineering
**Goal:** Agent dynamically decides what context to retrieve per step.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Repository mapper (file → module → subsystem hierarchy) | 🔴 PLANNED | Axodex provides symbol-level mapping; subsystem mapper pending |
| 2 | Semantic relevance scoring for context selection | ✅ DONE | `ContextCompressor.scoreImportance(msg, indexFromEnd)` (v0.3.6); user=95, assistant+tools=90, errors=85, done=88, success=60, plain text=40 with age decay |
| 3 | Hierarchical context: global → project → subsystem → task → step | 🔴 PLANNED | — |
| 4 | Context caching between steps with same workspace | 🔴 PLANNED | — |
| 5 | Extend `ContextCompressor` with semantic importance scoring (P2-003) | ✅ DONE | `semanticKeepMask()` + `compressSemantic()`; falls back to original contiguous-region method if LLM summary fails |
| 6 | `Codebase Investigator` agent (P1-005) | 🔴 PLANNED | Depends on wiring `ToolRegistry.scopedToolMap()` into runtime |

---

### ⬜ Phase 6 — Real Memory
**Goal:** Multi-class memory with retrieval, ranking, expiration, and contradiction detection.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Formalize Working / Episodic / Semantic / Procedural / Project memory classes | 🔴 PLANNED | MemPalace + KG + TF-IDF + Diary exist as stores; class formalization pending |
| 2 | Memory relevance ranking + confidence scores | 🔴 PLANNED | — |
| 3 | Memory expiration policies | 🔴 PLANNED | — |
| 4 | Contradiction detection | 🔴 PLANNED | — |
| 5 | Memory consolidation | 🔴 PLANNED | — |
| 6 | Provenance tracking | 🔴 PLANNED | — |
| 7 | `Agentic Memory Graph` — project + task + outcome graph (P3-001) | 🔴 PLANNED | — |

---

### ⬜ Phase 7 — Multi-Agent Architecture
**Goal:** Flexible orchestration with specialized roles.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Agent roles: Planner, Researcher, Coder, Debugger, Reviewer, Tester, Verifier | 🟡 PARTIAL | `ToolRegistry` (v0.3.6) ships 8 roles as definitions; runtime instantiation pending wiring |
| 2 | Dynamic instantiation based on task requirements | 🔴 PLANNED | Depends on ToolRegistry wiring |
| 3 | Shared artifacts between agents | 🔴 PLANNED | — |
| 4 | Agent communication protocol | 🔴 PLANNED | — |
| 5 | Budget management per agent | 🟡 PARTIAL | `CostTracker` exposes per-task totals; per-agent budget enforcement pending |
| 6 | `CLI Help Agent` (P2-006) | 🔴 PLANNED | — |

---

### 🟡 Phase 8 — Parallelism + Async Execution
**Goal:** Exploit concurrency safely and intelligently.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Task scheduler with dependency graph (DAG GoalLoop — P2-001) | ✅ DONE | `DAGPlanner` (v0.3.6); `DAGStep[]` with `dependsOn`; `topologicalSort()` returns parallel-executable "waves" via Kahn's algorithm; `PlanResult` includes `waves` + `estimatedDurationMs` |
| 2 | Worker pool with resource limits | 🟡 PARTIAL | `SwarmOrchestrator` provides configurable `max_workers`; formal resource limits pending |
| 3 | Cancellation propagation | 🔴 PLANNED | — |
| 4 | Deadlock prevention | 🔴 PLANNED | — |
| 5 | Failure propagation across parallel tasks | 🔴 PLANNED | — |
| 6 | Priority queuing | 🔴 PLANNED | — |

---

### 🟡 Phase 9 — Self-Verification
**Goal:** Agent never claims success without evidence.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Extend SwarmCritic verifier gate for code tasks (P1-006) | 🔴 PLANNED | — |
| 2 | Compile verification (tsc, mypy) after code changes | ✅ DONE | `VerifyGate` (v0.3.6) runs `tsc --noEmit` and `mypy` with real result parsing |
| 3 | Lint verification (eslint, flake8) | ✅ DONE | `VerifyGate` runs `eslint` and `flake8` |
| 4 | Test execution + result parsing | ✅ DONE | `VerifyGate` runs `vitest run` and `pytest`; returns per-check pass/fail/error counts |
| 5 | Regression detection (diff against baseline) | 🔴 PLANNED | — |
| 6 | Behavior verification (functional assertions) | 🔴 PLANNED | — |

**Canonical verification chain for code changes:**
```
Change → Compile → Lint → Unit Tests → Integration Tests → Behavior → Regression → Review
```
*Phases 2–4 of this chain are now backed by real VerifyGate checks rather than LLM-only verification.*

---

### 🟡 Phase 10 — Self-Debugging and Recovery
**Goal:** Failures trigger diagnosis, not termination.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Failure classifier (compiler / test / shell / model / tool / permission / dependency) | 🟡 PARTIAL | `SelfCorrector` exists and classifies failures; formal taxonomy pending |
| 2 | Evidence collector per failure type | 🔴 PLANNED | — |
| 3 | Hypothesis generator | 🔴 PLANNED | — |
| 4 | Hypothesis tester (retry with modifications) | 🔴 PLANNED | — |
| 5 | Patch applier | 🔴 PLANNED | — |
| 6 | Re-run + verify cycle | 🔴 PLANNED | Will integrate with VerifyGate once wired |
| 7 | Escalation: if N hypotheses fail → surface to user with evidence | 🔴 PLANNED | — |

---

### ⬜ Phase 11 — Model Abstraction
**Goal:** Model selection is intelligent, not hardcoded.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Model capability registry (context window, modalities, tool calling support, speed, cost) | 🔴 PLANNED | — |
| 2 | Task complexity classifier | 🔴 PLANNED | — |
| 3 | Model router: complexity + modality → model selection | 🔴 PLANNED | — |
| 4 | Fallback chain | 🔴 PLANNED | — |
| 5 | Cost tracking per model per task | 🟡 PARTIAL | `CostTracker` records per-LLM-call cost; per-model aggregation pending |

---

### ⬜ Phase 12 — Model-Agnostic Agent Protocol
**Goal:** Swap any model without rewriting agent runtime.

Current state: Backend abstraction already exists (`abstract class Backend`).

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Normalized message format | ✅ DONE | `ChatMessage` |
| 2 | Normalized tool call format | ✅ DONE | `ToolCall` |
| 3 | Reasoning metadata passthrough | 🔴 PLANNED | — |
| 4 | Multimodal input normalization | 🔴 PLANNED | — |
| 5 | Token usage normalization | 🟡 PARTIAL | `CostTracker` expects normalized token usage; backend reporting pending |

---

### ⬜ Phase 13 — Agentic Memory Graph
**Goal:** Connected graph: Project → files → symbols → commits → bugs → tests → agents → tasks → outcomes.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Design graph schema | 🔴 PLANNED | — |
| 2 | Graph persistence (SQLite or DuckDB) | 🔴 PLANNED | — |
| 3 | Graph ingestion pipeline | 🔴 PLANNED | — |
| 4 | Graph query API | 🔴 PLANNED | — |
| 5 | Future-agent context retrieval from graph | 🔴 PLANNED | — |

---

### ⬜ Phase 14 — Git-Native Engineering
**Goal:** Git as a first-class capability; every change has provenance.

Current state: Git tools exist.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Automatic branch creation for every autonomous task | 🔴 PLANNED | — |
| 2 | Commit attribution (which agent, which task, which tools) | 🔴 PLANNED | — |
| 3 | History analysis for bug investigation | 🔴 PLANNED | — |
| 4 | Conflict resolution support | 🔴 PLANNED | — |
| 5 | `shadow_step` improvement: proper cleanup of dead shadow branches | 🔴 PLANNED | — |

---

### ⬜ Phase 15 — Security and Permission System
**Goal:** Capability-based permissions. Least privilege by default.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Formal permission model | 🟡 PARTIAL | `AuthorityEngine` exists with deny/allow/ask; full capability taxonomy pending |
| 2 | Per-agent capability grants | 🟡 PARTIAL | `ToolRegistry.scopedToolMap(role, fullToolMap)` filters tools by role; full capability grants pending |
| 3 | Sandbox-or-ask for dangerous capabilities | 🔴 PLANNED | — |
| 4 | Audit log for every permission check | 🟡 PARTIAL | Authority audit log exists; per-check coverage pending |
| 5 | Policy engine: deny / ask / allow / sandbox | 🟡 PARTIAL | Three of four states implemented; sandbox pending |

---

### ⬜ Phase 16 — Sandboxed Execution
**Goal:** Agents can experiment safely.

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Isolated execution for code, tests, package installs | 🔴 PLANNED | — |
| 2 | Resource limits: CPU, memory, disk, time, network | 🔴 PLANNED | — |
| 3 | Windows: PowerShell constrained runspace / WSL2 jail | 🔴 PLANNED | — |
| 4 | Result extraction from sandbox | 🔴 PLANNED | — |

---

### ⬜ Phase 17 — Evaluation System
**Goal:** Every claimed improvement has reproducible evidence.

Metrics to track:
- Task completion rate
- Correctness (tests pass)
- Regression rate
- Tool efficiency (calls per task)
- Latency, token usage, cost
- Recovery success rate
- Long-horizon reliability

Benchmark suites:
- Coding tasks (implement feature, fix bug, refactor)
- Repository exploration
- Terminal + Git tasks
- Multi-step workflows
- Failure recovery

**Status:** 🔴 PLANNED — no reproducible benchmark harness yet.

---

### ⬜ Phase 18 — Adversarial Evaluation
**Goal:** Intentionally difficult environments to catch overconfidence.

Test scenarios:
- Stale documentation contradicting actual code
- Failing tests unrelated to the task
- Hidden dependencies
- Partial implementations
- Flaky tools (random failures)
- Conflicting requirements
- Huge repositories with red herrings

**Status:** 🔴 PLANNED.

---

### 🟡 Phase 19 — Observability
**Goal:** Every run produces a complete, human-readable + machine-readable execution trace.

Outputs per run:
- Goal → Plan → Tasks → Agents → Models → Tool calls → Observations → Failures → Retries → Memory → Files modified → Tests → Verification → Result
- Structured event stream (JSONL)
- Human-readable narrative

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Structured event stream (JSONL) | 🟡 PARTIAL | `TrajectoryStore` records to SQLite; JSONL export pending |
| 2 | Live cost dashboard feed | ✅ DONE | `CostTracker` emits `cost` SSE events via `broker.broadcast("cost", event)` |
| 3 | Next.js dashboard | ✅ DONE | `axoniz --web` spawns Next.js dev server in `web-next/` on :3000, proxied through Express on :7860 |
| 4 | Human-readable narrative | 🔴 PLANNED | — |

---

### 🟡 Phase 20 — User Experience
**Goal:** UI makes autonomous execution understandable, not opaque.

Views:
- Mission view (goal + progress)
- Agent view (active workers + responsibilities)
- Execution timeline (chronological actions)
- Workspace (files + changes)
- Terminal (commands + output)
- Memory (what Axoniz knows)
- Plan (editable execution strategy)
- Verification (evidence that result works)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Next.js dashboard scaffolding | ✅ DONE | `web-next/` spawned by `src/web/web-next-spawn.ts` |
| 2 | Live SSE wiring (cost, trajectory, status) | 🟡 PARTIAL | Cost SSE active; full UI consumption pending |
| 3 | Legacy static UI fallback | ✅ DONE | Falls back when dev server unavailable |

---

### Phases 21–30 — Long-Horizon, Self-Improvement, Specialization, Platform, Ecosystem, Distribution, Performance, Competitive Analysis, Benchmarking, Consolidation

See full mission brief for details. These phases are future work after Phases 1–20 are stable.

**Status:** ⬜ FUTURE.

---

## Anti-Patterns to Avoid (From Market Research)

Based on analysis of Claude Code, Cursor, Cline, Aider, Devin, AutoGPT, LangChain, and 15+ other systems:

| Anti-Pattern | How Others Failed | Axoniz Response | Status |
|---|---|---|---|
| Context window rot | All tools degrade at 50k–100k tokens | Multi-class memory + semantic context selection (`scoreImportance` + `compressSemantic`) | ✅ v0.3.6 |
| Silent failure ("I completed the task") | Cursor, Claude Code, Devin | Structured done() + VerifyGate (real tsc/eslint/vitest/pytest) | ✅ v0.3.6 |
| Infinite loops | AutoGPT, LangChain | Trajectory recording + termination conditions | ✅ (existing) |
| Bill shock | Aider, Claude Code | Per-tool + per-task cost attribution (`CostTracker` + SSE) | ✅ v0.3.6 |
| Rules ignored mid-session | Cursor, Windsurf, Cline | ConfidenceScorer + AuthorityEngine | ✅ (existing) |
| Destructive operations | Cursor (DB deletion), Replit (coverup) | SkillDistiller gate + shadow-step + checkpoints | 🔴 review gate pending |
| Over-abstraction | LangChain | Composable primitives, not framework spaghetti | ✅ (existing) |
| Tool scoping absent | All current tools | `ToolRegistry` with 8 roles + `scopedToolMap()` filter | ✅ v0.3.6 |
| No self-verification | All except emerging tools | `VerifyGate` runs real compile/lint/test checks | ✅ v0.3.6 |
| Linear execution only | Most early agents | `DAGPlanner` produces dependency graph + parallel waves | ✅ v0.3.6 |

---

## Wiring Plan (Post-v0.3.6)

The 5 PEAK advancement modules ship as standalone classes in v0.3.6. The immediate next milestone (v0.4.x) wires them into the runtime:

1. `agent.run()` → call `ToolRegistry.scopedToolMap(role, fullToolMap)` to filter the tool map per role
2. `_exec()` → call `CostTracker.recordToolCall()` after each tool execution; `recordLLMCall()` after each LLM call
3. `loop._verify()` → replace LLM-only verification with `VerifyGate.run(changes)`, fall back to LLM check only if no checks apply
4. `loop._plan()` → call `DAGPlanner.plan(goal)` instead of linear `PlanTask[]`; iterate `waves` of `DAGStep[]` with `Promise.all` per wave
5. `ContextCompressor` → call `compressSemantic()` when budget threshold crossed (already a method on the class)

See `docs/TODO.md` for the full wiring checklist.
