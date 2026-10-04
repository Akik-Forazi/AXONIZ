<!-- axodex:start -->
# Axodex — Code Intelligence

This project is indexed by **Axodex**, the standalone code-graph intelligence engine (npm package `@fraziym/axodex`, source at https://github.com/Akik-Forazi/axodex). The repo is indexed as **DevNet** (symbols, relationships, and execution flows). Use the Axodex MCP tools to understand code, assess impact, and navigate safely.

> Axodex is no longer bundled inside AXONIZ. As of v0.3.4 it ships as its own npm package and the `axodex` binary lives on your PATH after `npm install -g @fraziym/axodex`. If any Axodex tool warns the index is stale, run `axodex analyze` in the terminal to refresh it (no `npx`, no clone — `axodex` is a real binary now).

## Install (one-time, ~5s)

```bash
# Recommended — install AXONIZ and axodex together so the MCP server + CLI binary are both available
npm install -g @fraziym/axoniz @fraziym/axodex

# Verify both binaries are on PATH
axoniz --version    # → V00.01.000-beta-01
axodex --version    # → V00.01.000-beta-01
```

`axoniz install axodex` still works as a convenience wrapper — it just shells out to `npm install -g @fraziym/axodex` and verifies the binary lands on PATH. It no longer clones the AXONIZ repo (that old path downloaded 30+ MiB and never linked the binary).

For raw git-hosted integrations that aren't on npm, `axoniz install <git-url>` still clones into `~/.axoniz/integrations/` — that flow is preserved for custom integrations.

## Versioning (v0.3.5) — FRAZIYM format

Both AXONIZ and axodex use the **FRAZIYM versioning** format (not conventional semver):

```
VPP.FF.BBB-STAGE-RR
│  │  │    │     │
│  │  │    │     └── Pre-release revision (01, 02, …)
│  │  │    └──────── Release stage (-alpha | -beta | -rc; omitted when stable)
│  │  └───────────── Bug-fix version (000, 001, …)
│  └──────────────── Feature version (00, 01, …)
└─────────────────── Platform generation (V00, V01, …)
```

- **Current version (both packages):** `V00.01.000-beta-01`
- **Semver translation:** `0.1.0-beta.1` (npm requires valid semver — the FRAZIYM string is the canonical identity)
- **Single source of truth (AXONIZ):** `src/version.ts` (`AXONIZ_VERSION`, `AXONIZ_VERSION_SEMVER`, `AXONIZ_RELEASE_STAGE`, `parseFraziymVersion()`, `fraziymToSemver()`)
- **Single source of truth (axodex):** `axodex/src/version.ts` in the standalone repo
- **Sync verification:** `tests/version.test.ts` fails the build if any sync point drifts. Five sync points carry the AXONIZ string: `src/version.ts`, `package.json`, `src/core/runner.ts` (CLI banner), `README.md`, and the test itself.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `axodex_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `axodex_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `axodex_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `axodex_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `axodex_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `axodex_rename` which understands the call graph.
- NEVER commit changes without running `axodex_detect_changes()` to check affected scope.
- NEVER use `npx axodex ...` for routine work — `axodex` is a real on-PATH binary now. (`npx @fraziym/axodex ...` still works as a fallback if you can't install globally, but the binary form is the canonical interface.)

## CLI (post-v0.3.4)

The CLI is invoked as `axodex <command>` (no `npx` prefix — it's a real binary on PATH after global install).

| Task | Command |
|------|---------|
| Re-index the repo (refresh `.axodex/`) | `axodex analyze` |
| Show index freshness / commit hash | `axodex status` |
| Clean the on-disk index | `axodex clean` |
| Generate a markdown wiki from the graph | `axodex wiki` |
| Export the graph to JSON | `axodex export` |

> If the MCP server reports the index is stale, the fix is always: stop the agent, run `axodex analyze` in a terminal, then resume. The MCP tools will pick up the fresh index on the next call.

## MCP Tools (used by the agent during missions)

| Tool | Use for |
|------|---------|
| `axodex_impact({target, direction})` | Blast-radius analysis before editing a symbol — direct callers, affected processes, risk level |
| `axodex_query({query})` | Find execution flows by concept (process-grouped, ranked by relevance) — use this instead of grepping |
| `axodex_context({name})` | Full context for a symbol: callers, callees, which flows it participates in |
| `axodex_smart_read({symbol})` | Read the source of a symbol by name (resolves overloads) |
| `axodex_detect_changes()` | Pre-commit: verify changes only touch expected symbols + flows |
| `axodex_rename({from, to})` | Graph-aware rename (updates all call sites) — never use find-and-replace for symbols |
| `axodex_status()` | Check index freshness + version from inside a mission |
| `axodex_analyze()` | Trigger a re-index from inside a mission (rarely needed — usually faster to do it in a terminal) |

## Resources

| Resource | Use for |
|----------|---------|
| `axodex://repo/DevNet/context` | Codebase overview, check index freshness |
| `axodex://repo/DevNet/clusters` | All functional areas |
| `axodex://repo/DevNet/processes` | All execution flows |
| `axodex://repo/DevNet/process/{name}` | Step-by-step execution trace |

## Skill files (deep dives)

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/axodex/axodex-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/axodex/axodex-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/axodex/axodex-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/axodex/axodex-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/axodex/axodex-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/axodex/axodex-cli/SKILL.md` |

## PEAK agent advancements (v0.3.6) — agent-level consumers of axodex

When working on the PEAK agent stack, the new modules below consume axodex at runtime. Keep the axodex index fresh or these will degrade:

| Module | Axodex dependency |
|--------|--------------------|
| `src/core/tool_registry.ts` (Tool Registry) | Planner + Researcher roles use `axodex_query`, `axodex_context`, `axodex_smart_read`, `axodex_impact`, `axodex_detect_changes` |
| `src/core/intelligence/dag_planner.ts` (DAG Planner) | Planner step queries axodex for codebase structure before producing the DAG |
| `src/core/intelligence/verify_gate.ts` (Verify Gate) | Independent of axodex — runs `tsc`/`eslint`/`vitest`/`pytest` directly |
| `src/core/intelligence/cost_tracker.ts` (Cost Tracker) | Independent of axodex — emits SSE cost events for the dashboard |
| `src/core/intelligence/context_compressor.ts` (Semantic Compression) | Independent of axodex — importance scoring + keep-mask over the message log |

<!-- axodex:end -->
