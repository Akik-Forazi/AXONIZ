# AXONIZ-ZERO — Prioritized Implementation Backlog
> Phase 0 Ground Truth Audit · October 2026

**Priority classification:**
- `P0` — Blocks the foundation (fix immediately)
- `P1` — Required for serious agentic capability
- `P2` — Major capability improvement
- `P3` — Advanced / SOTA capability
- `P4` — Polish / optimization

---

## P0 — Foundation Blockers

### P0-001: Fix `specialized.ts` — `applyExtraPrompt` crash
**File:** `src/agents/specialized.ts`
**Issue:** `agent.messages[0]` undefined at construction. Smoke test fails.
**Fix:** Guard with existence check; defer extra prompt to `run()` if messages not yet populated.
**Effort:** 30 min

### P0-002: Implement `AgentDefinition` + tool scoping
**Files:** `src/agents/definition.ts` (new), `src/core/agent.ts`
**Issue:** All 3 specialized agents receive the full ~80-tool arsenal including `git_commit`, `mouse_click`, `goal_create`. A `ResearchAgent` should never have file-delete or computer-control tools.
**Design:**
```typescript
interface AgentToolConfig {
  tool_names: string[];  // allowlist
  deny_patterns?: string[];
}
interface AgentDefinition {
  id: string;
  role: string;
  system_prompt_extra?: string;
  tool_config: AgentToolConfig;
  model_override?: string;
}
```
**Change:** `Agent.__init__` filters `_tool_map` to `AgentToolConfig.tool_names` when `AgentDefinition` is provided.
**Effort:** 4–6 hrs

### P0-003: Human review gate for `SkillDistiller`
**File:** `src/core/intelligence/skill_distiller.ts`
**Issue:** Auto-applies distilled skills with zero review. Comment in Python code: "for now, we forge it to demonstrate the loop." This is a live safety gap.
**Fix:** Buffer distilled skills into a `pendingSkills` queue; expose a review API; require explicit approval before writing to disk.
**Effort:** 2–3 hrs

### ~~P0-004: Fix smoke test to run without absolute path argument~~ (DONE)
**File:** `_t_smoke.mjs`
**Issue:** Requires manual absolute path. Should auto-detect `dist/` relative to script location.
**Fix:** Use `import.meta.dirname` (Node 22+) or `fileURLToPath(import.meta.url)`.
**Effort:** 15 min

---

## P1 — Core Agentic Capability

### P1-001: `AgentRegistry` — dynamic agent catalog
**File:** `src/agents/registry.ts` (new)
**Purpose:** In-process `register(def) / get(id) / list()` catalog. Enables dynamic agent instantiation by task type rather than hardcoded subclasses.
**Blocked by:** P0-002
**Effort:** 2 hrs

### P1-002: Structured `Observation` type
**Issue:** Tool results are raw strings. No metadata (tool name, timing, success/failure, risk level, token count).
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
**Impact:** Enables proper self-verification, audit trails, and cost attribution.
**Effort:** 3 hrs (type + agent.ts changes)

### P1-003: Checkpointing — session persistence across restarts
**Issue:** Process restart loses all in-flight state. Long-running tasks cannot survive crashes.
**Design:** Serialize `GoalLoop` state (current step, completed steps, observations, plan) to SQLite. Resume on restart.
**Files:** `src/core/checkpoint.ts` (new), changes to `loop.ts`
**Effort:** 6–8 hrs

### P1-004: MockBackend for unit tests + test suite
**Issue:** No tests for the agent execution loop, tool dispatch, or intelligence subsystems.
**Files:** `test/unit/agent.test.ts`, `test/unit/memory.test.ts`, `test/mocks/backend.ts`
**Effort:** 4–6 hrs

### P1-005: `Codebase Investigator` specialized agent
**Purpose:** Read-only tool scope (`file_read`, `file_search`, `file_list`, `axodex_query`, `axodex_context`), outputs structured report.
**Blocked by:** P0-002 (tool scoping)
**Effort:** 2 hrs after P0-002

### P1-006: `SwarmCritic` verifier gate for code tasks
**Issue:** `SwarmCritic` does general result scoring, but has no deterministic checks (compile, lint, test) for code-editing sub-tasks.
**Design:** Extend `SwarmCritic` with a verifier-gate stage that runs `tsc --noEmit`, `eslint`, `npm test` and treats failures as hard rejections.
**Effort:** 4–6 hrs

