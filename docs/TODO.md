# AXONIZ-ZERO — Prioritized Implementation Backlog
> Current version: V00.01.000-beta-01 (npm: `0.1.0-beta.1`)
> Doc revision: v0.3.6 — PEAK modules landed; wiring tasks prioritized

**Priority classification:**
- `P0` — Blocks the foundation (fix immediately)
- `P1` — Required for serious agentic capability
- `P2` — Major capability improvement
- `P3` — Advanced / SOTA capability
- `P4` — Polish / optimization

---

## ✅ Recently Completed (v0.3.3 — v0.3.6)

### ✅ Standalone axodex (v0.3.4)
- Extracted axodex to standalone npm package `@fraziym/axodex`
- Repo: https://github.com/Akik-Forazi/axodex
- `axoniz install axodex` now runs `npm install -g @fraziym/axodex` (was: cloning entire AXONIZ repo, ~30 MiB)
- AXONIZ `package.json` declares `@fraziym/axodex` as `peerDependency: ^0.1.0-beta.1`
- `src/tools/axodex_tools.ts` simplified — looks for `axodex` on PATH, fallback `npx @fraziym/axodex`
- Install command: `npm install -g @fraziym/axoniz @fraziym/axodex`

### ✅ FRAZIYM versioning (v0.3.5)
- Canonical format: `VPP.FF.BBB-STAGE-RR` (e.g., `V00.01.000-beta-01`)
- Semver translation: `0.1.0-beta.1` for npm
- Single source of truth: `src/version.ts` (exports `AXONIZ_VERSION`, `AXONIZ_VERSION_SEMVER`, `parseFraziymVersion()`, `fraziymToSemver()`)
- 5 sync points verified by `tests/version.test.ts`: `src/version.ts`, `package.json`, `src/core/runner.ts` (CLI banner), `README.md`, `tests/version.test.ts`

### ✅ Next.js dashboard spawn (v0.3.3)
- `axoniz --web` spawns Next.js dev server in `web-next/` on :3000
- Express backend on :7860 proxies all non-API GET requests to :3000
- Falls back to legacy static UI if dev server unavailable
- Spawn logic in `src/web/web-next-spawn.ts`

### ✅ Tool scoping (v0.3.6)
- `ToolRegistry` class in `src/core/tool_registry.ts`
- `AgentDefinition` interface + 8 pre-defined roles (planner/researcher/coder/debugger/reviewer/tester/verifier/general)
- Each role has a curated tool allowlist
- `ToolRegistry.scopedToolMap(role, fullToolMap)` returns filtered tool map

### ✅ Per-task cost tracking (v0.3.6)
- `CostTracker` class in `src/core/intelligence/cost_tracker.ts`
- Records `tokensIn`/`tokensOut`/`costUsd` per tool call AND per LLM call
- `getTaskTotal(taskId)` aggregator
- Emits `cost` SSE events via `broker.broadcast("cost", event)` for live dashboard

### ✅ Real verify gate (v0.3.6)
- `VerifyGate` class in `src/core/intelligence/verify_gate.ts`
- Runs `tsc --noEmit`, `eslint`, `vitest run`, `pytest`, `mypy`, `flake8`
- Parses real results, returns `VerifyResult` with per-check pass/fail/error counts
- Each check is independent — a tsc failure doesn't stop eslint/vitest
- Inapplicable checks (e.g., no tsconfig.json) are skipped, not failed
- Replaces LLM-only `_verify()` in `loop.ts`

### ✅ DAG planner (v0.3.6)
- `DAGPlanner` class in `src/core/intelligence/dag_planner.ts`
- Produces `DAGStep[]` with `dependsOn: string[]`, `role`, `difficulty` (1-5), `produces`/`consumes` artifacts, `verify` condition
- `topologicalSort()` returns "waves" of parallel-executable steps using Kahn's algorithm
- `PlanResult` includes `waves` and `estimatedDurationMs`

