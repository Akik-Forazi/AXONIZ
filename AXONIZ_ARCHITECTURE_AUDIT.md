# AXONIZ Architecture Audit

## Verified Baseline (commit 7b74cd9 + working tree)

### Git State
- HEAD: `7b74cd9a` — "feat: durable execution system — tasks survive browser disconnect"
- Working tree: 10 modified files (docs, scripts, tests — unrelated to core changes)

### What Was Inspected

| Module | Path | Status |
|---|---|---|
| CLI Agent | `dist/core/agent.js` | PASS — `Agent.chatStream()` async generator, `Agent.run()` agent loop |
| Backend factory | `dist/core/backend/index.js` | PASS — `get_backend()` selects from 5 backend classes |
| Config | `dist/core/config.js` | PASS — `loadConfig()`/`saveConfig()` read/write `~/.axoniz/config.json` |
| Execution Manager | `web-next/src/lib/axoniz/execution-manager.ts` | PASS — 306 lines, SQLite, state machine, event journal |
| Execution Runner | `web-next/src/lib/axoniz/execution-runner.ts` | PASS — 87 lines, background runner, calls CLI Agent |
| CLI Bridge | `web-next/src/lib/axoniz/cli-bridge.ts` | PASS — `eval('require')` bypass, loads from dist/ |
| Chat Route | `web-next/src/app/api/axoniz/chat/route.ts` | PASS — submits durable execution, returns execution_id |
| Execution API | `web-next/src/app/api/axoniz/executions/` | PASS — 5 routes: list, get, events, stream, cancel |
| Config API | `web-next/src/app/api/axoniz/config/cli/` | PASS — reads/writes CLI's config.json, redacts secrets |
| Frontend Hook | `web-next/src/components/axoniz/zai-chat/use-chat-stream.ts` | PASS — rewritten to use execution_id + SSE reconnection |
| Boot Hook | `web-next/src/components/axoniz/boot.ts` | PASS — loads config from /api/axoniz/config/cli |
| Startup Recovery | `web-next/src/instrumentation.ts` | PASS — calls recoverOnStartup() on server start |

### Canonical Source of Truth

- **Provider config**: `~/.axoniz/config.json` (CLI's canonical file)
- **Execution state**: `~/.axoniz/db/executions.db` (SQLite)
- **Chat messages**: `~/.axoniz/db/chats/<id>.jsonl` (JSONL, append-only)
- **Diagnostic logs**: `~/.axoniz/logs/*.axolog`

### Duplicated Systems Found

| What | CLI | Web | Status |
|---|---|---|---|
| Provider catalog | `dist/core/backend/index.js` (5 classes) | `PROVIDER_CATALOG` in store (14 entries) | DUPLICATE — web should read from CLI |
| Config file | `~/.axoniz/config.json` | `~/.axoniz/db/config.json` | DUPLICATE — web should use CLI's file |
| Chat completion | `Agent.chatStream()` | Old `/api/axoniz/chat/route.ts` (554 lines) | REMOVED — now calls Agent via bridge |
| Model launch | `LlamaCppServerBackend.ensureServer()` | `/api/axoniz/models/launch/route.ts` | DUPLICATE — web should use CLI's backend |

### Remaining Duplicates

1. `PROVIDER_CATALOG` in `axoniz-store.ts` — 14 providers, should be replaced with metadata from CLI config
2. `~/.axoniz/db/config.json` — old web config, should be removed after migration
3. `/api/axoniz/models/launch/route.ts` — web's own llama-server spawn, should use CLI's `LlamaCppServerBackend`

## Test Results

| Test | Status | Evidence |
|---|---|---|
| Submit execution | PASS | Returns `{execution_id, state: "queued"}` |
| Execution persists | PASS | SQLite row with all fields |
| Runner completes | PASS | State transitions to `completed` |
| Event journal ordered | PASS | seq 1,2,3,4 |
| SSE stream | PASS | Replays events, closes on terminal |
| Config reads CLI's file | PASS | Returns 5 providers from `~/.axoniz/config.json` |
| API keys redacted | PASS | `"api_key":"[REDACTED]"` |
| Startup recovery | PASS | instrumentation.ts runs, 0 interrupted |
| Type-check | PASS | No errors in changed files |
| Real LLM generation | BLOCKED | No model configured in sandbox (`[ERROR] GGUF not found:`) |
