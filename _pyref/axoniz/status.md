# 📊 Status Report — Axoniz

**Last updated:** 2026-07-05
**Nothing described below has been implemented yet** — this session was analysis and design only (`AXONIZ_SUBAGENT_UPGRADE.md` + this file + `todo.md` + `HANDOFF.md`). See `HANDOFF.md` for full narrative context.

---

## Current state

| Area | Status |
|---|---|
| Subagent tool scoping | 🔴 Not started — `specialized.py`'s 3 agents currently get the full ~80-tool arsenal, no scoping |
| `AgentDefinition` schema (Python) | 🔴 Not started — design sketched in `AXONIZ_SUBAGENT_UPGRADE.md` Section 2.1 |
| Minimal agent registry | 🔴 Not started — design sketched in `AXONIZ_SUBAGENT_UPGRADE.md` Section 2.2 |
| Structured output validation for agents | 🔴 Not started — lowest priority, do last (Section 2.3) |
| Local Code Assist / `SwarmCritic` extension for code tasks | 🔴 Not started — needs its own design pass specific to Axoniz (see below), not a direct port of the gemini-cli TS design |
| Existing swarm/confidence/trajectory/daemon systems | 🟢 Working, in production use — do not modify without a specific reason, these are the parts already ahead of gemini-cli's equivalent |

---

## ✅ Checklist — Subagent architecture upgrade

From `AXONIZ_SUBAGENT_UPGRADE.md`, Section 3 ("Recommended order of work"):

- [ ] Write `axoniz/agents/definition.py` — `AgentDefinition`, `AgentToolConfig`, `AgentRunConfig`, `AgentOutputConfig` dataclasses (Section 2.1)
- [ ] Decide the open design question in Section 4: should scoped subagents reuse `Agent.run()`'s existing loop (confidence/trajectory/self-correction included for free) via an optional `AgentDefinition` param, or get a fully separate code path? **Recommended: reuse the existing loop** — confirm before writing code, since it changes how invasive the `Agent.__init__`/`_exec` changes need to be.
- [ ] Modify `Agent.__init__` (or add a thin subclass) to filter `self._tool_map` and the tool schemas sent to the backend down to `AgentToolConfig.tool_names` when an `AgentDefinition` is supplied. **This is the highest-impact single change** — currently every specialized-agent call sends the full ~80-tool schema regardless of relevance.
- [ ] Rewrite `agents/specialized.py`'s `CoderAgent`, `ResearchAgent`, `FileAgent` against the new `AgentDefinition` format — concrete tool allowlists already sketched in `AXONIZ_SUBAGENT_UPGRADE.md` Section 2.1.
- [ ] Add `axoniz/agents/registry.py` — minimal `register()`/`get()`/`list_agents()` catalog (Section 2.2). Explicitly NOT porting gemini-cli's disk-hot-reload or remote/A2A protocol — no current use case for either.
- [ ] Once the above is working: structured output validation via `jsonschema` on the `_done()` result, gated by an optional schema on `AgentOutputConfig` (Section 2.3).
- [ ] Re-test the 3 specialized agents end-to-end after tool scoping lands — confirm `ResearchAgent` genuinely can't call `git_commit`/`mouse_click`/etc., and that `CoderAgent` still has everything it actually needs (file/shell/code/axodex/git tools per the sketch).

---

## ✅ Checklist — Local Code Assist for Axoniz (adaptation, not direct port)

The original design (`LOCAL_CODE_ASSIST.md`, gemini-cli repo) was written for a TypeScript project with `tsc`/eslint/vitest as its verifier stack and no pre-existing critic system. Axoniz already has `SwarmCritic` doing result validation — this section is about extending that, not duplicating it. Nothing below has been designed in detail yet; this is a first-pass checklist, expect it to need its own dedicated design doc once work starts:

- [ ] Read `core/intelligence/swarm.py`'s `SwarmCritic` implementation in full (only the Decomposer prompt and dataclasses have been read so far this session — the Critic and Merger phases haven't been inspected yet)
- [ ] Determine what Python-equivalent deterministic checks exist/are needed for Axoniz's own codebase: `mypy` or similar for type checking, `flake8`/`black --check` (already wired as `code_lint`/`code_format` tools — reuse these), `pytest` for targeted test runs
- [ ] Design how a "verifier-gate" stage plugs into `SwarmCritic` for code-editing sub-tasks specifically, vs. its current more general-purpose scoring for arbitrary sub-tasks
- [ ] Apply the same context-budget guardrail principle from the original design (small models degrade with irrelevant context) — check whether Axoniz's existing `ContextCompressor` already covers this adequately for the swarm path, or whether a code-task-specific retrieval layer (using `axodex_query`/`axodex_context`, which already exist as tools) is needed on top
- [ ] Write the Axoniz-specific design doc once the above investigation is done — don't skip straight to implementation given how much of this depends on reading `SwarmCritic` first

---

## 🧭 What NOT to do (carried over from `AXONIZ_SUBAGENT_UPGRADE.md` Section 2.4 and `HANDOFF.md`)

- Don't port gemini-cli's remote/A2A agent protocol — no current use case.
- Don't build a second, parallel verifier/critic system alongside `SwarmCritic` — extend it.
- Don't propose or start a full rewrite of Axoniz into C++ — profiled reasoning in `HANDOFF.md` and this session's conversation history shows the orchestration layer isn't the bottleneck; LLM inference time dominates by orders of magnitude on this hardware.
- Don't let "make Axoniz work for every domain / NASA-grade" ambition creep into overclaiming in docs — keep the same honest capability framing used in `LOCAL_CODE_ASSIST.md` and repeated in `HANDOFF.md`.

---

## How to re-check this report

This is a documentation-only session — there's no build/typecheck command to re-run yet (unlike the gemini-cli repo's `npm run typecheck` pattern). Once actual code changes start landing against the checklists above, add a real verification section here (which Python command(s) confirm the change works, e.g. a specific `pytest` invocation) rather than leaving this section a documentation-only note.
