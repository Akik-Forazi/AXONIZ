# AXONIZ — Implementation Status

**Last updated:** 2026-10-18
**Commit:** c761131
**Version:** 0.1.8-beta.1

## Status Legend
- ✅ Done + tested
- ✅ Done (not runtime tested)
- ⚠️ Partially done
- ❌ Not started
- 🐛 Known bug

---

## 1. Repository Cleanup
| Item | Status | Notes |
|---|---|---|
| Rename web-next → web | ✅ | git mv preserves history |
| Delete scratch files (_*.mjs, _*.py, _pyref/) | ✅ | 20+ files deleted |
| Delete outdated audit docs (AXONIZ_*.md) | ✅ | 8 files deleted |
| Delete duplicate test files | ✅ | 4 files deleted |
| Update all references (src/, docs, scripts) | ✅ | All web-next → web |
| Delete .bat files (superseded by npm scripts) | ✅ | build.bat, install.bat, start-axoniz-odysseus.bat |

## 2. Theming System
| Item | Status | Notes |
|---|---|---|
| Theme registry (themes.ts) | ✅ | Monochrome Dark + Shadow Monarch |
| CSS variable overrides ([data-theme=...]) | ✅ | globals.css |
| Zustand store (activeTheme, setTheme) | ✅ | Persisted, v9 migrate |
| ThemeProvider component | ✅ | Applies <html data-theme> |
| Theme picker UI (Settings → Appearance) | ✅ | Swatch cards with live previews |
| Shadow Monarch as DEFAULT theme | ✅ | DEFAULT_THEME_ID = "shadow-monarch" |
| **Apply studio.html design to actual components** | ❌ | CSS variables changed but component CSS NOT rewritten — no Linear/Vercel-grade typography, spacing, borders, or composer animation applied |
| **Glassmorphism on cards/panels** | ❌ | Only in standalone HTML demos, not in actual dashboard |

## 3. Event Stream
| Item | Status | Notes |
|---|---|---|
| EventStreamProvider (singleton) | ✅ | Survives navigation |
| /event-stream page | ✅ | Full-screen event viewer |
| EventRail side panel DELETED | ✅ | Removed from layout |
| Sidebar "Event Stream" entry | ✅ | Terminal icon |
| Auto-reconnect on failure | ✅ | 5s backoff |
| LIVE indicator | ✅ | Connected/Reconnecting status |

## 4. Chat Stream (survives navigation)
| Item | Status | Notes |
|---|---|---|
| ChatStreamProvider (singleton per execution) | ✅ | Owned by layout |
| useChatStream rewritten to use store | ✅ | messagesByChatId + executionIdByChatId |
| EMPTY_MESSAGES stable constant (infinite loop fix) | ✅ | Module-level constant |
| **Streaming token appending** | ✅ | Fixed: pending stays true throughout stream |
| Token persistence to JSONL | ✅ | Fire-and-forget POST |

## 5. Providers
| Item | Status | Notes |
|---|---|---|
| OrcaRouter provider added | ✅ | 15th provider, OpenAI-compatible |
| OrcaRouter in CLI backend dispatch | ✅ | backend/index.ts openAICompatible Set |
| OrcaRouter in providers test route | ✅ | case "orca" in switch |
| OrcaRouter in CLI runner.ts + help text | ✅ | PROVIDERS array + --provider text |
| Null check for undefined providers | ✅ | ?? fallback in 5 locations |
| Store v9 migrate (merges new providers) | ✅ | Preserves API keys |

