<!-- axodex:start -->
# Axodex — Code Intelligence

This project is indexed by Axodex as **DevNet** (4843 symbols, 10982 relationships, 300 execution flows). Use the Axodex MCP tools to understand code, assess impact, and navigate safely.

> If any Axodex tool warns the index is stale, run `npx axodex analyze` in terminal first.

## Web UI (v0.3.0)

A new Next.js 16 dashboard lives in `web-next/` and replaces the legacy scraped `src/web/static/` UI. It is a separate Node.js project (not part of the AXONIZ TypeScript port) so it can be developed and deployed independently.

- **Sitemap**: `/chat`, `/agent`, `/vault`, `/forge`, `/war-room`, `/palace`, `/axodex`, `/search`, `/benchmarks`, `/system`, `/settings` (with sub-routes per provider — 14 total)
- **14 providers supported**: llama.cpp, LM Studio, Ollama, OpenAI, OpenRouter, Google Gemini, Anthropic Claude, Groq, Together AI, Mistral, DeepSeek, Fireworks AI, Perplexity, Custom
- **Real wiring**: every UI action hits a real backend endpoint OR makes a real fetch to the user's configured provider. No placeholders. Mock fallback only when no backend / no provider configured.
- **Architecture**: typed client (`web-next/src/lib/axoniz/client.ts`) → Next.js proxy routes (`web-next/src/app/api/axoniz/[...path]/route.ts` with mock fallback, `chat/route.ts` for streaming, `providers/test/route.ts` for pinger) → real AXONIZ backend at :7860 OR real provider endpoint.
- **See**: `docs/WEB_UI.md` (full sitemap + provider setup) and `docs/WEB_ROADMAP.md` (what's done, what's next).

When editing files in `web-next/`, run `bun run lint` from that directory before committing.

## `axoniz --web` now spawns the Next.js dashboard (v0.3.3)

Running `axoniz --web` no longer serves the legacy scraped static UI. The Express backend (`src/web/server.ts`) now:

1. Listens on :7860 (unchanged) — all `/api/*` routes live here
2. Spawns `bun run dev` (or `npm run dev`) in `web-next/` as a child process on :3000
3. Proxies all non-API GET requests from :7860 → :3000 so users only need to remember one URL
4. Falls back to the legacy static UI at `src/web/static/` if `web-next/` is missing or the dev server fails to start (with a clear log line: `dashboard -> not started (falling back to legacy static UI)`)

The spawn logic lives in `src/web/web-next-spawn.ts` (60s timeout for the dev server to come up; child process is cleaned up on SIGINT/SIGTERM).

## Versioning (v0.3.5) — FRAZIYM format

AXONIZ uses the FRAZIYM versioning format (NOT conventional semver):

```
VPP.FF.BBB-STAGE-RR
│  │  │    │     │
│  │  │    │     └── Pre-release revision (01, 02, …)
│  │  │    └──────── Release stage (-alpha | -beta | -rc; omitted when stable)
│  │  └───────────── Bug-fix version (000, 001, …)
│  └──────────────── Feature version (00, 01, …)
└─────────────────── Platform generation (V00, V01, …)
```

**Current version:** `V00.01.000-beta-01` (first beta of V00 platform, feature 01)

Single source of truth: `src/version.ts` (exports `AXONIZ_VERSION`,
`AXONIZ_VERSION_SEMVER`, `AXONIZ_RELEASE_STAGE`, `parseFraziymVersion()`,
`fraziymToSemver()`).

Five sync points carry the string (verified by `tests/version.test.ts`):
1. `src/version.ts` — the source of truth
2. `package.json` — `"version"` field (semver-translated to `0.1.0-beta.1`)
3. `src/core/runner.ts` — CLI banner displays (`AXONIZ-ZERO`, `FRAZIYM AI`)
4. `README.md` — version line at the top
5. `tests/version.test.ts` — the test that verifies all sync points

The `package.json` version is a semver-compatible translation of the
FRAZIYM string because npm requires valid semver:
- `V00.01.000-beta-01` → `0.1.0-beta.1`
- `V00` → major 0
- `01` → minor 1
- `000` → patch 0
- `-beta` → `-beta`
- `01` → `.1`

