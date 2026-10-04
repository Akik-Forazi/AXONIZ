# AXONIZ-ZERO — Testing Status
> Current version: V00.01.000-beta-01 (npm: `0.1.0-beta.1`)
> Doc revision: v0.3.6 — FRAZIYM version test, VerifyGate test infrastructure, PEAK module coverage plan

---

## Build Health

| Check | Command | Result |
|-------|---------|--------|
| TypeScript typecheck | `npm run typecheck` | ✅ **ZERO ERRORS** |
| TypeScript build | `npm run build` | ✅ **CLEAN** (157 assets copied) |
| Node built-in test runner | `node --test --experimental-strip-types "src/tests/**/*.test.ts"` | ✅ **PASS** (`tests/version.test.ts`) |
| Python (existing reference) | `pytest` | Working in Python reference |

---

## Test Runner

AXONIZ uses Node.js's built-in test runner (no Jest, no Vitest config required for harness tests). The `package.json` script:

```json
{
  "scripts": {
    "test": "node --test --experimental-strip-types \"src/tests/**/*.test.ts\""
  }
}
```

Run the full suite:

```bash
npm test
```

Run a single test file:

```bash
node --test --experimental-strip-types src/tests/version.test.ts
```

The `--experimental-strip-types` flag enables TypeScript import without a compile step (Node 22+).

---

## Existing Tests

### `src/tests/version.test.ts` — FRAZIYM Version Sync (NEW v0.3.5)

Verifies that the FRAZIYM version is consistent across all 5 source-of-truth points:

| # | Point | Check |
|---|-------|-------|
| 1 | `src/version.ts` | `AXONIZ_VERSION` parses via `parseFraziymVersion()` and round-trips through `fraziymToSemver()` |
| 2 | `package.json` | `version` field equals `AXONIZ_VERSION_SEMVER` from `src/version.ts` |
| 3 | `src/core/runner.ts` | CLI banner output contains the FRAZIYM literal `AXONIZ_VERSION` |
| 4 | `README.md` | Contains the FRAZIYM literal `AXONIZ_VERSION` |
| 5 | self | The test file itself uses the canonical exports from `src/version.ts` |

Failure of any point means a sync drift — fix the offending file, do not update the test to match a broken value.

**How to run:**
```bash
node --test --experimental-strip-types src/tests/version.test.ts
```

### `_t_smoke.mjs` — UnifiedMemory / MemPalace / KG

The most comprehensive existing smoke test. Tests the memory subsystem end-to-end.

**How to run:**
```bash
npm run build
node _t_smoke.mjs "$(pwd)/dist"
```

**Results (current run):**

| Test | Result |
|------|--------|
| `palace.is_available()` | ✅ PASS |
| `palace.store id shape` | ✅ PASS |
| `palace.store already_exists` | ✅ PASS |
| `palace.status total_drawers` | ✅ PASS |
| `palace.status wings` | ✅ PASS |
| `palace.list_wings` | ✅ PASS |
| `palace.list_rooms` | ✅ PASS |
| `palace.get_context()` | ✅ PASS |
| `palace.search shape` | ✅ PASS |
| `palace.search wing filter` | ✅ PASS |
| `palace.search options object` | ✅ PASS |
| `palace.check_duplicate` | ✅ PASS |
| `palace.traverse_graph` | ✅ PASS |
| `palace.find_tunnels` | ✅ PASS |
| `palace.graph_stats` | ✅ PASS |
| `palace._db.get().ids` | ✅ PASS |
| `kg.add returns id` | ✅ PASS |
| Knowledge graph queries | ✅ PASS |
| `CoderAgent` instantiation | ❌ **FAIL** — `TypeError: Cannot read properties of undefined (reading '0')` |

**Root cause of CoderAgent failure:**
`applyExtraPrompt()` in `src/agents/specialized.ts` reads `agent.messages[0]` immediately after `super()`, but the `Agent` base class populates `messages` lazily (first populated on `run()`). Fix: guard with existence check and defer or use `push`.

---

### `_probe.mjs` / `_probe2.mjs` — Backend Connectivity Probes
Quick probes to test LLM backend availability.

### `_t.mjs` / `_t2.mjs` — Minimal Unit Tests
Basic import and construction tests.

### `_t_sqlite_check.mjs` — SQLite Availability
Verifies SQLite is accessible for trajectory/palace storage.

### `smoke.mjs` — Integration Smoke
Broader integration test.

---

## Test Infrastructure: VerifyGate (NEW v0.3.6)

The new `VerifyGate` class (`src/core/intelligence/verify_gate.ts`) is itself **test infrastructure** — it runs the same checks a human reviewer would run after code changes:

