# AXONIZ — Product & Architecture Demo Handoff Brief

**Repository:** `https://github.com/Akik-Forazi/AXONIZ.git`
**Branch:** `main`
**Latest verified commit:** `6d917db`
**Version:** `0.1.8-beta.1`
**Document date:** 2026-10-19

---

## 1. Product Overview

AXONIZ is a **local-first AI agent system** — a developer tool that lets you run an AI agent with real tool-use (file operations, shell commands, web search, code analysis) from either a web dashboard or a terminal interface, using any LLM provider (local or cloud).

### What problem it solves

Most AI coding assistants are cloud-only SaaS. AXONIZ runs entirely on your machine. The agent can read your files, run shell commands, search the web, and modify code — all through your configured LLM provider (OrcaRouter, OpenAI, local llama.cpp, LM Studio, etc.).

### What makes it different from a chatbot

| Feature | Chatbot | AXONIZ |
|---|---|---|
| Tool execution | No | Yes — 72+ tools (file, shell, web, code, git, memory) |
| Provider choice | Fixed | 14 providers (local + cloud) |
| Agent loop | Single response | Multi-step with tool calls + tool results |
| Memory | Session-only | Persistent memory palace + knowledge graph |
| Interface | Web only | Web + terminal (Ink-based TUI) |
| Data residency | Cloud | Local — `~/.axoniz/` |

### Intended users

Developers who want an AI coding agent that runs locally, respects their privacy, and lets them choose any LLM provider.

---

## 2. Current Implementation Status

### Build status (verified 2026-10-19)

| Build | Command | Result |
|---|---|---|
| CLI (TypeScript) | `npx tsc -p tsconfig.json --noEmit` | 0 errors (strict mode) |
| TUI (TypeScript) | `npx tsc -p tsconfig.tui.json --noEmit` | 0 errors (strict, `noEmitOnError=true`) |

### Test status (verified 2026-10-19)

| Suite | Command | Result |
|---|---|---|
| E2E Agent Test | `npx tsx --test test/tui/e2e-agent.test.ts` | 5/5 pass |
| TUI Integration Test | `npx tsx --test test/tui/tui-integration.test.ts` | 3/3 pass |

---

## 3. Web App Architecture

### Framework

- **Next.js 16** (App Router, Turbopack)
- **React 19**, TypeScript, Tailwind CSS 4, shadcn/ui
- **Zustand** for state management (persisted to localStorage)
- Runs on port 7860 by default (`axoniz --web`)

### Route inventory (27 routes verified)

| Route | Purpose | Status |
|---|---|---|
| `/chat` | Main chat interface | ✅ Functional |
| `/chat/s/[id]` | Saved chat session | ✅ Functional |
| `/agent` | Agent task execution | ✅ Functional |
| `/agent/s/[id]` | Saved agent session | ✅ Functional |
| `/projects` | Project management | ✅ Functional |
| `/workflows` | Workflow editor (YAML) | ✅ Functional |
| `/logs` | Log viewer | ✅ Functional |
| `/event-stream` | Live event stream | ✅ Functional |
| `/vault` | Model vault browser | ✅ Functional |
| `/forge` | Model downloader | ✅ Functional |
| `/palace` | Memory palace viewer | ✅ Functional |
| `/axodex` | Code graph browser | ✅ Functional |
| `/search` | Semantic search | ✅ Functional |
| `/war-room` | Swarm/multi-agent | ✅ Functional |
| `/benchmarks` | Performance benchmarks | ✅ Functional |
| `/system` | System diagnostics | ✅ Functional |
| `/diagnostics` | Diagnostic sessions | ✅ Functional |
| `/servers` | Server management | ✅ Functional |
| `/settings` | Settings overview | ✅ Functional |
| `/settings/providers` | Provider config | ✅ Functional |
| `/settings/providers/[id]` | Provider detail | ✅ Functional |
| `/settings/appearance` | Theme picker | ✅ Functional |
| `/settings/runtime` | Runtime config | ✅ Functional |
| `/settings/authority` | Permission config | ✅ Functional |
| `/settings/voice` | Voice config | ✅ Functional |
| `/settings/session` | Session config | ✅ Functional |
| `/settings/devices` | Device management | ✅ Functional |

### Key web components

