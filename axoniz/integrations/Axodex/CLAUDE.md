<!-- version: 1.8.0 -->
<!--
  Metadata: version, last reviewed, scope, model policy, reference docs, changelog.
  Last updated: 2026-07-16
-->

Last reviewed: 2026-07-16

**Project:** Axodex · **Environment:** dev · **Maintainer:** repository maintainers (see GitHub)

Follow **AGENTS.md** for the canonical rules; this file adds Claude Code–specific deltas. Cursor-specific notes live only in `AGENTS.md`.

## Scope

See the **Scope** table in [AGENTS.md](AGENTS.md) for read/write/execute/off-limits boundaries. Cursor-specific workflow notes also live only in AGENTS.md.

## Model Configuration

- **Primary:** Pin per **Claude Code** / Anthropic org policy (explicit model id). Do not rely on an unversioned `latest` alias for governed workflows.
- **Fallback:** As configured in Claude Code (organization default or user override).
- **Notes:** The Axodex CLI analyzer does not call an LLM.

## Execution Sequence (complex tasks)

Same discipline as [AGENTS.md](AGENTS.md): before large multi-step work, state which **AGENTS.md** / **GUARDRAILS.md** rules apply, current **Scope**, and planned validation commands (`npm test`, `tsc`, etc.). When pausing, summarize progress in the chat or a **local** scratch file (do not add `HANDOFF.md` to the repo), then `/clear` and resume with that summary.

## Claude Code hooks

Prefer **PreToolUse** hooks for hard gates (e.g. tests before `git_commit`). Adapt hook commands to `axodex/` npm scripts.

## Context budget

If always-on instructions grow, load deep conventions via conditional reads (e.g. *“When writing new code, read STANDARDS.md”*) instead of pasting long blocks here. In Cursor, prefer `.cursor/index.mdc` plus optional `.cursor/rules/*.mdc` globs (see [AGENTS.md](AGENTS.md) § Context budget).

## Reference Documentation

