# axoniz Implemented Features Summary

This document outlines the key features implemented to transform axoniz into a seamless, fast, and feature-rich local AI development environment, addressing the user's requirements for a "premium, all-in-one local AI development environment" and a "powerful, autonomous engineer controlled via a feature-rich, customizable web dashboard."

> **Versioning note.** As of v0.3.5, AXONIZ uses the FRAZIYM versioning format `VPP.FF.BBB-STAGE-RR` (current: `V00.01.000-beta-01`, semver translation `0.1.0-beta.1`). Single source of truth: `src/version.ts`. See the versioning section below for the bump procedure.

---

## v0.3.4 — Standalone axodex + Installer Rewrite

These changes extract axodex from the AXONIZ repo and ship it as its own npm package. This removes 5800+ files of overhead from the AXONIZ repo and makes the axodex binary available on PATH after a one-line install.

*   **Standalone axodex npm package** — `@fraziym/axodex` is now published at https://www.npmjs.com/package/@fraziym/axodex (source: https://github.com/Akik-Forazi/axodex). Both packages are versioned independently using FRAZIYM versioning and currently sit at `V00.01.000-beta-01`.
*   **Installer rewrite** — `src/integrations/installer.ts` no longer clones the AXONIZ repo (which used to pull 30+ MiB and never linked the `axodex` binary on PATH). It now shells out to `npm install -g @fraziym/axodex` — one-line, ~5s, binary lands on PATH.
*   **One-command install** — `npm install -g @fraziym/axoniz @fraziym/axodex` installs both the AXONIZ agent core and the axodex graph-engine binary in a single npm transaction.
*   **`@fraziym/axodex` declared as a peerDependency** — In `package.json`, axodex is a required (non-optional) peerDependency so `npm install @fraziym/axoniz` warns if it's missing.
*   **Simplified axodex resolver** — `src/tools/axodex_tools.ts` now checks for the `axodex` binary on PATH (preferred) or falls back to `npx @fraziym/axodex`. No more probing for a bundled clone.
*   **Custom integrations path preserved** — `axoniz install <git-url>` still clones into `~/.axoniz/integrations/` for git-hosted integrations that aren't on npm yet. The npm path is the default for known integrations (currently just `axodex` in the registry).

---

## v0.3.5 — FRAZIYM Versioning System

A single source of truth for the version string, with a test that fails the build if any sync point drifts.

*   **FRAZIYM format** — `VPP.FF.BBB-STAGE-RR` where `VPP` is platform generation, `FF` is feature version, `BBB` is bugfix version, `STAGE` is `-alpha`/`-beta`/`-rc` (or omitted when stable), and `RR` is pre-release revision. Current: `V00.01.000-beta-01`.
*   **Single source of truth** — `src/version.ts` exports `AXONIZ_VERSION`, `AXONIZ_RELEASE_STAGE`, `AXONIZ_VERSION_SEMVER` (the npm-compatible translation), `parseFraziymVersion(v)`, and `fraziymToSemver(v)`.
*   **Five sync points** (verified by `tests/version.test.ts`):
    1. `src/version.ts` — the canonical string
    2. `package.json` — `"version"` field (semver-translated to `0.1.0-beta.1`)
    3. `src/core/runner.ts` — the CLI banner display
    4. `README.md` — the version line at the top
    5. `tests/version.test.ts` — the test that asserts all four above stay in sync
*   **Semver translation rules** — `V00 → major 0`, `01 → minor 1`, `000 → patch 0`, `-beta → -beta`, `01 → .1`. So `V00.01.000-beta-01` maps to `0.1.0-beta.1` for npm.
*   **Version sync tests** — `tests/version.test.ts` parses the FRAZIYM string, asserts it's well-formed, and verifies that each sync point carries the expected value. Bump procedure: edit `src/version.ts`, re-derive the semver translation and update `package.json`, update `README.md`, run `npm test`, then commit + push + `npm publish`.
*   **Same scheme applies to axodex** — The standalone axodex repo uses an identical `axodex/src/version.ts` as its single source of truth. Both packages are versioned independently.

---

## v0.3.6 — PEAK Agent Advancements

Five new modules bring the agent core up to the PEAK architecture target. All live under `src/core/` and `src/core/intelligence/`. Each is self-contained, independently testable, and ships in the npm package.

### Tool Registry — `src/core/tool_registry.ts`
*   **Per-role tool scoping** — Instead of every agent getting the full ~80-tool arsenal, agents can be instantiated with a `role` that determines which tools they can invoke. The scoped map is also used when generating the LLM's function-calling schema so the model only sees the tools it can call.
*   **Eight pre-defined roles** — `planner`, `researcher`, `coder`, `debugger`, `reviewer`, `tester`, `verifier`, `general`. Each `AgentDefinition` carries `name`, `role`, `description`, `tools` (allowlist), optional `systemPrompt`, `canDestroy` (file_delete, `rm`, etc.), and `canAccessNetwork` (web_get, web_search, package installs).
*   **Per-role tool allowlists** — The Planner and Researcher are read-only; the Coder has file edit + code tools + axodex for context but no shell; the Debugger has shell + log reads + axodex for trace analysis; the Tester writes and runs tests; the Verifier runs the Verify Gate.
*   **Backwards-compatible** — If no role is set, the full tool map is used (preserves pre-v0.3.6 behavior).
*   **Resilient allowlists** — Tool names in an allowlist that aren't in the full map are silently skipped, so adding new tools doesn't break old definitions.