| File | Purpose |
|---|---|
| `web/src/app/(auth)/layout.tsx` | Root layout — TopBar + Sidebar + providers |
| `web/src/components/axoniz/sidebar.tsx` | Navigation (Chat, Agent, Projects, Workflows, etc.) |
| `web/src/components/axoniz/top-bar.tsx` | Top bar — model picker, status, approval mode |
| `web/src/components/axoniz/model-picker.tsx` | Model/provider selection modal |
| `web/src/components/axoniz/zai-chat/` | Chat UI (input, messages, markdown, streaming) |
| `web/src/components/axoniz/zai-chat/use-chat-stream.ts` | SSE streaming hook (EventSource per execution) |
| `web/src/components/axoniz/chat-stream-provider.tsx` | Singleton EventSource owner |
| `web/src/components/axoniz/event-stream-provider.tsx` | Global event stream singleton |
| `web/src/components/axoniz/approval-dialog.tsx` | Tool approval prompt |
| `web/src/stores/axoniz-store.ts` | Zustand store (providers, model, theme, approvals) |

### Web API routes (30+ verified)

| Endpoint | Purpose |
|---|---|
| `POST /api/axoniz/chat` | Submit chat → creates execution → streams SSE |
| `POST /api/axoniz/agent/exec` | Run full agent loop (agent.run()) |
| `GET /api/axoniz/executions/[id]/stream` | SSE event stream for an execution |
| `GET /api/axoniz/chats` | List saved chats |
| `POST /api/axoniz/v2/provider/activate` | Switch provider (writes config, kills local model) |
| `GET /api/axoniz/models/local` | List local .gguf models |
| `POST /api/axoniz/models/launch` | Launch llama-server with a .gguf |
| `GET /api/axoniz/v2/[...path]` | V2 catch-all (projects, workflows, runs, etc.) |
| `GET /api/axoniz/config/cli` | Read ~/.axoniz/config.json |

### Web styling

- **Theme system:** Shadow Monarch (default — void-purple-black + monarch violet `#A855F7`)
- CSS variables in `globals.css`, `[data-theme="..."]` selector
- Glassmorphism (`.glass`), elevation shadows (`.elev-1/2/3`), 150ms cubic-bezier transitions
- Inter + JetBrains Mono fonts

### Web auth boundary

Local-first: localhost auto-trusted (invisible). Non-localhost requires device cookie. Set `AXONIZ_REQUIRE_AUTH=true` for JWT tokens.

---

## 4. CLI & TUI Architecture

### CLI entry point

- **File:** `src/cli/entry.ts` → compiled to `dist/cli/entry.js`
- **Bin:** `axoniz` → `./dist/cli/entry.js`
- **Modes:** `--lc` (REPL), `--cli` (one-shot), `--web` (dashboard), `--goal` (autonomous)
- **Subcommands:** `serve` (Hono HTTP), `attach` (remote connect), `mcp-server` (MCP stdio)
- **Runtime:** `src/core/runner.ts` (926 lines) — arg parser + agent bootstrapper

### CLI banner + rendering

- `src/core/cli.ts` (1500+ lines) — banner, prompt, printResponse, spinner, slash commands
- `src/core/cli-ui.ts` — separate rendering primitives (filled-block ASCII art, semantic theme)
- Stderr noise filter in `entry.ts` — suppresses node-llama-cpp warnings

### TUI (terminal UI)

- **Framework:** Ink (React for terminal) + React 19
- **Files:** 4 source files, ~760 lines total
- **Entry:** `src/tui/entry.tsx` → `dist/tui/entry.js`
- **Launch:** `node dist/tui/entry.js --provider orca` (or `--test-mode`)

| File | Lines | Purpose |
|---|---|---|
| `src/tui/App.tsx` | 388 | Root component — input, messages, spinner, footer, markdown |
| `src/tui/lib/agent-bridge.ts` | 135 | Loads AXONIZ Agent from `dist/`, provider catalog |
| `src/tui/lib/slash-commands.ts` | 217 | Slash command dispatcher (real agent methods) |
| `src/tui/entry.tsx` | 19 | `render(<App/>)` entry point |

### TUI features

