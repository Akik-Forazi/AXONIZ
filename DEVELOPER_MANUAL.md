# AXONIZ SYSTEM: THE AUTONOMOUS DEVELOPER MANUAL
*(Generated via Axodex Semantic Knowledge Graph · reflects v0.3.6 / `V00.01.000-beta-01`)*

> **Scope of this manual.** AXONIZ is the TypeScript-ported autonomous agent framework (`src/` tree, npm package `@fraziym/axoniz`). Axodex is now a separate npm package (`@fraziym/axodex`, source at https://github.com/Akik-Forazi/axodex) — see `AGENTS.md` for the axodex interface. The Next.js dashboard lives in `web-next/` as an independent Node project. This document covers the AXONIZ agent core only.

---

## 1. System Philosophy: "The Shadow Monarch's Eye"
Axoniz is not just a chatbot — it is a **multi-phase autonomous agent framework** designed to operate with 70B-parameter precision using efficient 3B-7B local models. It achieves this through:
- **Graph Intelligence** — Deep codebase understanding via the standalone Axodex engine (`@fraziym/axodex`, on PATH after global install).
- **Trajectory Store** — Self-correction and loop detection in tool execution (`src/core/intelligence/trajectory.ts`).
- **Swarm Orchestration** — Parallelizing heavy tasks across sub-agents (`src/core/intelligence/swarm.ts`).
- **PEAK Advancements (v0.3.6)** — Tool Registry, Cost Tracker, Verify Gate, DAG Planner, and Semantic Context Compression. See §9 below.

**Single source of truth for versioning.** AXONIZ uses the FRAZIYM versioning format `VPP.FF.BBB-STAGE-RR` (current: `V00.01.000-beta-01`). The canonical string lives in `src/version.ts`; `package.json` carries the semver translation `0.1.0-beta.1`; `tests/version.test.ts` fails the build if any sync point drifts. Same scheme applies to axodex.

---

## 2. Boot & Lifecycle Scenario
### **What happens when you run `axoniz`?**
1. **Entry** (`src/cli/entry.ts`):
   - Dispatches to the runner (`src/core/runner.ts`) — a hand-rolled arg parser (no commander for subcommand dispatch) preserves the Python semantics: free-form positional args that may also be subcommands (`config`, `model`, `memory`, `palace`, `setup`, `install`, `goal`, `--web`, `--lc`).
2. **Config Load (`src/core/config.ts`)**:
   - Loads global config from `~/.axoniz/config.json`.
   - **Scenario: Legacy Config** — Old flat configs trigger `migrate_legacy_config` to convert them to hierarchical structures.
   - **Scenario: No Model** — If no model path is provided, an interactive selector lists available GGUFs in `MODELS_DIR`.
3. **Agent Build (`src/core/agent.ts`)**:
   - Initializes `UnifiedMemory` (`src/integrations/unified_memory.ts` — TF-IDF + Palace).
   - Sets up **Intelligence Phases** via `src/startup.ts` (8-step ordered boot):
     1. Agent core
     2. LLM backend (LlamaCpp / LM Studio / Ollama / OpenAI-compatible)
     3. Memory warm
     4. Workflows engine
     5. Awareness service
     6. Telegram bridge (optional)
     7. Sidecar (optional)
     8. Web server (if `--web`)
4. **LLM Loading**:
   - `ensure_llm()` calls `_build_llm()` to spawn the LlamaCpp server, connect to Ollama, or hit an OpenAI-compatible endpoint.
   - **Wait Loop** — The system blocks until the backend responds at its `/health` (or equivalent) endpoint.

### **`axoniz --web` — the Next.js dashboard spawn (v0.3.3+)**
Running `axoniz --web` no longer serves the legacy scraped static UI at `src/web/static/`. Instead the Express backend (`src/web/server.ts`):

1. Listens on `:7860` (unchanged) — all `/api/*` routes live here.
2. Spawns `bun run dev` (preferred) or `npm run dev` (fallback) in `web-next/` as a child process on `:3000`. The spawn logic lives in `src/web/web-next-spawn.ts` (60s timeout for the dev server to come up; child is cleaned up on SIGINT/SIGTERM).
3. Proxies all non-API GET requests from `:7860 → :3000` so users only need to remember one URL.
4. Falls back to the legacy static UI at `src/web/static/` if `web-next/` is missing or the dev server fails to start (with a clear log line: `dashboard -> not started (falling back to legacy static UI)`).

The Next.js dashboard itself (`web-next/`) is a separate Node.js project with its own `package.json`, `bun.lock`, Prisma schema, and routes under `web-next/src/app/`. It is **not** part of the AXONIZ TypeScript port and can be developed / deployed independently. Sitemap: `/chat`, `/agent`, `/vault`, `/forge`, `/war-room`, `/palace`, `/axodex`, `/search`, `/benchmarks`, `/system`, `/settings/*`. See `docs/WEB_UI.md` and `docs/WEB_ROADMAP.md`.

---

## 3. Tool Execution & Self-Correction
### **How does `Agent._exec(name, args)` work?**
When the LLM outputs `<tool>{...}</tool>` (parsed by `src/core/stream_parser.ts`), the system enters the execution cycle:
1. **Permission Check** — `_get_authority()` (`src/core/authority.ts`) verifies if the agent has the level (1–5) required for the tool.
2. **Scope Check (v0.3.6 Tool Registry)** — If the agent has a `role` set (planner/researcher/coder/debugger/reviewer/tester/verifier/general), `ToolRegistry.scopedToolMap(role, agent.toolMap)` filters the full ~80-tool arsenal down to the role's allowlist. If a role isn't set, the full map is used (backwards-compatible).
3. **Execution** — The tool is dispatched to `FileTools`, `ShellTools`, `CodeTools`, `AxodexTools`, `WebTools`, or `ComputerTools` (see `src/tools/`).
4. **Cost Tracking (v0.3.6)** — Every tool call is recorded by `CostTracker.recordToolCall(name, tokensIn, tokensOut, durationMs)`. The tracker emits an SSE event via `src/web/broker.ts` so the dashboard's cost rail updates live.
5. **Trajectory Tracking (`src/core/intelligence/trajectory.ts`)**:
   - Every tool call and result is logged.
   - **Scenario: Error Detected** — `SelfCorrector.classify_error` (`src/core/intelligence/self_correction.ts`) determines if it's a `SyntaxError`, `PathError`, or `LogicError`.
   - **Correction** — The system injects a "Self-Correction" prompt (e.g., "The previous file write failed because the directory doesn't exist. Create the directory first.") into the next reasoning step.

### **The Tool Registry (v0.3.6) — `src/core/tool_registry.ts`**
`AGENT_DEFINITIONS` is a `Record<AgentRole, AgentDefinition>` with eight pre-defined roles:

| Role | Description | canDestroy | canAccessNetwork |
|------|-------------|------------|------------------|
| `planner` | Decomposes goals into steps. Read-only access to the codebase via axodex + file reads. | ❌ | ❌ |
| `researcher` | Gathers info from the codebase and the web. Read-only. | ❌ | ✅ |
| `coder` | Writes and edits code. Has file edit + code tools + axodex for context. Cannot run shell or install packages. | ❌ | ❌ |
| `debugger` | Diagnoses runtime errors. Has shell + log reads + axodex for trace analysis. | ❌ | ❌ |
| `reviewer` | Reads code and reports issues. Read-only. | ❌ | ❌ |
| `tester` | Writes and runs tests. Has shell for test runners + file edit for fixtures. | ❌ | ❌ |
| `verifier` | Runs the Verify Gate (tsc/eslint/vitest/pytest). Read-only on source files. | ❌ | ❌ |
| `general` | The default. Full tool map. Backwards-compatible with pre-v0.3.6 behavior. | (config) | (config) |

Each role's `tools` array is an allowlist of tool names that must match keys in `Agent.registerTools()`. Tool names not in the full map are silently skipped (so adding new tools doesn't break old definitions). Each `AgentDefinition` also carries `canDestroy`, `canAccessNetwork`, and an optional `systemPrompt` injected when the role is active.