### ✅ Semantic context compression (v0.3.6)
- Enhanced `ContextCompressor` (existing class) in `src/core/intelligence/context_compressor.ts`
- New methods: `scoreImportance(msg, indexFromEnd)`, `semanticKeepMask()`, `compressSemantic()`
- Importance scoring: user=95, assistant+tools=90, errors=85, done=88, success=60, plain text=40 with age decay
- Keeps high-importance messages verbatim + last N turns; summarizes only low-importance old successful results
- Falls back to original contiguous-region method if LLM summary fails

---

## P0 — Foundation Wiring (Immediate Next)

### P0-W1: Wire ToolRegistry into `agent.run()`
**Files:** `src/core/agent.ts`, `src/core/tool_registry.ts`
**Issue:** The `ToolRegistry` class exists but is not yet called by `agent.run()`. Agents still receive the full ~80-tool arsenal regardless of role.
**Fix:** In `agent.run()` (or `Agent.__init__`), if a role is assigned, call `ToolRegistry.scopedToolMap(role, this._tool_map)` and use the filtered map for the LLM's available tools.
**Effort:** 2–3 hrs

### P0-W2: Wire CostTracker into `_exec()`
**Files:** `src/core/agent.ts`, `src/core/intelligence/cost_tracker.ts`
**Issue:** The `CostTracker` class exists but is not called. No per-tool or per-LLM cost is recorded.
**Fix:** After each tool execution in `_exec()`, call `costTracker.recordToolCall(...)`. After each LLM call, call `costTracker.recordLLMCall(...)`. Tokens come from the backend's `CompletionResult.usage`.
**Effort:** 2–3 hrs

### P0-W3: Wire VerifyGate into `loop._verify()`
**Files:** `src/core/loop.ts`, `src/core/intelligence/verify_gate.ts`
**Issue:** `loop._verify()` still uses LLM-only "did this succeed?" verification. `VerifyGate` is ready but not called.
**Fix:** In `_verify()`, call `VerifyGate.run(changes)` first. If at least one applicable check ran, use its `VerifyResult` as the verdict. If all checks were skipped (no tsconfig/eslint/vitest/etc.), fall back to the LLM check. Pass `VerifyResult` to `_repair()` on failure for evidence-based retry.
**Effort:** 3–4 hrs

### P0-W4: Wire DAGPlanner into `loop._plan()`
**Files:** `src/core/loop.ts`, `src/core/intelligence/dag_planner.ts`
**Issue:** `loop._plan()` produces linear `PlanTask[]`. `DAGPlanner` produces dependency-graph `DAGStep[]` with waves.
**Fix:** In `_plan()`, call `DAGPlanner.plan(goal)` instead of the linear LLM prompt. Iterate `PlanResult.waves` — within each wave, run all steps concurrently via `Promise.all`; between waves, wait for the prior wave to complete (deps satisfied).
**Effort:** 4–6 hrs

### P0-W5: Wire `compressSemantic()` into the agent loop threshold hook
**Files:** `src/core/intelligence/context_compressor.ts`, `src/core/agent.ts`
**Issue:** The `compressSemantic()` method exists but the existing threshold hook still calls the original contiguous-region compression.
**Fix:** At the 40% threshold trigger, call `compressSemantic(messages)` first. If it returns null (LLM summary failed), fall back to the original contiguous method.
**Effort:** 1 hr

### P0-W6: Write tests for the 5 new PEAK modules
**Files:** `src/tests/unit/tool_registry.test.ts`, `src/tests/unit/cost_tracker.test.ts`, `src/tests/unit/verify_gate.test.ts`, `src/tests/unit/dag_planner.test.ts`, `src/tests/unit/context_compressor.test.ts`
**Issue:** All 5 modules ship without dedicated test coverage. See `docs/TESTING.md` for the per-module test matrix.
**Effort:** 8–12 hrs

---

## P0 — Foundation Blockers (Still Open)

### P0-001: Fix `specialized.ts` — `applyExtraPrompt` crash
**File:** `src/agents/specialized.ts`
**Issue:** `agent.messages[0]` undefined at construction. Smoke test fails.
**Fix:** Guard with existence check; defer extra prompt to `run()` if messages not yet populated.
**Effort:** 30 min

