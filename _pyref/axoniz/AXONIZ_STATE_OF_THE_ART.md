# AXONIZ: State of the Art (May 2026)

## Project Overview
**AXONIZ** (formerly Axonix) is a next-generation, high-performance local AI agent architecture. It is designed to be "Shadow Monarch Level"—ruthlessly efficient, proactively loyal, and capable of direct system-level execution with minimal overhead.

## Recent Upgrades & Implementation (Phase 7 Complete)

### 1. Identity & Persona: BERU
- **Persona:** The agent now operates under the **BERU** persona (Shadow Monarch's Marshal).
- **Core Traits:** Absolute loyalty, ruthless efficiency, proactive intent, and zero-apology execution.
- **Config:** Managed via `axoniz/roles/beru.yaml` and a dynamic `PersonaEngine`.

### 2. The Reflex System: Shadow Guard
- **Engine:** `axoniz/core/intelligence/reflex.py`
- **Low-Memory Tier:** A high-speed heuristic layer that detects common intents (browser, editor, screenshots, system info) and executes them **instantly without loading heavy LLM weights**.
- **Standby Mode:** AXONIZ now starts in a "Standby" state, consuming ~150MB RAM. The full LLM (Ollama/LlamaCpp/etc.) is only deployed when a complex command requires deep reasoning.

### 3. Execution Tools: AXONIZ-ULTRA
- **ComputerTools:** Direct GUI interaction (mouse control, keyboard typing, screen OCR, screenshots).
- **BackendOptimizer:** Hardware-aware tuning. Detects CPU cores, RAM, and GPU to automatically configure thread counts, context size, and GPU offloading layers for peak local speed.
- **Authority Engine:** A safety-critical gating system that audits and approves/denies actions based on risk levels (Read, Write, Execute, Dangerous).

### 4. Memory & Reasoning
- **Unified Memory:** Integration of Semantic Memory, Knowledge Graph, and a "Palace" long-term storage Wing/Room system.
- **AST Indexing:** Proactive codebase mapping for surgical code edits and impact analysis.
- **Self-Correction:** Live error detection and automated trajectory recovery.

## Technical Configuration
- **Root Directory:** `C:\Users\akikf\programing\nn`
- **Main Entry:** `axoniz_main.py`
- **Audit Log:** `axoniz_audit.jsonl` (All autonomous actions recorded here).

## Integration Notes
- **TTS/Voice:** The project is prepared for advanced TTS integration (including MMS-TTS context). It uses an earcon-based feedback system for low-latency voice interaction.
- **Backend:** 100% sovereign GGUF running via local Llama.cpp (in-process via `llama-cpp-python` or remote via `llama-server`) with native tool-calling template support.
- **Model Forge:** Full click-to-install HuggingFace suggestion UI and download pipeline built into the web dashboard settings.

## NEW integrations to implement
- **Harmes:** This Project will also get integrated Harmes agent for project specific tasks, not the real full harmes but taking key modules to improve reasoning so axoniz makes smaller local models perform at superintelligence tiers.
- **gemini-cli-derived subagent architecture (2026-07-05):** Full comparison and port plan in `AXONIZ_SUBAGENT_UPGRADE.md`. Short version: adopt gemini-cli's formal `AgentDefinition` schema and per-agent tool scoping (the current `specialized.py` agents inherit the entire ~80-tool arsenal with no scoping at all — the single biggest gap found), plus a minimal in-process agent registry. Explicitly NOT porting gemini-cli's Swarm-equivalent, since Axoniz's existing `SwarmOrchestrator` (Decompose→Worker→Critic→Merge with RAM-aware model swapping) is already more advanced than anything in gemini-cli for this use case.
- **Local Code Assist (2026-07-05):** A verifier-gated coding-task loop originally designed for the gemini-cli project (`LOCAL_CODE_ASSIST.md` in that repo) — core idea: small local models get meaningfully better *practical* pass rates on narrow tasks when judgment is offloaded to deterministic tools (typecheck/lint/test) instead of trusted from the model's own output, combined with tight context curation. For Axoniz specifically, this should extend the existing `SwarmCritic` pattern rather than duplicate it — see `status.md` and `todo.md` for the adaptation plan.

---
*Status: Ready for Deployment. Standby Mode Active. Local Llama.cpp backend running on port 7860.*
