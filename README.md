# AXONIZ
### Autonomous Local Agentic System

**Version: `V00.01.000-beta-01`** · FRAZIYM versioning · `npm: @fraziym/axoniz@0.1.0-beta.1`

AXONIZ is a high-performance, 100% offline agentic framework designed to comprehend and orchestrate large-scale codebases using small-parameter local models (3B-8B).

By moving intelligence into the **Code Graph** and the **System Architecture**, Axoniz-Zero enables a 3B model to outperform cloud-based 70B models in precision, speed, and architectural depth.

## ⚔️ Absolute Super-Powers

### 1. Autonomous Inference Engine
- **Llama-Native:** Zero overhead. No Ollama, no LM Studio. Pure `llama.cpp` autonomousty.
- **Prompt Caching:** Instant responses via permanent KV-cache management.
- **Autonomous Vault:** Centralized GGUF management in `~/.axoniz/models`.
- **The Forge:** Built-in HuggingFace downloader to acquire new weights directly.

### 2. Axodex Graph (Code Intelligence)
- **Graph-Native Awareness:** Axoniz-Zero doesn't just read text; it queries a static code graph.
- **Project Atlas:** Automatic architectural scanning of million-line repos.
- **Intelligence Slices:** Surgical retrieval of symbols and their graph neighbors, saving thousands of tokens.

### 3. The Worker Swarm (Massive Parallelism)
- **Swarm Command:** Delegate heavy tasks (linting, testing, massive refactors) to a swarm of background worker shadows.
- **Proactive Sentinel:** A daemon that watches your screen (OCR) and files, delivering "Shadow Solutions" to terminal errors before you even ask.
- **Shadow-Step:** Speculative execution in safe git branches. Merges only when tests pass 100%.

### 4. The Eternal Palace (Autonomous Memory)
- **Long-Term Recall:** Persistent semantic memory via MemPalace.
- **System's Archive:** Every session scan and successful fix is archived forever.
- **Absolute Query:** A single strike to search both the current Code Graph and your entire project history.

### 5. Tactical Pursuit (Autonomous Goals)
- **OKR Engine:** Direct the Worker Swarm towards high-level objectives with `goal_create`.
- **Key Result Tracking:** Automatic score calculation for project milestones.
- **Drill Sergeant Briefings:** AXONIZ provides daily accountability reports on your mission progress.

### 6. Autonomous Infrastructure
- **Hardened Server:** Built-in JWT Auth, Rate Limiting, and Prometheus Metrics.
- **Observability:** Monitor agent performance and system health via the `/metrics` endpoint.
- **Offline Integrity:** 100% local, 100% private, 0% cloud.

## 🚀 Installation & Command

#
### Install from NPM registry in global


```powershell
# Install AXONIZ + axodex together (recommended — axodex is a peer dependency)
npm install -g @fraziym/axoniz @fraziym/axodex
```

#### OR install separately
```powershell
npm install -g @fraziym/axoniz
npm install -g @fraziym/axodex      # graph-powered code intelligence engine

# Or via the AXONIZ installer (runs the above npm install for you):
axoniz install axodex
```

> **Note**: As of v0.3.4, `axoniz install axodex` no longer clones the AXONIZ
> GitHub repo. It just runs `npm install -g @fraziym/axodex` — fast, no
> 30 MiB download, and the `axodex` binary lands on PATH correctly.
> The bundled axodex has been removed from the AXONIZ repo (was 5800+ files
> of overhead). axodex now lives at https://github.com/Akik-Forazi/axodex
> as its own standalone package, versioned and published independently.

### The Autonomous Bundle
Run the pre-built executable for the absolute experience:
```powershell
.\dist\axoniz.exe --lc
```

### Manual Setup
1. **Prepare the Vault:**
   ```powershell
   # Models live here: ~/.axoniz/models
   # llama.cpp lives here: ~/.axoniz/llama
   ```
2. **Boot the System:**
   ```powershell
   axoniz --web
   ```

## 🏰 Command Center (Web UI)
Access the **FRAZIYM AI Console** at `http://localhost:7860`:
- **The Vault:** Manage your local GGUF armory.
- **The Forge:** Search and download models from HuggingFace.
- **War Room:** Monitor the Worker Swarm's background activities.
- **Autonomous Search:** Bridge the graph and your memory.

**Developer Resources:**
- [Web UI Architecture & Provider Guide](docs/WEB_UI.md) — Full sitemap, 14-provider setup, real chat streaming architecture.
- [Web UI Roadmap](docs/WEB_ROADMAP.md) — What's done in v0.3.0, what's next for PEAK positioning.
- [`web-next/`](web-next/) — The new Next.js 16 dashboard (replaces the legacy `src/web/static/` UI).
- [Frontend Integration Guide](docs/FRONTEND_INTEGRATION.md) — Connect your UI to the Worker Swarm.
- [Architecture Overview](docs/ARCHITECTURE.md)
- [AAA Tier Roadmap](docs/ROADMAP_TO_AAA.md)

### The New Web Dashboard (v0.3.0)

The `web-next/` directory contains a brand-new Next.js 16 + TypeScript + Tailwind 4 dashboard that wires to every AXONIZ backend endpoint and **14 inference providers** out of the box:

- **Local:** llama.cpp, LM Studio, Ollama
- **Cloud:** OpenAI, OpenRouter, Google Gemini, Anthropic Claude, Groq, Together AI, Mistral, DeepSeek, Fireworks AI, Perplexity, Custom

The Test Connection button in Settings actually pings your configured endpoint server-side and returns the real list of loaded models. The Chat page actually streams real tokens from your real provider (no mock shells). Every action is real-backed with mock fallback for demo environments.

```bash
cd web-next
bun install
bun run dev   # http://localhost:3000
```

Pure monochrome dark design — no amber/gold/blue palette, no AI-template feel. Built to be the PEAK of agentic system UIs.

---
**"Absolute Loyalty. Lethal Precision. Zero Overhead."**

(c) 2026 AKIK FARAJI | Fraziym Tech & AI
Contact: akikfaraji@gmail.com