### P0-003: Human review gate for `SkillDistiller`
**File:** `src/core/intelligence/skill_distiller.ts`
**Issue:** Auto-applies distilled skills with zero review. Comment in Python code: "for now, we forge it to demonstrate the loop." This is a live safety gap.
**Fix:** Buffer distilled skills into a `pendingSkills` queue; expose a review API; require explicit approval before writing to disk.
**Effort:** 2–3 hrs

### P0-004: ~~Fix smoke test to run without absolute path argument~~ ✅ DONE

---

## P1 — Core Agentic Capability

### P1-001: `AgentRegistry` — dynamic agent catalog
**File:** `src/agents/registry.ts` (new)
**Purpose:** In-process `register(def) / get(id) / list()` catalog. Enables dynamic agent instantiation by task type rather than hardcoded subclasses.
**Blocked by:** P0-W1 (ToolRegistry wiring)
**Status:** 🟡 PARTIAL — `ToolRegistry` provides role-based definitions; full dynamic catalog still pending.
**Effort:** 2 hrs

### P1-002: Structured `Observation` type — full migration
**Issue:** Tool results are raw strings. No metadata (tool name, timing, success/failure, risk level, token count). The `Observation` type exists but is not used at every callsite.
**Design:**
```typescript
interface Observation {
  tool: string;
  args: Record<string, unknown>;
  result: string;
  success: boolean;
  duration_ms: number;
  risk_level?: "low" | "medium" | "high" | "critical";
  tokens?: number;
}
```
**Impact:** Enables proper self-verification, audit trails, and feeds the `CostTracker`.
**Effort:** 3 hrs (full callsite migration)

### P1-003: Checkpointing — session persistence across restarts
**Issue:** Process restart loses all in-flight state. Long-running tasks cannot survive crashes.
**Design:** Serialize `GoalLoop` state (current step, completed steps, observations, plan, `CostTracker` totals) to SQLite. Resume on restart.
**Files:** `src/core/checkpoint.ts` (new), changes to `loop.ts`
**Effort:** 6–8 hrs

### P1-004: MockBackend for unit tests + test suite
**Issue:** No tests for the agent execution loop, tool dispatch, or intelligence subsystems. Blocks all agent-level tests.
**Files:** `src/tests/mocks/backend.ts`, `src/tests/unit/agent.test.ts`, `src/tests/unit/memory.test.ts`
**Effort:** 4–6 hrs

### P1-005: `Codebase Investigator` specialized agent
**Purpose:** Read-only tool scope (`file_read`, `file_search`, `file_list`, `axodex_query`, `axodex_context`), outputs structured report.
**Blocked by:** P0-W1 (ToolRegistry wiring)
**Effort:** 2 hrs after P0-W1

### P1-006: `SwarmCritic` verifier gate for code tasks
**Issue:** `SwarmCritic` does general result scoring, but no deterministic checks (compile, lint, test) for code-editing sub-tasks. (Now partly addressed by `VerifyGate`.)
**Design:** Have `SwarmCritic` consume `VerifyResult` from `VerifyGate` and treat check failures as hard rejections.
**Blocked by:** P0-W3 (VerifyGate wiring)
**Effort:** 4–6 hrs

### P1-007: ~~Fix `_is_done()` — replace text-string termination with structured signal~~ ✅ DONE
**Status:** `done()` tool is canonical; `_is_done()` retained as fallback only (DEC-013).

---

## P1 — Publish to npm

### P1-PUB1: Publish `@fraziym/axodex` to npm
**Repo:** https://github.com/Akik-Forazi/axodex
**Issue:** `@fraziym/axodex` is declared as a peerDependency of AXONIZ but is not yet published to the npm registry.
**Steps:**
1. Verify `src/version.ts` in axodex reports `V00.01.000-beta-01` / `0.1.0-beta.1`
2. `npm publish --access public --tag beta` from axodex repo
3. Verify `npm view @fraziym/axodex version` reports `0.1.0-beta.1`
**Effort:** 30 min