Bump procedure (documented in `src/version.ts`):
1. Edit `src/version.ts` — bump `AXONIZ_VERSION`
2. Re-derive the semver translation and update `package.json` `"version"`
3. Update `README.md` displayed version
4. Run `npm test` — `version.test.ts` fails if any sync point is stale
5. Commit + push + `npm publish`

The same FRAZIYM versioning applies to axodex (the standalone package
at https://github.com/Akik-Forazi/axodex). Both packages are currently
at `V00.01.000-beta-01` and versioned independently.

## PEAK agent advancements (v0.3.6)

Five new modules landed in v0.3.6 to close the highest-priority gaps from
the AGENTIC_ROADMAP. The modules are **implemented but not yet wired**
into `agent.run()` / `loop._plan()` / `loop._verify()` / `_exec()` —
that's the P0 wiring work tracked in `docs/TODO.md`.

### 1. Tool Registry — `src/core/tool_registry.ts`

Per-role tool scoping. Solves P0-002 "tool scoping not implemented".

- `AgentDefinition` interface with `role`, `tools` (allowlist), `canDestroy`, `canAccessNetwork`, `systemPrompt`
- `ToolRegistry` class with 8 pre-defined roles: `planner`, `researcher`, `coder`, `debugger`, `reviewer`, `tester`, `verifier`, `general`
- `ToolRegistry.scopedToolMap(role, fullToolMap)` → filtered `Map<string, ToolFn>` containing only the role's allowed tools
- `ToolRegistry.toolNamesForRole(role)` → `string[]` for system prompt construction
- P0-W1 wiring: call `scopedToolMap` in `agent.run()` when `this.role` is set

### 2. Cost Tracker — `src/core/intelligence/cost_tracker.ts`

Per-task token + $ cost attribution. Solves P2-002 "no per-task cost tracking".

- `CostTracker` class with `recordToolCall()`, `recordLLMCall()`, `getTaskTotal()`
- Pricing: `{ inputPricePerMTok, outputPricePerMTok }` — 0 for local providers (llama.cpp/LM Studio/Ollama)
- Emits `broker.broadcast("cost", event)` SSE events for live dashboard updates
- `onCost` callback for direct subscribers
- P0-W2 wiring: call `recordToolCall` + `recordLLMCall` inside `_exec()` and the LLM stream loop

### 3. Verify Gate — `src/core/intelligence/verify_gate.ts`

Real verification that runs actual toolchain checks. Replaces the LLM-only `_verify()` in `loop.ts`.

- `VerifyGate.run(checks: VerifyCheckName[])` → `VerifyResult`
- Supported checks: `tsc`, `eslint`, `vitest`, `pytest`, `mypy`, `flake8`
- Each check: runs the actual binary, parses output, returns `{ passed, errors, warnings, durationMs }`
- Checks that aren't applicable (no `tsconfig.json`) are skipped with `passed: true`
- Independent — a tsc failure doesn't stop eslint/vitest from running
- P0-W3 wiring: call `VerifyGate.run()` in `loop._verify()` after code-editing steps

### 4. DAG Planner — `src/core/intelligence/dag_planner.ts`

Dependency-graph plan with parallel step execution. Replaces the linear `PlanTask[]` from `loop._plan()`.

- `DAGStep` interface: `id`, `title`, `dependsOn: string[]`, `role`, `difficulty` (1-5), `produces`/`consumes` artifacts, `verify`
- `DAGPlanner.plan(goal)` → `{ steps: DAGStep[], waves: DAGStep[][], estimatedDurationMs }`
- `topologicalSort(steps)` → waves of parallel-executable steps (Kahn's algorithm, throws on cycles)
- Steps in the same wave can run via `Promise.all()` — major speedup for goals with independent sub-tasks
- P0-W4 wiring: call `DAGPlanner.plan()` in `loop._plan()`, iterate `waves` in `loop.run()`

### 5. Semantic Context Compression — `src/core/intelligence/context_compressor.ts`

Importance-based compression (was turn-count-based). Solves P2-003.

Enhanced the existing `ContextCompressor` class with three new methods:
- `scoreImportance(msg, indexFromEnd)` → 0-100 score (user=95, assistant+tools=90, errors=85, done=88, success=60, plain text=40 with age decay ×0.9 per 10 turns)
- `semanticKeepMask(messages)` → `boolean[]` — which messages to keep verbatim
- `compressSemantic(messages, agent)` → keeps high-importance + last N turns verbatim, summarizes only old low-importance results
- Falls back to the original contiguous-region `compress()` if LLM summary fails
- P0-W5 wiring: call `compressSemantic()` instead of `compress()` in the threshold trigger

### Module index

All 5 new modules are re-exported from `src/core/intelligence/index.ts`:
`CostTracker`, `VerifyGate`, `DAGPlanner` (+ their type interfaces).
`ToolRegistry` is exported from `src/core/tool_registry.ts` directly.
The semantic compression methods live on the existing `ContextCompressor` class.

### What's NOT done yet (P0 wiring — see `docs/TODO.md`)

The 5 modules are **implemented and exported** but **not yet called**
from the agent loop. The wiring tasks (P0-W1 through P0-W5) are the
immediate next step:

| Task | Module | Wire into | Status |
|---|---|---|---|
| P0-W1 | ToolRegistry | `agent.run()` scoped tool map | 🔴 pending |
| P0-W2 | CostTracker | `_exec()` + LLM stream | 🔴 pending |
| P0-W3 | VerifyGate | `loop._verify()` | 🔴 pending |
| P0-W4 | DAGPlanner | `loop._plan()` + `loop.run()` wave iteration | 🔴 pending |
| P0-W5 | compressSemantic | context threshold trigger | 🔴 pending |
| P0-W6 | tests for all 5 | `tests/*.test.ts` | 🔴 pending |

## Axodex integration (v0.3.4) — standalone npm package

Axodex is now its own standalone npm package, published as
**`@fraziym/axodex`** at https://www.npmjs.com/package/@fraziym/axodex.

Source: https://github.com/Akik-Forazi/axodex (separate repo)

### Install

```bash
# Recommended — install both AXONIZ and axodex in one command
npm install -g @fraziym/axoniz @fraziym/axodex

# Or install axodex via the AXONIZ installer (runs the above npm install)
axoniz install axodex
```

### What changed in v0.3.4

- **Removed**: the bundled axodex at `axoniz/integrations/Axodex/` (was
  5800+ files of overhead inside the AXONIZ repo)
- **Removed**: the git-clone-AXONIZ installer logic that downloaded 30+ MiB
  and never linked the `axodex` binary on PATH
- **Added**: `@fraziym/axodex` as a peerDependency in AXONIZ's package.json
- **Replaced** `src/integrations/installer.ts`: now runs
  `npm install -g @fraziym/axodex` (one-line, ~5s, binary lands on PATH)
- **Simplified** `src/tools/axodex_tools.ts`: resolver now just checks
  for `axodex` on PATH (preferred) or `npx @fraziym/axodex` (fallback)

### Single source of truth for versioning

axodex's version lives in `axodex/package.json` in the standalone repo
(https://github.com/Akik-Forazi/axodex). To bump the version:

```bash
cd /path/to/axodex-repo
# Edit axodex/package.json → bump "version"
npm version patch  # or minor, major
npm publish        # publishes @fraziym/axodex@<new-version> to npm
```

AXONIZ picks up the new version via its `^1.6.12` peerDependency range.
No bundling, no copying — just npm.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `axodex_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `axodex_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `axodex_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `axodex_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `axodex_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `axodex_rename` which understands the call graph.
- NEVER commit changes without running `axodex_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `axodex://repo/DevNet/context` | Codebase overview, check index freshness |
| `axodex://repo/DevNet/clusters` | All functional areas |
| `axodex://repo/DevNet/processes` | All execution flows |
| `axodex://repo/DevNet/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/axodex/axodex-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/axodex/axodex-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/axodex/axodex-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/axodex/axodex-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/axodex/axodex-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/axodex/axodex-cli/SKILL.md` |

<!-- axodex:end -->
