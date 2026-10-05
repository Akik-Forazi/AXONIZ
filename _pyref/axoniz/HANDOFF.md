# 🤝 Agent Handoff — Axoniz

**Date:** 2026-07-05
**Project:** `C:\Users\akikf\programing\nn\axoniz\axoniz`
**Owner:** AKIK FARAJI — CEO/CTO/Founder of FRAZIYM

---

## Purpose of this file

Narrative log of what happened and why, for continuity across sessions/agents given usage-limit constraints. For live checkable status (what's done, what's pending, exact checklist) see **`status.md`**. For the prioritized action list see **`todo.md`**.

---

## 📌 Naming note — read this before touching branding anywhere

**"Xorcl" is being repurposed as a name for a different, separate project — not the gemini-cli fork currently living at `C:\Users\akikf\programing\nn\gemini-cli` (which was itself rebranded to `@fraziym/xorcl-*` in an earlier session).** If you're an agent picking up work and see "xorcl" in the gemini-cli repo's `package.json`/`HANDOFF.md`/`status.md`, that's the existing rebrand from before this note — leave it as-is unless told otherwise. But going forward, don't assume "xorcl" as a name necessarily refers to that gemini-cli fork in future conversations — the user has indicated the name itself will be used elsewhere. If this causes ambiguity in a future session, ask rather than assume which project "xorcl" refers to.

---

## 🎯 What's being planned for Axoniz right now (2026-07-05 session)

Two pieces of work, both scoped/designed but **not yet implemented**:

### 1. Subagent architecture upgrade (ported ideas from gemini-cli)

Full comparison and integration plan: **`AXONIZ_SUBAGENT_UPGRADE.md`**.

This came out of a side-by-side review of gemini-cli's (TypeScript, Apache-2.0) subagent system against Axoniz's existing `Agent`/`SwarmOrchestrator`. Honest finding: **this is a merge, not a copy**. Axoniz's swarm system (Decompose→Worker→Critic→Merge with RAM-aware sequential model-swapping), confidence scoring, trajectory recording, and background daemon are already more advanced than anything in gemini-cli's subagent registry for this use case. What gemini-cli has that Axoniz genuinely lacks: a formal `AgentDefinition` schema with **per-agent tool scoping** (the single biggest real gap — `specialized.py`'s three agents currently inherit the entire ~80-tool arsenal with zero scoping), and a minimal agent registry/catalog.

### 2. Local Code Assist system (ported from a gemini-cli-specific design)

Original full design doc: `LOCAL_CODE_ASSIST.md` in the **gemini-cli repo** (`C:\Users\akikf\programing\nn\gemini-cli\LOCAL_CODE_ASSIST.md`) — written for that TypeScript project, but the core idea is language-agnostic: small local models get meaningfully better *practical* pass rates on narrow, well-scoped tasks when judgment is offloaded to deterministic verifiers (typecheck/lint/test) rather than trusted from the model's own self-assessment, combined with tight, minimal context curation.

**For Axoniz, don't build a parallel verifier system from scratch** — Axoniz's existing `SwarmCritic` (in `core/intelligence/swarm.py`) already does result validation before the Merger accepts a sub-task's output. The adaptation work is extending/formalizing that pattern for the specific case of code-editing tasks (add real `tsc`/`mypy`/`pytest`-equivalent-for-Python checks as a critic stage, not just model-based scoring), not inventing a second, competing pipeline. See `status.md` for the concrete checklist.

**Same honest framing applies here as in the original doc — repeat this in any summary, don't let it soften over time:** this raises the practical pass rate of small local models on narrow tasks. It does not, and cannot, make a small model reason like a much larger one. Don't let future docs or commit messages claim otherwise.

---

## 🖥️ Hardware context (relevant to both pieces of work above)

Measured on this project's actual hardware (Intel i5-8350U, CPU-only, 4 usable threads, via `llama-server`): roughly 13–25 tok/s prompt processing, ~11 tok/s generation. A 2048-token prompt alone took 80–150+ seconds to process in observed logs. This is why Local Code Assist's context-budget guardrails and Axoniz's own `ContextCompressor`/model-swap-for-RAM patterns in the swarm system both matter — they're not premature optimization, they're addressing a bottleneck already observed in practice.

The user is also exploring a custom model family (XORZEN-Nexar / "THO, ZERO, GREED" architecture family, sparse-SSM based) intended to reduce the O(n²) attention cost that causes the slow prompt-processing behavior above. That's a separate, lower-level project (inference architecture) from the agent-orchestration work described in this file — don't conflate the two when picking up either piece of work.

---

## 🛠️ Recommended order of work

See `todo.md` for the full prioritized checklist. Short version: start with the subagent tool-scoping fix (Section 2.1/2.2 of `AXONIZ_SUBAGENT_UPGRADE.md`) since it's the highest-value, most self-contained change — then move to the Local Code Assist / `SwarmCritic` extension once that's stable.

---

## ⚠️ Important rules for this project (carried over from established Axoniz conventions)

1. Tests for C++ components elsewhere in this org (XORZEN.CPP) use GoogleTest, never Python — not directly relevant to Axoniz itself (pure Python), but don't cross-contaminate if working across repos in one session.
2. This is a large, already-working codebase (tens of thousands of lines) — the user has expressed concern about its size/language choice. Per discussion this session: the orchestration layer being Python is not the bottleneck (LLM inference dominates wall-clock time by orders of magnitude); a rewrite is not recommended. Don't propose a full rewrite without a specific, profiled bottleneck to justify it.
3. Keep the "honest capability framing" (see Local Code Assist section above) intact in any new docs — this project has an explicit stated ambition to scale broadly (multi-domain agents, enterprise-grade reliability), and it's easy for documentation to drift into overclaiming as scope grows. Flag it if you see it happening.