## 6. v2 Foundation (Projects + Workflows + Logs)
| Item | Status | Notes |
|---|---|---|
| v2-schemas.ts (Zod) | ✅ | ProjectMeta, Workflow, WorkflowStep, LogEntry, WorkflowRun |
| v2-projects.ts (register + auto-detect) | ✅ | git/npm/TS/Next.js/framework/tests/docker detection |
| v2-workflows.ts (YAML parser + runner) | ✅ | Sequential, mustache templating, JSONL logs |
| v2-secrets.ts | ✅ | ~/.fraziym/axoniz/secrets.json, mode 0600 |
| v2-templates.ts | ✅ | 5 starter templates |
| v2-scheduler-server.ts | ✅ | Built-in setInterval + cron parser (no node-cron) |
| instrumentation.ts | ✅ | Server-side scheduler init |
| 13 REST endpoints (/api/axoniz/v2/*) | ✅ | projects, workflows, runs, logs, templates, secrets |
| /projects dashboard page | ✅ | Register + manage folders |
| /workflows dashboard page | ✅ | YAML editor + run + runs list |
| /logs dashboard page | ✅ | Live viewer with filter |
| Sidebar entries (Projects, Workflows, Logs) | ✅ | FolderKanban, Workflow, ScrollText icons |

## 7. v2 Workflow Tools (10 total)
| Tool | Status | Notes |
|---|---|---|
| http | ✅ | GET/POST/PUT/DELETE with headers + body |
| file | ✅ | read/write/append/list |
| shell | ✅ | exec with cwd + timeout |
| agent | ✅ | POST /api/axoniz/chat + poll execution |
| log | ✅ | Custom log line with level |
| email | ⚠️ | Logs to console only — full SMTP pending nodemailer |
| slack | ✅ | Incoming webhook URL |
| github | ✅ | REST API (GET/POST/PUT/DELETE) with token auth |
| palace | ✅ | store/read/list from ~/.fraziym/axoniz/palace/ |
| axodex | ⚠️ | Returns placeholder — full impl needs Axodex module call |

## 8. v2 Triggers
| Trigger | Status | Notes |
|---|---|---|
| manual | ✅ | POST /workflows/:name/run |
| schedule | ✅ | Built-in cron parser, setInterval every 60s |
| webhook | ❌ | Schema exists, no endpoint |
| git_hook | ❌ | Schema exists, no installer |
| file_watch | ❌ | Schema exists, no chokidar |

## 9. v2 Starter Templates (5)
| Template | Status | Notes |
|---|---|---|
| auto-test-on-push | ✅ | git_hook post_commit → npm test |
| security-scan-pre-commit | ✅ | git_hook pre_push → xorgis scan |
| daily-news-summary | ✅ | cron 0 8 * * * → fetch → agent → email |
| version-bump-on-commit | ✅ | git_hook post_commit → axovb bump |
| github-pr-digest | ✅ | cron 0 9 * * 1 → fetch PRs → summarize |

## 10. Tech Debt
| Item | Status | Notes |
|---|---|---|
| middleware.ts → proxy.ts (Next.js 16) | ✅ | Renamed + function renamed |
| Tree-sitter peer dep conflicts | ✅ | 16 npm overrides → @fraziym/tree-sitters |
| gypfile: false | ✅ | Prevents node-gyp rebuild |
| Turbopack filesystem warning | ✅ | /*turbopackIgnore: true*/ added |
| npm install (root → web deps) | ✅ | workspaces: ["web"] |
| npm vulnerabilities | ❌ | 1 critical (simple-git via node-llama-cpp) — can't force-fix without breaking CLI |
| Store version migration | ✅ | v9 — merges DEFAULT_PROVIDERS + Shadow Monarch default |
| node-cron removed | ✅ | Replaced with built-in setInterval scheduler |

## 11. Bugs Fixed This Session
| Bug | Status | Fix |
|---|---|---|
| 401 on /model/switch (parent project) | ✅ | Mock-error wrapper → 400 not 401 |
| Infinite loop in useChatStream | ✅ | EMPTY_MESSAGES stable constant |
| Providers page crash (undefined cfg) | ✅ | ?? null check in 5 locations |
| SchedulerProvider crashed all pages | ✅ | Moved to instrumentation.ts |
| node-cron build failure | ✅ | Removed entirely, built-in scheduler |
| Streaming tokens as separate bubbles | ✅ | pending stays true throughout stream |
| Agent HTTP 400 | ✅ | Added session_id to POST body |
| Recent chats on /agent page | ✅ | Sidebar showChats only on /chat |
| postinstall infinite loop | ✅ | Removed postinstall, kept workspaces |

## 12. NOT Done — Future Work
| Item | Priority | Effort |
|---|---|---|
| Apply studio.html design to actual components | HIGH | 1-2 weeks — rewrite sidebar, topbar, chat, composer, settings with Linear/Vercel-grade CSS |
| Glassmorphism on cards/panels | HIGH | Part of design rewrite |
| HTTP backend refactor (Hono + Zod + OpenAPI) | HIGH | 2-3 weeks |
| MCP host (consume external MCP servers) | HIGH | 2 weeks |
| MCP servers (expose AXONIZ tools) | HIGH | 2 weeks |
| Sandbox + approval modes | MEDIUM | 1 week |
| Artifacts (task lists, plans, screenshots) | MEDIUM | 2 weeks |
| Async Manager surface (/manager page) | MEDIUM | 2 weeks |
| Browser-in-the-loop (Playwright) | LOW | 2 weeks |
| Office doc generation (PPTX/DOCX/XLSX) | LOW | 1 week |
| Full email tool (nodemailer + SMTP) | MEDIUM | 2 days |
| Full axodex tool (call Axodex module) | MEDIUM | 2 days |
| Webhook trigger endpoint | MEDIUM | 1 day |
| Git hook installer | MEDIUM | 1 day |
| File watcher trigger (chokidar) | MEDIUM | 1 day |
| Visual workflow editor | LOW | 1 week |
| Integration of xorvoid, xorgis, promochu | LOW | 1 week each |
| npm vulnerabilities fix | LOW | Needs node-llama-cpp@2.0.0 (breaking) |