| Feature | Status | Implementation |
|---|---|---|
| Live input box | ✅ | `useInput` — char-by-char, backspace, Esc |
| Slash autocomplete | ✅ | Dropdown, arrow nav, Enter/Tab |
| Streaming responses | ✅ | `agent.run()` → `onToken` callback → React state |
| Tool call display | ✅ | `onToolCall` → `✓ tool_name` (green) |
| Tool result display | ✅ | `onToolResult` → 100-char preview |
| Step counter | ✅ | `onStep` → footer `step 2/5` |
| Markdown rendering | ✅ | `**bold**`, `code`, fenced blocks, bullets, headings |
| Spinner | ✅ | Braille dots `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` @ 80ms |
| Footer | ✅ | `◈ provider/model · tokens · elapsed · step` |
| Error display | ✅ | `[ERROR]` → red text |
| Exit | ✅ | `exit` or Ctrl-C |

### TUI slash commands (all wired to real agent methods)

| Command | Real agent call |
|---|---|
| `/help` | Static text |
| `/models` | `distRequire("core/models.js").REGISTRY` + vault scan |
| `/use <name>` | `agent.switchModel(name)` + `saveConfig()` |
| `/providers` | Reads `agent.config.llm.providers` |
| `/switch <p>` | `agent.switchBackend(p)` + kills local model + saves config |
| `/tools` | `agent.availableTools` getter |
| `/health` | `agent.health()` |
| `/config` | Reads `agent.config` |
| `/history` | `agent.history.getSession()` |
| `/clear` | Clears messages |
| `/reset` | `agent.reset()` |
| `/exit` | `useApp().exit()` |

### TUI test mode

`--test-mode` flag → uses `InlineTestBackend` (mock LLM returning pre-scripted tool_call responses). Real tools execute on real filesystem. The mock returns 7 responses simulating a "find and fix the bug" task.

---

## 5. Agent Runtime & Tool Execution Flow

### Agent class

- **File:** `src/core/agent.ts` (1861 lines)
- **Constructor:** `new Agent(config)` — sets up tools, memory, backend, daemon

### Key methods

| Method | Purpose |
|---|---|
| `agent.run(task)` | Full agent loop with tools — calls `runNative()` |
| `agent.chatStream(message)` | Async generator yielding tokens (no tools) |
| `agent.chat(message)` | Blocking chat (returns full string) |
| `agent.exec(name, args)` | Direct tool execution |
| `agent.switchBackend(provider)` | Switch provider live |
| `agent.switchModel(name)` | Switch model live |
| `agent.health()` | Health check |
| `agent.reset()` | Clear conversation |
| `agent.availableTools` | Getter — 72+ tool schemas |

### Callbacks (wired to TUI)

| Callback | Fires when | TUI renders |
|---|---|---|
| `onToken(tok)` | Each streamed token | Appends to assistant message |
| `onToolCall(name, args)` | Before tool executes | `✓ tool_name` indicator |
| `onToolResult(name, result)` | After tool returns | Result preview |
| `onStep(step, total)` | Start of each step | Footer `step N/M` |
| `onThought(content)` | Agent reasoning | `◐ preview` (dim) |
| `onDone()` | Task complete | Removes `▋` cursor |

### Tool-calling loop (`runNative`)

```
1. agent.run(task) → SystemScan() → history.append("user", task)
2. runNative(messages):
   loop (max 30 steps):
     response = llm.complete(messages)  ← sends tools[] in payload
     if isToolCallResponse(response):
       for each tool_call:
         onToolCall(name, args)
         result = exec(name, args)  ← REAL tool execution
         onToolResult(name, result)
         push assistant message with tool_calls
         push tool message with tool_call_id
       continue loop
     else:  // text response
       onToken(text)
       if isDone(text): return
       push assistant message
       push "Continue. Use a tool, or call done() if finished."
```

### Backend providers

| File | Provider | Tool Calls |
|---|---|---|
| `src/core/backend/openai.ts` | OpenAI-compatible (OrcaRouter, OpenAI, Groq, etc.) | ✅ `payload.tools` + `tool_choice: "auto"` + parses `message.tool_calls` |
| `src/core/backend/llamacpp.ts` | Direct GGUF (node-llama-cpp) | ⚠️ Native tool support via model templates |
| `src/core/backend/lmstudio.ts` | LM Studio (OpenAI-compatible) | ✅ Via OpenAI backend |
| `src/core/backend/ollama.ts` | Ollama | ⚠️ Partial |

### Tool registry (72+ tools)