| Check | Command | Skip Condition |
|-------|---------|----------------|
| TypeScript compile | `tsc --noEmit` | No `tsconfig.json` in project root |
| JS/TS lint | `eslint` | No `.eslintrc*` config |
| JS/TS tests | `vitest run` | No `vitest.config.*` |
| Python tests | `pytest` | No `pytest.ini` / `pyproject.toml` pytest section |
| Python type check | `mypy` | No `.mypy.ini` / `mypy.ini` |
| Python lint | `flake8` | No `.flake8` config |

Properties:
- Each check runs **independently** — a `tsc` failure does not stop `eslint` or `vitest` from running
- Inapplicable checks are **skipped**, not failed
- Returns `VerifyResult` with per-check `pass` / `fail` / `error` counts
- Will be wired into `loop._verify()` in v0.4.x, replacing the LLM-only "did this succeed?" verifier (DEC-018)

Usage example (once wired):
```typescript
const gate = new VerifyGate();
const result: VerifyResult = await gate.run({ changedFiles: ["src/core/agent.ts"] });
// result.checks = [{ name: "tsc", status: "pass" }, { name: "eslint", status: "fail", ... }, ...]
// result.passed, result.failed, result.errored
```

---

## Known Failures

### FAIL-001: `specialized.ts` — `applyExtraPrompt` crash
**Severity:** MEDIUM
**File:** `src/agents/specialized.ts:61`
**Error:** `TypeError: Cannot read properties of undefined (reading '0')`
**Cause:** `agent.messages[0]` is undefined at construction time
**Fix:**
```typescript
function applyExtraPrompt(agent: SpecializedAgentLike, extra: string): void {
  if (agent.messages && agent.messages.length > 0) {
    agent.messages[0]!.content += extra;
  } else {
    // Defer — agent will pick this up on first run()
    const existing = (agent as any)._pendingSystemAppend ?? "";
    (agent as any)._pendingSystemAppend = existing + extra;
  }
}
```

### FAIL-002: `_t_smoke.mjs` path argument (RESOLVED)
**Severity:** LOW (was a user error / platform issue)
**Status:** ✅ RESOLVED — absolute path is now auto-resolved from `import.meta.dirname`. Pass `$(pwd)/dist` for portability.

---

## PEAK Advancement Modules — Coverage Plan (NEW v0.3.6)

The five PEAK advancement modules landed in v0.3.6 ship **without** their own test coverage. This is the highest-priority testing gap and the next-up task list:

### `src/core/tool_registry.ts` — Tool Registry
| Test | Purpose | Priority |
|------|---------|----------|
| `scopedToolMap_returns_only_allowlisted_tools` | Filter correctness | P0 |
| `scopedToolMap_unknown_role_falls_back_to_general` | Robustness | P0 |
| `scopedToolMap_empty_full_map_returns_empty` | Edge case | P1 |
| `ROLE_DEFINITIONS_has_eight_roles` | Shape guard | P1 |
| `ROLE_DEFINITIONS_each_role_has_nonempty_allowlist` | Shape guard | P1 |

### `src/core/intelligence/cost_tracker.ts` — Cost Tracker
| Test | Purpose | Priority |
|------|---------|----------|
| `recordToolCall_accumulates_tokens` | Per-tool accounting | P0 |
| `recordLLMCall_accumulates_tokens` | Per-LLM accounting | P0 |
| `getTaskTotal_sums_across_calls` | Aggregator | P0 |
| `getTaskTotal_unknown_task_returns_zero` | Edge case | P1 |
| `record_emits_sse_cost_event` | SSE broadcast | P1 |
| `record_sse_event_carries_task_id_and_cost` | SSE payload | P1 |

### `src/core/intelligence/verify_gate.ts` — Verify Gate
| Test | Purpose | Priority |
|------|---------|----------|
| `run_tsc_pass_when_no_type_errors` | Happy path | P0 |
| `run_tsc_fails_with_error_count` | Failure path | P0 |
| `run_skips_checks_without_config_files` | Skip conditions | P0 |
| `run_each_check_independent` | One failure doesn't block others | P0 |
| `run_returns_per_check_results` | Result shape | P1 |
| `run_aggregates_pass_fail_error_counts` | Aggregator | P1 |

### `src/core/intelligence/dag_planner.ts` — DAG Planner
| Test | Purpose | Priority |
|------|---------|----------|
| `plan_returns_DAGStep_array_with_dependsOn` | Shape | P0 |
| `topologicalSort_returns_parallel_waves` | Kahn's algorithm | P0 |
| `topologicalSort_empty_input_returns_empty` | Edge case | P1 |
| `topologicalSort_cycle_throws` | Cycle detection | P0 |
| `topologicalSort_linear_chain_returns_single_element_waves` | Linear case | P1 |
| `plan_includes_estimatedDurationMs` | Shape | P2 |

