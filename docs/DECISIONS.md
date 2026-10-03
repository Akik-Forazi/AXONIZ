# AXONIZ-ZERO — Architectural Decisions Log
> Phase 0 Ground Truth Audit · October 2026

---

## DEC-001: TypeScript/Node.js port strategy
**Date:** October 2026
**Decision:** Full port of Python implementation to TypeScript/Node.js, mirroring module structure.
**Rationale:**
- TypeScript provides type safety, better IDE support, and easier distribution as a CLI tool
- Node.js event loop is better suited to I/O-bound agentic workloads than Python's GIL-constrained threading
- Async/await throughout eliminates Python's threading complexity (threads were used only to avoid blocking)
- `node-llama-cpp` provides feature-parity with `llama-cpp-python` on Windows
**Alternative considered:** Keep Python, add TS frontend only. Rejected: two runtimes = double maintenance.

---

## DEC-002: Python implementation is behavioral reference, not architectural authority
**Date:** October 2026
**Decision:** Port Python behavior but improve architecture where Python had debt.
**Examples of deliberate improvements in TS:**
- `tool_schemas.ts` extracted from `agent.py` (was inline, 120+ lines mixed in agent class)
- Backend abstraction formalized as `abstract class Backend` (was duck-typed in Python)
- Response types formalized: `TextResponse | ToolCallResponse` (was ambiguous union in Python)
- All tool calls made async (Python used sync with thread hacks)

---

## DEC-003: No remote/A2A agent protocol
**Date:** July 2026 (Python decision, carried forward)
**Decision:** Do not port or implement the gemini-cli remote/A2A agent protocol.
**Rationale:** No current use case. Adds complexity without benefit. Revisit if distributed Axoniz becomes a requirement (P3-005).

---

## DEC-004: Do not replace SwarmOrchestrator
**Date:** July 2026 (Python decision, carried forward)
**Decision:** The existing SwarmOrchestrator is already more advanced than comparable systems. Improve it; do not replace it.
**Key advantages to preserve:**
- RAM-aware sequential model hot-swapping (unique to Axoniz on CPU hardware)
- Dependency-graph parallel scheduling within swarms
- SwarmCritic result validation before acceptance

---

## DEC-005: No C++ rewrite of orchestration layer
**Date:** July 2026
**Decision:** Do not rewrite Axoniz orchestration in C++.
**Rationale:** Profiled: LLM inference time dominates wall-clock cost by 100–1000x on i5-8350U. Orchestration layer is not the bottleneck.

---

## DEC-006: Extend SwarmCritic, not build a parallel verifier
**Date:** July 2026
**Decision:** The planned Local Code Assist verifier should extend `SwarmCritic`, not create a competing system.
**Design direction:** Add a verifier-gate stage to `SwarmCritic` that runs deterministic checks (tsc, eslint, pytest) for code-editing sub-tasks.

---

## DEC-007: `node-llama-cpp` over Ollama as default backend
**Date:** October 2026
**Decision:** Use `node-llama-cpp` (native GGUF inference) as the primary backend, not Ollama.
**Rationale:**
- Zero overhead: no separate Ollama process required
- Direct control over KV cache, context management, model loading/unloading
- Enables RAM-aware model swapping that `SwarmOrchestrator` depends on
- Ollama, LM Studio, OpenAI-compatible backends remain available as alternatives
**Tradeoff:** `node-llama-cpp` binary must be pre-downloaded/installed. Mitigated by local tarball in `_dl/`.

---

## DEC-008: pnpm as package manager
**Date:** October 2026
**Decision:** Use `pnpm` (evidenced by `pnpm-lock.yaml`, `pnpm-workspace.yaml`).
**Rationale:** Better monorepo support, faster installs, disk deduplication. `node-llama-cpp` local tarballs handled correctly by pnpm.

---

## DEC-009: TypeScript strict mode
**Date:** October 2026
**Decision:** `"strict": true` in `tsconfig.json` with `noImplicitOverride` and `noFallthroughCasesInSwitch`.
**Result:** Zero type errors on first full audit. The previous agent built with discipline.

---

## DEC-010: Tool scoping is P0, not a design option
**Date:** October 2026
**Decision:** Implement `AgentDefinition` + tool scoping as the immediate next action after bug fixes.
**Rationale:** The current state where `ResearchAgent` can call `git_commit`, `mouse_click`, `file_delete`, `goal_create` is both a security issue and a behavioral one. The Python `todo.md` already identified this as "highest-impact single change."

---

## DEC-011: SkillDistiller review gate is non-negotiable
**Date:** October 2026
**Decision:** The SkillDistiller must not auto-apply distilled skills without human review.
**Rationale:** Auto-applying AI-generated patterns to the agent's own behavior without review is a self-modification risk. The Python code's own comment acknowledges this: "for now, we forge it to demonstrate the loop." Time to fix it properly.

---

## DEC-012: Structured Observation type (not raw strings)
**Date:** October 2026
**Decision:** Tool results should be `Observation` objects, not raw strings.
**Rationale:** Raw strings make it impossible to:
- Attribute token cost to specific tools
- Track success/failure rates per tool
- Build meaningful audit logs
- Implement proper self-verification
**Migration:** Observation wraps the string result; backward compatibility maintained.

---

## DEC-013: `done()` tool is the canonical termination signal
**Date:** October 2026
**Decision:** Agent termination should be driven by the `done()` tool call, not text-pattern matching.
**Rationale:** The current `_is_done()` function matches strings like "task complete", "all done", "finished." — these can appear in tool results (e.g., reading a file that contains the word "finished") causing false terminations. The structured `done(result)` call is unambiguous.
**Migration:** Keep `_is_done()` as emergency fallback only; log a warning when it triggers.
