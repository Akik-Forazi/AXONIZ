# AXONIZ-ZERO — Architectural Decisions Log
> Decisions DEC-001 through DEC-021
> Current version: V00.01.000-beta-01 (npm: `0.1.0-beta.1`)

---

## DEC-001: TypeScript/Node.js port strategy
**Date:** October 2026
**Decision:** Full port of Python implementation to TypeScript/Node.js, mirroring module structure.
**Rationale:**
- TypeScript provides type safety, better IDE support, and easier distribution as a CLI tool
- Node.js event loop is better suited to I/O-bound agentic workloads than Python's GIL-constrained threading
- Async/await throughout eliminates Python's threading complexity (threads were used only to avoid blocking)
- `node-llama-cpp` provides feature-parity with `llama-cpp-python` on Windows
**Alternative considered:** Keep Python, add TS frontend only. Rejected: two runtimes = double maintenance.

---

## DEC-002: Python implementation is behavioral reference, not architectural authority
**Date:** October 2026
**Decision:** Port Python behavior but improve architecture where Python had debt.
**Examples of deliberate improvements in TS:**
- `tool_schemas.ts` extracted from `agent.py` (was inline, 120+ lines mixed in agent class)
- Backend abstraction formalized as `abstract class Backend` (was duck-typed in Python)
- Response types formalized: `TextResponse | ToolCallResponse` (was ambiguous union in Python)
- All tool calls made async (Python used sync with thread hacks)

---

## DEC-003: No remote/A2A agent protocol
**Date:** July 2026 (Python decision, carried forward)
**Decision:** Do not port or implement the gemini-cli remote/A2A agent protocol.
**Rationale:** No current use case. Adds complexity without benefit. Revisit if distributed Axoniz becomes a requirement (P3-005).

---

## DEC-004: Do not replace SwarmOrchestrator
**Date:** July 2026 (Python decision, carried forward)
**Decision:** The existing SwarmOrchestrator is already more advanced than comparable systems. Improve it; do not replace it.
**Key advantages to preserve:**
- RAM-aware sequential model hot-swapping (unique to Axoniz on CPU hardware)
- Dependency-graph parallel scheduling within swarms
- SwarmCritic result validation before acceptance

---

## DEC-005: No C++ rewrite of orchestration layer
**Date:** July 2026
**Decision:** Do not rewrite Axoniz orchestration in C++.
**Rationale:** Profiled: LLM inference time dominates wall-clock cost by 100–1000x on i5-8350U. Orchestration layer is not the bottleneck.

---

## DEC-006: Extend SwarmCritic, not build a parallel verifier
**Date:** July 2026
**Decision:** The planned Local Code Assist verifier should extend `SwarmCritic`, not create a competing system.
**Design direction:** Add a verifier-gate stage to `SwarmCritic` that runs deterministic checks (tsc, eslint, pytest) for code-editing sub-tasks.

---

## DEC-007: `node-llama-cpp` over Ollama as default backend
**Date:** October 2026
**Decision:** Use `node-llama-cpp` (native GGUF inference) as the primary backend, not Ollama.
**Rationale:**
- Zero overhead: no separate Ollama process required
- Direct control over KV cache, context management, model loading/unloading
- Enables RAM-aware model swapping that `SwarmOrchestrator` depends on
- Ollama, LM Studio, OpenAI-compatible backends remain available as alternatives
**Tradeoff:** `node-llama-cpp` binary must be pre-downloaded/installed. Mitigated by local tarball in `_dl/`.

---

## DEC-008: pnpm as package manager
**Date:** October 2026
**Decision:** Use `pnpm` (evidenced by `pnpm-lock.yaml`, `pnpm-workspace.yaml`).
**Rationale:** Better monorepo support, faster installs, disk deduplication. `node-llama-cpp` local tarballs handled correctly by pnpm.

---

## DEC-009: TypeScript strict mode
**Date:** October 2026
**Decision:** `"strict": true` in `tsconfig.json` with `noImplicitOverride` and `noFallthroughCasesInSwitch`.
**Result:** Zero type errors on first full audit. The previous agent built with discipline.

---

## DEC-010: Tool scoping is P0, not a design option
**Date:** October 2026
**Decision:** Implement `AgentDefinition` + tool scoping as the immediate next action after bug fixes.
**Rationale:** The current state where `ResearchAgent` can call `git_commit`, `mouse_click`, `file_delete`, `goal_create` is both a security issue and a behavioral one. The Python `todo.md` already identified this as "highest-impact single change."
**Status:** ✅ Delivered as DEC-016 / `ToolRegistry` (v0.3.6). Wiring into `agent.run()` pending.