### P1-PUB2: Publish `@fraziym/axoniz` v0.1.0-beta.1 to npm
**Issue:** AXONIZ itself is not yet on the npm registry.
**Steps:**
1. Verify `src/version.ts`, `package.json`, `src/core/runner.ts` banner, `README.md`, and `tests/version.test.ts` all agree on `V00.01.000-beta-01` / `0.1.0-beta.1` (run `npm test`)
2. `npm publish --access public --tag beta`
3. Verify `npm view @fraziym/axoniz version` reports `0.1.0-beta.1`
4. Smoke test: clean-install in a fresh dir and run `axoniz --version`
**Blocked by:** P1-PUB1 (axodex peerDependency must resolve)
**Effort:** 1 hr

---

## P2 — Major Capability Improvements

### P2-001: ~~DAG-based GoalLoop step scheduling~~ ✅ DONE (v0.3.6 — `DAGPlanner`)
**Status:** Class delivered. Wiring into `loop._plan()` is P0-W4 above.

### P2-002: ~~Per-task token cost attribution~~ ✅ DONE (v0.3.6 — `CostTracker`)
**Status:** Class delivered. Wiring into `_exec()` is P0-W2 above.

### P2-003: ~~Intelligent context selection~~ ✅ DONE (v0.3.6 — `ContextCompressor` enhancement)
**Status:** `scoreImportance`, `semanticKeepMask`, `compressSemantic` delivered. Wiring into threshold hook is P0-W5 above.

### P2-004: Sandboxed execution environment
**Issue:** Agent can execute arbitrary shell commands without isolation.
**Design:** Windows: PowerShell constrained runspace or WSL2 jail. Add resource limits (CPU time, max output size).
**Effort:** 8–12 hrs

### P2-005: Integration tests for agent + llamacpp backend
**Purpose:** End-to-end: construct Agent, give it a simple task, verify `done()` called with sensible result.
**Blocked by:** P1-004 (MockBackend)
**Effort:** 3–4 hrs

### P2-006: `CLI Help Agent` — answers "how does Axoniz work"
**Purpose:** Read-only agent grounded in `docs/ARCHITECTURE.md`, `docs/TODO.md`, `HANDOFF.md`.
**Blocked by:** P0-W1 (ToolRegistry wiring)
**Effort:** 1–2 hrs after P0-W1

### P2-007: Per-tool timeout + cancellation
**Issue:** No timeout on individual tool calls. A hanging shell command blocks the entire loop indefinitely.
**Design:** Wrap every tool call in `Promise.race([toolCall, timeout(30_000)])`. Add `AbortController` plumbing.
**Effort:** 3–4 hrs

### P2-008: KV cache management API
**Issue:** `node-llama-cpp` gives direct control over KV cache, but AXONIZ does not expose a high-level API for cache warm/clear/evict across model swaps.
**Design:** Surface a `KvCache` interface on the backend that exposes `warmContext(messages)`, `clear()`, `evict(tokenRange)`. Used by `SwarmOrchestrator` during model hot-swap.
**Effort:** 4–6 hrs

### P2-009: Model auto-selection by task complexity
**Issue:** Model selection is hardcoded. Should be: planning → reasoning model; code search → fast model; vision → multimodal. Dynamic routing based on task metadata.
**Design:** `ModelRouter` class. Consumes `DAGStep.difficulty` and `role` to pick a model per step.
**Blocked by:** P0-W4 (DAGPlanner wiring — needs `difficulty` field per step)
**Effort:** 6–8 hrs

---

## P3 — Advanced / SOTA Capability

### P3-001: Agentic Memory Graph (project + task + outcome graph)
**Purpose:** Go beyond MemPalace. Connect files → symbols → commits → bugs → agents → tasks → outcomes into a queryable graph that evolves as Axoniz works.
**Effort:** 20–30 hrs

### P3-002: Evaluation benchmark harness
**Purpose:** Reproducible benchmarks for task completion, correctness, regression rate, token usage, recovery success.
**Effort:** 10–15 hrs

### P3-003: Adversarial test suite
**Purpose:** Intentionally difficult environments: stale docs, flaky tools, ambiguous errors, huge repos. Measures whether Axoniz detects uncertainty vs. hallucinating success.
**Effort:** 10–15 hrs