| Category | Tools |
|---|---|
| File | `file_read`, `file_write`, `file_edit`, `file_delete`, `file_list`, `file_search`, `file_append` |
| Shell | `shell_run`, `shell_python` |
| Web | `web_get`, `web_search` |
| Code | `code_lint`, `code_format`, `code_tree`, `code_analyze` |
| Git | `git_status`, `git_diff`, `git_log`, `git_add`, `git_commit`, `git_branch`, `git_checkout`, `git_push`, `git_pull`, `git_stash` |
| Memory | `memory_save`, `memory_get`, `memory_list`, `palace_search`, `palace_store`, `palace_context`, `palace_wings`, `kg_add`, `kg_query`, `kg_invalidate`, `kg_timeline`, `kg_stats`, `diary_write`, `diary_read` |
| Code Intelligence | `axodex_query`, `axodex_context`, `axodex_smart_read`, `axodex_impact`, `axodex_detect_changes`, `axodex_status`, `axodex_analyze` |
| Swarm | `swarm_spawn`, `shadow_step`, `war_room`, `absolute_query` |
| Desktop | `mouse_move`, `mouse_click`, `key_type`, `key_press`, `screen_size`, `screen_capture`, `screen_find` |
| Goals | `goal_create`, `goal_list`, `goal_kr_add`, `goal_action_add`, `goal_update_score`, `goal_action_complete`, `goal_report` |
| Misc | `get_time`, `done`, `optimize_hardware` |

### Config & persistence

| Path | Purpose |
|---|---|
| `~/.axoniz/config.json` | Main config (provider, model, tools, agent settings) |
| `~/.axoniz/models/` | Downloaded GGUF models |
| `~/.axoniz/palace/` | Memory palace data |
| `~/.axoniz/knowledge_graph.sqlite3` | Knowledge graph |
| `~/.axoniz/history/` | Chat history (JSONL + meta) |
| `~/.axoniz/mcp.json` | MCP server config |
| `~/.axoniz/grants.json` | File-access grants |

### Provider catalog (14 providers)

| Provider | Category | API Key | Default Base URL |
|---|---|---|---|
| `llamacpp` | Local | No | — |
| `lmstudio` | Local | No | `http://localhost:1234/v1` |
| `ollama` | Local | No | `http://localhost:11434` |
| `openai` | Cloud | Yes | `https://api.openai.com/v1` |
| `openrouter` | Cloud | Yes | `https://openrouter.ai/api/v1` |
| `orca` | Cloud | Yes | `https://api.orcarouter.ai/v1` |
| `anthropic` | Cloud | Yes | `https://api.anthropic.com/v1` |
| `groq` | Cloud | Yes | `https://api.groq.com/openai/v1` |
| `together` | Cloud | Yes | `https://api.together.xyz/v1` |
| `mistral` | Cloud | Yes | `https://api.mistral.ai/v1` |
| `deepseek` | Cloud | Yes | `https://api.deepseek.com/v1` |
| `fireworks` | Cloud | Yes | `https://api.fireworks.ai/inference/v1` |
| `perplexity` | Cloud | Yes | `https://api.perplexity.ai` |
| `custom` | Cloud | Yes | (user-configured) |

---

## 6. Important Source Paths

| Path | Purpose |
|---|---|
| `src/cli/entry.ts` | CLI entry point (stderr filter + main()) |
| `src/core/runner.ts` | Arg parser + agent bootstrapper (926 lines) |
| `src/core/agent.ts` | Agent class — run(), chatStream(), exec(), callbacks (1861 lines) |
| `src/core/config.ts` | Config loader (~/.axoniz/config.json) |
| `src/core/backend/openai.ts` | OpenAI-compatible backend with tool_calls support |
| `src/core/backend/types.ts` | Backend interface + CompletionResult (text/tool_calls) |
| `src/core/tool_schemas.ts` | JSON schema for all 72+ tools |
| `src/tools/file_tools.ts` | FileTools (read, write, edit, list, search) |
| `src/tools/shell_tools.ts` | ShellTools (run, python) |
| `src/tools/code_tools.ts` | CodeTools (lint, format, tree, analyze) |
| `src/core/history.ts` | ChatHistory (JSONL persistence + session management) |
| `src/core/memory.ts` | UnifiedMemory (palace + KG + diary) |
| `src/tui/App.tsx` | TUI root component (388 lines) |
| `src/tui/entry.tsx` | TUI entry point |
| `src/tui/lib/agent-bridge.ts` | Agent loader + provider catalog |
| `src/tui/lib/slash-commands.ts` | Slash command dispatcher |
| `web/src/app/(auth)/layout.tsx` | Web layout root |
| `web/src/components/axoniz/sidebar.tsx` | Web navigation |
| `web/src/components/axoniz/zai-chat/` | Web chat UI components |
| `web/src/lib/axoniz/cli-bridge.ts` | Web→CLI bridge (eval('require') from dist/) |
| `web/src/lib/axoniz/event-bus.ts` | In-memory pubsub for instant SSE streaming |
| `web/src/lib/axoniz/execution-manager.ts` | Execution lifecycle (SQLite + event bus) |
| `web/src/stores/axoniz-store.ts` | Zustand store (providers, model, theme, approvals) |

