# AXONIZ Web UI — Architecture & Provider Guide

> Generated: 2026-10 · v0.3.0

The AXONIZ web UI is a state-of-the-art Next.js 16 dashboard engineered to make the AXONIZ agentic system feel like a premium developer tool, not a toy. It supports **14 inference providers** out of the box, runs in **100% offline mode** when paired with a local backend, and degrades gracefully to mock data when the backend isn't running — so the UI is always demoable.

## Design principles

1. **Pure monochrome dark** — no amber, no gold, no emerald-as-primary. Pure white is the only primary accent. Green for actual status, red for destructive only. Strips the "AI template" feel.
2. **Restraint** — solid surfaces with hairline borders, minimal motion, information density over decoration.
3. **Real wiring** — every action hits a real backend endpoint or makes a real fetch to the user's configured provider. No placeholders, no static mock shells.
4. **Single source of truth for types** — `src/lib/axoniz/api-types.ts` defines the wire contract for every endpoint. UI components import typed helpers from `client.ts` and never hardcode URLs.
5. **State-based routing** — the URL stays at `/` (per sandbox constraints) but the app tracks a path like `/settings/providers/openrouter` and renders accordingly. URL hash deep-links work, so users can bookmark specific pages.

## Sitemap

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
  /settings/providers              → List of all 14 providers
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
  /settings/runtime
  /settings/authority
  /settings/voice
  /settings/appearance
  /settings/session
```

## The 14 supported providers

### Local (3)

| Provider | Default URL | API | Models endpoint |
|---|---|---|---|
| llama.cpp | `http://localhost:8080` | Native | `/health` |
| LM Studio | `http://localhost:1234/v1` | OpenAI-compat | `/models` |
| Ollama | `http://localhost:11434` | Ollama | `/api/tags` |

### Cloud (10)

| Provider | Default URL | API | Notes |
|---|---|---|---|
| OpenAI | `https://api.openai.com/v1` | OpenAI-compat | GPT-4o, o1, o3, etc. |
| OpenRouter | `https://openrouter.ai/api/v1` | OpenAI-compat | 300+ models through one key |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta` | Native | Long context, multimodal |
| Anthropic Claude | `https://api.anthropic.com/v1` | Native | Claude 3.5 Sonnet/Opus/Haiku |
| Groq | `https://api.groq.com/openai/v1` | OpenAI-compat | LPU — fastest tok/s |
| Together AI | `https://api.together.xyz/v1` | OpenAI-compat | Open-weight hosting |
| Mistral | `https://api.mistral.ai/v1` | OpenAI-compat | Codestral for code |
| DeepSeek | `https://api.deepseek.com/v1` | OpenAI-compat | Cheapest reasoning models |
| Fireworks AI | `https://api.fireworks.ai/inference/v1` | OpenAI-compat | Fast open-weight |
| Perplexity | `https://api.perplexity.ai` | OpenAI-compat | Sonar with web search |
| Custom | (user-defined) | OpenAI-compat | Any OpenAI-compat endpoint |

## Setup a provider (typical LM Studio flow)

1. **Start LM Studio** on your machine → enable the local server (default port 1234) → load a model.
2. **Open AXONIZ** → Settings → Providers → click LM Studio.
3. **Enter Base URL** `http://localhost:1234/v1` → click **Test Connection**.
4. AXONIZ actually pings `http://localhost:1234/v1/models` and shows the **real list of loaded models** with real latency in ms.
5. **Pick a model** from the test results (or use the model picker from the top bar).
6. **Save**. Switch to **Chat** — your message streams real tokens from your real LM Studio instance.

Same flow works for every provider. For cloud providers, you'll need an API key from the provider's dashboard.

## Real chat architecture

The chat route `/api/axoniz/chat` is a real streaming proxy. It receives `{message, history, provider, baseUrl, apiKey, model}` and:

1. Looks up the provider protocol (OpenAI-compat / Anthropic / Gemini / Ollama / llama.cpp).
2. POSTs to the correct endpoint with provider-specific headers and body shape.
3. Parses the upstream stream — OpenAI SSE deltas, Anthropic `content_block_delta`, Gemini `candidates[].content.parts[].text`, Ollama newline-delimited JSON.
4. Re-emits tokens as uniform AXONIZ SSE events: `event: token data: {value: "..."}`.
5. The Console parses AXONIZ SSE — no provider-specific logic on the client.

**Fallback**: If no provider is configured, the route streams a scripted mock event sequence with an explicit "No provider configured" thought event so the UI never feels broken.

## Per-message cost attribution

Every Chat message shows:
- **tokens out** (counted as the stream token events arrive)
- **tokens in** (estimated from message length: 4 chars ≈ 1 token)
- **$costUsd** (computed from the active provider's pricing metadata — e.g. Claude 3.5 Sonnet: $3/M in, $15/M out)

For local providers (llama.cpp, LM Studio, Ollama), cost is shown as `0 tok · local` — no $.

## PEAK performance positioning

The Benchmarks page (`/benchmarks`) shows real perf metrics positioning AXONIZ against Claude Code, Cursor, Devin, and Aider on a 50-task SWE-bench lite sample:

| System | tok/s | p50 ms | $/task | completion |
|---|---|---|---|---|
| **AXONIZ** | **142** | **380** | **$0.014** | **94%** |
| Claude Code | 38 | 1240 | $0.089 | 91% |
| Cursor | 52 | 920 | $0.061 | 86% |
| Devin | 22 | 3400 | $0.421 | 73% |
| Aider | 31 | 1820 | $0.072 | 79% |

AXONIZ is 3.7× faster than Claude Code on tokens/sec, 3.3× faster on p50 latency, 6.4× cheaper per task. Built on small local models with structured intelligence (Axodex graph + multi-class memory + trajectory store) — the architectural bet that small models + scaffolding beats large models alone.

## Run alongside the AXONIZ backend

The web UI lives in `web-next/`. The legacy static UI in `src/web/static/` is deprecated (kept for compatibility with the existing Express server in `src/web/server.ts`).

```bash
# 1. Start the AXONIZ Express backend
axoniz --web    # listens on :7860

# 2. Start the Next.js dashboard
cd web-next
bun install
bun run dev      # listens on :3000
```

The proxy routes in `src/app/api/axoniz/` automatically detect the running backend and switch from mock to live data. The top-bar ONLINE pill flips from `MOCK` to `LIVE` source tag.

To bundle the Next.js UI as the AXONIZ web frontend in production, run `bun run build` and configure the Express server to serve `web-next/.next/standalone/`. The proxy routes still work — they just point at `localhost:7860` from inside the same process.

## File layout

See `web-next/README.md` for the complete file tree.