- **This repository:** [AGENTS.md](AGENTS.md) (Cursor + monorepo notes), [ARCHITECTURE.md](ARCHITECTURE.md), [CONTRIBUTING.md](CONTRIBUTING.md), [GUARDRAILS.md](GUARDRAILS.md).
- **Call & inheritance resolution:** See ARCHITECTURE.md § Scope-Resolution Pipeline. Shared pipeline code in `axodex/src/core/ingestion/` must not name languages — use `LanguageProvider` / `ScopeResolver` hooks instead (see AGENTS.md). (The legacy call-resolution DAG was removed in #942.)
- **Axodex:** standard skills in `.claude/skills/axodex-*/`; MCP and indexed-repo rules live only in [AGENTS.md](AGENTS.md) (`axodex:start` … `axodex:end`). See **Axodex rules** below.
- **Engineering plans, execution & review:** `/axodex-plan <task>` (implementation-ready plans via Axodex + statement-level PDG + source verification; Deepen mode for existing plans), `/axodex-work [plan]` (executes a plan as impact-checked, detect_changes-gated atomic commits), `/axodex-review [PR|branch|range|local]` (read-only graph-backed review), `/axodex-lfg <task>` (plan with depth asked up front → proceed/stop gate → work → review pipeline). Specs in `.claude/skills/axodex-{plan,work,review,lfg}/SKILL.md` (see AGENTS.md § Engineering planning & execution).

## Changelog

| Date | Version | Change |
|------|---------|--------|
| 2026-07-20 | 1.8.0 | The CI review agent runs `axodex-review` as a coordinated swarm — six `ci-personas/` lanes dispatched via the `Agent` tool with a bounded critic gate. |
| 2026-07-16 | 1.7.0 | `/axodex-plan` asks depth up front in interactive runs; `/axodex-lfg` gate slimmed to proceed/stop. |
| 2026-07-16 | 1.6.0 | Renamed `/axodex-pr-review` to `/axodex-review` and added PR, branch/range, and local-change targets. |
| 2026-07-11 | 1.5.0 | Added `/axodex-work` and `/axodex-lfg` to the engineering plans & execution pointer. |
| 2026-07-11 | 1.4.0 | Added `/axodex-plan` pointer to Reference Documentation. |
| 2026-04-13 | 1.3.0 | Updated Axodex index stats after DAG refactor. |
| 2026-03-24 | 1.2.0 | Removed duplicated axodex:start block and scope table; replaced with pointers to AGENTS.md. |
| 2026-03-23 | 1.1.0 | Updated agent instructions to match AGENTS.md. |
| 2026-03-22 | 1.0.0 | Added structured header and changelog. |

---

## Axodex rules

See the `<!-- axodex:start --> … <!-- axodex:end -->` block in **[AGENTS.md](AGENTS.md)** for the canonical MCP tools, impact analysis rules, and index instructions.

<!-- axodex:start -->
# Axodex — Code Intelligence

This project is indexed by Axodex as **Axodex** (248612 symbols, 565510 relationships, 918 execution flows).

> Index stale? Run `node .axodex/run.cjs analyze --index-only` from the project root — it auto-selects an available runner. No `.axodex/run.cjs` yet? Bootstrap with `npx`, `bunx`, or `pnpm dlx` — e.g. `bunx axodex@latest analyze` (npm 11 npx crash; #1939).
> On query/context/impact/cypher object results, read staleness.status and branch/lastCommit. Re-analyze only for behind or diverged — current is clone HEAD, not main.

## Always Do

- **MUST run impact analysis before editing.** Use `impact({target: "symbolName", direction: "upstream"})` (MCP) or `node .axodex/run.cjs impact "symbolName" --direction upstream --repo .` (CLI fallback); report callers, processes, and risk. Never substitute grep for graph analysis. For unified PDG impact, add `mode: "pdg"` with optional `line: <N>` — it returns statement-level `affectedStatements` over CDG + REACHING_DEF and inter-procedural symbols in `interproceduralByDepth`/`byDepth`; no-layer/degraded PDG results are UNKNOWN-risk notes (`--pdg` layer). CLI equivalent: `node .axodex/run.cjs impact "symbolName" --direction upstream --mode pdg --line <N> --repo .`.
- **MUST analyze graph changes before committing.** Use `detect_changes({scope: "all"})` (MCP) or `node .axodex/run.cjs detect-changes --scope all --repo .` (CLI fallback). `partial: true` or `truncated: true` is not a clean check — a zero means unseen, not unaffected; re-run it. For regression review: `detect_changes({scope: "compare", base_ref: "main"})` or `node .axodex/run.cjs detect-changes --scope compare --base-ref "main" --repo .`.
- MUST warn on HIGH/CRITICAL `risk` pre-edit; never use `riskSharedAxes` to waive a HIGH/CRITICAL `risk` warning. Compare File/symbol: MCP File omits axes; Graph-RAG expands File.
- **MUST treat `risk: UNKNOWN` as unresolved, not as low.** An empty caller set is not evidence the symbol is unused — it can also mean the callers are not resolvable by the index (plain-object property access, dynamic dispatch, cross-language calls). `impact` pairs `UNKNOWN` with a `riskNote` saying so. Confirm with a text search before treating the symbol as safe to change or delete; do not proceed on the strength of a zero.
- **MUST use `query({search_query: "concept"})` for concepts/flows, `context({name: "symbolName"})` for a named symbol, or `impact` for blast radius, on read-only callers, dependencies, imports, or execution flow.** Graph first; text search only for empty/`UNKNOWN`/literals.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).
- For control/data dependence, `pdg_query({mode: "controls", target: "fileOrSymbol"})` answers "under what condition does X run?" (CDG, incl. guard clauses) and `pdg_query({mode: "flows", target, variable})` traces "where does variable Y flow?" (REACHING_DEF). `--pdg` layer.

## Never Do

- NEVER edit a function, class, or method before MCP/CLI impact analysis.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis, and never read `UNKNOWN` as an all-clear — it means the walk could not answer, which is the one verdict that requires confirming by other means.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit before MCP/CLI graph change analysis.

## Resources

| Resource | Use for |
| --- | --- |
| `axodex://repo/Axodex/context` | Codebase overview, check index freshness |
| `axodex://repo/Axodex/clusters` | All functional areas |
| `axodex://repo/Axodex/processes` | All execution flows |
| `axodex://repo/Axodex/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
| --- | --- |
| Understand architecture / "How does X work?" | `.claude/skills/axodex-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/axodex-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/axodex-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/axodex-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/axodex-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/axodex-cli/SKILL.md` |

<!-- axodex:end -->