---

## 7. Build & Test Commands

### Build

```bash
# CLI build (TypeScript → dist/)
npm run build:cli

# TUI build (separate tsconfig, strict, noEmitOnError=true)
npx tsc -p tsconfig.tui.json

# Web build
npm run build:web

# Full build
npm run build
```

### Run

```bash
# CLI REPL
node dist/cli/entry.js --lc --provider orca

# Web dashboard
node dist/cli/entry.js --web

# TUI (terminal)
node dist/tui/entry.js --provider orca

# TUI test mode (mock LLM, real tools)
node dist/tui/entry.js --test-mode --workspace /tmp/fixture

# One-shot task
node dist/cli/entry.js --cli "Find and fix the bug in calculator.js"
```

### Test

```bash
# E2E agent test (agent.run() with MockBackend)
npx tsx --test test/tui/e2e-agent.test.ts
# Result: 5/5 pass

# TUI integration test (real PTY terminal)
npx tsx --test test/tui/tui-integration.test.ts
# Result: 3/3 pass

# Existing tests
npx tsx --test test/diagnostics.test.ts
npx tsx --test test/logger-fault-injection.test.ts
```

### Environment variables

| Variable | Purpose | Required |
|---|---|---|
| `ORCA_API_KEY` | OrcaRouter API key | Only for orca provider |
| `OPENAI_API_KEY` | OpenAI API key | Only for openai provider |
| `AXONIZ_DEBUG` | Enable debug logging | No |
| `FORCE_COLOR` | Force ANSI colors | No (auto-detected) |
| `TERM` | Terminal type | No (auto-detected) |

---

## 8. Capability Matrix

| Capability | Status | Notes |
|---|---|---|
| CLI REPL | ✅ Implemented | `--lc` mode, slash commands, tool calls |
| CLI one-shot | ✅ Implemented | `--cli "task"` |
| Web dashboard | ✅ Implemented | 27 routes, Next.js 16 |
| TUI (Ink) | ✅ Implemented | 4 source files, agent.run() with tools |
| Provider switching | ✅ Implemented | 14 providers, live switch |
| Model switching | ✅ Implemented | `/use` + `/switch` commands |
| Tool execution | ✅ Implemented | 72+ tools, real filesystem I/O |
| Streaming | ✅ Implemented | chatStream() (TUI) + SSE (web) |
| Markdown rendering | ✅ Implemented | TUI: inline + code blocks. Web: full |
| Tool call display | ✅ Implemented | TUI: ✓/✗ indicators. Web: tool_call events |
| Cancellation | ⚠️ Partial | Ctrl-C clears input; agent.abort() not fully wired |
| Session persistence | ⚠️ Partial | History JSONL exists; TUI doesn't resume sessions |
| Memory palace | ✅ Implemented | `palace_search`, `palace_store`, `palace_context` |
| Knowledge graph | ✅ Implemented | `kg_add`, `kg_query`, `kg_timeline` |
| Multi-agent/swarm | ✅ Implemented | `swarm_spawn`, `shadow_step` |
| MCP host | ⚠️ Partial | McpHost class exists; 10 server stubs; not fully wired to agent |
| Hono HTTP backend | ⚠️ Partial | Server + 6 routes; `axoniz serve` command; not production-ready |
| Workflows (YAML) | ✅ Implemented | 10 tools, sequential runner, JSONL logging |
| Voice (TTS/STT) | ⚠️ Partial | Edge TTS + Whisper modules; not wired to TUI |
| Browser automation | ⚠️ Partial | Playwright browser-mgr; 4 API routes; not wired to agent |
| Office doc generation | ⚠️ Partial | PPTX/DOCX/XLSX routes; not wired to agent |
| Approval prompts | ⚠️ Partial | Zustand store + approval-dialog.tsx; not enforced in TUI |
| Real provider test | ❌ Not tested | No API key in sandbox; mock-only |
| Windows CI | ❌ Not tested | Linux-only in sandbox |
| Terminal resize | ❌ Not tested | No handling verified |
| Multiline paste | ❌ Not tested | Single-line input only |