### P1-007: Fix `_is_done()` — replace text-string termination with structured signal
**File:** `src/core/agent.ts`
**Issue:** Agent termination detected by matching strings like "task complete", "all done", etc. — fragile and gameable.
**Fix:** Treat the `done()` tool call as the canonical termination signal. Text-pattern matching as fallback only.
**Effort:** 1–2 hrs

---

## P2 — Major Capability Improvements

### P2-001: DAG-based GoalLoop step scheduling
**Issue:** `GoalLoop._plan()` generates steps but executes them linearly. Independent steps could run in parallel.
**Design:** Parse step dependencies from plan; build a DAG; execute parallel levels concurrently using `Promise.all`.
**Effort:** 6–8 hrs

### P2-002: Per-task token cost attribution
**Issue:** Token usage is not tracked per tool call or per task.
**Design:** Add `tokens_in / tokens_out` to `Observation`; accumulate in `TrajectoryStore`; expose via `war_room` tool.
**Effort:** 3–4 hrs

### P2-003: Intelligent context selection (beyond ContextCompressor)
**Issue:** `ContextCompressor` compresses by turn count. Should compress by semantic importance and relevance to current step.
**Design:** Score each message by relevance to current tool call; drop lowest-relevance messages first.
**Effort:** 4–6 hrs

### P2-004: Sandboxed execution environment
**Issue:** Agent can execute arbitrary shell commands without isolation.
**Design:** Windows: PowerShell constrained runspace or WSL2 jail. Add resource limits (CPU time, max output size).
**Effort:** 8–12 hrs

### P2-005: Integration tests for agent + llamacpp backend
**Purpose:** End-to-end: construct Agent, give it a simple task, verify done() called with sensible result.
**Effort:** 3–4 hrs

### P2-006: `CLI Help Agent` — answers "how does Axoniz work"
**Purpose:** Read-only agent grounded in `docs/ARCHITECTURE.md`, `docs/TODO.md`, `HANDOFF.md`.
**Blocked by:** P0-002
**Effort:** 1–2 hrs after P0-002

### P2-007: Per-tool timeout + cancellation
**Issue:** No timeout on individual tool calls. A hanging shell command blocks the entire loop indefinitely.
**Design:** Wrap every tool call in `Promise.race([toolCall, timeout(30_000)])`. Add `AbortController` plumbing.
**Effort:** 3–4 hrs

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
**Purpose:** Planning → reasoning model; Code search → fast model; Vision → multimodal. Dynamic routing based on task metadata.
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
**Effort:** 8–12 hrs

### P4-004: Remove `_pyref/` from repo
**Purpose:** `_pyref/` is a snapshot of the Python source used as reference. Once port is verified stable, archive it.
**Effort:** 30 min

---

## Execution Order (Recommended)

```
Week 1 — Foundation
  P0-001 (specialized.ts bug fix)        — 30 min
  P0-003 (SkillDistiller review gate)    — 3 hrs
  P0-004 (smoke test path fix)           — 15 min
  P0-002 (AgentDefinition + scoping)     — 6 hrs
  P1-007 (fix _is_done() termination)    — 1 hr
  P1-004 (MockBackend + unit tests)      — 6 hrs

Week 2 — Core Agentic
  P1-001 (AgentRegistry)                 — 2 hrs
  P1-002 (Observation type)              — 3 hrs
  P1-003 (Checkpointing)                 — 8 hrs
  P2-007 (per-tool timeout)              — 4 hrs
  P1-005 (Codebase Investigator agent)   — 2 hrs
  P1-006 (SwarmCritic verifier gate)     — 6 hrs

Week 3 — Quality & Safety
  P1-004 extended: integration tests     — 6 hrs
  P2-001 (DAG GoalLoop)                  — 8 hrs
  P2-004 (sandbox)                       — 12 hrs
  P2-003 (semantic context selection)    — 6 hrs

Week 4+ — SOTA
  P3-001 (Memory Graph)
  P3-002 (Evaluation harness)
  P3-003 (Adversarial tests)
  P3-004 (Model routing)
```

