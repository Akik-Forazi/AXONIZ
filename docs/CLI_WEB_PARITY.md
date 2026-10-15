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
| Config: `~/.axoniz/config.json` | loadConfig/saveConfig | GET/POST /api/axoniz/config/cli | **PASS** — redacted on read |

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
build, but they should be fixed in a follow-up.

### 1. Root `npm ci` requires `--legacy-peer-deps`

The root `package.json` declares `@fraziym/axodex` as a mandatory
peer dependency (`peerDependenciesMeta."@fraziym/axodex".optional = false`),
but the lockfile does not materialize a `node_modules/@fraziym/axodex`
entry because it was generated with `--legacy-peer-deps`.

Result: plain `npm ci` fails with EUSAGE "Missing from lock file".
Workaround: `npm ci --legacy-peer-deps --ignore-scripts` works.

Fix path: either (a) add `@fraziym/axodex`, `@fraziym/axovb`,
`@fraziym/axotest` as devDependencies so they're materialized in the
lockfile, or (b) regenerate the lockfile without `--legacy-peer-deps`
and accept that `npm ci` will install peer deps automatically (npm 7+).

> **Note (post-fix):** the web-next lockfile drift (missing `yjs`,
> `lib0`, `isomorphic.js`) is fixed in this commit by regenerating
> `web-next/package-lock.json`. The root lockfile peer-dep issue
> remains because the fix requires a policy decision on the
> peerDependencies block.

### 2. Web `npm run typecheck:web` has 11 pre-existing errors

`web-next/next.config.ts` sets `typescript.ignoreBuildErrors: true`,
so `next build` succeeds despite these type errors. They are real
type errors in web source files, NOT masked by ambient declarations:

| File | Error |
|------|-------|
| `src/app/api/axoniz/[...path]/route.ts:178` | `CpuInfo` has no `idle`, `user`, `nice`, `sys` (5 occurrences) — the route reads CPU fields that the `systeminformation` types don't expose at the call site |
| `src/app/api/axoniz/providers/test/route.ts:77-80` | Object literal `{ id: string }` has no `pricing` (5 occurrences) — the route writes a `pricing` field onto a typed object that doesn't declare it |
| `src/components/axoniz/pages/chat.tsx:291` | `ClassAttributes<HTMLElement> & HTMLAttributes<HTMLElement> & ExtraProps` has no `inline` — likely a react-syntax-highlighter prop type mismatch |

These are independent of the CLI build pipeline; the CLI `typecheck`
passes with 0 errors after the `src/declarations.d.ts` removal.

### 3. Native compilation of `tree-sitter-graphql` (transitive of `@fraziym/axodex`) fails on Node 24

`@fraziym/axodex` pulls in `tree-sitter-graphql@1.0.0` which uses the
Node 12 V8 C++ API. On Node 24.x the API signatures have changed and
`node-gyp rebuild` fails. The CI and local installs use
`--ignore-scripts` to bypass native compilation; the axodex CLI
binary may not work fully until the upstream package is updated.

### 4. Tests require `build:cli` before `npm test`

The diagnostics tests import from `../dist/core/diagnostics.js`, so
`npm test` will fail with `ERR_MODULE_NOT_FOUND` unless
`npm run build:cli` is run first. This is by design (tests verify
compiled output) but should be documented in the test command's
help text or wired as a `pretest` script.

### 5. Minimum Node version is 22 (not 20)

`web-next/src/lib/axoniz/execution-manager.ts` imports
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


