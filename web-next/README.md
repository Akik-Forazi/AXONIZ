# AXONIZ Web UI — Next.js 16 Dashboard

Professional monochrome-dark dashboard for the AXONIZ agentic system. Replaces the legacy scraped `src/web/static/` UI with a purpose-built Next.js 16 + TypeScript + Tailwind 4 application that actually wires to every backend endpoint and every major inference provider.

## Sitemap (state-routed — URL hash deep-links)

```
/                                   → Login (auth-gated)
/chat                               → Single-turn Q&A, streaming tokens, model picker
/agent                              → Goal-pursuit: plan → execute → verify → report
/vault                              → Local GGUF armory
/forge                              → HuggingFace search + download
/war-room                           → Live Worker Swarm monitor
/palace                             → Eternal memory (wings/rooms/drawers + KG)
/axodex                             → Code graph (4843 symbols / 10982 rels / 300 flows)
/search                             → Absolute query (graph + memory)
/benchmarks                         → Perf dashboard (tok/s, p50, $/task)
/system                             → Health, telemetry, Prometheus
/settings                           → Settings index
  /settings/providers              → List of all 14 providers (local + cloud)
    /settings/providers/llamacpp
    /settings/providers/lmstudio
    /settings/providers/ollama
    /settings/providers/openai
    /settings/providers/openrouter
    /settings/providers/gemini
    /settings/providers/anthropic
    /settings/providers/groq
    /settings/providers/together
    /settings/providers/mistral
    /settings/providers/deepseek
    /settings/providers/fireworks
    /settings/providers/perplexity
    /settings/providers/custom
  /settings/runtime                 → n_ctx / n_gpu_layers / n_threads
  /settings/authority               → Persona, auth level, permission matrix
  /settings/voice                   → TTS / STT / wake word
  /settings/appearance              → Theme, density, motion
  /settings/session                 → Operator, vault home, sign out
```

## Architecture

The web UI is a Next.js 16 app that runs alongside the existing AXONIZ Express backend (`src/web/server.ts`, port 7860). It uses a typed API client + proxy routes to talk to the backend with mock fallback, so it works both during development (without the backend running) and in production (against the real AXONIZ backend).

```
Browser ──── /api/axoniz/<path> ────► Next.js API route
                                      │
                                      ├─► tries real backend at :7860
                                      │   (responses tagged x-axoniz-source: live)
                                      │
                                      └─► falls back to mock data
                                          (responses tagged x-axoniz-source: mock)
```

### Real provider integration

The Test Connection button in Settings actually pings the user's configured endpoint server-side and returns the real model list:

- **LM Studio, OpenAI, OpenRouter, Groq, Together, Mistral, DeepSeek, Fireworks, Perplexity, Custom** → `GET {baseUrl}/models` (OpenAI-compatible)
- **Anthropic** → `GET {baseUrl}/models` with `x-api-key` + `anthropic-version: 2023-06-01`
- **Gemini** → `GET {baseUrl}/models?key=…`
- **Ollama** → `GET {baseUrl}/api/tags`
- **llama.cpp** → `GET {baseUrl}/health`

The chat route (`/api/axoniz/chat`) actually streams tokens from the user's configured provider with provider-specific protocol handling:

- **OpenAI-compatible providers** → `POST {baseUrl}/chat/completions` with `stream: true`, parse OpenAI SSE deltas
- **Anthropic** → `POST {baseUrl}/messages` with `x-api-key`, parse `content_block_delta` events
- **Gemini** → `POST {baseUrl}/models/{model}:streamGenerateContent?alt=sse&key=…`, parse `candidates[].content.parts[].text`
- **Ollama** → `POST {baseUrl}/api/chat`, parse newline-delimited JSON `message.content`
- **llama.cpp** (server mode) → OpenAI-compatible `/v1/chat/completions`

All responses re-emitted as AXONIZ SSE events so the client parser stays uniform across providers.

## Run

```bash
cd web-next
bun install
bun run dev   # http://localhost:3000
```

To pair with the real AXONIZ backend (optional):

```bash
# In another terminal:
axoniz --web   # starts Express backend on :7860
# The proxy routes detect it and switch from mock to live data automatically.
```

Set `AXONIZ_BACKEND_URL` env var to override the default `http://127.0.0.1:7860`.

## Tech stack

- Next.js 16 (App Router, Turbopack)
- TypeScript 5 (strict)
- Tailwind CSS 4 (pure monochrome dark palette — no amber/gold/blue)
- shadcn/ui (New York style) + Lucide icons
- Zustand (client state, persisted to localStorage)
- TanStack Query (server state, polling intervals)
- Framer Motion (entrance animations — minimal, opacity-only)
- ReactMarkdown + react-syntax-highlighter
- Recharts (benchmarks + telemetry)
- next-themes (forced dark)

## File layout

```
src/
├── app/
│   ├── page.tsx                     ← renders AppRouter
│   ├── layout.tsx                   ← Theme + Query providers
│   ├── globals.css                  ← Pure monochrome dark palette
│   └── api/axoniz/                  ← Proxy routes
│       ├── [...path]/route.ts       ← Catch-all proxy with mock fallback
│       ├── chat/route.ts            ← Real streaming chat (14 providers)
│       ├── stream/route.ts          ← SSE event stream proxy
│       └── providers/test/route.ts  ← Real provider pinger
├── components/axoniz/
│   ├── app-router.tsx               ← State-based router
│   ├── top-bar.tsx sidebar.tsx      ← Shell
│   ├── event-rail.tsx               ← Right-side live SSE feed
│   ├── model-picker.tsx             ← Modal: pick provider + model
│   ├── login-screen.tsx
│   └── pages/                       ← One file per route
│       ├── chat.tsx agent.tsx       ← Separate Chat & Agent UX
│       ├── vault.tsx forge.tsx ...  ← Workspace pages
│       ├── axodex.tsx               ← Code graph viewer
│       ├── benchmarks.tsx           ← Perf dashboard
│       └── settings/                ← Settings sub-pages
│           ├── index.tsx providers.tsx
│           ├── provider-detail.tsx  ← Per-provider form + model list
│           ├── runtime.tsx authority.tsx voice.tsx
│           ├── appearance.tsx session.tsx
├── lib/axoniz/
│   ├── api-types.ts                 ← TypeScript contract for all endpoints
│   ├── client.ts                    ← Typed fetch wrappers
│   └── mock-data.ts                 ← Realistic demo responses
└── stores/axoniz-store.ts          ← Zustand (auth, route, providers, model picker)
```

## License

(c) 2026 Akik Faraji — Fraziym Tech & AI. Same license as the parent AXONIZ project.