---

## 4. Autonomous Goal Mode (LoopEngine)
### **The Mission Cycle (`src/core/loop.ts`)**
Triggered via `axoniz goal "..."`.
1. **Planning** — `_plan()` uses the LLM to generate a plan. As of v0.3.6, this can be either:
   - **Linear plan** (legacy): a `PlanTask[]` JSON array.
   - **DAG plan** (new): the `DAGPlanner` (`src/core/intelligence/dag_planner.ts`) produces a `DAGStep[]` with explicit `dependsOn` lists and `role` hints. The `topologicalSort()` method returns "waves" of independent steps that can execute in parallel via `Promise.all(...)`.
2. **Execution** — The `LoopEngine` iterates through tasks (or DAG waves). Each task is passed to `Agent.run()`, optionally with a scoped tool map matching the task's `role`.
3. **Verification** — After a task completes, `_verify()` is called.
   - **v0.3.6 Verify Gate** (`src/core/intelligence/verify_gate.ts`) — replaces the LLM-only verification that asked the model "did this succeed?" (expensive + unreliable; LLMs hallucinate success). The `VerifyGate` actually runs deterministic checks — `tsc`, `eslint`, `vitest`, `pytest`, `mypy`, `flake8` — and parses the real results with concrete errors and line numbers. Each check is independent: if `tsc` fails, `eslint` and `vitest` still run so you get the full picture.
   - **Canonical verification chain for code changes:** Change → Compile (`tsc`) → Lint (`eslint`) → Unit Tests (`vitest`/`pytest`) → Behavior → Regression → Review.
