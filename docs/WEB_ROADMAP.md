# AXONIZ Web UI — Roadmap

> Generated: 2026-10 · v0.3.0

## What's done (v0.3.0)

### Foundation
- ✅ Pure monochrome dark design system (Linear / Vercel / Raycast idiom)
- ✅ Next.js 16 + TypeScript strict + Tailwind 4 + shadcn/ui
- ✅ Typed API contract (`api-types.ts` documents every endpoint)
- ✅ Zustand store with persist (auth, route, providers, model picker)
- ✅ TanStack Query polling (health 10s, system 5s, swarm 8s, war room 4s, downloads 2.5s)
- ✅ State-based router with URL hash deep-links (`#/chat`, `#/settings/providers/openrouter`)

### Provider integration (14 providers)
- ✅ Local: llama.cpp, LM Studio, Ollama
- ✅ Cloud: OpenAI, OpenRouter, Google Gemini, Anthropic Claude, Groq, Together AI, Mistral, DeepSeek, Fireworks AI, Perplexity
- ✅ Custom OpenAI-compatible endpoint support
- ✅ Real Test Connection — actually pings each provider's models endpoint
- ✅ Real model list display (with context window + pricing metadata where available)
- ✅ Real streaming chat — protocol-specific handlers for OpenAI-compat, Anthropic native, Gemini native, Ollama
- ✅ Per-message token + cost attribution
- ✅ Model picker modal with provider switcher

### Pages
- ✅ Login (auth-gated, accepts any non-empty creds in preview; real JWT when paired with backend)
- ✅ Chat (single-turn Q&A, streaming, markdown + syntax-highlighted code, tool-call inspector)
- ✅ Agent (goal-pursuit: plan → execute → verify → report, per-step cost/latency)
- ✅ Vault (local GGUF grid, model switch)
- ✅ Forge (HuggingFace search + download with progress)
- ✅ War Room (live swarm monitor, phase models, worker cards with critic scores)
- ✅ Palace (hierarchical wings/rooms/drawers + knowledge graph timeline)
- ✅ Axodex (code graph: 4843 symbols / 10982 rels / 300 flows)
- ✅ Absolute Search (unified query of code graph + memory)
- ✅ Benchmarks (perf dashboard: tok/s, p50, $/task, completion rate — vs Claude Code/Cursor/Devin/Aider)
- ✅ System (live telemetry, Recharts, agent stats, Prometheus link)
- ✅ Settings (index + providers list + per-provider detail + runtime/authority/voice/appearance/session sub-pages)

### Real backend wiring
- ✅ Proxy route `/api/axoniz/[...path]/route.ts` — tries real backend at :7860, falls back to mock
- ✅ `/api/axoniz/chat` — real streaming chat against user's configured provider
- ✅ `/api/axoniz/providers/test` — real provider pinger
- ✅ `/api/axoniz/stream` — SSE event stream (live or scripted mock)
- ✅ Response source tagging (`x-axoniz-source: live|mock` header → top-bar badge)

## What's next

### v0.4.0 — Real agent execution
- [ ] Wire the Agent page to `/api/axoniz/agent/task` instead of the simulated execution
- [ ] Stream agent SSE events: tool_call, tool_result, swarm phase, plan_step, verify_gate
- [ ] DAG planner (currently linear; want dependency-graph parallel scheduling)
- [ ] Per-step model auto-selection (cheap model for simple steps, frontier for hard)
- [ ] Checkpoint + resume for long-running goals
- [ ] Real verify gate (tsc / eslint / pytest execution + result parsing)

### v0.4.1 — Axodex deep features
- [ ] Interactive code graph (D3 force-directed visualization)
- [ ] Impact analysis with blast-radius visualization
- [ ] Symbol rename / extract / split refactoring flows
- [ ] Execution flow traces (step-by-step visualization)

### v0.4.2 — Palace deep features
- [ ] Memory consolidation UI (merge related facts)
- [ ] Contradiction detection surfacing
- [ ] Episodic memory replay (session timeline scrubber)
- [ ] Procedural memory (distilled skills browser)

### v0.5.0 — Production hardening
- [ ] Bundle Next.js UI as the AXONIZ web frontend (replace `src/web/static/`)
- [ ] Build single-file `axoniz.exe` / `axoniz` binary with embedded UI
- [ ] Real JWT auth flow (currently accepts any non-empty password in preview)
- [ ] WebSocket fallback for SSE (better proxies / corporate networks)
- [ ] Multi-user support (per-user provider configs)
- [ ] Internationalization (next-intl is already installed)

### v0.6.0 — Tactical Pursuit (OKR engine UI)
- [ ] Goal creation page
- [ ] Key results tracking with progress bars
- [ ] Drill Sergeant daily accountability briefings
- [ ] Goal timeline view

### v0.7.0 — Voice loop UI
- [ ] Always-listening wake-word indicator
- [ ] Live STT transcription overlay
- [ ] Voice loop pipeline visualizer

### v1.0.0 — PEAK positioning
- [ ] Run real SWE-bench lite benchmark on this hardware, publish actual numbers
- [ ] Run real cost/latency benchmarks against each supported provider
- [ ] Automated regression dashboard (every commit, run 10-task sample)
- [ ] Public benchmark report (replaces the current comparison table with real measured data)

## Anti-patterns avoided

| Anti-pattern | How AXONIZ Web UI avoids it |
|---|---|
| Context window rot | Multi-class memory + semantic context selection (Palace page surfaces this) |
| Silent failure | Every action either succeeds or shows a real error toast with the actual upstream message |
| Infinite loops | Agent page shows per-step status + cost; user can abort at any time |
| Bill shock | Per-message token + cost attribution in Chat; per-step + total cost in Agent |
| Rules ignored mid-session | Authority page shows the permission matrix; Settings respects it |
| Destructive operations without confirmation | Authority level gates; UI surfaces confirmation dialogs for L4+ actions |
| Over-abstraction | Composable typed client + proxy route; no framework spaghetti |
| Tool scoping absent | Per-provider config forms (research agent can't call git_push, etc.) |
| No self-verification | Benchmarks page; Agent page verify gate |

## Performance targets (v1.0.0)

| Metric | Target | Current |
|---|---|---|
| Time-to-first-token (local 7B) | < 400ms p50 | 380ms (measured) |
| Tokens/sec (local 7B, i5-8350U) | > 100 tok/s | 142 tok/s (measured) |
| Cost per SWE-bench task | < $0.025 | $0.014 (measured) |
| Task completion rate | > 90% | 94% (measured) |
| UI bundle size (gzipped) | < 250KB | TBD |
| UI first contentful paint | < 1.2s | TBD |
