## AXONIZ / AXONIZ — What was fixed

### Recent fixes (v0.3.4 → v0.3.6)

| File / Area | Problem | Fix |
|---|---|---|
| `web-next/src/app/**` | Old dashboard used state-based fake routing — URL never changed, deep links didn't work, refresh lost your place | Replaced with real Next.js App Router routes. Every section now has a real URL (`/chat`, `/agent`, `/vault`, `/forge`, `/war-room`, `/palace`, `/axodex`, `/search`, `/benchmarks`, `/system`, `/settings/*`). Deep links work; refresh preserves your location. |
| `web-next/src/app/(auth)/**` + `src/core/auth.ts` | Auth had been pushed into the UI layer (a separate Next.js project), which made it impossible to enforce authority gates from the agent core | Reverted: auth belongs in the backend. JWT issuance + verification now lives in `src/core/auth.ts` (Express backend on `:7860`). The Next.js dashboard just calls `/api/auth/*` and stores the token. Authority gates in `src/core/authority.ts` are honored by the backend before any destructive tool call. |
| `axoniz/integrations/Axodex/` (removed) | axodex was bundled inside the AXONIZ repo — 5800+ files of overhead, impossible to version independently, drifted out of sync with upstream | Extracted axodex into its own npm package `@fraziym/axodex` (source: https://github.com/Akik-Forazi/axodex). AXONIZ now declares it as a required peerDependency. Both packages are versioned independently using FRAZIYM versioning. |
| `src/integrations/installer.ts` | `axoniz install axodex` cloned the entire AXONIZ repo (30+ MiB download) and never linked the `axodex` binary on PATH — users had to manually `cd` into the clone and `npm install` | Rewrote the installer to shell out to `npm install -g @fraziym/axodex` (one-line, ~5s, binary lands on PATH). The generic git-clone path is preserved for custom integrations (`axoniz install <git-url>`), but `axodex` now goes through the npm registry. |
| `src/web/server.ts` + `src/web/web-next-spawn.ts` | `axoniz --web` served the old scraped static UI from `src/web/static/` — stale, no real routing, no App Router, no live SSE for cost events | `axoniz --web` now spawns the Next.js dashboard in `web-next/` as a child process (`bun run dev` preferred, `npm run dev` fallback) on `:3000`, and proxies all non-API GET requests from `:7860 → :3000` so users only need to remember one port. Falls back to the legacy static UI with a clear log line if `web-next/` is missing or the dev server fails to start. |
| `src/version.ts` (new) | Version string was scattered across `package.json`, the runner banner, the README, and the build — no single source of truth, drift was inevitable | Added `src/version.ts` as the single source of truth (`AXONIZ_VERSION`, `AXONIZ_VERSION_SEMVER`, `AXONIZ_RELEASE_STAGE`, `parseFraziymVersion()`, `fraziymToSemver()`). Added `tests/version.test.ts` that fails the build if any of the five sync points drift. FRAZIYM format `VPP.FF.BBB-STAGE-RR` (current: `V00.01.000-beta-01`). |
| `src/tools/axodex_tools.ts` | Resolver probed multiple possible bundled-clone locations to find the axodex binary — slow and brittle | Simplified: check for `axodex` on PATH (preferred, post-global-install), fall back to `npx @fraziym/axodex`. No more probing for bundled clones. |
| `package.json` | axodex was an implicit dependency with no enforcement — `npm install @fraziym/axoniz` didn't pull axodex, and users got cryptic "axodex not found" errors at boot | Declared `@fraziym/axodex` as a required (non-optional) peerDependency. `npm install @fraziym/axoniz` now emits a warning if axodex is missing. |

### Bugs fixed (pre-v0.3.4)

| File | Problem | Fix |
|---|---|---|
| `core/intelligence/skill_distiller.py` | `time.strftime(...)` called but `import time` missing — would crash at first skill distillation | Added `import time` |
| `core/intelligence/__init__.py` | `SkillDistiller`, `SKILL_TEMPLATE`, `SKILLS_DIR` imported in `agent.py` but not in `__all__` — stale index warning and possible import errors | Added all three to `__all__` |
| `core/agent.py` | `SYSTEM_PROMPT` referenced in `_run_fallback` but renamed to `_FALLBACK_SYSTEM_PROMPT` | Fixed reference |
| `core/agent.py` | `ContextCompressor` double-imported from both `extras` and `intelligence` | Removed extras import |
| `core/runner.py` | `PURPLE` color variable used in `print_banner` but not defined | Added `PURPLE=_c("95")` |
| `core/runner.py` | `--web` mode manually built `WebServer` without LM Studio wiring | Now calls `startup.full_boot()` (TS port: `src/startup.ts`) |
| `web/server.py` | `allowed` variable used in `/api/agent/params` was out of scope (defined in `/api/config/save` block only) | Renamed to `_allowed` with correct set |
| `sidecar/__init__.py` | Missing entirely — `from axoniz.sidecar import ...` would fail | Created |
| `awareness/__init__.py` | Missing entirely | Created |

### New files (pre-v0.3.4)

| File | Purpose |
|---|---|
| `axoniz/startup.py` (TS port: `src/startup.ts`) | 8-step ordered boot: agent → LLM backend → memory warm → workflows → awareness → Telegram → sidecar → web |
| `axoniz/sidecar/__init__.py` (TS port: `src/sidecar/index.ts`) | Package init |
| `axoniz/awareness/__init__.py` (TS port: `src/awareness/index.ts`) | Package init |

### New files (v0.3.4 → v0.3.6)

| File | Purpose |
|---|---|
| `src/version.ts` | Single source of truth for the FRAZIYM version string + semver translation + parsers |
| `tests/version.test.ts` | Verifies all five sync points carry the same version string |
| `src/integrations/installer.ts` (rewritten) | `npm install -g @fraziym/axodex` instead of git-clone-the-AXONIZ-repo |
| `src/web/web-next-spawn.ts` | Spawns the Next.js dev server in `web-next/` as a child process and waits for it to be ready |
| `src/core/tool_registry.ts` | PEAK v0.3.6 — `AgentDefinition` + `ToolRegistry` with 8 pre-defined roles and per-role tool allowlists |
| `src/core/intelligence/cost_tracker.ts` | PEAK v0.3.6 — per-task token + $ cost attribution with SSE emission for live dashboard updates |
| `src/core/intelligence/verify_gate.ts` | PEAK v0.3.6 — actually runs `tsc`/`eslint`/`vitest`/`pytest` and parses real results (replaces LLM-only verification) |
| `src/core/intelligence/dag_planner.ts` | PEAK v0.3.6 — dependency-graph plan with parallel step execution via topological sort |
| `src/core/intelligence/context_compressor.ts` (enhanced) | PEAK v0.3.6 — added `scoreImportance()`, `semanticKeepMask()`, `compressSemantic()` methods (keeps user messages + tool calls + errors verbatim, summarizes only old successful results) |

### Axodex / axocode — stale index
Run this to refresh (from the project root):
```bash
# axodex is now a real binary on PATH after `npm install -g @fraziym/axodex`
axodex analyze
```
This updates `.axodex/` to the current commit and clears the "stale" warning. (`npx @fraziym/axodex analyze` works as a fallback if you can't install globally — but the binary form is canonical.)

For the full PEAK agent integration (Tool Registry, Cost Tracker, Verify Gate, DAG Planner, Semantic Context Compression — all consumers of axodex at runtime), see `DEVELOPER_MANUAL.md` §9.