4. **Replanning** — If verification fails, `_replan()` is triggered to pivot the strategy.

### **The DAG Planner (v0.3.6) — `src/core/intelligence/dag_planner.ts`**
A `DAGStep` carries:
- `id`, `title`, `description` — identity + human-readable summary
- `dependsOn: string[]` — step IDs that must complete first
- `role` — which agent role should execute this step (planner/researcher/coder/debugger/reviewer/tester/verifier/general)
- `difficulty` (1–5), `parallelizable` (bool)
- `verify` — the condition that must be true for this step to be "done"
- `produces` / `consumes` — artifact names that drive data-flow-based dependency inference

The planner prompts the LLM with a strict-JSON instruction (no prose, no markdown fences), parses the steps, then annotates dependencies based on the `produces`/`consumes` graph. The output `waves: DAGStep[][]` is what the LoopEngine walks.

---

## 5. Swarm Orchestration (Worker Swarm)
### **Scenario: Massive Refactor or Research**
When a task is too large for a single context, `run_swarm()` (`src/core/intelligence/swarm.ts`) is used:
1. **Decomposition** — `SwarmOrchestrator` splits the task into independent `SubTask` objects.
2. **Parallel Workers** — Multiple `SwarmWorker` instances are spawned (default 4).
3. **Critic Review** — Each worker's output is reviewed by a `SwarmCritic` (Phase 2.5).
4. **Merge** — `SwarmMerger` synthesizes the sub-task results into a final report.

> **Note on the relationship to the DAG Planner (v0.3.6).** The DAG Planner is for **single-agent multi-step** missions (one agent, parallelizable sub-steps). Swarm Orchestration is for **multi-agent parallel execution** (multiple independent worker agents on a shared large task). They compose: a DAG step can itself spawn a swarm if it's tagged as too large for one context.

---

## 6. Proactive Awareness (Phase 7)
### **The Observer Loop (`src/awareness/service.ts`)**
A background daemon that makes Axoniz feel "alive":
1. **Context Snapshot** — Every 60s, it captures:
   - **Active Window** — What application are you in?
   - **Clipboard** — What did you just copy?
   - **OCR (Optional)** — Text content on the screen.