---

## DEC-011: SkillDistiller review gate is non-negotiable
**Date:** October 2026
**Decision:** The SkillDistiller must not auto-apply distilled skills without human review.
**Rationale:** Auto-applying AI-generated patterns to the agent's own behavior without review is a self-modification risk. The Python code's own comment acknowledges this: "for now, we forge it to demonstrate the loop." Time to fix it properly.
**Status:** 🔴 OPEN — still unaddressed as of v0.3.6.

---

## DEC-012: Structured Observation type (not raw strings)
**Date:** October 2026
**Decision:** Tool results should be `Observation` objects, not raw strings.
**Rationale:** Raw strings make it impossible to:
- Attribute token cost to specific tools
- Track success/failure rates per tool
- Build meaningful audit logs
- Implement proper self-verification
**Migration:** Observation wraps the string result; backward compatibility maintained.
**Status:** 🟡 PARTIAL — type exists; full migration of all tool callsites still pending.

---

## DEC-013: `done()` tool is the canonical termination signal
**Date:** October 2026
**Decision:** Agent termination should be driven by the `done()` tool call, not text-pattern matching.
**Rationale:** The current `_is_done()` function matches strings like "task complete", "all done", "finished." — these can appear in tool results (e.g., reading a file that contains the word "finished") causing false terminations. The structured `done(result)` call is unambiguous.
**Migration:** Keep `_is_done()` as emergency fallback only; log a warning when it triggers.
**Status:** ✅ DELIVERED — `done()` is canonical; `_is_done()` retained as fallback only.

---

## DEC-014: Extract axodex into standalone `@fraziym/axodex` npm package
**Date:** v0.3.4
**Decision:** Remove axodex from the AXONIZ repository and publish it as a standalone npm package `@fraziym/axodex` at https://github.com/Akik-Forazi/axodex.
**Rationale:**
- Bundling axodex inside AXONIZ caused 5,800+ files of overhead in every clone/install
- The previous installer (`axoniz install axodex`) cloned the entire AXONIZ GitHub repo (~30 MiB download) just to obtain axodex
- npm packaging: `axoniz install axodex` now runs `npm install -g @fraziym/axodex` (fast, deduplicated, versioned)
**Implementation:**
- AXONIZ `package.json` declares `@fraziym/axodex` as `peerDependency: ^0.1.0-beta.1`
- `src/tools/axodex_tools.ts` simplified: looks for `axodex` binary on `PATH`, falls back to `npx @fraziym/axodex`
- Install: `npm install -g @fraziym/axoniz @fraziym/axodex`
**Tradeoff:** Two packages to install instead of one. Outweighed by the 30 MiB → ~few hundred KB install size reduction and clean version independence.

---

## DEC-015: FRAZIYM versioning replaces semver as canonical version format
**Date:** v0.3.5
**Decision:** AXONIZ uses the FRAZIYM versioning scheme `VPP.FF.BBB-STAGE-RR` as the canonical version format. Semver is derived for npm `package.json` compatibility only.
**Format:**
- `V` prefix marks FRAZIYM literal (distinguishes from semver at a glance)
- `PP` — vision phase (e.g., `00` for foundation vision)
- `FF` — feature family (e.g., `01` for the axoniz family)
- `BBB` — build (e.g., `000`, `001`, `002`)
- `STAGE` — release stage: `alpha` | `beta` | `rc` | `stable`
- `RR` — revision within the stage (e.g., `01`, `02`)
**Semver translation:** `V00.01.000-beta-01` → `0.1.0-beta.1`
- `V00` → `0` (major)
- `01` → `1` (minor)
- `000` → `0` (patch)
- `-beta` → `-beta` (prerelease identifier)
- `-01` → `.1` (prerelease version)
**Single source of truth:** `src/version.ts`
- `AXONIZ_VERSION` — FRAZIYM literal
- `AXONIZ_VERSION_SEMVER` — npm-compatible
- `parseFraziymVersion(str)` — parse to structured fields
- `fraziymToSemver(fraziym)` — convert to semver string
**5 sync points** (verified by `tests/version.test.ts`):
1. `src/version.ts` (canonical)
2. `package.json` (`version` field, semver form)
3. `src/core/runner.ts` (CLI banner)
4. `README.md` (visible version string)
5. `tests/version.test.ts` (verification harness)
**Rationale:** Semver's `major.minor.patch` semantics are poorly suited to an autonomous agent still in heavy architectural flux. FRAZIYM expresses both vision phase and feature family explicitly, while still maintaining npm compatibility through translation.
**Application to axodex:** The same scheme applies to axodex (its own `src/version.ts`). Both packages are kept in lockstep at `^0.1.0-beta.1` via the peerDependency declaration in AXONIZ.

