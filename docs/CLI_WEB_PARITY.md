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
