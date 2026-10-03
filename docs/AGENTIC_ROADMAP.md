# AXONIZ-ZERO — Agentic SOTA Roadmap
> 30-Phase Mission to State-of-the-Art Agentic OS

---

## Current Position (Phase 0 Complete)

✅ TypeScript port: ~95% feature parity, zero type errors, clean build
✅ Core agent loop: fully ported and async
✅ Memory: MemPalace + KG smoke-tested
✅ Intelligence: SwarmOrchestrator, ConfidenceScorer, TrajectoryStore all ported
✅ Differentiators: Axodex code graph, RAM-aware model swapping, multi-memory

🔴 P0 blockers: tool scoping, SkillDistiller safety, specialized agent bug
🔴 P1 gaps: checkpointing, structured observations, test coverage

---

## Phase Roadmap

### ✅ Phase 0 — Ground Truth (COMPLETE)
- Repository inventory
- Python → TypeScript parity matrix
- Build verification (PASS)
- Smoke test execution
- Failure identification
- Architecture documentation
- Prioritized backlog

---

### 🔴 Phase 1 — Clean Foundation
**Goal:** Fix all P0 blockers. Establish reliable baseline.

Tasks:
1. Fix `specialized.ts` `applyExtraPrompt` bug (P0-001)
2. Add human review gate to SkillDistiller (P0-003)
3. Fix smoke test path handling (P0-004)
4. Implement `AgentDefinition` + tool scoping (P0-002)
5. Fix `_is_done()` → structured done() signal (P1-007)
6. Create MockBackend + first unit tests (P1-004)

**Exit criteria:** All smoke tests pass. Agent can be constructed with scoped tools. Unit tests green.

---

### Phase 2 — Agent Runtime
**Goal:** Build real, composable agent infrastructure.

Tasks:
1. `AgentRegistry` — dynamic agent catalog (P1-001)
2. `Observation` type — structured tool results (P1-002)
3. `Checkpoint` — session persistence across restarts (P1-003)
4. Per-tool timeout + cancellation (P2-007)
5. Per-task token cost attribution (P2-002)
6. Integration tests: agent + llamacpp (P2-005)

**Exit criteria:** Agent can be interrupted and resumed. Every tool call produces a typed Observation. Token costs tracked.

---

### Phase 3 — First-Class Tool System
**Goal:** Tools become discoverable, safe, and auditable.

Tasks:
1. Tool registry with capability advertisement
2. Tool preconditions + postconditions
3. Tool risk classification (read-only / write / destructive / external)
4. Retry policies per tool category
5. Rollback support for reversible tools (file edits, git)
6. Tool audit log (every call, args, result, cost)

---

### Phase 4 — Computer Control
**Goal:** Screen, mouse, keyboard as first-class capabilities.