2. **Suggestion Engine** — `SuggestionEngine.evaluate()` checks if the current context matches a trigger rule (e.g., you are in VS Code looking at a traceback).
3. **Intervention** — If a match is found, AXONIZ sends a proactive message: *"I see you're debugging X. Should I analyze the logs for you?"*

---

## 7. Communication & Remote Control
### **Telegram Integration (`src/comms/telegram.ts`)**
The bot acts as a bridge between the local agent and your mobile device:
- **Authority Gates** — If the agent wants to run `rm -rf`, it can send a message to Telegram. You reply `/approve [id]` to let it proceed.
- **Remote Ask** — Send `/ask "summarize my progress"` while away from your PC.
- **Heartbeats** — The `axonizDaemon` sends periodic health updates to your chat.

---

## 8. Critical Breaking Points & Troubleshooting
| Component | What Breaks It | Symptom | Fix |
| :--- | :--- | :--- | :--- |
| **Axodex** | Renaming folders or deleting `.axodex/` | `AxodexTools` returns empty / stale-index warning | Run `axodex analyze` (binary on PATH after `npm install -g @fraziym/axodex`) |
| **Axodex binary missing** | Skipped global install of `@fraziym/axodex` | `axoniz` logs "axodex not on PATH" at boot | `npm install -g @fraziym/axodex` (or `axoniz install axodex` as a wrapper) |
| **LLM Backend** | Port conflict (`:8080`/`:1234`/`:11434`) or OOM | Agent hangs on `ensure_llm` | Check `taskmanager` / `ps` for zombie `llama-server` processes |
| **Auth Engine** | Missing `default.yaml` | Authority level resets to 1 | Verify `src/roles/default.yaml` exists (and `~/.axoniz/roles/` if you've overridden) |
| **Awareness** | Missing optional deps (`screenshot-desktop`, `sharp`) | Suggestion loop stops | `npm install` in the AXONIZ repo to pull optional deps |
| **Web dashboard** | `web-next/` missing or `bun`/`npm` not on PATH | `axoniz --web` falls back to legacy static UI with a warning | Clone `web-next/` into the repo, or `npm install` inside `web-next/` |
| **Verify Gate** | `tsc`/`eslint`/`vitest`/`pytest` not installed | Verification reports "skipped" for missing checks | Install the relevant runner in the workspace's devDeps |
| **Cost Tracker** | `src/web/broker.ts` SSE clients dropped | Dashboard cost rail freezes | The tracker keeps accumulating internally; dashboard recovers on reconnect |

---

## 9. PEAK Advancements (v0.3.6)
Five new modules bring the agent core up to the PEAK architecture target. All live under `src/core/` and `src/core/intelligence/`. Each is self-contained, independently testable, and ships in the npm package.

### 9.1 Tool Registry — `src/core/tool_registry.ts`
- **Exports** `AgentRole` (union of 8 roles), `AgentDefinition`, `AGENT_DEFINITIONS` (the pre-defined role table), and `ToolRegistry` (a static helper class with `get(role)`, `scopedToolMap(role, fullMap)`, `isAllowed(role, toolName)`).
- **Why** — Pre-v0.3.6 every agent got the full ~80-tool arsenal. That's both a security issue (a planning agent shouldn't be able to delete files) and a behavioral one (the LLM gets distracted by irrelevant tools in its function-calling schema).
- **Integration** — `Agent.ts` checks `this.role` on every `_exec`; if set, the call is rejected unless the tool is in the role's allowlist. The scoped map is also used when generating the LLM's tool schema so the model only sees the tools it can call.