---

## DEC-016: Tool Registry with per-role tool scoping (8 roles)
**Date:** v0.3.6
**Decision:** Implement a `ToolRegistry` class with `AgentDefinition` interface and 8 pre-defined agent roles, each carrying its own tool allowlist. `ToolRegistry.scopedToolMap(role, fullToolMap)` returns a filtered tool map for the given role.
**Roles defined:**
1. `planner` — read-only + axodex context tools
2. `researcher` — read-only + axodex query/context + web search
3. `coder` — file write/edit + code tools + axodex smart_read/impact
4. `debugger` — file read + shell run + code analyze + trajectory
5. `reviewer` — file read + code lint/format + axodex analyze
6. `tester` — file read + shell run + code lint
7. `verifier` — file read + shell run (limited)
8. `general` — full tool set (legacy behavior, used when role is unspecified)
**Rationale:** Solves the P0 "tool scoping absent" gap (DEC-010). The anti-pattern where every specialized agent gets the full ~80-tool arsenal — including `git_commit`, `mouse_click`, `file_delete`, `goal_create` — is shared by every major CLI agent (Claude Code, Cursor, Cline, Aider, Devin). A `ResearchAgent` should never have file-delete or computer-control tools.
**Implementation:** `src/core/tool_registry.ts`
**Status:** ✅ Module delivered. Wiring into `agent.run()` is the next milestone (v0.4.x).

---