### `src/core/intelligence/context_compressor.ts` — Semantic Compression
| Test | Purpose | Priority |
|------|---------|----------|
| `scoreImportance_user_message_95` | Baseline | P0 |
| `scoreImportance_assistant_with_tools_90` | Baseline | P0 |
| `scoreImportance_error_message_85` | Baseline | P0 |
| `scoreImportance_done_call_88` | Baseline | P0 |
| `scoreImportance_success_60` | Baseline | P0 |
| `scoreImportance_plain_text_40` | Baseline | P0 |
| `scoreImportance_decays_with_age` | Age decay | P1 |
| `semanticKeepMask_returns_boolean_array_matching_length` | Shape | P0 |
| `compressSemantic_keeps_high_importance_verbatim` | Behavior | P0 |
| `compressSemantic_keeps_last_N_turns` | Recency | P1 |
| `compressSemantic_falls_back_to_contiguous_on_llm_failure` | Fallback | P1 |

### Shared: MockBackend
A `MockBackend` is still needed as foundational test infrastructure for any agent-level test (see TODO). It must extend the abstract `Backend` class and return canned `CompletionResult` responses.

---

## What's Not Yet Tested

| System | Test Coverage | Priority | Notes |
|--------|--------------|----------|-------|
| FRAZIYM version sync | ✅ v0.3.5 | — | `tests/version.test.ts` |
| Agent execution loop | ❌ None | P0 | Blocked on MockBackend |
| Tool execution (`_exec`) | ❌ None | P0 | Blocked on MockBackend |
| SwarmOrchestrator | ❌ None | P1 | |
| Backend backends (llamacpp, openai, ollama) | ❌ None | P0 | |
| GoalLoop (`loop.ts`) | ❌ None | P1 | |
| SkillDistiller | ❌ None | P1 | |
| Authority engine | ❌ None | P1 | |
| ConfidenceScorer | ❌ None | P1 | |
| TrajectoryStore | ❌ None | P1 | |
| Voice pipeline | ❌ None | P2 | |
| Web server routes | ❌ None | P2 | |
| Telegram bot | ❌ None | P3 | |
| **ToolRegistry** (v0.3.6) | ❌ None | **P0** | See coverage plan above |
| **CostTracker** (v0.3.6) | ❌ None | **P0** | See coverage plan above |
| **VerifyGate** (v0.3.6) | ❌ None | **P0** | See coverage plan above (also serves as test infrastructure) |
| **DAGPlanner** (v0.3.6) | ❌ None | **P0** | See coverage plan above |
| **ContextCompressor semantic** (v0.3.6) | ❌ None | **P0** | See coverage plan above |
| `web-next-spawn.ts` (v0.3.3) | ❌ None | P2 | Spawn + proxy + fallback |

---

## Recommended Test Plan (v0.4.x)

### Unit Tests (`src/tests/unit/`)
- Tool execution: each tool returns expected shape
- ConfidenceScorer: risk levels for known-dangerous tools
- TrajectoryStore: SQLite read/write/query
- MemPalace: all smoke tests migrated to proper test runner
- KnowledgeGraph: add/query/invalidate
- **ToolRegistry**: 8 roles, scopedToolMap filter correctness
- **CostTracker**: per-tool/per-LLM aggregation, SSE emission
- **VerifyGate**: each check (tsc/eslint/vitest/pytest/mypy/flake8) success/fail/skip
- **DAGPlanner**: topological sort, cycle detection, wave shape
- **ContextCompressor**: scoreImportance baselines, semanticKeepMask, compressSemantic fallback

### Integration Tests (`src/tests/integration/`)
- Agent + mock backend: full `run()` with `done()` call
- Agent + real llamacpp: end-to-end single task
- SwarmOrchestrator: decompose → workers → critic → merge
- GoalLoop: understand → plan → execute → verify (with VerifyGate wired in)
- **CostTracker + SSE broker**: live cost event flow to dashboard
- **DAGPlanner + GoalLoop**: wave-based `Promise.all` execution per topological level

### End-to-End Tests (`src/tests/e2e/`)
- CLI: `node dist/cli/entry.js --lc` interactive session
- Web server: HTTP routes returning expected JSON
- Next.js dashboard spawn: `axoniz --web` brings up :3000 + :7860 proxy
- Full task: "read this file and summarize it"

### Failure Injection Tests
- Tool timeout handling (once per-tool timeout is wired — Phase 2)
- Model failure → graceful degradation
- Context overflow → compression trigger (semantic path + fallback path)
- Authority block on dangerous tool
- VerifyGate check failure → GoalLoop repair path

---

## Test Infrastructure Needed

```typescript
// MockBackend for unit tests (still needed):
class MockBackend extends Backend {
  constructor(private responses: CompletionResult[]) { super(); }
  async complete(): Promise<CompletionResult> { return this.responses.shift()!; }
  async *streamText(): AsyncGenerator<string> { yield "mock"; }
  async healthCheck() { return { status: "ok" }; }
  get name() { return "mock"; }
}
```

The MockBackend is still the gating dependency for all agent-level tests (P0 in TODO). Once landed, the per-module coverage plans above can be executed.