---

## 9. Known Risks & Limitations

1. **No real-provider verification.** All tests use MockBackend. Real LLM behavior (tool-call decisions, response quality, error handling) is untested.
2. **Process lifecycle.** The daemon and file watcher can keep the TUI process alive after "exit". Background timers may prevent clean shutdown.
3. **Input handling.** Rapid keystrokes can be lost due to React state batching. The fix (`setInput(prev => ...)`) works but requires slow typing in PTY tests (150ms/char).
4. **No Windows CI.** Terminal raw mode, ANSI codes, and path handling are untested on Windows.
5. **MCP integration is stubbed.** The McpHost class and 10 MCP server files exist but are not wired into the agent's tool registry.
6. **Hono HTTP backend is partial.** Server + 6 routes + schemas exist but are not the primary runtime path.
7. **No session resume in TUI.** History is persisted (JSONL) but the TUI doesn't load past sessions on startup.
8. **No scrollback in TUI.** Long conversations scroll off-screen with no way to navigate back.

---

## 10. Recommended Demo Scope

### What to demo (no API key needed)

Use `--test-mode` which injects a mock LLM backend that returns pre-scripted tool_call responses. The agent's tool-calling loop, tool execution, and filesystem modifications are all real.

**Demo scenario:** "Find and fix the bug in the calculator"

1. Create a fixture: `calculator.js` with a deliberate bug (`multiply` returns `a + b` instead of `a * b`)
2. Create `test.js` with 5 tests (4 pass, 1 fails on multiply)
3. Launch: `node dist/tui/entry.js --test-mode --workspace /tmp/calc-fixture`
4. Type `hi` + Enter
5. Watch the agent:
   - Call `file_list` → see project structure
   - Call `file_read` → read calculator.js
   - Call `shell_run` → run tests (4/5 pass)
   - Call `file_edit` → fix the bug
   - Call `shell_run` → run tests (5/5 pass)
   - Return "Found and fixed the bug" text response
6. Independently verify: `node test.js` → `5/5 passed`

**What this proves:**
- The TUI accepts user input
- The agent runtime starts and runs
- Real tools execute (file I/O, shell commands)
- Tool calls and results are visible in the terminal
- Filesystem is actually modified
- Tests pass after the fix
- The agent continues through dependent steps

### What requires a real API key

- Real LLM decision-making (which tool to call, what args to pass)
- Real streaming text generation
- Real error recovery from provider failures
- Real model-specific behavior (different models make different decisions)

### Demo boundary

A mock-mode demo proves the **integration** is correct (TUI → agent → tools → results → TUI). It does not prove the **intelligence** is real (the LLM's decisions are scripted). Both should be clearly labeled.

---

## Summary of Findings

### What's solid
- The agent runtime (`agent.ts`, 1861 lines) has a real tool-calling loop with proper OpenAI tool_calls format
- The OpenAI-compatible backend passes `tools` in the payload and parses `tool_calls` from responses
- 72+ real tools execute on the real filesystem
- The TUI (4 files, ~760 lines) uses Ink correctly with `agent.run()` + all 6 callbacks wired
- 8/8 automated tests pass (5 E2E + 3 TUI integration via PTY)
- TypeScript builds with 0 errors in strict mode

### What's not verified
- Real provider behavior (no API key in sandbox)
- Windows compatibility (Linux-only testing)
- Terminal resize, multiline paste, scrollback
- Cancellation actually stopping work
- MCP integration with real MCP servers
- Hono HTTP backend serving real traffic

### What's absent
- No CI/CD pipeline
- No session resume in TUI
- No approval enforcement in TUI (approval-dialog exists in web only)
- No diff viewer for file changes
- No voice integration in TUI
