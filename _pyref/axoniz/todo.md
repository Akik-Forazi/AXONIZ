# TODO — Axoniz

**Last updated:** 2026-07-05. See `HANDOFF.md` for narrative context and `status.md` for the detailed checklist this file summarizes/prioritizes.

---

## Now (highest value, most self-contained)

0. **Add a human review gate to `SkillDistiller`** (`core/agent.py` `_sync_done()`) — currently auto-applies distilled skills with zero review; the code's own comment admits this ("for now, we forge it to demonstrate the loop"). This is a real safety-posture gap versus gemini-cli's strict patch-and-review-inbox pattern, independent of the rest of the subagent upgrade work. Do this regardless of priority/sequencing of everything else below — it's a live gap in an already-shipping feature, not a design choice pending implementation.
1. **Write `axoniz/agents/definition.py`** — `AgentDefinition`/`AgentToolConfig`/`AgentRunConfig`/`AgentOutputConfig` dataclasses. See `AXONIZ_SUBAGENT_UPGRADE.md` Section 2.1 for the sketch.
2. **Confirm the design question in `AXONIZ_SUBAGENT_UPGRADE.md` Section 4** before writing more code: scoped subagents should almost certainly reuse `Agent.run()`'s existing loop rather than get a separate implementation, to keep confidence-scoring/trajectory-recording/self-correction "for free." Get explicit confirmation, this changes how invasive the next step is.
3. **Add tool-scoping enforcement to `Agent.__init__`/`_exec`** — filter `_tool_map` and backend tool schemas to `AgentToolConfig.tool_names` when an `AgentDefinition` is passed in. This is the single highest-impact change: right now `ResearchAgent`/`FileAgent`/`CoderAgent` all get the full ~80-tool arsenal including git, mouse/keyboard control, and goal management, regardless of relevance.
4. **Rewrite `agents/specialized.py`** against the new format — allowlists already drafted in `AXONIZ_SUBAGENT_UPGRADE.md` Section 2.1.

## Next (after tool scoping is working and tested)

5. **Add `axoniz/agents/registry.py`** — minimal in-process catalog (`register`/`get`/`list_agents`). Not gemini-cli's full disk-hot-reload/remote-A2A version — no current use case for either.
6. **Structured output validation** — `jsonschema`-based validation of the `_done()` result against an optional `AgentOutputConfig.schema`. Lowest priority of the subagent-upgrade work.
6b. **Build a Codebase Investigator equivalent** — read-only tool scope (`file_read`/`file_search`/`file_list`/`axodex_query`/`axodex_context`), structured report output. Cheap once tool scoping (items 1–4) lands. See `AXONIZ_SUBAGENT_UPGRADE.md` Section 5.1.
6c. **Build a CLI Help Agent equivalent** — answers "how does Axoniz work" grounded in its own docs (`AXONIZ_STATE_OF_THE_ART.md`, `HANDOFF.md`, etc.). Cheap once tool scoping lands. See Section 5.2.

## Later (needs its own design pass first)

7. **Read `SwarmCritic`'s implementation in full** (`core/intelligence/swarm.py`) — only the Decomposer phase has been read so far. Needed before designing the Local Code Assist adaptation.
8. **Design the Axoniz-specific Local Code Assist adaptation** — extend `SwarmCritic` with deterministic checks (mypy/flake8/black/pytest — the tool wrappers already exist as `code_lint`/`code_format`) for code-editing sub-tasks specifically. Do not build a parallel verifier system. Write this as its own doc once the `SwarmCritic` read is done — don't skip straight to code.
9. **Check whether `ContextCompressor` already covers** the "small models need minimal, relevant context" principle adequately, or whether a code-task-specific retrieval layer using the existing `axodex_query`/`axodex_context` tools is needed on top.
10. **Design a semantic web Browser Agent, if/when Axoniz needs real web browsing** (not just OS-level screen control) — needs accessibility-tree-based navigation and, critically, explicit prompt-injection defenses for untrusted web content, following gemini-cli's pattern. Not urgent unless a real use case for web browsing (vs. local screen automation) comes up. See `AXONIZ_SUBAGENT_UPGRADE.md` Section 5.3.

## Ongoing / cross-cutting reminders (not one-time tasks)

- Keep the honest capability framing in every doc touched — this project has real ambition to scale broadly (multi-domain agents, enterprise-grade reliability); don't let that ambition turn into overclaiming what small local models + a good harness can actually do.
- Don't propose a C++ rewrite of Axoniz's orchestration layer without a specific, profiled bottleneck — LLM inference time dominates wall-clock cost by orders of magnitude on the current hardware (i5-8350U, CPU-only), so the language choice for orchestration isn't the constraint.
- "Xorcl" as a name is being repurposed for a separate project going forward — don't assume it always refers to the gemini-cli fork in future conversations if the context is ambiguous. See `HANDOFF.md`'s naming note.
- The XORZEN model-architecture family (THO/ZERO/GREED, sparse-SSM-based) is a separate, lower-level project from everything in this file — it's aimed at fixing the O(n²) attention bottleneck at the model level, not the agent-orchestration level. Don't conflate the two when scoping work.

## Explicitly not doing (see `AXONIZ_SUBAGENT_UPGRADE.md` Section 2.4 for reasoning)

- Porting gemini-cli's remote/A2A agent protocol.
- Replacing or duplicating the existing `SwarmOrchestrator` — it's already more advanced than gemini-cli's equivalent for this use case (RAM-aware sequential model swapping, dependency-aware parallel sub-tasks).
- A full Python→C++ rewrite of Axoniz.