### P3-004: Model routing by task complexity
**Status:** Promoted to P2-009 above.
**Effort:** 6–8 hrs

### P3-005: Distributed worker support
**Purpose:** Schedule tasks across local, GPU, and remote workers.
**Effort:** 20+ hrs

### P3-006: Specialization engine
**Purpose:** Task-type-specific strategies (frontend, backend, security, DevOps), each with own tools, heuristics, context strategies.
**Effort:** 15–20 hrs

---

## P4 — Polish / Optimization

### P4-001: Startup time profiling + optimization
**Issue:** Cold start includes daemon, memory, AST indexer. Profile and defer non-critical components.
**Effort:** 2–4 hrs

### P4-002: Better Windows path handling throughout
**Issue:** Several places use forward-slash paths that may fail on native Windows.
**Effort:** 2–3 hrs

### P4-003: Observability dashboard
**Purpose:** Human-readable execution trace UI showing goal → plan → steps → observations → result.
**Status:** 🟡 PARTIAL — Next.js dashboard SPA landed (v0.3.3); SSE cost events emitted (v0.3.6); full UI consumption pending.
**Effort:** 8–12 hrs

### P4-004: Remove `_pyref/` from repo
**Purpose:** `_pyref/` is a snapshot of the Python source used as reference. Once port is verified stable, archive it.
**Effort:** 30 min

---

## Execution Order (Recommended, v0.4.x milestone)

```
Sprint 1 — Wire PEAK modules into runtime
  P0-W1 (ToolRegistry → agent.run)           — 3 hrs
  P0-W2 (CostTracker → _exec)                — 3 hrs
  P0-W5 (compressSemantic → threshold hook)  — 1 hr
  P0-W4 (DAGPlanner → loop._plan)            — 6 hrs
  P0-W3 (VerifyGate → loop._verify)          — 4 hrs

Sprint 2 — Test coverage for the 5 modules
  P0-W6 (tests for tool_registry, cost_tracker,
         verify_gate, dag_planner,
         context_compressor semantic)        — 12 hrs
  P1-004 (MockBackend)                       — 6 hrs

Sprint 3 — Publish
  P1-PUB1 (publish @fraziym/axodex to npm)   — 30 min
  P1-PUB2 (publish @fraziym/axoniz)          — 1 hr

Sprint 4 — Remaining foundation blockers
  P0-001 (specialized.ts bug)                — 30 min
  P0-003 (SkillDistiller review gate)         — 3 hrs

Sprint 5 — Core agentic (Phase 2 completion)
  P1-001 (AgentRegistry)                     — 2 hrs
  P1-002 (Observation migration)             — 3 hrs
  P1-003 (Checkpointing)                      — 8 hrs
  P2-007 (per-tool timeout)                  — 4 hrs
  P1-005 (Codebase Investigator agent)       — 2 hrs
  P1-006 (SwarmCritic consumes VerifyGate)  — 6 hrs

Sprint 6+ — Major capability
  P2-008 (KV cache API)                      — 6 hrs
  P2-009 (model auto-selection)              — 8 hrs
  P2-004 (sandboxed execution)               — 12 hrs
  P2-005 (agent + llamacpp integration tests)— 4 hrs

Then SOTA:
  P3-001 (Memory Graph)
  P3-002 (Evaluation harness)
  P3-003 (Adversarial tests)
```

---

## Cross-Reference

- **Architecture:** `docs/ARCHITECTURE.md` — system layout, all 5 PEAK modules described
- **Decisions:** `docs/DECISIONS.md` — DEC-014 through DEC-021 cover the v0.3.3–v0.3.6 design decisions
- **Port status:** `docs/PORT_STATUS.md` — per-module porting status + wiring status table
- **Testing:** `docs/TESTING.md` — per-module test coverage plan for the 5 PEAK modules
- **Roadmap:** `docs/AGENTIC_ROADMAP.md` — Phase 0–30 SOTA roadmap with v0.3.6 status updates