### 9.2 Cost Tracker — `src/core/intelligence/cost_tracker.ts`
- **Per-task attribution** — Tracks `tokensIn`, `tokensOut`, `costUsd`, `durationMs` for every LLM call and every tool call. Aggregates per task via `getTaskTotal()`.
- **SSE emission** — The optional `onCost?: (event: CostEvent) => void` callback fires on every recorded call. The web broker (`src/web/broker.ts`) wires this to an SSE channel the dashboard subscribes to, so the cost rail updates live as the mission runs.
- **Local pricing** — For local providers (llama.cpp, LM Studio, Ollama) prices default to 0 — the cost is hardware depreciation, not per-token billing. OpenAI-compatible providers can supply real `inputPricePerMTok` / `outputPricePerMTok`.

### 9.3 Verify Gate — `src/core/intelligence/verify_gate.ts`
- **Runs real checks** — `VerifyGate(workspace).run(["tsc","eslint","vitest","pytest","mypy","flake8"])`. Each check spawns the underlying CLI via `execSync`, parses the exit code + stdout/stderr, and reports `{ passed, output, errors, warnings, durationMs }`.
- **Independent checks** — A failure in one check doesn't stop the others. Checks that aren't applicable (e.g. `vitest` with no vitest config) are skipped with a "skipped" note rather than counted as failures.
- **Replaces LLM-only `_verify()`** — The legacy flow asked the LLM "did this succeed?" which is expensive (extra inference call) and unreliable (LLMs hallucinate success). The Verify Gate returns deterministic results with concrete error line numbers.
- **Canonical chain** — Change → Compile (`tsc`) → Lint (`eslint`) → Unit Tests (`vitest`/`pytest`) → Behavior → Regression → Review.

### 9.4 DAG Planner — `src/core/intelligence/dag_planner.ts`
- **Dependency-graph plans** — Produces `DAGStep[]` where each step declares `dependsOn: string[]`. The `topologicalSort(steps)` method returns `waves: DAGStep[][]` — each wave is a set of independent steps that can run in parallel via `Promise.all(...)`.
- **Role hints per step** — Each step carries a `role` (planner/researcher/coder/...) so the LoopEngine knows which scoped tool map to apply.
- **Data-flow annotation** — Steps declare `produces` and `consumes` artifact names. The planner uses these to infer dependencies in addition to whatever the LLM explicitly listed.
- **Integration** — `loop.ts._plan()` picks the DAG path when `--dag` is passed (or when the goal's complexity estimate crosses the parallelization threshold). Falls back to linear `PlanTask[]` for trivial goals.

### 9.5 Semantic Context Compression — `src/core/intelligence/context_compressor.ts`
- **Three new methods on `ContextCompressor`**:
  - `scoreImportance(msg, indexFromEnd): number` — Scores a message 0–100 based on role, recency, and content type. User messages and tool calls get high scores; old assistant filler gets low scores.
  - `semanticKeepMask(messages): boolean[]` — Returns a per-message keep/drop mask. Keeps: all `system` messages, all user messages, all tool calls and tool results, all error messages. Drops only old successful assistant turns that have already been summarized.
  - `compressSemantic(messages, agent): Promise<CompressionMessage[]>` — Drives the new flow: scores every message, computes the keep-mask, summarizes only the dropped block, and returns the compacted message list with the `[CONTEXT COMPACTION — REFERENCE ONLY]` prefix on the summary.
- **Why semantic, not just token-count** — The legacy compressor used a simple "compress when over threshold, summarize the middle" approach. It would happily summarize a critical error message that the agent needed to recover from. The semantic mask protects user instructions, tool calls, and errors verbatim — only old successful results get summarized.
- **Integration** — `Agent.compress()` calls `compressSemantic()` instead of `compress()` when `this.semanticCompression` is true (default for goal mode, opt-in for chat mode).

---

*This manual was synthesized for AXONIZ `V00.01.000-beta-01` (semver: `0.1.0-beta.1`) using the Axodex semantic knowledge graph. The FRAZIYM versioning source of truth is `src/version.ts`; the npm `package.json` carries the semver translation; `tests/version.test.ts` keeps them in sync.*