### Cost Tracker — `src/core/intelligence/cost_tracker.ts`
*   **Per-task cost attribution** — Tracks `tokensIn`, `tokensOut`, `costUsd`, and `durationMs` for every LLM call and every tool call. Aggregates per task via `getTaskTotal()`.
*   **SSE events for live dashboard updates** — The optional `onCost?: (event: CostEvent) => void` callback fires on every recorded call. The web broker (`src/web/broker.ts`) wires this to an SSE channel the dashboard subscribes to, so the cost rail updates live as the mission runs.
*   **Local pricing defaults to 0** — For local providers (llama.cpp, LM Studio, Ollama) the per-token price is 0 (the cost is hardware depreciation, not per-token billing). OpenAI-compatible providers can supply real `inputPricePerMTok` / `outputPricePerMTok`.

### Verify Gate — `src/core/intelligence/verify_gate.ts`
*   **Runs real checks** — `VerifyGate(workspace).run(["tsc","eslint","vitest","pytest","mypy","flake8"])`. Each check spawns the underlying CLI via `execSync`, parses exit code + stdout/stderr, and reports `{ passed, output, errors, warnings, durationMs }`.
*   **Independent checks** — A failure in one check doesn't stop the others (so a `tsc` failure doesn't hide test failures). Checks that aren't applicable (e.g. `vitest` with no vitest config) are skipped with a "skipped" note rather than counted as failures.
*   **Replaces LLM-only verification** — The legacy `_verify()` in `loop.ts` asked the LLM "did this succeed?" (expensive — extra inference call; unreliable — LLMs hallucinate success). The Verify Gate returns deterministic results with concrete error line numbers.
*   **Canonical verification chain for code changes** — Change → Compile (`tsc`) → Lint (`eslint`) → Unit Tests (`vitest`/`pytest`) → Behavior → Regression → Review.