Tasks:
1. Formalize `ComputerAction` → `Observation` → `Verification` pipeline
2. OCR-based result verification (don't assume GUI action succeeded)
3. Window discovery + application enumeration
4. Browser interaction support
5. Clipboard integration

---

### Phase 5 — Context Engineering
**Goal:** Agent dynamically decides what context to retrieve per step.

Tasks:
1. Repository mapper (file → module → subsystem hierarchy)
2. Semantic relevance scoring for context selection
3. Hierarchical context: global → project → subsystem → task → step
4. Context caching between steps with same workspace
5. Extend `ContextCompressor` with semantic importance scoring (P2-003)
6. `Codebase Investigator` agent (P1-005)

---

### Phase 6 — Real Memory
**Goal:** Multi-class memory with retrieval, ranking, expiration, and contradiction detection.

Tasks:
1. Formalize Working / Episodic / Semantic / Procedural / Project memory classes
2. Memory relevance ranking + confidence scores
3. Memory expiration policies
4. Contradiction detection (new fact conflicts with stored fact)
5. Memory consolidation (merge related facts)
6. Provenance tracking (where did this memory come from?)
7. `Agentic Memory Graph` — project + task + outcome graph (P3-001)

---

### Phase 7 — Multi-Agent Architecture
**Goal:** Flexible orchestration with specialized roles.

Tasks:
1. Agent roles: Planner, Researcher, Coder, Debugger, Reviewer, Tester, Verifier
2. Dynamic instantiation based on task requirements (not just 3 hardcoded types)
3. Shared artifacts between agents
4. Agent communication protocol
5. Budget management per agent
6. `CLI Help Agent` (P2-006)

---

### Phase 8 — Parallelism + Async Execution
**Goal:** Exploit concurrency safely and intelligently.

Tasks:
1. Task scheduler with dependency graph (DAG GoalLoop — P2-001)
2. Worker pool with resource limits
3. Cancellation propagation
4. Deadlock prevention
5. Failure propagation across parallel tasks
6. Priority queuing

---

### Phase 9 — Self-Verification
**Goal:** Agent never claims success without evidence.

Tasks:
1. Extend SwarmCritic verifier gate for code tasks (P1-006)
2. Compile verification (tsc, mypy) after code changes
3. Lint verification (eslint, flake8)
4. Test execution + result parsing
5. Regression detection (diff against baseline)
6. Behavior verification (functional assertions)

**Canonical verification chain for code changes:**
```
Change → Compile → Lint → Unit Tests → Integration Tests → Behavior → Regression → Review
```

---

### Phase 10 — Self-Debugging and Recovery
**Goal:** Failures trigger diagnosis, not termination.

Tasks:
1. Failure classifier (compiler / test / shell / model / tool / permission / dependency)
2. Evidence collector per failure type
3. Hypothesis generator
4. Hypothesis tester (retry with modifications)
5. Patch applier
6. Re-run + verify cycle
7. Escalation: if N hypotheses fail → surface to user with evidence

---

### Phase 11 — Model Abstraction
**Goal:** Model selection is intelligent, not hardcoded.

Tasks:
1. Model capability registry (context window, modalities, tool calling support, speed, cost)
2. Task complexity classifier
3. Model router: complexity + modality → model selection
4. Fallback chain: if preferred model unavailable → next best
5. Cost tracking per model per task

---

### Phase 12 — Model-Agnostic Agent Protocol
**Goal:** Swap any model without rewriting agent runtime.

Current state: Backend abstraction already exists (`abstract class Backend`). Need to formalize:
1. Normalized message format (already done: `ChatMessage`)
2. Normalized tool call format (already done: `ToolCall`)
3. Reasoning metadata passthrough (for models that expose thinking)
4. Multimodal input normalization
5. Token usage normalization

---

### Phase 13 — Agentic Memory Graph
**Goal:** Connected graph: Project → files → symbols → commits → bugs → tests → agents → tasks → outcomes.

Tasks:
1. Design graph schema
2. Graph persistence (SQLite or DuckDB)
3. Graph ingestion pipeline (parse commits, link to files, link to tasks)
4. Graph query API
5. Future-agent context retrieval from graph

---

### Phase 14 — Git-Native Engineering
**Goal:** Git as a first-class capability; every change has provenance.

Current state: Git tools exist. Need to formalize:
1. Automatic branch creation for every autonomous task
2. Commit attribution (which agent, which task, which tools)
3. History analysis for bug investigation
4. Conflict resolution support
5. `shadow_step` improvement: proper cleanup of dead shadow branches

---

### Phase 15 — Security and Permission System
**Goal:** Capability-based permissions. Least privilege by default.

Tasks:
1. Formal permission model: read-fs / write-fs / exec-shell / network / git-write / package-install / credential-access
2. Per-agent capability grants
3. Sandbox-or-ask for dangerous capabilities
4. Audit log for every permission check
5. Policy engine: deny / ask / allow / sandbox

---

### Phase 16 — Sandboxed Execution
**Goal:** Agents can experiment safely.

Tasks:
1. Isolated execution for code, tests, package installs
2. Resource limits: CPU, memory, disk, time, network
3. Windows: PowerShell constrained runspace / WSL2 jail
4. Result extraction from sandbox

---

### Phase 17 — Evaluation System
**Goal:** Every claimed improvement has reproducible evidence.

Metrics to track:
- Task completion rate
- Correctness (tests pass)
- Regression rate
- Tool efficiency (calls per task)
- Latency, token usage, cost
- Recovery success rate
- Long-horizon reliability

Benchmark suites:
- Coding tasks (implement feature, fix bug, refactor)
- Repository exploration
- Terminal + Git tasks
- Multi-step workflows
- Failure recovery

---

### Phase 18 — Adversarial Evaluation
**Goal:** Intentionally difficult environments to catch overconfidence.

Test scenarios:
- Stale documentation contradicting actual code
- Failing tests unrelated to the task
- Hidden dependencies
- Partial implementations
- Flaky tools (random failures)
- Conflicting requirements
- Huge repositories with red herrings

---

### Phase 19 — Observability
**Goal:** Every run produces a complete, human-readable + machine-readable execution trace.

Outputs per run:
- Goal → Plan → Tasks → Agents → Models → Tool calls → Observations → Failures → Retries → Memory → Files modified → Tests → Verification → Result
- Structured event stream (JSONL)
- Human-readable narrative

---

### Phase 20 — User Experience
**Goal:** UI makes autonomous execution understandable, not opaque.

Views:
- Mission view (goal + progress)
- Agent view (active workers + responsibilities)
- Execution timeline (chronological actions)
- Workspace (files + changes)
- Terminal (commands + output)
- Memory (what Axoniz knows)
- Plan (editable execution strategy)
- Verification (evidence that result works)

---

### Phases 21–30 — Long-Horizon, Self-Improvement, Specialization, Platform, Ecosystem, Distribution, Performance, Competitive Analysis, Benchmarking, Consolidation

See full mission brief for details. These phases are future work after Phases 1–20 are stable.

---

## Anti-Patterns to Avoid (From Market Research)

Based on analysis of Claude Code, Cursor, Cline, Aider, Devin, AutoGPT, LangChain, and 15+ other systems:

| Anti-Pattern | How Others Failed | Axoniz Response |
|---|---|---|
| Context window rot | All tools degrade at 50k–100k tokens | Multi-class memory + semantic context selection |
| Silent failure ("I completed the task") | Cursor, Claude Code, Devin | Structured done() + verification gate |
| Infinite loops | AutoGPT, LangChain | Trajectory recording + termination conditions |
| Bill shock | Aider, Claude Code | Per-tool + per-task cost attribution |
| Rules ignored mid-session | Cursor, Windsurf, Cline | ConfidenceScorer + AuthorityEngine |
| Destructive operations | Cursor (DB deletion), Replit (coverup) | SkillDistiller gate + shadow-step + checkpoints |
| Over-abstraction | LangChain | Composable primitives, not framework spaghetti |
| Tool scoping absent | All current tools | P0-002 — AgentDefinition |
| No self-verification | All except emerging tools | Phase 9 — verification chain mandatory |
