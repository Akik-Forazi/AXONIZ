<!-- axodex:start -->
# Axodex — Code Intelligence

This project is indexed by Axodex as **DevNet** (4843 symbols, 10982 relationships, 300 execution flows). Use the Axodex MCP tools to understand code, assess impact, and navigate safely.

> If any Axodex tool warns the index is stale, run `npx axodex analyze` in terminal first.

## Web UI (v0.3.0)

A new Next.js 16 dashboard lives in `web-next/` and replaces the legacy scraped `src/web/static/` UI. It is a separate Node.js project (not part of the AXONIZ TypeScript port) so it can be developed and deployed independently.

- **Sitemap**: `/chat`, `/agent`, `/vault`, `/forge`, `/war-room`, `/palace`, `/axodex`, `/search`, `/benchmarks`, `/system`, `/settings` (with sub-routes per provider — 14 total)
- **14 providers supported**: llama.cpp, LM Studio, Ollama, OpenAI, OpenRouter, Google Gemini, Anthropic Claude, Groq, Together AI, Mistral, DeepSeek, Fireworks AI, Perplexity, Custom
- **Real wiring**: every UI action hits a real backend endpoint OR makes a real fetch to the user's configured provider. No placeholders. Mock fallback only when no backend / no provider configured.
- **Architecture**: typed client (`web-next/src/lib/axoniz/client.ts`) → Next.js proxy routes (`web-next/src/app/api/axoniz/[...path]/route.ts` with mock fallback, `chat/route.ts` for streaming, `providers/test/route.ts` for pinger) → real AXONIZ backend at :7860 OR real provider endpoint.
- **See**: `docs/WEB_UI.md` (full sitemap + provider setup) and `docs/WEB_ROADMAP.md` (what's done, what's next).

When editing files in `web-next/`, run `bun run lint` from that directory before committing.

## `axoniz --web` now spawns the Next.js dashboard (v0.3.3)

Running `axoniz --web` no longer serves the legacy scraped static UI. The Express backend (`src/web/server.ts`) now:

1. Listens on :7860 (unchanged) — all `/api/*` routes live here
2. Spawns `bun run dev` (or `npm run dev`) in `web-next/` as a child process on :3000
3. Proxies all non-API GET requests from :7860 → :3000 so users only need to remember one URL
4. Falls back to the legacy static UI at `src/web/static/` if `web-next/` is missing or the dev server fails to start (with a clear log line: `dashboard -> not started (falling back to legacy static UI)`)

The spawn logic lives in `src/web/web-next-spawn.ts` (60s timeout for the dev server to come up; child process is cleaned up on SIGINT/SIGTERM).

## Axodex integration (v0.3.3) — always bundled, no separate install

`axoniz install axodex` is no longer required. AXONIZ now resolves the axodex CLI in this priority order:

1. **Bundled dist** at `<repo>/axoniz/integrations/Axodex/axodex/dist/cli/index.js` — run via `node`
2. **Bundled TS source** at `<repo>/axoniz/integrations/Axodex/axodex/src/cli/index.ts` — run via `bun` (preferred) or `npx tsx`
3. **Packaged exe** (PyInstaller/pkg/SEA): from `process.resourcesPath/integrations/Axodex/axodex/dist/cli/index.js`
4. **User home** `~/.axoniz/integrations/Axodex/axodex/dist/cli/index.js` (legacy fallback)
5. **Global `npx axodex`** (last resort)

The resolver lives in `src/tools/axodex_tools.ts` (`resolveAxodex()` — memoized per-process). No build step is needed if `bun` is on PATH; the TS source runs directly.

To build the dist manually (optional, for fastest CLI startup):
```bash
cd axoniz/integrations/Axodex/axodex && bun run build
```

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
| `axodex://repo/DevNet/context` | Codebase overview, check index freshness |
| `axodex://repo/DevNet/clusters` | All functional areas |
| `axodex://repo/DevNet/processes` | All execution flows |
| `axodex://repo/DevNet/process/{name}` | Step-by-step execution trace |

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
