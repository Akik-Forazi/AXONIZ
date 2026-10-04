<!-- version: 1.7.0 -->
<!-- Last updated: 2026-04-23 -->

Last reviewed: 2026-04-23

**Project:** Axodex · **Environment:** dev · **Maintainer:** repository maintainers (see GitHub)

## Scope

| Boundary | Rule |
|----------|------|
| **Reads** | `axodex/`, `axodex-web/`, `eval/`, plugin packages, `.github/`, `.axodex/`, docs. |
| **Writes** | Only paths required for the change; keep diffs minimal. Update lockfiles when deps change. |
| **Executes** | `npm`, `npx`, `node` under `axodex/` and `axodex-web/`; `uv run` for Python under `eval/`; documented CI/dev workflows. |
| **Off-limits** | Real `.env` / secrets, production credentials, unrelated repos, destructive git ops without confirmation. |

## Model Configuration

- **Primary:** Use a named model (e.g. Claude Sonnet 4.x). Avoid `Auto` or unversioned `latest` when reproducibility matters.
- **Notes:** The Axodex CLI indexer does not call an LLM.

## Execution Sequence (complex tasks)

For multi-step work, state up front:
1. Which rules in this file and **[GUARDRAILS.md](GUARDRAILS.md)** apply (and any relevant Signs).
2. Current **Scope** boundaries.
3. Which **validation commands** you will run (`cd axodex && npm test`, `npx tsc --noEmit`).

On long threads, *"Remember: apply all AGENTS.md rules"* re-weights these instructions against context dilution.

## Claude Code hooks

**PreToolUse** hooks can block tools (e.g. `git_commit`) until checks pass. Adapt to this repo: `cd axodex && npm test` before commit.

## Context budget

Commands and gotchas live under **Repo reference** below and in **[CONTRIBUTING.md](CONTRIBUTING.md)**. If always-on rules grow, split into **`.cursor/rules/*.mdc`** (globs). **Cursor:** project-wide rules in `.cursor/index.mdc`. **Claude Code:** load `STANDARDS.md` only when needed.

## Reference docs

- **[ARCHITECTURE.md](ARCHITECTURE.md)**, **[CONTRIBUTING.md](CONTRIBUTING.md)**, **[GUARDRAILS.md](GUARDRAILS.md)**
- **Call-resolution DAG (legacy path):** See ARCHITECTURE.md § Call-Resolution DAG. Typed 6-stage DAG inside the `parse` phase; language-specific behavior behind `inferImplicitReceiver` / `selectDispatch` hooks on `LanguageProvider`. Shared code in `axodex/src/core/ingestion/` must not name languages. Types: `axodex/src/core/ingestion/call-types.ts`.
- **Scope-resolution pipeline (RFC #909 Ring 3):** See ARCHITECTURE.md § Scope-Resolution Pipeline. Replaces the legacy DAG for languages in `MIGRATED_LANGUAGES` (see `registry-primary-flag.ts`). A language plugs in by implementing `ScopeResolver` (`scope-resolution/contract/scope-resolver.ts`) and registering it in `SCOPE_RESOLVERS`. CI parity gate runs BOTH paths per migrated language on every PR.
- **Cursor:** `.cursor/index.mdc` (always-on); `.cursor/rules/*.mdc` (glob-scoped). Legacy `.cursorrules` deprecated.
- **Axodex:** skills in `.claude/skills/axodex/`; MCP rules in `axodex:start` block below.

## Changelog

| Date | Version | Change |
|------|---------|--------|
| 2026-04-23 | 1.7.0 | TypeScript added to `MIGRATED_LANGUAGES` (registry-primary call resolution by default). |
| 2026-04-20 | 1.6.0 | Added scope-resolution pipeline pointer (RFC #909 Ring 3); Python migrated to registry-primary. |
| 2026-04-19 | 1.5.0 | Cross-repo impact (#794): `impact`/`query`/`context` accept `repo: "@<group>"` + `service`. Removed `group_query`/`group_contracts`/`group_status` MCP tools; added `axodex://group/{name}/contracts` and `axodex://group/{name}/status` resources. |
| 2026-04-16 | 1.4.0 | Fixed: web UI description, pre-commit behavior, MCP tools (7->16), added axodex-shared, removed stale vite-plugin-wasm gotcha. |
| 2026-04-13 | 1.3.0 | Updated Axodex index stats after DAG refactor. |
| 2026-03-24 | 1.2.0 | Fixed axodex:start block duplication. |
| 2026-03-23 | 1.1.0 | Updated agent instructions, references, Cursor layout. |
| 2026-03-22 | 1.0.0 | Initial structured header and changelog. |

---

<!-- axodex:start -->
# Axodex — Code Intelligence

This project is indexed by Axodex as **Axodex** (20601 symbols, 27453 relationships, 300 execution flows). Use the Axodex MCP tools to understand code, assess impact, and navigate safely.

> If any Axodex tool warns the index is stale, run `npx axodex analyze` in terminal first.

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

## Resources

| Resource | Use for |
|----------|---------|
| `axodex://repo/Axodex/context` | Codebase overview, check index freshness |
| `axodex://repo/Axodex/clusters` | All functional areas |
| `axodex://repo/Axodex/processes` | All execution flows |
| `axodex://repo/Axodex/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/axodex/axodex-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/axodex/axodex-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/axodex/axodex-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/axodex/axodex-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/axodex/axodex-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/axodex/axodex-cli/SKILL.md` |

<!-- axodex:end -->

## Repo reference

### Packages

| Package | Path | Purpose |
|---------|------|---------|
| **CLI/Core** | `axodex/` | TypeScript CLI, indexing pipeline, MCP server. Published to npm. |
| **Web UI** | `axodex-web/` | React/Vite thin client. All queries via `axodex serve` HTTP API. |
| **Shared** | `axodex-shared/` | Shared TypeScript types and constants. |
| Claude Plugin | `axodex-claude-plugin/` | Static config for Claude marketplace. |
| Cursor Integration | `axodex-cursor-integration/` | Static config for Cursor editor. |
| Eval | `eval/` | Python evaluation harness (Docker + LLM API keys). |

### Running services

```bash
cd axodex && npm run dev                 # CLI: tsx watch mode
cd axodex-web && npm run dev             # Web UI: Vite on port 5173
npx axodex serve                         # HTTP API on port 4747 (from any indexed repo)
```

### Testing

**CLI / Core (`axodex/`)**
- `npm test` — full vitest suite (~2000 tests)
- `npm run test:unit` — unit tests only
- `npm run test:integration` — integration (~1850 tests). LadybugDB file-locking tests may fail in containers (known env issue).
- `npx tsc --noEmit` — typecheck

**Web UI (`axodex-web/`)**
- `npm test` — vitest (~200 tests)
- `npm run test:e2e` — Playwright (7 spec files; requires `axodex serve` + `npm run dev`)
- `npx tsc -b --noEmit` — typecheck

**Pre-commit hook** (`.husky/pre-commit`): formatting (prettier via lint-staged) + typecheck for staged packages. Tests do **not** run in pre-commit — CI only.

### Gotchas

- `npm install` in `axodex/` triggers `prepare` (builds via `tsc`) and `postinstall` (patches tree-sitter-swift, builds tree-sitter-proto). Native bindings need `python3`, `make`, `g++`.
- `tree-sitter-kotlin` and `tree-sitter-swift` are optional — install warnings expected.
- ESLint configured via `eslint.config.mjs` (TS, React Hooks, unused-imports). No `npm run lint` script; use `npx eslint .`. Prettier runs via lint-staged. CI checks both in `ci-quality.yml`.
