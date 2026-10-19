# CLI ↔ Web Parity Matrix

## Overview

This document tracks which CLI capabilities are accessible through the web application.
The CLI is the authoritative implementation; the web is a frontend.

## Build & Runtime

| Capability | CLI | Web | Status |
|---|---|---|---|
| `npm run build` (unified) | `tsc + copy-assets` | `next build` | **PASS** — root build produces both |
| `npm run build:cli` | ✅ | — | **PASS** |
| `npm run build:web` | — | ✅ | **PASS** |
| `npm run dev:all` | `tsc --watch` | `next dev` | **PASS** — concurrent dev |
| CLI bridge (eval('require')) | dist/core/*.js | cli-bridge.ts | **PASS** |
| Config: `~/.fraziym/axoniz/config.json` | loadConfig/saveConfig | GET/POST /api/axoniz/config/cli | **PASS** — redacted on read |

## Agent & Chat

| Capability | CLI Source | Web Integration | Status |
|---|---|---|---|
| Agent.chatStream() | `dist/core/agent.js` | execution-runner.ts → SSE | **PASS** — durable, survives disconnect |
| Agent.run() (agent loop) | `dist/core/agent.js` | POST /api/axoniz/agent/exec | **PASS** — background execution |
| Tool parsing + execution | `dist/tools/*.js` (6 modules, ~80 tools) | Agent.run() handles internally | **PASS** — tools execute via agent loop |
| Cancellation | `Agent.aborted()` flag | POST /api/axoniz/executions/[id]/cancel | **PASS** — checks between tokens |
| Streaming SSE | `Agent.chatStream()` yields tokens | GET /api/axoniz/executions/[id]/stream | **PASS** — replay + live |
| Durable persistence | — | SQLite: executions.db + events table | **PASS** |
| Startup recovery | — | instrumentation.ts → recoverOnStartup() | **PASS** |
| Idempotency | — | UNIQUE constraint on idempotency_key | **PASS** |
| Worker claiming | — | claimExecution() atomic UPDATE...WHERE | **PASS** |

## Provider System

| Capability | CLI Source | Web Integration | Status |
|---|---|---|---|
| get_backend() | `dist/core/backend/index.js` | Agent uses internally | **PASS** — no duplicate provider client |
| LlamaCppBackend | `dist/core/backend/llamacpp.js` | via Agent | **PASS** |
| LlamaCppServerBackend | `dist/core/backend/llama_server.js` | via Agent | **PASS** |
| OpenAICompatibleBackend | `dist/core/backend/openai.js` | via Agent | **PASS** |
| OllamaBackend | `dist/core/backend/ollama.js` | via Agent | **PASS** |
| LMStudioBackend | `dist/core/backend/lmstudio.js` | via Agent | **PASS** |
| Model discovery | scanModels() in catch-all route | GET /api/axoniz/models/local | **PASS** |
| Model launch | ServerProcessManager | POST /api/axoniz/models/launch | **PASS** — live logs via SSE |
| Model stop | ServerProcessManager | POST /api/axoniz/models/stop | **PASS** |
| Provider test | /api/axoniz/providers/test | POST /api/axoniz/providers/test | **PASS** |

## Memory

| Capability | CLI Source | Web Integration | Status |
|---|---|---|---|
| UnifiedMemory (palace + KG) | `dist/integrations/unified_memory.js` | GET /api/axoniz/memory/status | **PASS** |
| Palace search | `PalaceLayer.search()` | GET /api/axoniz/memory/query | **PASS** |
| Palace store | `PalaceLayer.store()` | POST /api/axoniz/memory/store | **PASS** — requires auth |

## Swarm

| Capability | CLI Source | Web Integration | Status |
|---|---|---|---|
| SwarmOrchestrator | `dist/core/intelligence/swarm.js` | POST /api/axoniz/swarm/run | **PASS** — requires auth |

## Workflows & Goals

| Capability | CLI Source | Web Integration | Status |
|---|---|---|---|
| WorkflowEngine | `dist/workflows/engine.js` | GET /api/axoniz/workflows | **PASS** — returns real workflows |
| Workflow run | `engine.run_now()` | POST /api/axoniz/workflows/run/[id] | **PASS** — requires auth |
| GoalService | `dist/goals/service.js` | GET /api/axoniz/goals | **PASS** — returns from goals.db |

## Diagnostics

| Capability | CLI Source | Web Integration | Status |
|---|---|---|---|
| .axolog logging | diagnostics.ts | POST /api/axoniz/diagnostics/log | **PASS** — JSONL append |
| Diagnostics viewer | — | /diagnostics page + /read + /sessions | **PASS** |
| CostTracker | `dist/core/intelligence/cost_tracker.js` | GET /api/axoniz/cost/summary | **PASS** |
| Daemon status | `dist/core/intelligence/daemon.js` | GET /api/axoniz/daemon/status | **PASS** |

## Voice

| Capability | CLI Source | Web Integration | Status |
|---|---|---|---|
| TTS | `dist/voice/tts.js` | POST /api/axoniz/voice/tts | **PASS** — requires auth |
| VoiceLoop (STT+TTS state machine) | `dist/voice/voice_loop.js` | NOT EXPOSED | **NOT IMPLEMENTED** — needs audio I/O |

## Authority Engine

| Capability | CLI Source | Web Integration | Status |
|---|---|---|---|
| Action gating | `dist/core/authority.js` | NOT WIRED to web | **NOT IMPLEMENTED** — Agent.run() uses internally, but web doesn't enforce at API boundary |

## Not Yet Implemented

| Capability | Reason |
|---|---|
| Authority Engine at web boundary | Needs integration with execution runner |
| VoiceLoop (STT) | Requires audio hardware + browser mic access |
| ComputerTools (GUI) | Requires pyautogui equivalent + screen capture |
| MCP server management | MCPClient exists in CLI but no web UI |
| Code intelligence (axodex) | AxodexTools exists but /axodex page shows placeholder |
| Telegram bot | grammy integration exists but not exposed via web |

## Known Build / Lockfile Issues (Pre-existing)

These are NOT security regressions and do not block the production
build. Items marked **FIXED** are resolved as of the latest commit.

### 1. Root `npm ci` peer-dep materialization (FIXED)

The root `package.json` declares `@fraziym/axodex` as a mandatory
peer dependency (`peerDependenciesMeta."@fraziym/axodex".optional = false`).
The lockfile was previously generated with `--legacy-peer-deps`, so
the mandatory peer dep was NOT materialized as a `node_modules/@fraziym/axodex`
entry — plain `npm ci` failed with EUSAGE "Missing from lock file".

**Fix:** added `@fraziym/axodex`, `@fraziym/axovb`, `@fraziym/axotest`
to `devDependencies` (with exact versions that exist on the registry —
npm's prerelease semver resolution is strict about [major,minor,patch]
tuple matching, so `^0.1.1-beta.2` doesn't satisfy `0.1.2-beta.3`).
Regenerated `package-lock.json` with `npm install --package-lock-only`.

**Additional fix (the `--ignore-scripts` issue):** `@fraziym/axodex`
pulls in `tree-sitter-graphql@1.0.0`, which has a `binding.gyp` file
on disk. npm auto-runs `node-gyp rebuild` for any package with a
`binding.gyp` during `npm ci` (no `--ignore-scripts` flag). That
package's `binding.cc` uses the Node 12 V8 C++ API and fails native
compilation on Node 22+ (which AXONIZ requires for `node:sqlite`).

The previous workaround was `npm ci --ignore-scripts` — but that
BROKE all other packages that need their install scripts:
`sharp` (image processing), `node-llama-cpp` (downloads prebuilt
llama.cpp binaries), `systeminformation` (system metrics), and all
the `tree-sitter-*` grammar packages (which use `node-gyp-build`
to load prebuilt binaries for linux-x64 and win32-x64).

**The surgical fix:** added npm `overrides` in package.json:
```json
"overrides": {
  "tree-sitter-graphql": "file:scripts/tree-sitter-graphql-stub"
}
```
The stub at `scripts/tree-sitter-graphql-stub/` has no `binding.gyp`
and no install script — just a placeholder `index.js` that throws
when required. When axodex's parser-loader tries to load
tree-sitter-graphql, the throw is caught and axodex reports
"GraphQL parsing requires `tree-sitter-graphql`. Check the install."
— graceful degradation, no crash. AXONIZ does not parse `.graphql`
files in its own source tree, so losing the GraphQL grammar is a
no-op for AXONIZ's code-graph intelligence engine in practice.

**Result:** plain `npm ci` (no flags) works on both Linux and
Windows. All packages get their install scripts run normally.
sharp, node-llama-cpp, systeminformation, and the tree-sitter-*
grammar packages all use their prebuilt binaries (no source
compilation needed — the prebuilds cover linux-x64 and win32-x64).

> **Note (post-fix):** the web lockfile drift (missing `yjs`,
> `lib0`, `isomorphic.js`) is also fixed in this commit by regenerating
> `web/package-lock.json`.

### 2. Web `npm run typecheck:web` errors (FIXED — was 11 errors, now 0)

All 11 pre-existing typecheck errors were fixed in commit `883e88b`:

| File | Error (was) | Fix |
|------|-------------|-----|
| `src/app/api/axoniz/[...path]/route.ts:182` (5 occurrences) | `CpuInfo` has no `idle`, `user`, `nice`, `sys` | Read `cpus[0].times.idle` etc. (CpuInfo has nested `times: CpuTimes`) |
| `src/app/api/axoniz/providers/test/route.ts:77-80` (5 occurrences) | `{ id: string }` has no `pricing` | Widened the `models?: Array<{id}>` type to also include `context_length` and `pricing` (OpenAI's response includes these for some providers) |
| `src/components/axoniz/pages/chat.tsx:291` (1 occurrence) | `inline` prop doesn't exist on code component | react-markdown v10 removed `inline`; now detect block-vs-inline by presence of a `language-*` className |

Web typecheck now passes with **0 errors** (verified in CI).

### 3. Native compilation of `tree-sitter-graphql` (transitive of `@fraziym/axodex`) fails on Node 22+ (FIXED)

`@fraziym/axodex` pulls in `tree-sitter-graphql@1.0.0` which uses the
Node 12 V8 C++ API in its `binding.cc`. On Node 22+ the V8 API
signatures changed and `node-gyp rebuild` fails with a C++ compile
error.

**Fix:** npm `overrides` swaps `tree-sitter-graphql` with a local
stub at `scripts/tree-sitter-graphql-stub/` (no `binding.gyp`, no
install script, just a placeholder `index.js` that throws when
required). axodex's parser-loader catches the throw and reports
"GraphQL parsing requires `tree-sitter-graphql`. Check the install."
— graceful degradation. AXONIZ does not parse `.graphql` files,
so the impact is zero for AXONIZ's own functionality.

See section 1 above for the full story.

### 4. Tests require `build:cli` before `npm test`

The diagnostics tests import from `../dist/core/diagnostics.js`, so
`npm test` will fail with `ERR_MODULE_NOT_FOUND` unless
`npm run build:cli` is run first. This is by design (tests verify
compiled output) but should be documented in the test command's
help text or wired as a `pretest` script.

### 5. Minimum Node version is 22 (not 20)

`web/src/lib/axoniz/execution-manager.ts` imports
`{ DatabaseSync } from "node:sqlite"`, which is only available in
Node 22.5+. The `package.json` `engines.node` field has been updated
from `>=20.11` to `>=22` to reflect this. The CI matrix dropped the
Node 20.x leg accordingly — Node 20.x builds fail with
`ERR_UNKNOWN_BUILTIN_MODULE: No such built-in module: node:sqlite`
during `next build`'s "Collecting page data" step.

### 6. Test #10 and #18 cross-platform script-string bug (FIXED + VERIFIED)

The two fault-injection tests that fork child Node processes via
`execSync` previously used template-literal substitution of Windows
paths directly into a generated JS source string. Two layers of
Windows-specific bugs were uncovered by running the CI matrix:

**Layer 1 (commit 61fb0a5):** JS string-literal escape parsing
eats backslashes (`\U` → `U`, `\r` → CR, etc.), mangling
`process.env.HOME` so the child wrote to a non-existent path and
the parent's `readdirSync` failed with ENOENT. Fixed by calling
`JSON.stringify()` on the path/username values that get
interpolated into the script string AND passing the script via
`execSync`'s `input` option (stdin) instead of via
`-e "<escaped script>"`, sidestepping shell-quoting issues.

**Layer 2 (commit 78c4437):** After Layer 1, Windows moved from
0/28 → 26/28 passing. The remaining 2 tests failed with
`ERR_UNSUPPORTED_ESM_URL_SCHEME: ... Received protocol 'd:'`
because the child did `import("D:\\a\\AXONIZ\\...")` — Windows
ESM requires `file://` URLs for absolute paths, not bare path
strings (which Node parses as having scheme `d:`). Fixed by
converting the path to a `file://` URL via
`pathToFileURL(path).href` before interpolating it into the
child script.

**Verified across all 4 matrix legs (commit 78c4437, CI run
#38773214829):**

| OS | Node | Build | Tests |
|----|------|-------|-------|
| ubuntu-latest | 22.x | ✅ | ✅ 28/28 pass |
| ubuntu-latest | 24.x | ✅ | ✅ 28/28 pass |
| windows-latest | 22.x | ✅ | ✅ 28/28 pass |
| windows-latest | 24.x | ✅ | ✅ 28/28 pass |

CI: https://github.com/Akik-Forazi/AXONIZ/actions/runs/38773214829


