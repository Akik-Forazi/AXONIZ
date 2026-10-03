# AXONIZ-ZERO — Testing Status
> Phase 0 Ground Truth Audit · October 2026

---

## Build Health

| Check | Command | Result |
|-------|---------|--------|
| TypeScript typecheck | `npm run typecheck` | ✅ **ZERO ERRORS** |
| TypeScript build | `npm run build` | ✅ **CLEAN** (157 assets copied) |
| Python (existing) | `pytest` | Working in Python reference |

---

## Existing Smoke Tests

### `_t_smoke.mjs` — UnifiedMemory / MemPalace / KG
The most comprehensive existing test. Tests memory subsystem end-to-end.

**How to run:**
```powershell
npm run build
node _t_smoke.mjs "C:\Users\user\akik\programing\axo\dist"
```

**Results (Phase 0 run):**

| Test | Result |
|------|--------|
| `palace.is_available()` | ✅ PASS |
| `palace.store id shape` | ✅ PASS |
| `palace.store already_exists` | ✅ PASS |
| `palace.status total_drawers` | ✅ PASS |
| `palace.status wings` | ✅ PASS |
| `palace.list_wings` | ✅ PASS |
| `palace.list_rooms` | ✅ PASS |
| `palace.get_context()` | ✅ PASS |
| `palace.search shape` | ✅ PASS |
| `palace.search wing filter` | ✅ PASS |
| `palace.search options object` | ✅ PASS |
| `palace.check_duplicate` | ✅ PASS |
| `palace.traverse_graph` | ✅ PASS |
| `palace.find_tunnels` | ✅ PASS |
| `palace.graph_stats` | ✅ PASS |
| `palace._db.get().ids` | ✅ PASS |
| `kg.add returns id` | ✅ PASS |
| Knowledge graph queries | ✅ PASS |
| `CoderAgent` instantiation | ❌ **FAIL** — `TypeError: Cannot read properties of undefined (reading '0')` |

**Root cause of CoderAgent failure:**
`applyExtraPrompt()` in `src/agents/specialized.ts` reads `agent.messages[0]` immediately after `super()`, but the `Agent` base class populates `messages` lazily (first populated on `run()`). Fix: guard with existence check and defer or use `push`.

---

### `_probe.mjs` / `_probe2.mjs` — Backend Connectivity Probes
Quick probes to test LLM backend availability.

### `_t.mjs` / `_t2.mjs` — Minimal Unit Tests
Basic import and construction tests.

### `_t_sqlite_check.mjs` — SQLite Availability
Verifies SQLite is accessible for trajectory/palace storage.

### `smoke.mjs` — Integration Smoke
Broader integration test.

---

## Known Failures (Phase 0)

### FAIL-001: `specialized.ts` — `applyExtraPrompt` crash
**Severity:** MEDIUM
**File:** `src/agents/specialized.ts:61`
**Error:** `TypeError: Cannot read properties of undefined (reading '0')`
**Cause:** `agent.messages[0]` is undefined at construction time
**Fix:**
```typescript
function applyExtraPrompt(agent: SpecializedAgentLike, extra: string): void {
  if (agent.messages && agent.messages.length > 0) {
    agent.messages[0]!.content += extra;
  } else {
    // Defer — agent will pick this up on first run()
    const existing = (agent as any)._pendingSystemAppend ?? "";
    (agent as any)._pendingSystemAppend = existing + extra;
  }
}
```

### FAIL-002: `_t_smoke.mjs` path argument
**Severity:** LOW (user error / platform issue)
**Error:** Relative `dist` path fails on Windows due to absolute URL resolution
**Fix:** Always pass absolute path: `node _t_smoke.mjs "C:\...\axo\dist"`

---

## What's Not Yet Tested

| System | Test Coverage | Priority |
|--------|--------------|----------|
| Agent execution loop | ❌ None | P0 |
| Tool execution (_exec) | ❌ None | P0 |
| SwarmOrchestrator | ❌ None | P1 |
| Backend backends (llamacpp, openai, ollama) | ❌ None | P0 |
| GoalLoop (loop.ts) | ❌ None | P1 |
| SkillDistiller | ❌ None | P1 |
| Authority engine | ❌ None | P1 |
| ConfidenceScorer | ❌ None | P1 |
| TrajectoryStore | ❌ None | P1 |
| Voice pipeline | ❌ None | P2 |
| Web server routes | ❌ None | P2 |
| Telegram bot | ❌ None | P3 |

---

## Recommended Test Plan (Phase 1+)

### Unit Tests (`test/unit/`)
- Tool execution: each tool returns expected shape
- ConfidenceScorer: risk levels for known-dangerous tools
- TrajectoryStore: SQLite read/write/query
- MemPalace: all smoke tests migrated to proper test runner
- KnowledgeGraph: add/query/invalidate

### Integration Tests (`test/integration/`)
- Agent + mock backend: full run() with done() call
- Agent + real llamacpp: end-to-end single task
- SwarmOrchestrator: decompose → workers → critic → merge
- GoalLoop: understand → plan → execute → verify

### End-to-End Tests (`test/e2e/`)
- CLI: `node dist/cli/entry.js --lc` interactive session
- Web server: HTTP routes returning expected JSON
- Full task: "read this file and summarize it"

### Failure Injection Tests
- Tool timeout handling
- Model failure → graceful degradation
- Context overflow → compression trigger
- Authority block on dangerous tool

---

## Test Infrastructure Needed

```typescript
// Recommended: Node.js built-in test runner (already in package.json scripts)
// "test": "node --test --experimental-strip-types \"test/**/*.test.ts\""

// Mock backend for unit tests:
class MockBackend extends Backend {
  constructor(private responses: CompletionResult[]) { super(); }
  async complete(): Promise<CompletionResult> { return this.responses.shift()!; }
  async *streamText(): AsyncGenerator<string> { yield "mock"; }
  async healthCheck() { return { status: "ok" }; }
  get name() { return "mock"; }
}
```