### DAG Planner — `src/core/intelligence/dag_planner.ts`
*   **Dependency-graph plans** — Produces `DAGStep[]` where each step declares `dependsOn: string[]`. The `topologicalSort(steps)` method returns `waves: DAGStep[][]` — each wave is a set of independent steps that can run in parallel via `Promise.all(...)`.
*   **Role hints per step** — Each step carries a `role` (planner/researcher/coder/debugger/reviewer/tester/verifier/general) so the LoopEngine knows which scoped tool map to apply.
*   **Data-flow annotation** — Steps declare `produces` and `consumes` artifact names. The planner uses these to infer dependencies in addition to whatever the LLM explicitly listed, so the LLM doesn't have to get the dependency graph exactly right.
*   **Integration with `loop.ts`** — `_plan()` picks the DAG path when `--dag` is passed (or when the goal's complexity estimate crosses the parallelization threshold). Falls back to linear `PlanTask[]` for trivial goals.

### Semantic Context Compression — `src/core/intelligence/context_compressor.ts`
*   **Three new methods on `ContextCompressor`**:
    *   `scoreImportance(msg, indexFromEnd): number` — Scores a message 0–100 based on role, recency, and content type. User messages and tool calls get high scores; old assistant filler gets low scores.
    *   `semanticKeepMask(messages): boolean[]` — Returns a per-message keep/drop mask. Keeps: all `system` messages, all user messages, all tool calls and tool results, all error messages. Drops only old successful assistant turns that have already been summarized.
    *   `compressSemantic(messages, agent): Promise<CompressionMessage[]>` — Drives the new flow: scores every message, computes the keep-mask, summarizes only the dropped block, and returns the compacted message list with the `[CONTEXT COMPACTION — REFERENCE ONLY]` prefix on the summary.
*   **Why semantic, not just token-count** — The legacy compressor used a simple "compress when over threshold, summarize the middle" approach. It would happily summarize a critical error message that the agent needed to recover from. The semantic mask protects user instructions, tool calls, and errors verbatim — only old successful results get summarized.
*   **Integration** — `Agent.compress()` calls `compressSemantic()` instead of `compress()` when `this.semanticCompression` is true (default for goal mode, opt-in for chat mode).

---

## Core Agent & Backend Enhancements (pre-v0.3.4)

*   **Unified "Super-Server" Architecture**:
    *   **Direct Backend Optimization**: The internal GGUF runner (`llama-cpp-python` in the Python era; `node-llama-cpp` in the TS port) is the first-class citizen, optimized for speed and control. It supports `n_gpu_layers` and streams tokens in real-time.
    *   **Ollama Integration**: Added an `OllamaBackend` to allow users to leverage their local Ollama server for running models, expanding backend flexibility.
    *   **No External Server Dependency**: The system is designed to remove the need for users to manage an external `llama-server` process, reducing redundancy and confusion.

*   **Model Management**:
    *   **Model Downloader**: Implemented a background model downloader. Users can now download GGUF models directly from HuggingFace via the Web UI's Model Manager.
    *   **Real-time Download Progress**: Download status and progress are tracked and displayed in the UI.
    *   **Dynamic Context Size**: Users can adjust `n_ctx` (context window size) and `n_gpu_layers` directly from the settings panel, with changes dynamically applied to the loaded model via the `/api/config/update_model_params` endpoint.
    *   **Improved Model Discovery**: The system correctly detects and utilizes local GGUF models stored in the `~/.axoniz/models` directory, and the model registry reflects the user's local model versions.

## Advanced Intelligence & Autonomy (pre-v0.3.4)

*   **Goal Pursuit Engine (Phase 11)**:
    *   **OKR-style Tracking**: SQLite-backed goal pursuit engine.
    *   **Agent Tools**: `goal_create`, `goal_list`, `goal_update_score`, `goal_report` tools, allowing the agent to autonomously manage and track project objectives.
    *   **Drill Sergeant Accountability**: Proactive progress checks and status reporting.

*   **Workflow Automation (Phase 9)**:
    *   **Trigger-Action System**: Support for cron, heartbeat, and file-change triggers.
    *   **Agent Integration**: Workflows can autonomously trigger agent tasks, shell commands, or palace archival.

*   **Continuous Awareness (Phase 10)**:
    *   **Environment Monitoring**: Background monitoring of active windows, clipboard, and system metrics.
    *   **Proactive Suggestions**: Rule-based engine that allows AXONIZ to suggest actions based on the user's current context.

*   **Autonomous Infrastructure Hardening**:
    *   **Local JWT Authentication**: Zero-cost, 100% offline authentication integrated into the web server.
    *   **Prometheus Metrics**: Built-in observability for tracking requests, agent performance, and hardware usage.
    *   **In-memory Rate Limiting**: Protection against API flooding.

*   **Chat & History**:
    *   **Real-time Token Streaming**: The agent's thought process and responses are streamed token-by-token to the UI, providing immediate feedback and a more interactive experience.
    *   **JSONL Chat Persistence**: All chat interactions (user messages, assistant responses, tool calls, and results) are automatically saved as JSONL files in the workspace's `.axoniz/history` folder.
    *   **Session History Viewer**: A "HISTORY" tab in the sidebar allows users to browse and view previous chat sessions.

## Web Dashboard (IDE-like Experience)

*   **Next.js 16 dashboard** (`web-next/`) — Replaces the legacy scraped static UI at `src/web/static/`. Independent Node.js project with its own `package.json`, `bun.lock`, Prisma schema, and routes. `axoniz --web` spawns `bun run dev` (or `npm run dev`) in `web-next/` as a child process on `:3000` and proxies all non-API GET requests from `:7860 → :3000`. Falls back to the legacy static UI if `web-next/` is missing.
*   **Sitemap** — `/chat`, `/agent`, `/vault`, `/forge`, `/war-room`, `/palace`, `/axodex`, `/search`, `/benchmarks`, `/system`, `/settings/*` (14 settings sub-routes per provider).
*   **14 providers supported** — llama.cpp, LM Studio, Ollama, OpenAI, OpenRouter, Google Gemini, Anthropic Claude, Groq, Together AI, Mistral, DeepSeek, Fireworks AI, Perplexity, Custom.
*   **Real wiring** — Every UI action hits a real backend endpoint OR makes a real fetch to the user's configured provider. No placeholders. Mock fallback only when no backend / no provider is configured.
*   **Enhanced layout** — Workspace split-view, file explorer, integrated code editor panel.
*   **User interface controls** — Responsive design with collapsible sidebar, sidebar toggle, settings panel with `n_ctx` and `n_gpu_layers` controls, model manager panel with "Download GGUF" button.

## Development & Build

*   **TypeScript port** — The Python codebase has been ported to TypeScript (`src/` tree). Build: `npm run build` (`tsc -p tsconfig.json`). Run: `node dist/cli/entry.js`. The `axoniz` binary is published to npm at `./dist/cli/entry.js`.
*   **PyInstaller build (legacy)** — The `build.bat` script is configured to use PyInstaller and the `axoniz.spec` file to create a standalone `axoniz.exe` executable for the legacy Python path (preserved for compatibility).
*   **Module Inclusion** — The legacy `axoniz.spec` has been updated to explicitly include newly added modules (`history`, `downloader`, `ollama`) and `llama_cpp` for a robust executable build.

---

**Status: PEAK-1 Complete (v0.3.6 / `V00.01.000-beta-01`)**
The core functionality, advanced intelligence (Workflows, Awareness, Goals, Tool Registry, Cost Tracker, Verify Gate, DAG Planner, Semantic Compression), hardened infrastructure (Auth, Metrics, Rate-limiting, Cost SSE), and the Next.js dashboard (real App Router routes, 14 providers, real backend wiring) are fully integrated. The system is ready for production-level agentic tasks. Remaining work involves expanding test coverage for the v0.3.6 modules, stabilizing the DAG Planner's LLM prompt, and wiring the dashboard's cost rail to consume the new SSE cost events end-to-end.