## DEC-017: Per-task cost attribution via CostTracker
**Date:** v0.3.6
**Decision:** Implement a `CostTracker` class that records `tokensIn` / `tokensOut` / `costUsd` per tool call AND per LLM call, aggregated per task. Emits `cost` SSE events via `broker.broadcast("cost", event)` for live dashboard updates.
**Interface:**
```typescript
class CostTracker {
  recordToolCall(rec: CostRecord): void;
  recordLLMCall(rec: CostRecord): void;
  getTaskTotal(taskId: string): { tokensIn, tokensOut, costUsd };
}
```
**Rationale:** Solves the "no per-task cost tracking" architectural weakness (item #10 in the Phase 0 findings). Aider and Claude Code both suffered public bill-shock incidents from per-task token usage being opaque. Per-tool attribution enables:
- Comparing tool efficiency (calls per task, tokens per tool)
- Catching runaway loops early (a single tool call spiking tokens)
- Live dashboard cost feed via SSE for human-in-the-loop intervention
**Implementation:** `src/core/intelligence/cost_tracker.ts`
**Status:** ✅ Module delivered. Wiring into `agent._exec()` is pending (v0.4.x).

---

## DEC-018: Real Verify Gate replaces LLM-only verification
**Date:** v0.3.6
**Decision:** Replace the LLM-only `_verify()` in `loop.ts` (which asked "did this succeed?" and accepted the LLM's yes/no at face value) with a `VerifyGate` class that runs real build, lint, and test checks and parses their results.
**Checks performed by `VerifyGate.run(changes)`:**
- `tsc --noEmit` — TypeScript compile
- `eslint` — TypeScript/JavaScript lint
- `vitest run` — JavaScript/TypeScript tests
- `pytest` — Python tests
- `mypy` — Python type check
- `flake8` — Python lint
**Key properties:**
- Each check is **independent** — a `tsc` failure does not stop `eslint` or `vitest` from running
- Checks that aren't applicable (e.g., no `tsconfig.json`) are **skipped**, not failed
- Returns `VerifyResult` with per-check `pass` / `fail` / `error` counts
**Rationale:** The LLM-only "did this succeed?" verification has been a recurring embarrassment in the agentic tooling market — Cursor's DB deletion, Replit's cover-up incident, Devin's premature success claims. A structured `done()` call (DEC-013) is unambiguous about intent, but verification needs evidence, not intent. `VerifyGate` provides that evidence by running the same checks a human reviewer would run.
**Implementation:** `src/core/intelligence/verify_gate.ts`
**Status:** ✅ Module delivered. Wiring into `loop._verify()` is pending (v0.4.x).

---

## DEC-019: DAG-based GoalLoop with topological waves
**Date:** v0.3.6
**Decision:** Replace the linear `PlanTask[]` produced by `loop._plan()` with a `DAGPlanner` class that produces `DAGStep[]` carrying `dependsOn: string[]` dependency edges, and a `topologicalSort()` method that returns "waves" of parallel-executable steps using Kahn's algorithm.
**Interface:**
```typescript
interface DAGStep {
  id: string;
  role: AgentRole;
  instruction: string;
  dependsOn: string[];
  difficulty: 1 | 2 | 3 | 4 | 5;
  produces?: string[];   // artifact names
  consumes?: string[];
  verify?: VerifyCondition;
}

interface PlanResult {
  steps: DAGStep[];
  waves: DAGStep[][];     // topologically sorted, parallel-executable
  estimatedDurationMs: number;
}
```
**Rationale:** Linear execution of a 10-step plan wastes wall-clock time when 4 of those steps are independent. Dependency-graph planning is table stakes for any serious agent runtime, and the existing `SwarmOrchestrator` already had a dependency-graph parallel scheduler internally — this decision brings the same property to the top-level GoalLoop. Kahn's algorithm is the textbook topological sort, chosen for its O(V+E) complexity and its natural production of "wave" batches suitable for `Promise.all` execution.
**Implementation:** `src/core/intelligence/dag_planner.ts`
**Status:** ✅ Module delivered. Wiring into `loop._plan()` is pending (v0.4.x).

---

## DEC-020: Semantic context compression (importance-scored, not turn-count-based)
**Date:** v0.3.6
**Decision:** Enhance `ContextCompressor` with `scoreImportance(msg, indexFromEnd)`, `semanticKeepMask()`, and `compressSemantic()`. Message retention is now driven by importance scoring, not naive turn-count.
**Importance baseline scoring (0–100):**
- user message → **95** (highest — user asks are the ground truth of intent)
- assistant message with tool calls → **90** (actions taken)
- error messages → **85** (failures must be remembered for self-debugging)
- `done()` calls → **88** (terminal signals)
- success messages → **60** (compression-fodder — once it's done, the result matters, not the path)
- plain text → **40**, with **age decay** (older plain text scores lower)
**Compression strategy:**
1. Build `semanticKeepMask(messages): boolean[]` — which messages to keep verbatim
2. Keep high-importance messages verbatim + the last N turns (recency)
3. Summarize only low-importance old successful results
4. Fall back to original contiguous-region compression method if the LLM summary call fails
**Rationale:** Naive turn-count compression (drop oldest 50% of messages above threshold) is the source of "context window rot" — the user's original ask gets dropped while verbose successful tool outputs get retained. Importance-scored retention keeps the things that matter (user asks, tool calls, errors) and compresses the things that don't (old successful paths).
**Implementation:** `src/core/intelligence/context_compressor.ts` (enhanced)
**Status:** ✅ Module delivered. Method `compressSemantic()` is ready to be called by the existing threshold hook in the agent loop.

---

## DEC-021: Next.js dashboard spawned as child process by Express backend
**Date:** v0.3.3
**Decision:** `axoniz --web` spawns a Next.js dev server as a child process in `web-next/` on `:3000`. The Express backend on `:7860` proxies all non-API GET requests to `:3000`. Falls back to the legacy static UI in `src/web/static/` if the dev server is unavailable.
**Implementation:** `src/web/web-next-spawn.ts`
**Architecture:**
```
[ Browser ]
     │
     ▼
[ Express :7860 ]
     │
     ├─ API routes (chat, swarm, goals, memory, models) → handled directly
     │
     └─ Non-API GET → proxy to :3000
                              │
                              ▼
                    [ Next.js dev server :3000 ]
                              │
                              ▼
                    [ web-next/ SPA with HMR ]
```
**Rationale:**
- The legacy static UI was opaque — a single HTML file with no React, no HMR, no real state management
- A full Next.js SPA gives the dashboard: live SSE consumption, per-task cost visualization, DAG wave timeline, real-time trajectory inspection
- Spawning as a child process keeps the API surface stable (Express on :7860) while giving the dashboard a modern dev experience
- The proxy pattern means the browser only ever talks to one port (`:7860`); no CORS issues
- Fallback to legacy UI ensures the dashboard still works in production without a Node dev server running
**Tradeoff:** Requires `web-next/` to be installed (`pnpm install` inside it) for the full experience. Mitigated by graceful fallback to legacy static UI.
**Status:** ✅ Delivered. Live SSE consumption by the dashboard UI (for the new `cost` events emitted by `CostTracker`) is pending UI work.
